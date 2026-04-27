/**
 * @module core/runtime/CommandRegistry
 * @description Command registry for managing slash commands.
 *
 * Commands are user-invocable operations that either expand to prompts
 * for the AI model or execute locally without model involvement.
 *
 * This registry manages command registration, lookup, and execution.
 * It supports multiple command sources (builtin, skill, plugin, managed)
 * with priority-based conflict resolution.
 */

import type {
  Command,
  PromptCommand,
  LocalCommand,
  BaseCommand,
  CommandContext,
  CommandResult,
  CommandSource,
  CommandRegistryEntry,
  CommandExecutionError,
  CommandResultType,
} from '../types/command-types.js';
import type { ToolUseContext } from '../types/tool-types.js';
import type { Tool } from '../types/tool-types.js';

// ============================================================================
// DEFAULT PRIORITIES
// ============================================================================

/**
 * Default priority values for command sources.
 * Higher values take precedence in conflict resolution.
 */
export const DEFAULT_PRIORITIES: Record<CommandSource, number> = {
  /** Built-in commands have highest priority. */
  builtin: 1000,
  /** Managed commands (from remote config) have high priority. */
  managed: 800,
  /** Plugin commands have medium priority. */
  plugin: 600,
  /** User-defined skill commands have lowest priority (can be overridden). */
  skill: 400,
};

// ============================================================================
// COMMAND EXECUTOR
// ============================================================================

/**
 * Executes a command and returns its result.
 *
 * Handles both PromptCommand and LocalCommand types, returning
 * appropriate results for each.
 */
async function executeCommand(
  command: Command,
  args: string,
  context: CommandContext,
): Promise<CommandResult> {
  // Check if command is enabled
  if (command.isEnabled && !command.isEnabled()) {
    return {
      type: 'skip' as CommandResultType,
      content: `Command "${command.name}" is disabled.`,
    };
  }

  // Execute based on command type
  if (command.type === 'prompt') {
    const prompt = await (command as PromptCommand).getPrompt(args);
    return {
      type: 'text' as CommandResultType,
      content: prompt,
    };
  } else {
    return await (command as LocalCommand).call(args, context);
  }
}

// ============================================================================
// COMMAND REGISTRY
// ============================================================================

/**
 * Registry for managing command registration, lookup, and execution.
 *
 * The registry maintains commands from multiple sources with priority-based
 * conflict resolution. It supports alias resolution and can execute commands
 * with appropriate context.
 */
export class CommandRegistry {
  private readonly commands = new Map<string, CommandRegistryEntry>();
  private readonly aliases = new Map<string, string>(); // alias -> canonical name
  private readonly sources = new Set<CommandSource>();

  /**
   * Register a command.
   *
   * If a command with the same name already exists, the higher priority
   * command wins (lower priority command is not registered).
   *
   * @param command - The command to register.
   * @param source - Where this command comes from.
   * @param priority - Optional priority override (defaults to source default).
   * @returns true if the command was registered, false if a higher priority
   *          command with the same name already exists.
   */
  register(
    command: Command,
    source: CommandSource,
    priority?: number,
  ): boolean {
    const canonicalName = command.name;

    // Check for existing command
    const existing = this.commands.get(canonicalName);
    const newPriority = priority ?? DEFAULT_PRIORITIES[source];

    if (existing) {
      // Higher priority wins
      if (existing.priority >= newPriority) {
        return false; // Existing command has higher or equal priority
      }
      // Replace with higher priority command
      this.unregister(canonicalName);
    }

    // Register the command
    const entry: CommandRegistryEntry = {
      command,
      source,
      registeredAt: new Date(),
      priority: newPriority,
      active: true,
    };

    this.commands.set(canonicalName, entry);
    this.sources.add(source);

    // Register aliases
    if (command.aliases) {
      for (const alias of command.aliases) {
        // Check for alias conflict
        const aliasTarget = this.aliases.get(alias);
        if (aliasTarget && aliasTarget !== canonicalName) {
          const existingEntry = this.commands.get(aliasTarget);
          if (existingEntry && existingEntry.priority >= newPriority) {
            // Skip this alias, existing command has higher priority
            continue;
          }
        }
        this.aliases.set(alias, canonicalName);
      }
    }

    return true;
  }

  /**
   * Unregister a command by name.
   *
   * @param name - The name or alias of the command to unregister.
   * @returns true if the command was found and removed, false otherwise.
   */
  unregister(name: string): boolean {
    const canonicalName = this.resolveAlias(name);
    if (!canonicalName) {
      return false;
    }

    const entry = this.commands.get(canonicalName);
    if (!entry) {
      return false;
    }

    // Remove aliases pointing to this command
    const aliasesToDelete: string[] = [];
    this.aliases.forEach((target, alias) => {
      if (target === canonicalName) {
        aliasesToDelete.push(alias);
      }
    });
    for (const alias of aliasesToDelete) {
      this.aliases.delete(alias);
    }

    this.commands.delete(canonicalName);

    // Update sources set
    const stillHasSource = Array.from(this.commands.values()).some(
      (e) => e.source === entry.source,
    );
    if (!stillHasSource) {
      this.sources.delete(entry.source);
    }

    return true;
  }

  /**
   * Get a command by name or alias.
   *
   * @param name - The name or alias of the command to retrieve.
   * @returns The command if found and active, undefined otherwise.
   */
  get(name: string): Command | undefined {
    const entry = this.getEntry(name);
    return entry?.active ? entry.command : undefined;
  }

