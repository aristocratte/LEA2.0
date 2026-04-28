/**
 * @module core/runtime/ToolExecutor
 * @description Executes tools via ToolRegistry with schema validation and error handling.
 */

import type { Tool, ToolUseContext } from '../types/tool-types.js';
import type { ToolResultEvent } from '../types/session-types.js';
import type { ToolExecutionError } from '../types/tool-types.js';
import { isToolExecutionError } from '../types/tool-types.js';
import type { ToolRegistry } from './ToolRegistry.js';
import type { PermissionContext } from '../permissions/types.js';
import type { PermissionRequestStore } from '../permissions/PermissionRequestStore.js';
import { hasPermissionsToUseTool } from '../permissions/PermissionEngine.js';
import type { HookBus } from '../hooks/HookBus.js';
import type { RuntimeTaskManager } from './RuntimeTaskManager.js';
import { evaluateToolScope, type ScopeGuardContext } from './ScopeGuard.js';

// ============================================================================
// PUBLIC TYPES
// ============================================================================

/**
 * Result returned by ToolExecutor.execute()
 *
 * Contains the StreamEvent to emit plus metadata about error recoverability.
 */
export interface ToolExecutionResult {
  /** The StreamEvent to emit */
  event: ToolResultEvent;
  /** Structured error category for callers that need transport-level mapping. */
  errorCode?: ToolExecutionErrorCode;
  /** Whether the error is recoverable (loop can continue) */
  recoverable: boolean;
  /** Suggested recovery actions */
  suggestions?: string[];
}

export type ToolExecutionErrorCode =
  | 'tool_not_found'
  | 'input_validation'
  | 'tool_disabled'
  | 'permission_denied'
  | 'permission_denied_by_user'
  | 'permission_approval_required'
  | 'scope_denied'
  | 'tool_execution_error'
  | 'unknown_error';

/**
 * Parameters passed to ToolExecutor.execute()
 */
export interface ToolExecutorParams {
  /** ID from the tool_use event */
  readonly toolUseId: string;
  /** Name of the tool to execute */
  readonly toolName: string;
  /** Input parameters */
  readonly input: Record<string, unknown>;
  /** Session ID for context building */
  readonly sessionId: string;
  /** Abort controller for cancellation */
  readonly abortController: AbortController;
  /** Optional permission context override */
  readonly permissions?: PermissionContext;
  /** Optional AI provider override */
  readonly provider?: unknown;
  /** Optional agent identifier for ownership-aware tools */
  readonly agentId?: string;
  /** Optional agent display name for UI-facing permission requests */
  readonly agentName?: string;
  /** Optional working directory for this agent's tool executions */
  readonly cwd?: string;
  /** Optional extra runtime context exposed to tool implementations. */
  readonly runtimeContext?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// PERMISSION CONTEXT HELPER
// ============================================================================

/**
 * Create a default minimal PermissionContext for tool execution.
 *
 * This provides a sensible default when no explicit permission context
 * is provided. Tools can still check permissions but will get a
 * permissive default context.
 *
 * @returns A minimal valid PermissionContext.
 */
function createDefaultPermissionContext(): PermissionContext {
  return {
    mode: 'default',
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    additionalWorkingDirectories: new Map(),
  };
}

// ============================================================================
// TRUNCATION HELPER
// ============================================================================

const TRUNCATED_SUFFIX = '\n...[truncated]';

// ============================================================================
// OUTPUT CAPTURE CONSTANTS
// ============================================================================

/** Threshold above which tool output is captured in RuntimeTaskManager for later retrieval. */
const OUTPUT_CAPTURE_THRESHOLD = 15_000;

/** Number of characters shown to the agent when output is captured (head of output). */
const AGENT_PREVIEW_CHARS = 10_000;

/**
 * Helper to truncate tool results that exceed max size.
 *
 * @param result - The result to potentially truncate
 * @param maxChars - Maximum allowed characters
 * @returns Truncated string representation
 */
export function truncateResult(result: unknown, maxChars: number): string {
  const str = typeof result === 'string' ? result : JSON.stringify(result);

  if (str.length <= maxChars) {
    return str;
  }

  // Reserve space for the truncation suffix
  const availableChars = maxChars - TRUNCATED_SUFFIX.length;
  if (availableChars <= 0) {
    return TRUNCATED_SUFFIX.slice(1); // Just the suffix without leading newline
  }

  return str.slice(0, availableChars) + TRUNCATED_SUFFIX;
}

// ============================================================================
// TOOL EXECUTOR
// ============================================================================

/**
 * Executes tools with schema validation and error handling.
 *
 * The ToolExecutor bridges the SessionLoop (which receives tool_use events)
 * and the ToolRegistry (which manages available tools). It handles:
 *
 * 1. Tool lookup by name
 * 2. Input validation against the tool's Zod schema
 * 2.5. Tool enabled check (isEnabled())
 * 3. Context building (sessionId, abortController, etc.)
 * 3.5. Permission check (checkPermissions())
 * 4. Tool execution with error handling
 * 5. Optional output schema validation (advisory)
 * 5.5. Result truncation for oversized outputs
 *
 * @example
 * ```typescript
 * const executor = new ToolExecutor(registry);
 * const result = await executor.execute({
 *   toolUseId: 'call_123',
 *   toolName: 'web_search',
 *   input: { query: 'typescript' },
 *   sessionId: 'sess_456',
 *   abortController,
 * });
 * ```
 */
/**
 * WorktreeManager interface for dynamic cwd resolution.
 *
 * Defined locally to avoid circular dependencies with the worktree module.
 */
interface WorktreeManagerLike {
  getActiveWorktreePath(agentId: string): string | undefined;
  getActiveSessionPath(): string | undefined;
}

export class ToolExecutor {
  private readonly permissionRequestStore?: PermissionRequestStore;
  private worktreeManager?: WorktreeManagerLike;
  private hookBus?: HookBus;
  private runtimeTaskManager?: RuntimeTaskManager;

