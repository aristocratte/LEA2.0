/**
 * @module core/runtime/SessionLoop
 * @description Main session loop for LEA's agent runtime system.
 *
 * The session loop is the heart of the runtime: it orchestrates model calls,
 * tool executions, and streaming events to drive agent behavior.
 *
 * Inspired by claude-code's query.ts architecture.
 */

import type {
  SessionConfig,
  StreamEvent,
  QueryParams,
  QueryDeps,
  LoopState,
  SessionResult,
  TerminalReason,
  TokenUsage,
  CanUseToolFn,
  ModelCallParams,
  SessionStatus,
  TurnEndReason,
} from '../types/session-types.js';
import type {
  Tool,
  ToolResult,
  ToolUseContext,
} from '../types/tool-types.js';
import type {
  ChatMessage,
  ContentBlock,
  ToolUseContent,
  TextContent,
  ToolResultContent,
} from '../../services/ai/AIClient.js';
import { ToolExecutor } from './ToolExecutor.js';
import { ToolRegistry } from './ToolRegistry.js';

// ============================================================================
// DEFAULT DEPENDENCIES
// ============================================================================

/**
 * Default UUID generator.
 * Uses a simple random string generator.
 */
function defaultUuid(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Default model caller (placeholder).
 *
 * This is a placeholder that throws an error. Real implementations
 * should provide their own model caller via deps.
 */
async function* defaultModelCaller(_params: ModelCallParams): AsyncGenerator<StreamEvent> {
  throw new Error('Model caller not provided. Provide via deps.callModel.');
}

/**
 * Default dependencies for the session loop.
 */
export const DEFAULT_DEPS: QueryDeps = {
  callModel: defaultModelCaller,
  uuid: defaultUuid,
} as const;

// ============================================================================
// SESSION LOOP CLASS
// ============================================================================

/**
 * Main session loop implementation.
 *
 * The session loop manages the execution of an agent session, coordinating
 * model calls, tool executions, and event streaming. It handles turn management,
 * token tracking, and graceful termination.
 */
export class SessionLoop {
  private readonly config: SessionConfig;
  private readonly canUseTool?: CanUseToolFn;
  private readonly deps: Omit<Required<QueryDeps>, 'toolExecutor'> & Pick<QueryDeps, 'toolExecutor'>;
  private readonly toolExecutor: ToolExecutor;
  private state: LoopState;
  private currentStatus: SessionStatus = 'initializing';
  private usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  private turnTerminalReason?: TerminalReason;

  constructor(params: QueryParams) {
    this.config = params.config;
    this.canUseTool = params.canUseTool;
    this.deps = {
      callModel: params.deps?.callModel ?? DEFAULT_DEPS.callModel,
      uuid: params.deps?.uuid ?? DEFAULT_DEPS.uuid,
      toolExecutor: params.deps?.toolExecutor,
    };

    // Create ToolExecutor from deps or build from config tools
    if (params.deps?.toolExecutor) {
      this.toolExecutor = params.deps.toolExecutor;
    } else {
      const registry = new ToolRegistry();
      for (const tool of this.config.tools) {
        registry.registerTool(tool);
      }
      this.toolExecutor = new ToolExecutor(registry);
    }

    // Create mutable state with proper mutability
    this.state = {
      messages: [...params.messages],
      turnCount: 0,
      abortController: new AbortController(),
      paused: false,
    };
  }

  /**
   * Run the session loop to completion.
   *
   * @returns AsyncGenerator yielding stream events.
   */
  async *run(): AsyncGenerator<StreamEvent> {
    this.currentStatus = 'running';

    try {
      while (this.shouldContinue()) {
        // Wait if paused
        while (this.state.paused) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (!this.shouldContinue()) break;
        }

        if (!this.shouldContinue()) break;

        const turn = this.state.turnCount + 1;

        yield { type: 'turn_start', turn };

        // Stream events directly from executeTurn
        for await (const event of this.executeTurn(turn)) {
          yield event;
        }

        // Increment turnCount after executing the turn
        this.state.turnCount = turn;

        // Check if the turn had a terminal reason
        if (this.turnTerminalReason) {
          this.currentStatus = 'completed';
          yield {
            type: 'turn_end',
            turn,
            reason: this.getTurnEndReason(this.turnTerminalReason),
          };
          break;
        }

        yield {
          type: 'turn_end',
          turn,
          reason: 'completed',
        };
      }
    } catch (error) {
      this.currentStatus = 'failed';
      yield {
        type: 'error',
        error: error as Error,
        recoverable: false,
      };
    }
  }

  /**
   * Execute a single turn (model response + tool calls).
   * Streams events in real-time as they arrive.
   */
  private async *executeTurn(turn: number): AsyncGenerator<StreamEvent> {
    this.turnTerminalReason = undefined;

    try {
      // Prepare model call parameters
      const modelParams: ModelCallParams = {
        model: this.config.model,
        messages: this.state.messages,
        tools: this.config.tools,
        systemPrompt: this.config.systemPrompt,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        thinkingBudget: this.config.thinkingBudget,
        signal: this.state.abortController.signal,
      };

      // Stream model events — yield immediately AND collect for processing
      const modelEvents: StreamEvent[] = [];
      let modelStopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' = 'end_turn';
      for await (const event of this.deps.callModel(modelParams)) {
        yield event; // REAL STREAMING: yield each event as it arrives
        modelEvents.push(event);
        // Capture the model's stop reason for turn-end semantics
        if (event.type === 'model_stop') {
          modelStopReason = event.reason;
        }
      }

      // Process the model's response
      const toolUses = this.extractToolUses(modelEvents);

      // ALWAYS add assistant message to history (P0 #2 fix)
      this.addMessagesFromEvents(modelEvents);

      if (toolUses.length === 0) {
        // No tool calls - turn is complete, propagate the model's stop reason
        this.turnTerminalReason = this.modelStopToTerminalReason(modelStopReason);
        return;
      }

      // Execute tools
      for (const toolUse of toolUses) {
        const toolResult = await this.executeTool(toolUse);

        yield toolResult.event; // Stream tool results too

        if (toolResult.error) {
          if (toolResult.recoverable) {
            continue;
          } else {
            this.turnTerminalReason = 'tool_error';
            return;
          }
        }

        // Add tool result to messages
        this.addToolResult(toolUse, toolResult.result);
      }
    } catch (error) {
      const err = error as Error;
      yield {
        type: 'error',
        error: err,
        recoverable: false,
      };

      if (this.state.abortController.signal.aborted) {
        this.turnTerminalReason = 'aborted';
      } else {
        this.turnTerminalReason = 'model_error';
      }
    }
  }

  /**
   * Extract tool use events from model events.
   */
  private extractToolUses(events: StreamEvent[]): ToolUseContent[] {
    const toolUses: ToolUseContent[] = [];

    for (const event of events) {
      if (event.type === 'tool_use') {
        toolUses.push({
          type: 'tool_use',
          id: event.id,
          name: event.toolName,
          input: event.input as Record<string, unknown>,
          thought_signature: event.thoughtSignature,
        });
      }
    }

    return toolUses;
  }

  /**
   * Execute a single tool use.
   */
  private async executeTool(
    toolUse: ToolUseContent,
  ): Promise<{
    event: StreamEvent;
    result?: unknown;
    error?: Error;
    recoverable?: boolean;
  }> {
    // Permission check: find the tool for canUseTool gate
    const tool = this.config.tools.find((t) => t.name === toolUse.name);

    if (tool && this.canUseTool) {
      const canUse = await this.canUseTool(tool, toolUse.input);
      if (!canUse) {
        return {
          event: {
            type: 'tool_result',
            id: toolUse.id,
            toolName: toolUse.name,
            result: `Tool "${toolUse.name}" is not permitted`,
            isError: true,
          },
          error: new Error(`Tool "${toolUse.name}" is not permitted`),
          recoverable: true,
        };
      }
    }

    // Delegate to ToolExecutor for validation + execution + truncation
    const execResult = await this.toolExecutor.execute({
      toolUseId: toolUse.id,
      toolName: toolUse.name,
      input: toolUse.input as Record<string, unknown>,
      sessionId: this.config.sessionId,
      abortController: this.state.abortController,
    });

    return {
      event: execResult.event,
      result: execResult.event.isError ? undefined : execResult.event.result,
      error: execResult.event.isError ? new Error(String(execResult.event.result)) : undefined,
      recoverable: execResult.recoverable,
    };
  }

  /**
   * Add messages from model events to the message history.
   */
  private addMessagesFromEvents(events: StreamEvent[]): void {
    let currentText = '';
    let currentToolUses: ToolUseContent[] = [];

    for (const event of events) {
      switch (event.type) {
        case 'text_delta':
          currentText += event.text;
          break;
        case 'tool_use':
          currentToolUses.push({
            type: 'tool_use',
            id: event.id,
            name: event.toolName,
            input: event.input as Record<string, unknown>,
            thought_signature: event.thoughtSignature,
          });
          break;
      }
    }

    // Build assistant message from collected content
    const content: ContentBlock[] = [];

    if (currentText) {
      content.push({ type: 'text', text: currentText } as TextContent);
    }

    for (const toolUse of currentToolUses) {
      content.push(toolUse);
    }

    if (content.length > 0) {
      this.state.messages.push({
        role: 'assistant',
        content,
      });
    }
  }

  /**
   * Add a tool result to the message history.
   */
  private addToolResult(toolUse: ToolUseContent, result: unknown): void {
    const content: ToolResultContent = {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: typeof result === 'string' ? result : JSON.stringify(result),
      is_error: false,
    };

    this.state.messages.push({
      role: 'user',
      content: content as unknown as string | ContentBlock[],
    });
  }

  /**
   * Check if the loop should continue.
   */
  private shouldContinue(): boolean {
    // Check abort signal
    if (this.state.abortController.signal.aborted) {
      return false;
    }

    // Check max turns
    if (this.config.maxTurns && this.state.turnCount >= this.config.maxTurns) {
      return false;
    }

    // Check status
    return this.currentStatus === 'running' || this.currentStatus === 'paused';
  }

  /**
   * Map model stop reason to a TerminalReason for session termination.
   */
  private modelStopToTerminalReason(
    reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence',
  ): TerminalReason {
    switch (reason) {
      case 'max_tokens':
        return 'budget_exceeded';
      case 'end_turn':
      case 'tool_use':
      case 'stop_sequence':
        return 'completed';
    }
  }

  /**
   * Map TerminalReason to TurnEndReason for turn_end events.
   */
  private getTurnEndReason(reason: TerminalReason): TurnEndReason {
    switch (reason) {
      case 'completed':
        return 'completed';
      case 'budget_exceeded':
        return 'max_tokens';
      case 'model_error':
      case 'tool_error':
      case 'aborted':
      case 'max_turns':
      case 'prompt_too_long':
        return 'completed';
    }
  }

  /**
   * Pause the session.
   */
  pause(): void {
    this.currentStatus = 'paused';
    this.state.paused = true;
  }

  /**
   * Resume the session.
   */
  resume(): void {
    if (this.currentStatus === 'paused') {
      this.currentStatus = 'running';
      this.state.paused = false;
    }
  }

  /**
   * Abort the session.
   */
  abort(): void {
    this.currentStatus = 'cancelled';
    this.state.abortController.abort();
  }

  /**
   * Get the current session status.
   */
  getStatus(): SessionStatus {
    return this.currentStatus;
  }

  /**
   * Get the current loop state.
   */
  getState(): LoopState {
    return { ...this.state };
  }

  /**
   * Get the final session result.
   */
  getResult(): SessionResult {
    let reason: TerminalReason;

    if (this.currentStatus === 'cancelled' || this.state.abortController.signal.aborted) {
      reason = 'aborted';
    } else if (this.currentStatus === 'failed') {
      reason = 'model_error';
    } else if (this.config.maxTurns && this.state.turnCount >= this.config.maxTurns) {
      reason = 'max_turns';
    } else {
      reason = 'completed';
    }

    return {
      reason,
      messages: this.state.messages,
      turnCount: this.state.turnCount,
      usage: this.usage,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create and run a session loop.
 *
 * @param params - The query parameters.
 * @returns AsyncGenerator yielding stream events.
 */
export async function* createSessionLoop(
  params: QueryParams,
): AsyncGenerator<StreamEvent> {
  const loop = new SessionLoop(params);
  yield* loop.run();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default SessionLoop;
