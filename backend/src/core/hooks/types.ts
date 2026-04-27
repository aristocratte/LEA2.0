/**
 * @module core/hooks/types
 * @description Type definitions for the runtime HookBus system.
 *
 * Hooks provide an extensibility point for observing and optionally
 * influencing tool execution and agent lifecycle events without
 * modifying ToolExecutor or AgentRunner directly.
 */

// ============================================================================
// EVENT NAMES
// ============================================================================

/**
 * All supported hook event names.
 *
 * Each event carries a typed payload (see below).
 * To add a new event: add name here + payload interface + extend HookEventMap.
 */
export type HookEventName =
  | 'pre-tool'
  | 'post-tool'
  | 'tool-failure'
  | 'agent-idle'
  | 'agent-completed';

// ============================================================================
// PAYLOAD TYPES
// ============================================================================

/**
 * Payload emitted before a tool is executed.
 *
 * Listeners can inspect but NOT modify the input
 * (modification would require a different contract).
 */
export interface PreToolPayload {
  /** Session identifier (typically `${swarmRunId}-${agentId}`) */
  readonly sessionId: string;
  /** Agent executing the tool */
  readonly agentId: string;
  /** Name of the tool about to be called */
  readonly toolName: string;
  /** Validated input parameters */
  readonly input: Record<string, unknown>;
  /** ISO timestamp of emission */
  readonly timestamp: string;
}

/**
 * Payload emitted after a tool executes successfully.
 */
export interface PostToolPayload {
  /** Session identifier */
  readonly sessionId: string;
  /** Agent that executed the tool */
  readonly agentId: string;
  /** Name of the tool that was called */
  readonly toolName: string;
  /** Input that was passed to the tool */
  readonly input: Record<string, unknown>;
  /** Raw output from the tool (pre-truncation) */
  readonly result: unknown;
  /** ISO timestamp of emission */
  readonly timestamp: string;
}

/**
 * Payload emitted when a tool execution fails.
 */
export interface ToolFailurePayload {
  /** Session identifier */
  readonly sessionId: string;
  /** Agent that was running the tool */
  readonly agentId: string;
  /** Name of the tool that failed */
  readonly toolName: string;
  /** Input that was passed to the tool */
  readonly input: Record<string, unknown>;
  /** Error object or message string */
  readonly error: Error | string;
  /** ISO timestamp of emission */
  readonly timestamp: string;
}

/**
 * Payload emitted when an agent transitions to idle state
 * (finished its current turn, waiting for next prompt).
 */
export interface AgentIdlePayload {
  /** Agent identifier */
  readonly agentId: string;
  /** Swarm run this agent belongs to */
  readonly swarmRunId: string;
  /** Pentest this swarm is working on */
  readonly pentestId: string;
  /** ISO timestamp of emission */
  readonly timestamp: string;
}

/**
 * Payload emitted when an agent completes successfully
 * (exits the run loop normally, not via failure/abort).
 */
export interface AgentCompletedPayload {
  /** Agent identifier */
  readonly agentId: string;
  /** Swarm run this agent belonged to */
  readonly swarmRunId: string;
  /** Pentest this swarm was working on */
  readonly pentestId: string;
  /** Total number of turns executed */
  readonly turnCount: number;
  /** ISO timestamp of emission */
  readonly timestamp: string;
}

// ============================================================================
// EVENT MAP (union discriminator)
// ============================================================================

/**
 * Maps each event name to its payload type.
 * Used by HookBus.emit() to enforce type safety.
 */
export interface HookEventMap {
  'pre-tool': PreToolPayload;
  'post-tool': PostToolPayload;
  'tool-failure': ToolFailurePayload;
  'agent-idle': AgentIdlePayload;
  'agent-completed': AgentCompletedPayload;
}

/**
 * Extract payload type for a given event name.
 */
export type HookPayload<E extends HookEventName> = HookEventMap[E];

// ============================================================================
// HANDLER TYPE
// ============================================================================

/**
 * A hook handler function.
 *
 * Handlers are async-safe. Return values are ignored — hooks are
 * observation/notification only, not middleware that can modify flow.
 *
 * If a handler throws, the error is caught and logged but does NOT
 * propagate to the emitter or affect the main execution flow.
 */
export type HookHandler<E extends HookEventName> = (
  payload: HookPayload<E>,
) => Promise<void> | void;

/**
 * Internal stored handler (event-erased for uniform storage).
 */
export type StoredHandler = (payload: unknown) => Promise<void> | void;