  constructor(registry: ToolRegistry, permissionRequestStore?: PermissionRequestStore) {
    this.registry = registry;
    this.permissionRequestStore = permissionRequestStore;
  }

  /**
   * Set the HookBus for tool lifecycle event emission.
   *
   * Optional — if not set, no hook events are emitted.
   * This allows lazy wiring after construction (the ToolExecutor
   * is created by SwarmOrchestrator before all services are ready).
   */
  setHookBus(hookBus: HookBus): void {
    this.hookBus = hookBus;
  }

  /** @internal Exposed for access by consumers that need the raw registry reference. */
  private readonly registry: ToolRegistry;

  /**
   * Set the WorktreeManager for dynamic cwd resolution.
   *
   * This allows ToolExecutor to resolve the active worktree path at execution time
   * instead of using a static spawn-time cwd value.
   *
   * @param manager - WorktreeManager instance (optional, for lazy initialization)
   */
  setWorktreeManager(manager: WorktreeManagerLike): void {
    this.worktreeManager = manager;
  }

  /**
   * Set the RuntimeTaskManager for large output capture.
   *
   * When a tool produces output exceeding OUTPUT_CAPTURE_THRESHOLD characters,
   * the full output is stored in RuntimeTaskManager and the agent receives
   * a truncated preview with a reference to retrieve the full output.
   *
   * Optional — if not set, falls back to simple truncation (no capture).
   */
  setRuntimeTaskManager(manager: RuntimeTaskManager): void {
    this.runtimeTaskManager = manager;
  }