  /**
   * Get a command registry entry by name or alias.
   *
   * Returns the full entry including metadata, not just the command.
   *
   * @param name - The name or alias of the command.
   * @returns The registry entry if found, undefined otherwise.
   */
  getEntry(name: string): CommandRegistryEntry | undefined {
    const canonicalName = this.resolveAlias(name);
    return canonicalName ? this.commands.get(canonicalName) : undefined;
  }

  /**
   * Check if a command is registered.
   *
   * @param name - The name or alias of the command to check.
   * @returns true if the command is registered and active, false otherwise.
   */
  has(name: string): boolean {
    const entry = this.getEntry(name);
    return entry?.active ?? false;
  }

  /**
   * Execute a command by name.
   *
   * @param name - The name or alias of the command to execute.
   * @param args - The arguments string to pass to the command.
   * @param context - The execution context.
   * @returns Promise resolving to the command result, or an error result
   *          if the command is not found or disabled.
   */
  async execute(
    name: string,
    args: string,
    context: CommandContext,
  ): Promise<CommandResult> {
    const command = this.get(name);

    if (!command) {
      return {
        type: 'text',
        content: `Unknown command: ${name}`,
      };
    }

    return executeCommand(command, args, context);
  }

  /**
   * Get all registered commands.
   *
   * @returns An array of all registered commands.
   */
  getAll(): Command[] {
    return Array.from(this.commands.values())
      .filter((entry) => entry.active)
      .map((entry) => entry.command);
  }

  /**
   * Get all commands from a specific source.
   *
   * @param source - The source to filter by.
   * @returns An array of commands from the specified source.
   */
  getBySource(source: CommandSource): Command[] {
    return Array.from(this.commands.values())
      .filter((entry) => entry.source === source && entry.active)
      .map((entry) => entry.command);
  }

  /**
   * Get all active command sources.
   *
   * @returns A set of sources that have registered commands.
   */
  getSources(): Set<CommandSource> {
    return new Set(this.sources);
  }

  /**
   * Resolve an alias to its canonical command name.
   *
   * @param name - The name or alias to resolve.
   * @returns The canonical command name if found, undefined otherwise.
   */
  resolveAlias(name: string): string | undefined {
    if (this.commands.has(name)) {
      return name;
    }
    return this.aliases.get(name);
  }

  /**
   * Enable or disable a command.
   *
   * Disabled commands remain registered but won't execute.
   *
   * @param name - The name or alias of the command.
   * @param active - Whether the command should be active.
   * @returns true if the command was found, false otherwise.
   */
  setActive(name: string, active: boolean): boolean {
    const canonicalName = this.resolveAlias(name);
    const entry = canonicalName ? this.commands.get(canonicalName) : undefined;

    if (!entry || !canonicalName) {
      return false;
    }

    // Replace the entry with a new one with updated active state
    this.commands.set(canonicalName, {
      ...entry,
      active,
    });

    return true;
  }

  /**
   * Clear all registered commands.
   *
   * Useful for testing or resetting the registry state.
   */
  clear(): void {
    this.commands.clear();
    this.aliases.clear();
    this.sources.clear();
  }

  /**
   * Get the number of registered commands.
   */
  get size(): number {
    return Array.from(this.commands.values()).filter((e) => e.active).length;
  }

  /**
   * Get command names matching a prefix.
   *
   * Useful for command autocomplete/suggestions.
   *
   * @param prefix - The prefix to match.
   * @returns Array of matching command names.
   */
  suggest(prefix: string): string[] {
    const results: string[] = [];
    const lowerPrefix = prefix.toLowerCase();

    for (const [name, entry] of Array.from(this.commands.entries())) {
      if (!entry.active) continue;
      if (name.toLowerCase().startsWith(lowerPrefix)) {
        results.push(name);
      }
      // Also check aliases
      for (const alias of entry.command.aliases ?? []) {
        if (alias.toLowerCase().startsWith(lowerPrefix) && !results.includes(alias)) {
          results.push(alias);
        }
      }
    }

    return results.sort();
  }
}

// ============================================================================
// COMMAND CONTEXT BUILDER
// ============================================================================

/**
 * Build a CommandContext from base components.
 *
 * @param sessionId - The session identifier.
 * @param args - The command arguments string.
 * @param toolUseContext - The tool use context.
 * @param tools - Map of available tools.
 * @param extras - Additional context properties.
 * @returns A complete CommandContext.
 */
export function buildCommandContext(
  sessionId: string,
  args: string,
  toolUseContext: ToolUseContext,
  tools: ReadonlyMap<string, Tool>,
  extras?: Record<string, unknown>,
): CommandContext {
  const context: CommandContext = {
    sessionId,
    args,
    toolUseContext,
    tools,
    ...extras,
  };
  return context;
}

// ============================================================================
// CREATE COMMAND EXECUTION ERROR
// ============================================================================

/**
 * Create a CommandExecutionError with proper structure.
 *
 * @param commandName - The name of the command that failed.
 * @param args - The arguments that caused the failure.
 * @param cause - The underlying error.
 * @param recoverable - Whether the error is recoverable.
 * @returns A properly structured CommandExecutionError.
 */
export function createCommandExecutionError(
  commandName: string,
  args: string,
  cause: Error,
  recoverable = false,
): CommandExecutionError {
  const baseError = new Error(
    `Command "${commandName}" execution failed: ${cause.message}`,
  );

  const error = {
    ...baseError,
    name: 'CommandExecutionError',
    message: baseError.message,
    stack: baseError.stack,
    commandName,
    args,
    cause,
    recoverable,
  } as CommandExecutionError;

  Object.freeze(error);
  return error;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default CommandRegistry;
