/**
 * @module core/types/session-types
 * @description Session loop types for LEA's agent runtime system.
 *
 * Defines the core session execution loop, streaming events, and
 * configuration. Inspired by claude-code's query.ts architecture.
 *
 * The session loop is the heart of the runtime: it orchestrates model calls,
 * tool executions, and streaming events to drive agent behavior.
 */

import type { Tool } from './tool-types.js';
import type { Command } from './command-types.js';
import type { ChatMessage, ContentBlock } from '../../services/ai/AIClient.js';
import type { ToolExecutor } from '../runtime/ToolExecutor.js';

// ============================================================================
// SESSION CONFIGURATION
// ============================================================================

/**
 * Immutable configuration for a session.
 *
 * Sessions are created with this config and cannot be modified during
 * execution. To change behavior, create a new session.
 */
export interface SessionConfig {
  /** Unique identifier for this session. */
  readonly sessionId: string;
  /** The model identifier to use for this session. */
  readonly model: string;
  /** System prompt that guides model behavior. */
  readonly systemPrompt: string;
  /**
   * Optional maximum number of turns before auto-completion.
   *
   * A "turn" is one full model response cycle (including any tool calls).
   * Undefined means no limit (session runs until completion or abort).
   */
  readonly maxTurns?: number;
  /**
   * Tools available to the model during this session.
   *
   * Tools are filtered by canUseTool before each invocation.
   */
  readonly tools: readonly Tool[];
  /**
   * Commands available during this session.
   *
   * Commands can be invoked by the user via the chat interface.
   */
  readonly commands: readonly Command[];
  /**
   * Optional custom temperature for model sampling.
   */
  readonly temperature?: number;
  /**
   * Optional maximum tokens per model response.
   */
  readonly maxTokens?: number;
  /**
   * Optional thinking budget for models that support reasoning tokens.
   */
  readonly thinkingBudget?: number;
}

// ============================================================================
// STREAM EVENTS
// ============================================================================

/**
 * Discriminated union of all events that can be emitted during a session.
 *
 * These events are streamed to clients via SSE and drive real-time UI updates.
 */
export type StreamEvent =
  | TextDeltaEvent
  | ToolUseEvent
  | ToolResultEvent
  | ToolProgressEvent
  | ThinkingEvent
  | ErrorEvent
  | TurnStartEvent
  | TurnEndEvent
  | ModelStopEvent
  | UsageEvent;

/**
 * A chunk of text content from the model.
 */
export interface TextDeltaEvent {
  readonly type: 'text_delta';
  /** The text chunk to append to the current message. */
  readonly text: string;
}

/**
 * The model is requesting a tool call.
 */
export interface ToolUseEvent {
  readonly type: 'tool_use';
  /** Unique identifier for this tool use (matches result). */
  readonly id: string;
  /** The name of the tool being invoked. */
  readonly toolName: string;
  /** The input parameters for the tool. */
  readonly input: unknown;
  /** Optional signature for models that support tool call signing. */
  readonly thoughtSignature?: string;
}

/**
 * Result from a completed tool execution.
 */
export interface ToolResultEvent {
  readonly type: 'tool_result';
  /** Matches the id from the corresponding ToolUseEvent. */
  readonly id: string;
  /** The name of the tool that was executed. */
  readonly toolName: string;
  /** The result data from the tool execution. */
  readonly result: unknown;
  /** Whether the tool execution resulted in an error. */
  readonly isError?: boolean;
}

/**
 * Progress update during a long-running tool execution.
 */
export interface ToolProgressEvent {
  readonly type: 'tool_progress';
  /** Matches the id from the corresponding ToolUseEvent. */
  readonly id: string;
  /** Human-readable progress message. */
  readonly message: string;
  /** Optional progress percentage (0-100). */
  readonly progress?: number;
}

/**
 * Thinking/reasoning content from models that support explicit reasoning.
 */
export interface ThinkingEvent {
  readonly type: 'thinking';
  /** The thinking/reasoning text content. */
  readonly content: string;
  /** Optional signature for verifying thinking integrity. */
  readonly signature?: string;
}