  /**
   * Execute a tool with full validation and error handling.
   *
   * @param params - Execution parameters including tool name, input, and context
   * @returns Promise resolving to ToolExecutionResult with event and metadata
   */
  async execute(params: ToolExecutorParams): Promise<ToolExecutionResult> {
    const { toolUseId, toolName, input, sessionId, abortController } = params;

    // Step 1: Look up tool in registry
    const tool = this.registry.get(toolName);
    if (!tool) {
      return {
        event: {
          type: 'tool_result',
          id: toolUseId,
          toolName,
          result: `Tool "${toolName}" not found in registry`,
          isError: true,
        },
        errorCode: 'tool_not_found',
        recoverable: false,
        suggestions: [`Register tool "${toolName}" in the ToolRegistry`],
      };
    }

    // Step 2: Validate input against schema
    const validationResult = tool.inputSchema.safeParse(input);
    if (!validationResult.success) {
      const errors = validationResult.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');

      return {
        event: {
          type: 'tool_result',
          id: toolUseId,
          toolName,
          result: `Input validation failed: ${errors}`,
          isError: true,
        },
        errorCode: 'input_validation',
        recoverable: true,
        suggestions: ['Fix the input parameters to match the tool schema'],
      };
    }

    const validatedInput = validationResult.data;

    // Step 2.5: Check if tool is enabled
    if (!tool.isEnabled()) {
      return {
        event: {
          type: 'tool_result',
          id: toolUseId,
          toolName,
          result: `Tool "${toolName}" is currently disabled`,
          isError: true,
        },
        errorCode: 'tool_disabled',
        recoverable: false,
        suggestions: [`Enable tool "${toolName}" or use an alternative`],
      };
    }

    // Step 3: Build ToolUseContext with proper defaults
    // Resolve cwd dynamically: agent worktree > session worktree > explicit cwd > process.cwd()
    const agentCwd =
      this.worktreeManager?.getActiveWorktreePath(params.agentId ?? '') ??
      this.worktreeManager?.getActiveSessionPath() ??
      params.cwd ??
      process.cwd();

    const context: ToolUseContext = {
      sessionId,
      agentId: params.agentId,
      permissions: params.permissions ?? createDefaultPermissionContext(),
      abortController,
      provider: params.provider ?? null,
      cwd: agentCwd,
      ...(params.runtimeContext ?? {}),
    };

    const scopeDecision = evaluateToolScope({
      toolName: tool.name,
      toolSource: tool.source,
      input: validatedInput as Record<string, unknown>,
      context: context as ScopeGuardContext,
      requireScope: tool.source === 'mcp',
    });

    if (!scopeDecision.allowed) {
      return {
        event: {
          type: 'tool_result',
          id: toolUseId,
          toolName,
          result: scopeDecision.reason,
          isError: true,
        },
        errorCode: 'scope_denied',
        recoverable: true,
        suggestions: ['Use a target inside the authorized scope or update the pentest scope first'],
      };
    }

    // Step 3.5: Check tool permissions through PermissionEngine.
    // Even non-interactive executors must use the full engine so `passthrough`
    // becomes approval-required instead of silently executing.
    let effectiveInput = validatedInput;
    const toolPermCheck = {
      name: tool.name,
      inputSchema: {
        parse: (input: unknown) => tool.inputSchema.parse(input) as Record<string, unknown>,
      },
      checkPermissions: async (input: Record<string, unknown>, _permCtx: import('../permissions/types.js').PermissionContext) => {
        const toolResult = await tool.checkPermissions(input as any, context);
        if (toolResult.behavior === 'allow') {
          return {
            behavior: 'allow' as const,
            updatedInput: toolResult.updatedInput as Record<string, unknown> | undefined,
          };
        }
        if (toolResult.behavior === 'deny') {
          return {
            behavior: 'deny' as const,
            message: toolResult.message ?? `Tool "${toolName}" permission denied`,
          };
        }
        if (toolResult.behavior === 'ask') {
          return {
            behavior: 'ask' as const,
            message: toolResult.message ?? `Tool "${toolName}" requires user approval`,
            updatedInput: toolResult.updatedInput as Record<string, unknown> | undefined,
          };
        }
        return { behavior: 'passthrough' as const };
      },
      isReadOnly: (input: Record<string, unknown>) => tool.isReadOnly(input as any),
    };

    const engineDecision = await hasPermissionsToUseTool(
      toolPermCheck,
      validatedInput as Record<string, unknown>,
      context.permissions,
    );

    if (engineDecision.behavior === 'deny') {
      return {
        event: {
          type: 'tool_result',
          id: toolUseId,
          toolName,
          result: engineDecision.message ?? `Tool "${toolName}" permission denied`,
          isError: true,
        },
        errorCode: 'permission_denied',
        recoverable: true,
        suggestions: ['Check tool permissions and try again'],
      };
    }

    if (engineDecision.behavior === 'ask') {
      if (!this.permissionRequestStore) {
        return {
          event: {
            type: 'tool_result',
            id: toolUseId,
            toolName,
            result: engineDecision.message ?? `Tool "${toolName}" requires user approval`,
            isError: true,
          },
          errorCode: 'permission_approval_required',
          recoverable: true,
          suggestions: ['Run in interactive mode to approve this tool use'],
        };
      }

      // Create a pending request and wait for user resolution via REST API.
      const requestItem = this.permissionRequestStore.create({
        agentId: params.agentId ?? 'unknown',
        agentName: params.agentName ?? params.agentId ?? 'unknown',
        toolName,
        toolUseId,
        input: validatedInput as Record<string, unknown>,
        description: tool.description,
        reason: engineDecision.message ?? `Tool "${toolName}" requires approval`,
      });

      const resolution = await this.permissionRequestStore.waitForResolution(requestItem.requestId);

      if (resolution.decision === 'deny') {
        return {
          event: {
            type: 'tool_result',
            id: toolUseId,
            toolName,
            result: resolution.feedback ?? `Tool "${toolName}" permission denied by user`,
            isError: true,
          },
          errorCode: 'permission_denied_by_user',
          recoverable: true,
          suggestions: ['User denied the permission request'],
        };
      }

      if (resolution.updatedInput) {
        effectiveInput = resolution.updatedInput as typeof validatedInput;
      }
    }

    if (engineDecision.behavior === 'allow' && 'updatedInput' in engineDecision && engineDecision.updatedInput) {
      effectiveInput = engineDecision.updatedInput as typeof validatedInput;
    }

    // Step 4: Execute the tool
    try {
      // Emit pre-tool hook (observation only, cannot modify flow)
      if (this.hookBus) {
        await this.hookBus.emit('pre-tool', {
          sessionId,
          agentId: params.agentId ?? 'unknown',
          toolName,
          input: effectiveInput as Record<string, unknown>,
          timestamp: new Date().toISOString(),
        });
      }

      const toolResult = await tool.call(effectiveInput, context);

      // Emit post-tool hook (observation only)
      if (this.hookBus) {
        await this.hookBus.emit('post-tool', {
          sessionId,
          agentId: params.agentId ?? 'unknown',
          toolName,
          input: effectiveInput as Record<string, unknown>,
          result: toolResult.data,
          timestamp: new Date().toISOString(),
        });
      }

      // Step 5: Validate output against outputSchema if defined
      let toolData = toolResult.data;
      if (tool.outputSchema) {
        const outputValidation = tool.outputSchema.safeParse(toolData);
        if (!outputValidation.success) {
          // Log but don't fail — output validation is advisory
          // The tool still produced a result, we just truncate it
          // TODO: Consider emitting a warning event for validation failures
        }
      }

      // Step 5.5: Smart truncation with output capture for large results
      const result = this.smartTruncate(
        toolData,
        tool.maxResultSizeChars,
        toolName,
        effectiveInput as Record<string, unknown>,
        params.agentId,
      );

      return {
        event: {
          type: 'tool_result',
          id: toolUseId,
          toolName,
          result,
        },
        recoverable: true,
      };
    } catch (error) {
      // Emit tool-failure hook (observation only)
      if (this.hookBus) {
        await this.hookBus.emit('tool-failure', {
          sessionId,
          agentId: params.agentId ?? 'unknown',
          toolName,
          input: effectiveInput as Record<string, unknown>,
          error: error instanceof Error ? error : String(error),
          timestamp: new Date().toISOString(),
        });
      }

      // Step 6: Handle execution errors
      if (isToolExecutionError(error)) {
        return {
          event: {
            type: 'tool_result',
            id: toolUseId,
            toolName,
            result: error.message,
            isError: true,
          },
          errorCode: 'tool_execution_error',
          recoverable: error.recoverable,
          suggestions: error.suggestions ? [...error.suggestions] : undefined,
        };
      }

      // Unknown error - wrap it
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        event: {
          type: 'tool_result',
          id: toolUseId,
          toolName,
          result: `Tool execution error: ${errorMessage}`,
          isError: true,
        },
        errorCode: 'unknown_error',
        recoverable: false, // Unknown errors are not recoverable by default
        suggestions: ['Check tool implementation and dependencies'],
      };
    }
  }

