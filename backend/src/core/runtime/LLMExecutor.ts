/**
 * @module core/runtime/LLMExecutor
 * @description Bridges AIClient streaming into AsyncGenerator<StreamEvent> for SessionLoop.
 *
 * The LLMExecutor wraps AI provider calls, converting callback-based streaming
 * from AIClient.streamChat into AsyncGenerator<StreamEvent> format expected by
 * the SessionLoop.
 */

import type {
  AIClient,
  StreamChatParams,
  StreamResult,
  AgentEvent,
  ChatMessage,
  ToolDefinition,
} from '../../services/ai/AIClient.js';
import type {
  StreamEvent,
  ModelCallParams,
} from '../types/session-types.js';
import type { Tool } from '../types/tool-types.js';
import type { z } from 'zod';
import { calculateCost } from '../analytics/pricing-table.js';

// ============================================================================
// TYPE CONVERSIONS
// ============================================================================

/**
 * Internal Zod _def shape for JSON Schema conversion.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZodInternalDef = { typeName: string; [key: string]: any };

/**
 * Recursively convert a Zod _def to JSON Schema.
 */
function zodDefToJsonSchema(def: ZodInternalDef | undefined): Record<string, unknown> {
  if (!def) return { type: 'object' };
  switch (def.typeName) {
    case 'ZodString': return { type: 'string' };
    case 'ZodNumber': return { type: 'number' };
    case 'ZodBoolean': return { type: 'boolean' };
    case 'ZodArray': return { type: 'array', items: zodDefToJsonSchema(def.type?._def) };
    case 'ZodObject': {
      const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape as Record<string, unknown>)) {
        const valueDef = (value as { _def?: ZodInternalDef })._def;
        properties[key] = zodDefToJsonSchema(valueDef);
        if (valueDef?.typeName !== 'ZodOptional') required.push(key);
      }
      return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
    }
    case 'ZodOptional':
    case 'ZodDefault': return zodDefToJsonSchema(def.innerType?._def);
    case 'ZodEnum': return { type: 'string', enum: def.values };
    case 'ZodRecord': return { type: 'object', additionalProperties: {} };
    default: return { type: 'object' };
  }
}

/**
 * Convert runtime Tool to AIClient ToolDefinition.
 */
function toolToToolDefinition(tool: Tool): ToolDefinition {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zodDef = (tool.inputSchema as any)._def as ZodInternalDef | undefined;
  let inputSchema: Record<string, unknown>;
  try {
    inputSchema = zodDefToJsonSchema(zodDef);
  } catch {
    inputSchema = { type: 'object', properties: {} };
  }
  return { name: tool.name, description: tool.description, input_schema: inputSchema };
}

/**
 * Convert ModelCallParams to StreamChatParams.
 */
function toStreamChatParams(
  params: ModelCallParams,
  onEvent: (event: AgentEvent) => void,
): StreamChatParams {
  return {
    model: params.model,
    messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
    tools: params.tools.map(toolToToolDefinition),
    systemPrompt: params.systemPrompt,
    maxTokens: params.maxTokens,
    thinkingBudget: params.thinkingBudget,
    onEvent,
    signal: params.signal,
  };
}

// ============================================================================
// SHARED STREAMING BRIDGE
// ============================================================================

/**
 * Bridge a callback-based AIClient.streamChat into an AsyncGenerator<StreamEvent>.
 *
 * This is the core logic shared by both the class and factory function.
 * It manages an event queue, a promise-based notification system, and
 * maps AgentEvent types to StreamEvent types.
 */