/**
 * An error occurred during session execution.
 */
export interface ErrorEvent {
  readonly type: 'error';
  /** The error that occurred. */
  readonly error: Error;
  /** Whether the session can recover from this error. */
  readonly recoverable: boolean;
  /** Suggested recovery actions. */
  readonly suggestions?: readonly string[];
}

/**
 * A new turn (model response cycle) is starting.
 */
export interface TurnStartEvent {
  readonly type: 'turn_start';
  /** The turn number (1-indexed). */
  readonly turn: number;
}

/**
 * A turn has completed.
 */
export interface TurnEndEvent {
  readonly type: 'turn_end';
  /** The turn number (1-indexed). */
  readonly turn: number;
  /** Why this turn ended. */
  readonly reason: TurnEndReason;
}

/**
 * The model has finished generating and provides its stop reason.
 *
 * This event is emitted once per model call, after all content events
 * (text_delta, tool_use, thinking). SessionLoop uses it to determine
 * the appropriate TurnEndReason.
 */
export interface ModelStopEvent {
  readonly type: 'model_stop';
  /** Why the model stopped generating. */
  readonly reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
}

/**
 * Token usage reported by the model provider after a call completes.
 * Emitted once per LLM call, after all content events.
 */
export interface UsageEvent {
  readonly type: 'usage';
  /** Model identifier used for this call. */
  readonly model: string;
  /** Input tokens consumed. */
  readonly inputTokens: number;
  /** Output tokens generated. */
  readonly outputTokens: number;
  /** Estimated cost in USD. */
  readonly costUsd: number;
}

/**
 * Reasons why a turn might end.
 */
export type TurnEndReason =
  /** Normal completion of the model response. */
  | 'completed'
  /** The model wants to use a tool. */
  | 'tool_use'
  /** The model hit max tokens before finishing. */
  | 'max_tokens'
  /** The model hit a stop sequence. */
  | 'stop_sequence';

// ============================================================================
// TERMINATION REASONS
// ============================================================================

/**
 * Reasons why a session might terminate.
 *
 * Used to determine if the session completed successfully, was aborted,
 * or failed due to an error condition.
 */
export type TerminalReason =
  /** Session completed all work successfully. */
  | 'completed'
  /** Session was aborted by user or system. */
  | 'aborted'
  /** Session hit maxTurns limit. */
  | 'max_turns'
  /** Prompt became too large for the model's context window. */
  | 'prompt_too_long'
  /** The model provider returned an error. */
  | 'model_error'
  /** A tool execution failed and couldn't be recovered. */
  | 'tool_error'
  /** Session ran out of available budget/tokens. */
  | 'budget_exceeded';

// ============================================================================
// SESSION STATE
// ============================================================================

/**
 * Immutable parameters to start a session loop.
 */
export interface QueryParams {
  /** The session configuration. */
  readonly config: SessionConfig;
  /** Initial message history (for continuation sessions). */
  readonly messages: readonly ChatMessage[];
  /**
   * Optional filter for which tools the model can use.
   *
   * If provided, the model will only be able to use tools that pass
   * this check. Useful for implementing tool-level permissions.
   */
  readonly canUseTool?: CanUseToolFn;
  /**
   * Optional injectable dependencies for testing.
   *
   * If not provided, default implementations are used.
   */
  readonly deps?: QueryDeps;
}

/**
 * Function type for checking if a tool can be used.
 *
 * @param tool - The tool being checked.
 * @param input - The input parameters for the tool call.
 * @returns Promise resolving to true if the tool can be used.
 */
export type CanUseToolFn = (
  tool: Tool,
  input: unknown,
) => Promise<boolean>;

/**
 * Injectable dependencies for the session loop.
 *
 * Providing these allows for deterministic testing and mocking of
 * external dependencies like the model client.
 */
