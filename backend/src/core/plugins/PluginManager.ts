import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { readdir, readFile, realpath } from 'node:fs/promises';
import { join, normalize, resolve, sep } from 'node:path';
import type { ToolExecutor } from '../runtime/ToolExecutor.js';
import type { ToolRegistry } from '../runtime/ToolRegistry.js';
import { registerSkillTools } from '../skills/SkillLoader.js';
import { SkillDefinitionSchema, type SkillDefinition } from '../skills/types.js';
import { PluginTrustStore } from './PluginTrustStore.js';
import {
  PluginManifestSchema,
  type PluginManagerSnapshot,
  type PluginManifest,
  type PluginSnapshot,
} from './types.js';

export interface PluginManagerOptions {
  pluginsDir: string;
  trustStorePath: string;
  registry: ToolRegistry;
  executor: ToolExecutor;
}

interface DiscoveredPlugin {
  manifest: PluginManifest;
  directory: string;
  digest: string;
  skillDefinitions: SkillDefinition[];
  skillErrors: string[];
}

export class PluginManager {
  private readonly pluginsDir: string;
  private readonly trustStore: PluginTrustStore;
  private readonly registry: ToolRegistry;
  private readonly executor: ToolExecutor;
  private managedToolNames = new Set<string>();
  private snapshot: PluginManagerSnapshot;

  constructor(options: PluginManagerOptions) {
    this.pluginsDir = options.pluginsDir;
    this.trustStore = new PluginTrustStore(options.trustStorePath);
    this.registry = options.registry;
    this.executor = options.executor;
    this.snapshot = {
      pluginsDir: this.pluginsDir,
      trustStorePath: options.trustStorePath,
      plugins: [],
      errors: [],
    };
  }

  getSnapshot(): PluginManagerSnapshot {
    return {
      ...this.snapshot,
      plugins: this.snapshot.plugins.map((plugin) => ({
        ...plugin,
        skills: [...plugin.skills],
        registeredTools: [...plugin.registeredTools],
        errors: [...plugin.errors],
      })),
      errors: [...this.snapshot.errors],
    };
  }

  async reload(): Promise<PluginManagerSnapshot> {
    this.unregisterManagedTools();
    const { plugins, errors } = await this.discover();
    const snapshots: PluginSnapshot[] = [];

    for (const plugin of plugins) {
      const trust = await this.trustStore.getState(plugin.manifest.id, plugin.digest);
      const base = {
        id: plugin.manifest.id,
        name: plugin.manifest.name,
        version: plugin.manifest.version,
        description: plugin.manifest.description,
        directory: plugin.directory,
        digest: plugin.digest,
        trust,
        skills: plugin.manifest.skills ?? [],
      };

      if (trust !== 'trusted') {
        snapshots.push({
          ...base,
          state: trust,
          registeredTools: [],
          errors: plugin.skillErrors,
        });
        continue;
      }

      const registration = registerSkillTools(this.registry, plugin.skillDefinitions, {
        executor: this.executor,
      });
      registration.registeredToolNames.forEach((name) => this.managedToolNames.add(name));
      snapshots.push({
        ...base,
        state: registration.errors.length || plugin.skillErrors.length ? 'error' : 'loaded',
        registeredTools: registration.registeredToolNames,
        errors: [...plugin.skillErrors, ...registration.errors],
      });
    }

    this.snapshot = {
      pluginsDir: this.pluginsDir,
      trustStorePath: this.trustStore.filePath,
      loadedAt: new Date().toISOString(),
      plugins: snapshots,
      errors,
    };
    return this.getSnapshot();
  }

  async trust(pluginId: string): Promise<PluginManagerSnapshot> {
    const plugin = await this.findCurrent(pluginId);
    await this.trustStore.trust(plugin.manifest.id, plugin.digest);
    return this.reload();
  }

  async deny(pluginId: string): Promise<PluginManagerSnapshot> {
    const plugin = await this.findCurrent(pluginId);
    await this.trustStore.deny(plugin.manifest.id, plugin.digest);
    return this.reload();
  }

  private unregisterManagedTools(): void {
    for (const toolName of this.managedToolNames) {
      this.registry.unregister(toolName);
    }
    this.managedToolNames.clear();
  }

  private async findCurrent(pluginId: string): Promise<DiscoveredPlugin> {
    const { plugins } = await this.discover();
    const plugin = plugins.find((candidate) => candidate.manifest.id === pluginId);
    if (!plugin) {
      throw new Error(`Plugin "${pluginId}" not found`);
    }
    return plugin;
  }

  private async discover(): Promise<{ plugins: DiscoveredPlugin[]; errors: string[] }> {
    let entries: Dirent[];
    try {
      entries = await readdir(this.pluginsDir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { plugins: [], errors: [] };
      }
      return { plugins: [], errors: [`Failed to read plugins directory: ${String((error as Error).message ?? error)}`] };
    }

    const plugins: DiscoveredPlugin[] = [];
    const errors: string[] = [];
    for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const directory = join(this.pluginsDir, entry.name);
      try {
        plugins.push(await this.loadPlugin(directory));
      } catch (error) {
        errors.push(`Invalid plugin ${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { plugins, errors };
  }

  private async loadPlugin(directory: string): Promise<DiscoveredPlugin> {
    const manifestPath = join(directory, 'lea-plugin.json');
    const manifestRaw = await readFile(manifestPath, 'utf8');
    const manifest = PluginManifestSchema.parse(JSON.parse(manifestRaw));
    const skillDefinitions: SkillDefinition[] = [];
    const skillErrors: string[] = [];
    const digest = createHash('sha256').update(manifestRaw);

    for (const relativePath of manifest.skills ?? []) {
      const skillPath = await this.safeJoin(directory, relativePath);
      try {
        const raw = await readFile(skillPath, 'utf8');
        digest.update(raw);
        skillDefinitions.push(SkillDefinitionSchema.parse(JSON.parse(raw)));
      } catch (error) {
        skillErrors.push(`Invalid skill ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      manifest,
      directory,
      digest: digest.digest('hex'),
      skillDefinitions,
      skillErrors,
    };
  }

  private async safeJoin(base: string, relativePath: string): Promise<string> {
    const normalized = normalize(relativePath);
    if (normalized.startsWith('..') || normalized.includes('/../')) {
      throw new Error(`Plugin path escapes plugin directory: ${relativePath}`);
    }
    const absolute = resolve(base, normalized);
    const root = resolve(base);
    if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
      throw new Error(`Plugin path escapes plugin directory: ${relativePath}`);
    }

    const realRoot = await realpath(root);
    const realAbsolute = await realpath(absolute);
    if (realAbsolute !== realRoot && !realAbsolute.startsWith(`${realRoot}${sep}`)) {
      throw new Error(`Plugin path escapes plugin directory: ${relativePath}`);
    }
    return realAbsolute;
  }
}
