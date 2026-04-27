/**
 * @module core/types/tool-types
 * @description Core tool interfaces for LEA's agent runtime system.
 * Inspired by claude-code's Tool architecture with structural type system.
 *
 * These types define the contract that all tools must implement to be
 * registered in the ToolRegistry and used by agents during execution.
 */

import type { z } from 'zod';
import type {
  PermissionBehavior,
  PermissionContext,
  PermissionResult as PermissionDecision,
} from '../permissions/types.js';

/**
 * Extended permission behavior that includes 'passthrough' for tool-level checks.
 * The global PermissionEngine handles 'passthrough' by converting it to 'ask'.
 */
export type ToolPermissionBehavior = PermissionBehavior | 'passthrough';

export type ToolSource = 'local' | 'mcp' | 'skill' | 'plugin' | 'lsp';

// ============================================================================
// CORE TOOL INTERFACE
// ============================================================================

/**
 * Result returned by a tool after execution.
 *
 * @template Output - The type of data the tool returns.
 */
export interface ToolResult<Output = unknown> {
  /** The primary output data from the tool execution. */
  data: Output;
  /** Optional metadata about the execution (e.g., timing, diagnostics). */
  metadata?: Readonly<Record<string, unknown>>;
  /** Optional additional messages to emit to the session stream. */
  newMessages?: readonly Message[];
}

/**
 * Context object passed to every tool call during execution.
 *
 * Provides tools with runtime information they may need for permission
 * checks, logging, cancellation, or AI provider access.
 */
export interface ToolUseContext {
  /** Unique identifier for the current session/agent run. */
  readonly sessionId: string;
  /** Optional agent identifier within the session (for multi-agent scenarios). */
  readonly agentId?: string;
  /** Permission context for checking access rights. */
  readonly permissions: PermissionContext;
  /** AbortController for cancelling long-running operations. */
  readonly abortController: AbortController;
  /** AI provider client (for tools that need to make LLM calls). */
  readonly provider: unknown;
  /** Working directory for this agent's tool executions. */
  readonly cwd?: string;
  /** Additional context properties (extensible for future needs). */
  readonly [key: string]: unknown;
}

/**
 * Simplified permission result returned by tool's checkPermissions method.
 *
 * Unlike the full PermissionDecision type, this is focused on the tool's
 * perspective: should this operation proceed, and with what modifications?
 *
 * @template Input - The type of input being checked.
 */
export interface ToolPermissionResult<Input = unknown> {
  /** The permission decision behavior. 'passthrough' delegates to the global engine. */
  behavior: ToolPermissionBehavior;
  /** Optional message explaining the decision (required for 'deny' and 'ask'). */
  message?: string;
  /** Optionally modified input (for 'allow' with user modifications). */
  updatedInput?: Input;
}

/**
 * Core Tool interface — all methods required, no defaults.
 *
 * Tools implementing this interface can be registered in the ToolRegistry
 * and used by agents during session execution. The structural type system
 * ensures all tools provide the same capabilities.
 *
 * @template Input - The type of input parameters the tool accepts.
 * @template Output - The type of output data the tool returns.
 */
export interface Tool<Input = unknown, Output = unknown> {
  /** Unique identifier for this tool (used for registration and invocation). */
  readonly name: string;
  /** Optional alternative names that can invoke this tool. */
  readonly aliases?: readonly string[];
  /** Human-readable description of what this tool does. */
  readonly description: string;
  /** Zod schema for validating and parsing input parameters. */
  readonly inputSchema: z.ZodType<Input>;
  /** Optional Zod schema for validating output data. */
  readonly outputSchema?: z.ZodType<Output>;

  /**
   * Execute the tool with validated input parameters.
   *
   * @param args - Validated input parameters matching inputSchema.
   * @param context - Runtime context for this tool call.
   * @returns Promise resolving to the tool's execution result.
   */
  call(args: Input, context: ToolUseContext): Promise<ToolResult<Output>>;

  /**
   * Check if this tool operation is permitted given current permissions.
   *
   * @param input - The raw input to check permissions against.
   * @param context - Runtime context including permission rules.
   * @returns Promise resolving to the permission decision.
   */
  checkPermissions(input: Input, context: ToolUseContext): Promise<ToolPermissionResult<Input>>;

  /**
   * Check if this tool is currently enabled.
   *
   * Tools may be disabled globally (e.g., feature flags) or conditionally
   * based on environment state.
   *
   * @returns true if the tool can be used, false otherwise.
   */
  isEnabled(): boolean;

  /**
   * Determine if this tool operation is read-only (no side effects).
   *
   * Read-only tools are more likely to be auto-approved in permission checks.
   *
   * @param input - The input parameters to evaluate.
   * @returns true if the operation has no mutating side effects.
   */
  isReadOnly(input: Input): boolean;

  /**
   * Determine if this tool can run concurrently with other tool calls.
   *
   * Concurrency-unsafe tools require exclusive access during execution.
   *
   * @param input - The input parameters to evaluate.
   * @returns true if the tool is safe to run concurrently.
   */
  isConcurrencySafe(input: Input): boolean;

  /**
   * Origin/source of this tool.
   *
   * Distinguishes where a tool comes from:
   * - `'local'` — built-in runtime tool (bash, task_output, etc.)
   * - `'mcp'` — bridged from an MCP server (Kali container)
   * - `'skill'` — declarative workflow registered as a tool
   * - Future: `'plugin'`, etc.
   *
   * Defaults to `'local'` if not specified.
   */
  readonly source?: ToolSource;

