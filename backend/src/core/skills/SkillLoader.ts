import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ToolRegistry } from '../runtime/ToolRegistry.js';
import type { ToolExecutor } from '../runtime/ToolExecutor.js';
import type { SkillDefinition } from './types.js';
import { SkillDefinitionSchema } from './types.js';
import { createSkillTool } from './SkillTool.js';

export interface SkillRegistrationResult {
  registered: number;
  skipped: number;
  errors: string[];
  registeredToolNames: string[];
  skippedToolNames: string[];
}

export interface SkillLoadResult {
  definitions: SkillDefinition[];
  errors: string[];
}

export async function loadSkillDefinitionsWithDiagnostics(dir: string): Promise<SkillLoadResult> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { definitions: [], errors: [] };
    }
    return {
      definitions: [],
      errors: [`Failed to read skills directory ${dir}: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const definitions: SkillDefinition[] = [];
  const errors: string[] = [];
  for (const filename of entries.filter((entry) => entry.endsWith('.json')).sort()) {
    const path = join(dir, filename);
    try {
      const raw = await readFile(path, 'utf8');
      const parsed = JSON.parse(raw);
      const result = SkillDefinitionSchema.safeParse(parsed);

      if (!result.success) {
        errors.push(`Invalid skill definition ${filename}: ${result.error.message}`);
        continue;
      }

      definitions.push(result.data);
    } catch (error) {
      errors.push(`Invalid skill definition ${filename}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { definitions, errors };
}

export async function loadSkillDefinitionsFromDir(dir: string): Promise<SkillDefinition[]> {
  const result = await loadSkillDefinitionsWithDiagnostics(dir);
  if (result.errors.length > 0) {
    throw new Error(result.errors.join('; '));
  }
  return result.definitions;
}

export function registerSkillTools(
  registry: ToolRegistry,
  definitions: readonly SkillDefinition[],
  options: { executor: ToolExecutor },
): SkillRegistrationResult {
  const result: SkillRegistrationResult = {
    registered: 0,
    skipped: 0,
    errors: [],
    registeredToolNames: [],
    skippedToolNames: [],
  };

  for (const definition of definitions) {
    const toolName = `skill:${definition.id}`;
    if (registry.has(toolName)) {
      result.skipped++;
      result.skippedToolNames.push(toolName);
      continue;
    }

    try {
      registry.register(createSkillTool(definition, options));
      result.registered++;
      result.registeredToolNames.push(toolName);
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return result;
}

export async function registerSkillsFromDirectory(
  registry: ToolRegistry,
  dir: string,
  options: { executor: ToolExecutor },
): Promise<SkillRegistrationResult> {
  const definitions = await loadSkillDefinitionsFromDir(dir);
  return registerSkillTools(registry, definitions, options);
}
