/**
 * @module core/types
 * @description Shared core types for LEA's agent runtime system.
 *
 * This module re-exports all types from the core runtime subsystems:
 * - Tool types (tool registry, execution, permissions)
 * - Command types (prompt expansion, local execution)
 * - Session types (loop, streaming, configuration)
 *
 * These types form the foundation of LEA's agent runtime. All other
 * components depend on these types being correct and complete.
 */

// ============================================================================
// TOOL TYPES
// ============================================================================

export type {
  // Core tool interfaces
  Tool,
  ToolDef,
  ToolResult,
  ToolUseContext,
  ToolPermissionResult,
  // Error types
  ToolExecutionError,
  // Helper types
  Message,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  // Type guards
  isToolExecutionError,
} from './tool-types.js';

// ============================================================================
// COMMAND TYPES
// ============================================================================

export type {
  // Command interfaces
  Command,
  PromptCommand,
  LocalCommand,
  BaseCommand,
  // Context and results
  CommandContext,
  CommandResult,
  CommandResultType,
  // Registry
  CommandRegistryEntry,
  CommandSource,
  // Error types
  CommandExecutionError,
  // Type guards
  isCommandExecutionError,
} from './command-types.js';

// ============================================================================
// SESSION TYPES
// ============================================================================

export type {
  // Configuration
  SessionConfig,
  // Streaming events
  StreamEvent,
  TextDeltaEvent,
  ToolUseEvent,
  ToolResultEvent,
  ToolProgressEvent,
  ThinkingEvent,
  ErrorEvent,
  TurnStartEvent,
  TurnEndEvent,
  TurnEndReason,
  // Termination
  TerminalReason,
  // Session state
  QueryParams,
  QueryDeps,
  CanUseToolFn,
  ModelCallParams,
  LoopState,
  // Results
  SessionResult,
  TokenUsage,
  // Status
  SessionStatus,
  // Helper types
  ExtendedChatMessage,
  ToolExecutionState,
} from './session-types.js';

// ============================================================================
// RE-EXPORT COMMON DEPENDENCIES
// ============================================================================

// Re-export AI client types for convenience
export type {
  ChatMessage,
  ContentBlock as AIContentBlock,
  TextContent,
  ToolUseContent,
  ToolResultContent,
  ToolDefinition,
  StreamChatParams,
  StreamResult,
  AgentEvent,
} from '../../services/ai/AIClient.js';

// Re-export permission types for convenience
export type {
  PermissionBehavior,
  PermissionMode,
  PermissionContext,
  PermissionResult as PermissionDecision,
  PermissionRule,
  PermissionRuleSource,
  PermissionUpdate,
  PermissionDecisionReason,
  PermissionAllowDecision,
  PermissionAskDecision,
  PermissionDenyDecision,
} from '../permissions/types.js';