  /**
   * Determine if this tool operation is destructive (hard to reverse).
   *
   * Destructive operations (e.g., deletions, force-pushes) require extra
   * scrutiny in permission checks.
   *
   * @param input - The input parameters to evaluate.
   * @returns true if the operation is destructive.
   */
  isDestructive?(input: Input): boolean;

  /**
   * Get a user-facing name for this tool invocation.
   *
   * Used in UI displays and logging. May be parameter-specific.
   *
   * @param input - The input parameters for this invocation.
   * @returns Human-readable name for this specific tool call.
   */
  userFacingName(input: Input): string;

  /**
   * Get a brief activity description for this tool invocation.
   *
   * Used in status indicators and progress displays.
   *
   * @param input - The input parameters for this invocation.
   * @returns Brief description string, or null if not applicable.
   */
  getActivityDescription?(input: Input): string | null;

  /**
   * Maximum size of the result in characters.
   *
   * Results exceeding this size should be truncated or summarized to prevent
   * context overflow. Default to a reasonable limit if not specified.
   */
  readonly maxResultSizeChars: number;
}

// ============================================================================
// TOOL DEF (Factory Builder Type)
// ============================================================================

/**
 * ToolDef is the same as Tool but with optional methods.
 *
 * Used with the buildTool factory function to create tools with partial
 * implementations that are then merged with sensible defaults.
 *
 * Required fields: name, description, inputSchema, call, maxResultSizeChars
 * All other fields are optional and will be given default implementations.
 *
 * @template Input - The type of input parameters the tool accepts.
 * @template Output - The type of output data the tool returns.
 */
export interface ToolDef<Input = unknown, Output = unknown> {
  /** Unique identifier for this tool. */
  readonly name: string;
  /** Optional alternative names. */
  readonly aliases?: readonly string[];
  /** Human-readable description. */
  readonly description: string;
  /** Zod schema for input validation. */
  readonly inputSchema: z.ZodType<Input>;
  /** Optional Zod schema for output validation. */
  readonly outputSchema?: z.ZodType<Output>;

  /**
   * Execute the tool with validated input.
   * This is the ONLY required method besides basic metadata.
   */
  call(args: Input, context: ToolUseContext): Promise<ToolResult<Output>>;

  /**
   * Optional permission check implementation.
   * Defaults to passthrough (delegates to permission engine).
   */
  checkPermissions?(input: Input, context: ToolUseContext): Promise<ToolPermissionResult<Input>>;

  /**
   * Optional enabled check.
   * Defaults to always true.
   */
  isEnabled?(): boolean;

  /**
   * Optional read-only check.
   * Defaults to false (assume tools have side effects).
   */
  isReadOnly?(input: Input): boolean;

  /**
   * Optional concurrency safety check.
   * Fail-closed: defaults to false (assume NOT concurrency-safe).
   */
  isConcurrencySafe?(input: Input): boolean;

  /**
   * Optional destructive operation check.
   * Defaults to false.
   */
  isDestructive?(input: Input): boolean;

  /**
   * Optional user-facing name.
   * Defaults to the tool's base name.
   */
  userFacingName?(input: Input): string;

  /**
   * Optional activity description.
   * Defaults to null.
   */
  getActivityDescription?(input: Input): string | null;

  /**
   * Maximum result size in characters.
   * Required to prevent context overflow.
   */
  readonly maxResultSizeChars: number;

  /**
   * Origin/source of this tool.
   *
   * Defaults to `'local'` if not specified. Used for filtering and
   * display in tool discovery UIs.
   *
   * Values: `'local'`, `'mcp'`, `'skill'`, or future sources like `'plugin'`.
   */
  readonly source?: ToolSource;
}

// ============================================================================
// TOOL EXECUTION ERROR
// ============================================================================

/**
 * Typed error thrown when a tool execution fails.
 *
 * Wraps the original error with tool-specific context for better
 * error reporting and recovery strategies.
 */
export interface ToolExecutionError extends Error {
  /** The name of the tool that failed. */
  readonly toolName: string;
  /** The input that caused the failure. */
  readonly input: unknown;
  /** The underlying error that caused the failure. */
  readonly cause: Error;
  /** Whether this error is recoverable (can retry with different input). */
  readonly recoverable: boolean;
  /** Suggested alternative actions or fixes. */
  readonly suggestions?: readonly string[];
}

/**
 * Type guard to check if an error is a ToolExecutionError.
 *
 * @param error - The error to check.
 * @returns true if the error is a ToolExecutionError.
 */
export function isToolExecutionError(error: unknown): error is ToolExecutionError {
  return (
    error instanceof Error &&
    'toolName' in error &&
    'input' in error &&
    'cause' in error &&
    'recoverable' in error
  );
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Message type that can be emitted by tools during execution.
 * These messages will be added to the session message history.
 */
export interface Message {
  /** The role of the message sender. */
  readonly role: 'user' | 'assistant' | 'system';
  /** The message content (text or structured content blocks). */
  readonly content: string | ContentBlock[];
}

/**
 * Content block type for structured messages.
 * Used when a tool needs to emit rich/multimodal content.
 */
export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock;

/**
 * Plain text content block.
 */
export interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

/**
 * Tool use content block (requesting tool execution).
 */
export interface ToolUseBlock {
  readonly type: 'tool_use';
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

/**
 * Tool result content block (result of tool execution).
 */
export interface ToolResultBlock {
  readonly type: 'tool_result';
  readonly tool_use_id: string;
  readonly content: string;
  readonly is_error?: boolean;
}

/**
 * Thinking/reasoning content block.
 * Used for models that support explicit reasoning output.
 */
export interface ThinkingBlock {
  readonly type: 'thinking';
  readonly text: string;
  readonly signature?: string;
}