export interface QueryDeps {
  /**
   * Call the model and stream events.
   *
   * @param params - Model invocation parameters.
   * @returns AsyncGenerator yielding stream events.
   */
  readonly callModel: (params: ModelCallParams) => AsyncGenerator<StreamEvent>;
  /**
   * UUID generator for creating unique IDs.
   *
   * @returns A unique identifier string.
   */
  readonly uuid: () => string;
  /**
   * Optional ToolExecutor for tool execution.
   *
   * If not provided, one will be created from the config tools.
   */
  readonly toolExecutor?: ToolExecutor;
}

/**
 * Parameters passed to the model client.
 */
export interface ModelCallParams {
  /** The model identifier to call. */
  readonly model: string;
  /** Messages to send to the model. */
  readonly messages: readonly ChatMessage[];
  /** Tools available to the model. */
  readonly tools: readonly Tool[];
  /** System prompt for the model. */
  readonly systemPrompt: string;
  /** Maximum tokens for the response. */
  readonly maxTokens?: number;
  /** Temperature for sampling. */
  readonly temperature?: number;
  /** Thinking budget for reasoning models. */
  readonly thinkingBudget?: number;
  /** Optional abort signal for cancellation. */
  readonly signal?: AbortSignal;
  /**
   * Optional session identifier for cost/usage tracking.
   * When provided, usage events will be attributed to this session.
   * Format: `<swarmRunId>-<agentId>` (e.g. `run-abc123-agent-0`).
   */
  readonly sessionId?: string;
}

/**
 * Mutable state within the session loop.
 *
 * This state is updated during execution and is not part of the immutable
 * session configuration.
 */
export interface LoopState {
  /** The message history (grows during execution). */
  messages: ChatMessage[];
  /** Current turn number (starts at 0, increments each turn). */
  turnCount: number;
  /** AbortController for cancelling the session. */
  readonly abortController: AbortController;
  /** Whether the session is currently paused. */
  paused: boolean;
  /** Additional mutable state (extensible). */
  [key: string]: unknown;
}

// ============================================================================
// SESSION RESULT
// ============================================================================

/**
 * Final result of a completed session.
 *
 * Returned when the session loop terminates for any reason.
 */
export interface SessionResult {
  /** Why the session terminated. */
  readonly reason: TerminalReason;
  /** Final message history. */
  readonly messages: readonly ChatMessage[];
  /** Total number of turns executed. */
  readonly turnCount: number;
  /** Total tokens consumed (if tracked). */
  readonly usage?: TokenUsage;
  /** Error if the session terminated due to failure. */
  readonly error?: Error;
}

/**
 * Token usage statistics for a session.
 */
export interface TokenUsage {
  /** Total input tokens consumed. */
  readonly inputTokens: number;
  /** Total output tokens consumed. */
  readonly outputTokens: number;
  /** Total tokens (input + output). */
  readonly totalTokens: number;
  /** Estimated cost in USD (if applicable). */
  readonly estimatedCost?: number;
}

// ============================================================================
// SESSION STATUS
// ============================================================================

/**
 * Current status of a session.
 *
 * Used for UI display and state management.
 */
export type SessionStatus =
  /** Session is initializing. */
  | 'initializing'
  /** Session is actively running. */
  | 'running'
  /** Session is paused (can be resumed). */
  | 'paused'
  /** Session completed successfully. */
  | 'completed'
  /** Session was cancelled by user. */
  | 'cancelled'
  /** Session failed with an error. */
  | 'failed';

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Extended ChatMessage with additional metadata.
 *
 * Used internally within the session loop for tracking message
 * provenance and timing.
 */
export interface ExtendedChatMessage extends ChatMessage {
  /** Unique identifier for this message. */
  readonly id: string;
  /** Timestamp when this message was created. */
  readonly timestamp: number;
  /** Optional metadata about the message. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Tool execution state for tracking in-progress tool calls.
 */
export interface ToolExecutionState {
  /** The tool use event ID. */
  readonly toolUseId: string;
  /** The tool being executed. */
  readonly tool: Tool;
  /** The input parameters. */
  readonly input: unknown;
  /** When execution started. */
  readonly startTime: number;
  /** Current execution status. */
  readonly status: 'executing' | 'completed' | 'failed';
  /** Result if completed. */
  readonly result?: unknown;
  /** Error if failed. */
  readonly error?: Error;
}
