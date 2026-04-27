/**
 * @module core/types/command-types
 * @description Command types for LEA's agent runtime system.
 *
 * Commands are user-invocable operations that expand to prompts or execute
 * directly. Inspired by claude-code's slash command architecture.
 *
 * Two command types:
 * - PromptCommand: Expands to a prompt sent to the AI model
 * - LocalCommand: Executes directly without model involvement
 */

import type { Tool } from './tool-types.js';
import type { ToolUseContext } from './tool-types.js';

// ============================================================================
// COMMAND DISCRIMINATED UNION
// ============================================================================

/**
 * Base command interface with common properties.
 *
 * All commands share these properties regardless of their type.
 */
export interface BaseCommand {
  /** Unique identifier for this command. */
  readonly name: string;
  /** Optional alternative names that can invoke this command. */
  readonly aliases?: readonly string[];
  /** Human-readable description of what this command does. */
  readonly description: string;
  /**
   * Check if this command is currently enabled.
   *
   * Commands may be disabled based on feature flags, environment state,
   * or user configuration.
   *
   * @returns true if the command can be invoked, false otherwise.
   */
  isEnabled?(): boolean;
  /** Argument hint for autocomplete UI (e.g. "list | <taskId>"). */
  readonly argHints?: string;
  /** UI grouping for command menu (e.g. "actions", "navigation", "info"). */
  readonly group?: string;
}

/**
 * A command that expands to a prompt for the AI model.
 *
 * When invoked, the prompt is injected into the message history and
 * processed by the model like any other user message.
 *
 * Example: `/refactor` → generates a detailed refactoring prompt.
 */
export interface PromptCommand extends BaseCommand {
  /** Discriminator: this is a prompt-based command. */
  readonly type: 'prompt';

  /**
   * Generate the prompt text from command arguments.
   *
   * @param args - Parsed command arguments (string-based).
   * @returns Promise resolving to the prompt text to inject.
   */
  getPrompt(args: string): Promise<string>;

  /**
   * Optional: restrict which tools the model can use while processing
   * this prompt.
   *
   * If undefined, all available tools are permitted.
   */
  readonly allowedTools?: readonly string[];
}

/**
 * A command that executes directly without model involvement.
 *
 * Local commands perform their own logic and return results immediately.
 * Useful for operations that don't need LLM reasoning.
 *
 * Example: `/status` → returns current session status without AI call.
 */
export interface LocalCommand extends BaseCommand {
  /** Discriminator: this is a locally-executing command. */
  readonly type: 'local';

  /**
   * Execute the command with its arguments.
   *
   * @param args - Parsed command arguments (string-based).
   * @param context - Execution context with tool use capabilities.
   * @returns Promise resolving to the command result.
   */
  call(args: string, context: CommandContext): Promise<CommandResult>;
}

/**
 * Discriminated union of all command types.
 */
export type Command = PromptCommand | LocalCommand;

// ============================================================================
// COMMAND CONTEXT
// ============================================================================

/**
 * Context passed to local command execution.
 *
 * Provides commands with access to session state and tool capabilities.
 */
export interface CommandContext {
  /** Unique identifier for the current session. */
  readonly sessionId: string;
  /** The raw arguments string passed to the command. */
  readonly args: string;
  /**
   * Tool use context for executing tools if needed.
   *
   * Local commands may invoke tools as part of their execution.
   */
  readonly toolUseContext: ToolUseContext;
  /** Map of available tools (for commands that need to invoke tools). */
  readonly tools: ReadonlyMap<string, Tool>;
  /** Additional context properties (extensible). */
  readonly [key: string]: unknown;
}

// ============================================================================
// COMMAND RESULT
// ============================================================================

/**
 * Result type for local command execution.
 *
 * Defines how the command's output should be displayed to the user.
 */
export interface CommandResult {
  /** The rendering type for this result. */
  readonly type: CommandResultType;
  /** The content to display. */
  readonly content: string;
}

/**
 * How a command result should be rendered/displayed.
 */
export type CommandResultType =
  /** Normal text output with full formatting. */
  | 'text'
  /** Compact output suitable for inline display. */
  | 'compact'
  /** Skip display entirely (command executed silently). */
  | 'skip';

// ============================================================================
// COMMAND SOURCE
// ============================================================================

/**
 * Where a command originates from.
 *
 * Used for priority (builtins override) and management (plugins can be
 * disabled, skills can be reloaded).
 */
export type CommandSource =
  /** Built-in commands shipped with LEA core. */
  | 'builtin'
  /** User-defined commands from skills/ directory. */
  | 'skill'
  /** External plugin-provided commands. */
  | 'plugin'
  /** Managed commands (e.g., from remote configuration). */
  | 'managed';

// ============================================================================
// COMMAND REGISTRY ENTRY
// ============================================================================

/**
 * Extended command type with metadata for registry storage.
 *
 * Commands are stored in the registry with additional metadata about
 * their source and registration status.
 */
export interface CommandRegistryEntry {
  /** The command implementation. */
  readonly command: Command;
  /** Where this command was loaded from. */
  readonly source: CommandSource;
  /** When this command was registered (for cache invalidation). */
  readonly registeredAt: Date;
  /** Priority for conflict resolution (higher wins). */
  readonly priority: number;
  /** Whether this command is currently active (not disabled). */
  readonly active: boolean;
}

// ============================================================================
// COMMAND EXECUTION ERROR
// ============================================================================

/**
 * Error thrown when a command execution fails.
 */
export interface CommandExecutionError extends Error {
  /** The name of the command that failed. */
  readonly commandName: string;
  /** The arguments that caused the failure. */
  readonly args: string;
  /** The underlying error. */
  readonly cause: Error;
  /** Whether this error is recoverable. */
  readonly recoverable: boolean;
}

/**
 * Type guard to check if an error is a CommandExecutionError.
 *
 * @param error - The error to check.
 * @returns true if the error is a CommandExecutionError.
 */
export function isCommandExecutionError(error: unknown): error is CommandExecutionError {
  return (
    error instanceof Error &&
    'commandName' in error &&
    'args' in error &&
    'cause' in error
  );
}
