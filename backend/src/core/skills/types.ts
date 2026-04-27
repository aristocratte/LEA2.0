import { z } from 'zod';

export type SkillInputFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface SkillInputField {
  type: SkillInputFieldType;
  required?: boolean;
  default?: unknown;
  description?: string;
}

export interface SkillStepDefinition {
  id?: string;
  label?: string;
  tool: string;
  input?: Record<string, unknown>;
  optional?: boolean;
}

export interface SkillDefinition {
  id: string;
  description: string;
  aliases?: string[];
  inputSchema?: Record<string, SkillInputField | SkillInputFieldType>;
  steps: SkillStepDefinition[];
  readOnly?: boolean;
  concurrencySafe?: boolean;
  destructive?: boolean;
  maxResultSizeChars?: number;
}

export interface SkillStepResult {
  id: string;
  label?: string;
  tool: string;
  optional: boolean;
  success: boolean;
  result: string;
  recoverable?: boolean;
  suggestions?: string[];
}

export interface SkillRunResult {
  success: boolean;
  skill: string;
  steps: SkillStepResult[];
}

const SkillInputFieldSchema = z.union([
  z.enum(['string', 'number', 'boolean', 'object', 'array']),
  z.object({
    type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
    required: z.boolean().optional(),
    default: z.unknown().optional(),
    description: z.string().optional(),
  }),
]);

export const SkillDefinitionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_.-]+$/, 'Skill id must be a stable identifier'),
  description: z.string().min(1),
  aliases: z.array(z.string().min(1)).optional(),
  inputSchema: z.record(SkillInputFieldSchema).optional(),
  steps: z.array(z.object({
    id: z.string().min(1).optional(),
    label: z.string().min(1).optional(),
    tool: z.string().min(1),
    input: z.record(z.unknown()).optional(),
    optional: z.boolean().optional(),
  })).min(1),
  readOnly: z.boolean().optional(),
  concurrencySafe: z.boolean().optional(),
  destructive: z.boolean().optional(),
  maxResultSizeChars: z.number().int().positive().optional(),
}) satisfies z.ZodType<SkillDefinition>;
