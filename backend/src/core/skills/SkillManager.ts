import type { ToolExecutor } from '../runtime/ToolExecutor.js';
import type { ToolRegistry } from '../runtime/ToolRegistry.js';
import type { SkillDefinition } from './types.js';
import {
  loadSkillDefinitionsWithDiagnostics,
  registerSkillTools,
  type SkillRegistrationResult,
} from './SkillLoader.js';

export interface SkillStepMetadata {
  id: string;
  tool: string;
  optional: boolean;
}

export interface SkillMetadata {
  id: string;
  toolName: string;
  aliases: string[];
  description: string;
  steps: SkillStepMetadata[];
  readOnly: boolean;
  concurrencySafe: boolean;
  destructive: boolean;
  maxResultSizeChars: number;
}

export interface SkillManagerSnapshot {
  skillsDir: string;
  loadedAt?: string;
  registered: number;
  skipped: number;
  errors: string[];
  skills: SkillMetadata[];
}

export interface SkillManagerOptions {
  registry: ToolRegistry;
  executor: ToolExecutor;
  skillsDir: string;
}

function toSkillMetadata(definition: SkillDefinition): SkillMetadata {
  return {
    id: definition.id,
    toolName: `skill:${definition.id}`,
    aliases: Array.from(new Set([definition.id, ...(definition.aliases ?? [])])),
    description: definition.description,
    steps: definition.steps.map((step, index) => ({
      id: step.id ?? `step_${index + 1}`,
      tool: step.tool,
      optional: step.optional ?? false,
    })),
    readOnly: definition.readOnly ?? false,
    concurrencySafe: definition.concurrencySafe ?? false,
    destructive: definition.destructive ?? false,
    maxResultSizeChars: definition.maxResultSizeChars ?? 50_000,
  };
}

export class SkillManager {
  private readonly registry: ToolRegistry;
  private readonly executor: ToolExecutor;
  private readonly skillsDir: string;
  private managedToolNames = new Set<string>();
  private snapshot: SkillManagerSnapshot;

  constructor(options: SkillManagerOptions) {
    this.registry = options.registry;
    this.executor = options.executor;
    this.skillsDir = options.skillsDir;
    this.snapshot = {
      skillsDir: this.skillsDir,
      registered: 0,
      skipped: 0,
      errors: [],
      skills: [],
    };
  }

  getSnapshot(): SkillManagerSnapshot {
    return {
      ...this.snapshot,
      errors: [...this.snapshot.errors],
      skills: this.snapshot.skills.map((skill) => ({
        ...skill,
        aliases: [...skill.aliases],
        steps: skill.steps.map((step) => ({ ...step })),
      })),
    };
  }

  async reload(): Promise<SkillManagerSnapshot> {
    this.unregisterManagedSkills();

    const loaded = await loadSkillDefinitionsWithDiagnostics(this.skillsDir);
    const registration = registerSkillTools(this.registry, loaded.definitions, { executor: this.executor });
    this.managedToolNames = new Set(registration.registeredToolNames);

    this.snapshot = this.createSnapshot(loaded.definitions, registration, loaded.errors);
    return this.getSnapshot();
  }

  private unregisterManagedSkills(): void {
    for (const toolName of this.managedToolNames) {
      this.registry.unregister(toolName);
    }
    this.managedToolNames.clear();
  }

  private createSnapshot(
    definitions: readonly SkillDefinition[],
    registration: SkillRegistrationResult,
    loadErrors: readonly string[],
  ): SkillManagerSnapshot {
    const managedDefinitions = definitions.filter((definition) =>
      registration.registeredToolNames.includes(`skill:${definition.id}`),
    );

    return {
      skillsDir: this.skillsDir,
      loadedAt: new Date().toISOString(),
      registered: registration.registered,
      skipped: registration.skipped,
      errors: [...loadErrors, ...registration.errors],
      skills: managedDefinitions.map(toSkillMetadata),
    };
  }
}