  // ===========================================================================
  // SMART TRUNCATION WITH OUTPUT CAPTURE
  // ===========================================================================

  /**
   * Smart truncation that captures large outputs in RuntimeTaskManager.
   *
   * Strategy:
   * - Small output (≤ threshold): return inline, no capture needed
   * - Object with `taskId` (bash pattern): output already captured → replace stdout with reference
   * - Large string/object without taskId: capture full output in RuntimeTaskManager, return preview + reference
   * - No RuntimeTaskManager available: fall back to simple truncation
   */
  private smartTruncate(
    rawData: unknown,
    maxChars: number,
    toolName: string,
    input: Record<string, unknown>,
    agentId?: string,
  ): string {
    // Convert to string for size check
    const rawStr = typeof rawData === 'string' ? rawData : JSON.stringify(rawData);

    // Path A: Small result — use existing truncation (no capture)
    if (rawStr.length <= OUTPUT_CAPTURE_THRESHOLD) {
      if (typeof rawData === 'string' || typeof rawData === 'object') {
        return truncateResult(rawData, maxChars);
      }
      return String(rawData);
    }

    // Path B: Result object with existing taskId — bash already captured the output
    if (typeof rawData === 'object' && rawData !== null && 'taskId' in rawData) {
      const obj = rawData as Record<string, unknown>;
      const existingTaskId = String(obj.taskId);
      // Replace large fields with references to the already-captured output
      const ref = `[${rawStr.length.toLocaleString()} bytes. Use task_output with taskId="${existingTaskId}" to view full output]`;
      // If there's a 'stdout' field, replace it specifically; otherwise replace whole data
      if ('stdout' in obj) {
        const modified = { ...obj, stdout: ref };
        return JSON.stringify(modified);
      }
      return ref;
    }

    // Path C: Large output without existing taskId — capture in RuntimeTaskManager
    if (this.runtimeTaskManager) {
      const captureTaskId = `out-${toolName}-${Date.now()}`;
      const commandDesc = this.describeToolInvocation(toolName, input);

      try {
        this.runtimeTaskManager.registerTask(captureTaskId, {
          taskId: captureTaskId,
          command: commandDesc,
          agentId,
          status: 'running',
        });
        this.runtimeTaskManager.appendOutput(captureTaskId, rawStr);
        this.runtimeTaskManager.completeTask(captureTaskId, 0);
      } catch {
        // Capture failed — fall back to simple truncation
        return truncateResult(rawData, maxChars);
      }

      // Return preview + reference for the agent
      const preview = rawStr.slice(0, AGENT_PREVIEW_CHARS);
      const remaining = rawStr.length - AGENT_PREVIEW_CHARS;
      return (
        preview +
        `\n...[${remaining.toLocaleString()} more characters truncated. Full output (${rawStr.length.toLocaleString()} bytes) available via task_output tool with taskId="${captureTaskId}"]`
      );
    }

    // No RuntimeTaskManager available — simple truncation fallback
    return truncateResult(rawData, maxChars);
  }

  /**
   * Build a human-readable description of a tool invocation for RuntimeTaskInfo.command.
   */
  private describeToolInvocation(toolName: string, input: Record<string, unknown>): string {
    const keys = Object.keys(input).slice(0, 3); // First 3 params
    const parts = keys.map((k) => `${k}=${JSON.stringify(input[k]).slice(0, 50)}`);
    return `tool:${toolName}(${parts.join(', ')}${keys.length > 3 ? ', ...' : ''})`;
  }
}