async function* bridgeStreamToGenerator(
  client: AIClient,
  params: ModelCallParams,
): AsyncGenerator<StreamEvent> {
  const eventQueue: AgentEvent[] = [];
  let resolveNext: ((value: boolean) => void) | null = null;
  let streamComplete = false;
  let streamError: Error | null = null;
  let streamResult: StreamResult | null = null;

  const onEvent = (event: AgentEvent): void => {
    eventQueue.push(event);
    if (resolveNext) {
      resolveNext(true);
      resolveNext = null;
    }
  };

  const streamPromise = client.streamChat(
    toStreamChatParams(params, onEvent),
  ).then(
    (result) => {
      streamResult = result;
      streamComplete = true;
      if (resolveNext) { resolveNext(true); resolveNext = null; }
      return result;
    },
    (error: unknown) => {
      streamError = error as Error;
      streamComplete = true;
      if (resolveNext) { resolveNext(true); resolveNext = null; }
      throw error;
    },
  );

  try {
    while (!streamComplete) {
      if (eventQueue.length === 0) {
        await new Promise<boolean>((resolve) => {
          if (streamComplete) { resolve(false); return; }
          resolveNext = resolve;
          setTimeout(() => resolve(false), 50);
        });
      }

      while (eventQueue.length > 0) {
        const event = eventQueue.shift();
        if (!event) break;

        switch (event.type) {
          case 'text_delta':
            yield { type: 'text_delta', text: event.text };
            break;
          case 'tool_use':
            yield { type: 'tool_use', id: event.id, toolName: event.name, input: event.input, thoughtSignature: event.thought_signature };
            break;
          case 'thinking_delta':
            yield { type: 'thinking', content: event.text };
            break;
          // Usage event — yield for cost tracking
          case 'usage': {
            const inputTokens = event.inputTokens ?? 0;
            const outputTokens = event.outputTokens ?? 0;
            const costUsd = calculateCost(params.model, inputTokens, outputTokens);
            yield {
              type: 'usage',
              model: params.model,
              inputTokens,
              outputTokens,
              costUsd,
            };
            break;
          }
          // Control events with no StreamEvent mapping
          case 'message_stop':
          case 'thinking_start':
          case 'thinking_end':
          case 'message_start':
          case 'message_end':
            break;
        }
      }

      if (streamComplete) break;
      if (eventQueue.length === 0 && !streamComplete) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    await streamPromise;

    if (streamError) {
      yield { type: 'error', error: streamError, recoverable: true, suggestions: ['Retry the request', 'Check provider status'] };
      return;
    }

    if (streamResult) {
      const reason = streamResult.stopReason ?? 'end_turn';
      yield { type: 'model_stop', reason: reason as 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' };
    }
  } catch (error) {
    yield { type: 'error', error: error as Error, recoverable: false, suggestions: ['Check error details', 'Verify provider configuration'] };
  }
}

// ============================================================================
// LLM EXECUTOR CLASS
// ============================================================================

/**
 * LLMExecutor bridges AIClient streaming to AsyncGenerator<StreamEvent>.
 *
 * Wraps AIClient.streamChat's callback-based streaming into an AsyncGenerator
 * that SessionLoop can consume.
 */
export class LLMExecutor {
  private readonly getClient: (model: string) => AIClient | null;

  constructor(getClient: (model: string) => AIClient | null) {
    this.getClient = getClient;
  }

  /**
   * Call the model and stream events as AsyncGenerator.
   */
  async *callModel(params: ModelCallParams): AsyncGenerator<StreamEvent> {
    const client = this.getClient(params.model);
    if (!client) {
      yield {
        type: 'error',
        error: new Error(`No AI client available for model: ${params.model}`),
        recoverable: false,
        suggestions: ['Configure an AI provider for this model', 'Check ProviderManager configuration'],
      };
      return;
    }
    yield* bridgeStreamToGenerator(client, params);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a callModel function from a client resolver.
 *
 * Supports both sync and async client resolution.
 */
export function createCallModel(
  getClient: (model: string) => AIClient | null | Promise<AIClient | null>,
): (params: ModelCallParams) => AsyncGenerator<StreamEvent> {
  return async function* (params: ModelCallParams): AsyncGenerator<StreamEvent> {
    const result = getClient(params.model);
    const client = result instanceof Promise ? await result : result;
    if (!client) {
      yield {
        type: 'error',
        error: new Error(`No AI client available for model: ${params.model}`),
        recoverable: false,
        suggestions: ['Configure an AI provider for this model', 'Check ProviderManager configuration'],
      };
      return;
    }
    yield* bridgeStreamToGenerator(client, params);
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default LLMExecutor;
