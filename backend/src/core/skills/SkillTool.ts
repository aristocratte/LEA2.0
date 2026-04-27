import { z } from 'zod';
import type { Tool, ToolUseContext } from '../types/tool-types.js';
import { buildTool, createToolExecutionError } from '../runtime/ToolRegistry.js';
import type { ToolExecutor } from '../runtime/ToolExecutor.js';
import type {
  SkillDefinition,
  SkillInputField,
  SkillInputFieldType,
  SkillRunResult,
  SkillStepResult,
} from './types.js';
import { SkillDefinitionSchema } from './types.js';

export interface SkillToolOptions {
  executor: ToolExecutor;
}

const DEFAULT_STEP_ALLOW_PATTERNS = ['mcp:*', 'task_output', 'send_message'];
const DEFAULT_STEP_DENY_PATTERNS = ['bash', 'shell_exec', 'mcp:shell_exec', 'skill:*'];

function normalizeField(field: SkillInputField | SkillInputFieldType): SkillInputField {
  return typeof field === 'string' ? { type: field } : field;
}

function fieldToZod(field: SkillInputField | SkillInputFieldType): z.ZodTypeAny {
  const normalized = normalizeField(field);
  let schema: z.ZodTypeAny;

  switch (normalized.type) {
    case 'string':
      schema = z.string();
      break;
    case 'number':
      schema = z.number();
      break;
    case 'boolean':
      schema = z.boolean();
      break;
    case 'array':
      schema = z.array(z.unknown());
      break;
    case 'object':
      schema = z.record(z.unknown());
      break;
  }

  if (normalized.default !== undefined) {
    return schema.default(normalized.default);
  }

  return normalized.required === false ? schema.optional() : schema;
}

function buildSkillInputSchema(definition: SkillDefinition): z.ZodType<Record<string, unknown>> {
  if (!definition.inputSchema) {
    return z.record(z.unknown());
  }

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, field] of Object.entries(definition.inputSchema)) {
    shape[key] = fieldToZod(field);
  }

  return z.object(shape).passthrough() as z.ZodType<Record<string, unknown>>;
}

function lookupPath(input: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object' && segment in acc) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, input);
}

function stringifyInterpolated(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function renderTemplate(value: unknown, input: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const exact = value.match(/^\s*\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}\s*$/);
    if (exact) {
      return lookupPath(input, exact[1]!) ?? '';
    }

    return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) =>
      stringifyInterpolated(lookupPath(input, key)),
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderTemplate(item, input));
  }

  if (value && typeof value === 'object') {
    const rendered: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      rendered[key] = renderTemplate(nested, input);
    }
    return rendered;
  }

  return value;
}

function validateSkillDefinition(definition: SkillDefinition): SkillDefinition {
  const parsed = SkillDefinitionSchema.parse(definition);
  for (const step of parsed.steps) {
    if (step.tool.startsWith('skill:')) {
      throw new Error('Skill steps cannot invoke other skills in C10');
    }
  }
  return parsed;
}

function skillAliases(definition: SkillDefinition): string[] {
  return Array.from(new Set([definition.id, ...(definition.aliases ?? [])]));
}

function parsePatterns(raw: string | undefined, defaults: readonly string[]): string[] {
  if (raw === undefined) return [...defaults];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesGlob(pattern: string, value: string): boolean {
  if (pattern === '*') return true;
  const regex = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);
  return regex.test(value);
}

function evaluateSkillStepPolicy(toolName: string): { allowed: true } | { allowed: false; reason: string } {
  const denyPatterns = parsePatterns(process.env.LEA_SKILL_STEP_DENY, DEFAULT_STEP_DENY_PATTERNS);
  const allowPatterns = parsePatterns(process.env.LEA_SKILL_STEP_ALLOW, DEFAULT_STEP_ALLOW_PATTERNS);

  if (denyPatterns.some((pattern) => matchesGlob(pattern, toolName))) {
    return { allowed: false, reason: `Tool "${toolName}" is denied by skill step policy` };
  }

  if (!allowPatterns.some((pattern) => matchesGlob(pattern, toolName))) {
    return { allowed: false, reason: `Tool "${toolName}" is not allowed by skill step policy` };
  }

  return { allowed: true };
}

export function createSkillTool(
  definition: SkillDefinition,
  options: SkillToolOptions,
): Tool<Record<string, unknown>, SkillRunResult> {
  const skill = validateSkillDefinition(definition);
  const skillName = `skill:${skill.id}`;
  const inputSchema = buildSkillInputSchema(skill);

  return buildTool({
    name: skillName,
    aliases: skillAliases(skill),
    description: skill.description,
    source: 'skill',
    inputSchema,
    maxResultSizeChars: skill.maxResultSizeChars ?? 50_000,
    checkPermissions: async () => ({ behavior: 'allow' }),
    isReadOnly: () => skill.readOnly ?? false,
    isConcurrencySafe: () => skill.concurrencySafe ?? false,
    isDestructive: () => skill.destructive ?? false,
    userFacingName: () => skillName,
    getActivityDescription: () => `Running skill: ${skill.id}`,

    async call(input: Record<string, unknown>, context: ToolUseContext) {
      const steps: SkillStepResult[] = [];

      for (const [index, step] of skill.steps.entries()) {
        const stepId = step.id ?? `step_${index + 1}`;
        const renderedInput = renderTemplate(step.input ?? {}, input) as Record<string, unknown>;
        const policy = evaluateSkillStepPolicy(step.tool);

        if (!policy.allowed) {
          throw createToolExecutionError(
            skillName,
            input,
            new Error(`Skill "${skillName}" step "${stepId}" denied by skill step policy: ${policy.reason}`),
            true,
            ['Adjust LEA_SKILL_STEP_ALLOW/LEA_SKILL_STEP_DENY or remove the unsafe step.'],
          );
        }

        const result = await options.executor.execute({
          toolUseId: `${context.sessionId}-${skill.id}-${stepId}-${index + 1}`,
          toolName: step.tool,
          input: renderedInput,
          sessionId: context.sessionId,
          abortController: context.abortController,
          permissions: context.permissions,
          provider: context.provider,
          agentId: context.agentId,
          cwd: context.cwd,
        });

        const resultText = String(result.event.result ?? '');
        const success = result.event.isError !== true;
        const stepResult: SkillStepResult = {
          id: stepId,
          label: step.label,
          tool: step.tool,
          optional: step.optional ?? false,
          success,
          result: resultText,
          recoverable: result.recoverable,
          suggestions: result.suggestions,
        };
        steps.push(stepResult);

        if (!success && !step.optional) {
          throw createToolExecutionError(
            skillName,
            input,
            new Error(`Skill "${skillName}" failed at step "${stepId}": ${resultText}`),
            result.recoverable,
            result.suggestions,
          );
        }
      }

      return {
        data: {
          success: true,
          skill: skillName,
          steps,
        },
      };
    },
  });
}
