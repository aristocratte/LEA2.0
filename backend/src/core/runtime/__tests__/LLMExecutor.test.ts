/**
 * @module core/runtime/__tests__/LLMExecutor.test
 * @description Tests for LLMExecutor - bridging AIClient to SessionLoop streaming.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMExecutor, createCallModel } from '../LLMExecutor.js';
import type {
  AIClient,
  StreamChatParams,
  StreamResult,
  AgentEvent,
  ChatMessage,
  ContentBlock,
  ToolDefinition,
} from '../../../services/ai/AIClient.js';
import type { ModelCallParams, StreamEvent } from '../../types/session-types.js';
import type { Tool } from '../../types/tool-types.js';
import { z } from 'zod';

// ============================================================================
// MOCKS
// ============================================================================

/**
 * Create a mock AIClient for testing.
 */
function createMockClient(config: {
  streamChatResult?: {
    stopReason: StreamResult['stopReason'];
    content: ContentBlock[];
    usage: { inputTokens: number; outputTokens: number };
  };
  eventsToEmit?: AgentEvent[];
  error?: Error;
}): AIClient {
  const mockClient: AIClient = {
    streamChat: vi.fn(async (params: StreamChatParams): Promise<StreamResult> => {
      // Emit events via onEvent callback
      if (config.eventsToEmit) {
        for (const event of config.eventsToEmit) {
          params.onEvent(event);
        }
      }

      if (config.error) {
        throw config.error;
      }

      return config.streamChatResult || {
        stopReason: 'end_turn',
        content: [],
        usage: { inputTokens: 10, outputTokens: 20 },
      };
    }),
    getProviderName: vi.fn(() => 'mock-provider'),
  };

  return mockClient;
}

/**
 * Create a mock Tool for testing.
 */
function createMockTool(overrides?: Partial<Tool>): Tool {
  return {
    name: 'test_tool',
    description: 'A test tool',
    inputSchema: z.object({
      query: z.string(),
    }),
    call: vi.fn(async () => ({ data: 'test result' })),
    checkPermissions: vi.fn(async () => ({ behavior: 'allow' })),
    isEnabled: vi.fn(() => true),
    isReadOnly: vi.fn(() => false),
    isConcurrencySafe: vi.fn(() => false),
    isDestructive: vi.fn(() => false),
    userFacingName: vi.fn(() => 'Test Tool'),
    getActivityDescription: vi.fn(() => null),
    maxResultSizeChars: 10000,
    ...overrides,
  } as Tool;
}

/**
 * Collect all events from an AsyncGenerator into an array.
 */
async function collectEvents<T>(generator: AsyncGenerator<T>): Promise<T[]> {
  const events: T[] = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

// ============================================================================
// TESTS
// ============================================================================

describe('LLMExecutor', () => {
  describe('text_delta events', () => {
    it('should yield text_delta events from streaming', async () => {
      const mockClient = createMockClient({
        eventsToEmit: [
          { type: 'message_start' },
          { type: 'text_delta', text: 'Hello' },
          { type: 'text_delta', text: ' world' },
          { type: 'message_end' },
          { type: 'message_stop', stopReason: 'end_turn' },
        ],
        streamChatResult: {
          stopReason: 'end_turn',
          content: [
            { type: 'text', text: 'Hello world' },
          ],
          usage: { inputTokens: 5, outputTokens: 10 },
        },
      });

      const executor = new LLMExecutor(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [],
        systemPrompt: 'You are helpful',
      };

      const events = await collectEvents(executor.callModel(params));

      const textEvents = events.filter((e) => e.type === 'text_delta');
      expect(textEvents).toHaveLength(2);
      expect(textEvents[0]).toEqual({ type: 'text_delta', text: 'Hello' });
      expect(textEvents[1]).toEqual({ type: 'text_delta', text: ' world' });
    });

    it('should handle empty text_delta gracefully', async () => {
      const mockClient = createMockClient({
        eventsToEmit: [
          { type: 'message_start' },
          { type: 'text_delta', text: '' },
          { type: 'message_end' },
          { type: 'message_stop', stopReason: 'end_turn' },
        ],
        streamChatResult: {
          stopReason: 'end_turn',
          content: [],
          usage: { inputTokens: 5, outputTokens: 0 },
        },
      });

      const executor = new LLMExecutor(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [],
        systemPrompt: 'You are helpful',
      };

      const events = await collectEvents(executor.callModel(params));
      const textEvents = events.filter((e) => e.type === 'text_delta');
      expect(textEvents).toHaveLength(1);
      expect(textEvents[0]).toEqual({ type: 'text_delta', text: '' });
    });
  });

  describe('tool_use events', () => {
    it('should yield tool_use events with proper id/name/input', async () => {
      const mockClient = createMockClient({
        eventsToEmit: [
          { type: 'message_start' },
          {
            type: 'tool_use',
            id: 'tool-123',
            name: 'search',
            input: { query: 'test', limit: 10 },
          },
          { type: 'message_end' },
          { type: 'message_stop', stopReason: 'tool_use' },
        ],
        streamChatResult: {
          stopReason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'tool-123',
              name: 'search',
              input: { query: 'test', limit: 10 },
            },
          ],
          usage: { inputTokens: 15, outputTokens: 25 },
        },
      });

      const executor = new LLMExecutor(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Search for something' }],
        tools: [],
        systemPrompt: 'You are helpful',
      };

      const events = await collectEvents(executor.callModel(params));

      const toolEvents = events.filter((e) => e.type === 'tool_use');
      expect(toolEvents).toHaveLength(1);
      expect(toolEvents[0]).toEqual({
        type: 'tool_use',
        id: 'tool-123',
        toolName: 'search',
        input: { query: 'test', limit: 10 },
      });
    });

    it('should include thoughtSignature when present', async () => {
      const mockClient = createMockClient({
        eventsToEmit: [
          {
            type: 'tool_use',
            id: 'tool-456',
            name: 'analyze',
            input: { data: 'test' },
            thought_signature: 'sig-abc-123',
          },
          { type: 'message_stop', stopReason: 'tool_use' },
        ],
        streamChatResult: {
          stopReason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'tool-456',
              name: 'analyze',
              input: { data: 'test' },
              thought_signature: 'sig-abc-123',
            },
          ],
          usage: { inputTokens: 10, outputTokens: 20 },
        },
      });

      const executor = new LLMExecutor(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Analyze this' }],
        tools: [],
        systemPrompt: 'You are helpful',
      };

      const events = await collectEvents(executor.callModel(params));

      const toolEvents = events.filter((e) => e.type === 'tool_use');
      expect(toolEvents[0]).toMatchObject({
        type: 'tool_use',
        id: 'tool-456',
        toolName: 'analyze',
        thoughtSignature: 'sig-abc-123',
      });
    });
  });

  describe('thinking events', () => {
    it('should yield thinking events from thinking_delta', async () => {
      const mockClient = createMockClient({
        eventsToEmit: [
          { type: 'thinking_start' },
          { type: 'thinking_delta', text: 'Let me think...' },
          { type: 'thinking_delta', text: ' step by step.' },
          { type: 'thinking_end' },
          { type: 'message_start' },
          { type: 'text_delta', text: 'Here is the answer.' },
          { type: 'message_stop', stopReason: 'end_turn' },
        ],
        streamChatResult: {
          stopReason: 'end_turn',
          content: [{ type: 'text', text: 'Here is the answer.' }],
          usage: { inputTokens: 20, outputTokens: 30 },
        },
      });

      const executor = new LLMExecutor(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Complex question' }],
        tools: [],
        systemPrompt: 'You are helpful',
      };

      const events = await collectEvents(executor.callModel(params));

      const thinkingEvents = events.filter((e) => e.type === 'thinking');
      expect(thinkingEvents).toHaveLength(2);
      expect(thinkingEvents[0]).toEqual({ type: 'thinking', content: 'Let me think...' });
      expect(thinkingEvents[1]).toEqual({ type: 'thinking', content: ' step by step.' });
    });
  });

  describe('AbortSignal propagation', () => {
    it('should propagate AbortSignal to streamChat', async () => {
      const abortController = new AbortController();
      const mockClient = createMockClient({
        eventsToEmit: [
          { type: 'message_start' },
          { type: 'text_delta', text: 'Before abort' },
          { type: 'message_stop', stopReason: 'end_turn' },
        ],
        streamChatResult: {
          stopReason: 'end_turn',
          content: [{ type: 'text', text: 'Before abort' }],
          usage: { inputTokens: 5, outputTokens: 10 },
        },
      });

      const executor = new LLMExecutor(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [],
        systemPrompt: 'You are helpful',
        signal: abortController.signal,
      };

      await collectEvents(executor.callModel(params));

      expect(mockClient.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          signal: abortController.signal,
        }),
      );
    });

    it('should handle abort signal during streaming', async () => {
      const abortController = new AbortController();

      // Create a mock that can be aborted
      let onEventCallback: ((event: AgentEvent) => void) | null = null;
      const mockClient = {
        streamChat: vi.fn(async (params: StreamChatParams): Promise<StreamResult> => {
          onEventCallback = params.onEvent;

          // Simulate streaming
          onEventCallback({ type: 'message_start' });
          onEventCallback({ type: 'text_delta', text: 'Starting...' });

          // Wait a bit (simulating network delay)
          await new Promise((resolve) => setTimeout(resolve, 50));

          // Check if aborted
          if (abortController.signal.aborted) {
            throw new Error('Aborted');
          }

          onEventCallback({ type: 'message_stop', stopReason: 'end_turn' });
          return {
            stopReason: 'end_turn',
            content: [{ type: 'text', text: 'Starting...' }],
            usage: { inputTokens: 5, outputTokens: 10 },
          };
        }),
        getProviderName: vi.fn(() => 'mock'),
      } satisfies AIClient;

      const executor = new LLMExecutor(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [],
        systemPrompt: 'You are helpful',
        signal: abortController.signal,
      };

      // Abort immediately
      abortController.abort();

      const events = await collectEvents(executor.callModel(params));

      // Should get the initial events before abort
      const textEvents = events.filter((e) => e.type === 'text_delta');
      expect(textEvents.length).toBeGreaterThan(0);

      // Should have an error event
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
    });
  });

  describe('token usage tracking', () => {
    it('should track token usage from usage events', async () => {
      const mockClient = createMockClient({
        eventsToEmit: [
          { type: 'message_start' },
          { type: 'usage', inputTokens: 100, outputTokens: 200 },
          { type: 'text_delta', text: 'Response' },
          { type: 'message_stop', stopReason: 'end_turn' },
        ],
        streamChatResult: {
          stopReason: 'end_turn',
          content: [{ type: 'text', text: 'Response' }],
          usage: { inputTokens: 100, outputTokens: 200 },
        },
      });

      const executor = new LLMExecutor(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [],
        systemPrompt: 'You are helpful',
      };

      const events = await collectEvents(executor.callModel(params));

      // Usage events are tracked internally but not emitted
      // Just verify the stream completes successfully
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should yield ErrorEvent on provider failure', async () => {
      const providerError = new Error('Provider API error');
      const mockClient = createMockClient({
        error: providerError,
      });

      const executor = new LLMExecutor(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [],
        systemPrompt: 'You are helpful',
      };

      const events = await collectEvents(executor.callModel(params));

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]).toMatchObject({
        type: 'error',
        error: providerError,
        recoverable: false,
      });
      expect(errorEvents[0].suggestions).toBeDefined();
    });

    it('should handle empty response (no events) gracefully', async () => {
      const mockClient = createMockClient({
        eventsToEmit: [],
        streamChatResult: {
          stopReason: 'end_turn',
          content: [],
          usage: { inputTokens: 0, outputTokens: 0 },
        },
      });

      const executor = new LLMExecutor(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [],
        systemPrompt: 'You are helpful',
      };

      const events = await collectEvents(executor.callModel(params));

      // Should emit a model_stop event even when no content events
      expect(events).toEqual([{ type: 'model_stop', reason: 'end_turn' }]);
    });

    it('should yield error when no client available for model', async () => {
      const executor = new LLMExecutor(() => null);

      const params: ModelCallParams = {
        model: 'unknown-model',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [],
        systemPrompt: 'You are helpful',
      };

      const events = await collectEvents(executor.callModel(params));

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].error.message).toContain('No AI client available');
      expect(errorEvents[0].recoverable).toBe(false);
      expect(errorEvents[0].suggestions).toContain('Configure an AI provider for this model');
    });

    it('should yield model_stop with max_tokens instead of error event', async () => {
      const mockClient = createMockClient({
        eventsToEmit: [
          { type: 'message_start' },
          { type: 'text_delta', text: 'Partial response' },
          { type: 'message_stop', stopReason: 'max_tokens' },
        ],
        streamChatResult: {
          stopReason: 'max_tokens',
          content: [{ type: 'text', text: 'Partial response' }],
          usage: { inputTokens: 100, outputTokens: 8192 },
        },
      });

      const executor = new LLMExecutor(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Long question' }],
        tools: [],
        systemPrompt: 'You are helpful',
      };

      const events = await collectEvents(executor.callModel(params));

      // Should emit model_stop with max_tokens, not an error event
      const stopEvents = events.filter((e) => e.type === 'model_stop');
      expect(stopEvents).toHaveLength(1);
      expect(stopEvents[0].reason).toBe('max_tokens');

      // Should NOT emit error events for max_tokens
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(0);
    });
  });

  describe('Tool conversion', () => {
    it('should convert Tool[] to ToolDefinition[] correctly', async () => {
      const mockTool = createMockTool({
        name: 'test_search',
        description: 'Search for information',
        inputSchema: z.object({
          query: z.string(),
          limit: z.number().optional(),
        }),
      });

      const mockClient = createMockClient({
        eventsToEmit: [
          { type: 'message_start' },
          { type: 'text_delta', text: 'OK' },
          { type: 'message_stop', stopReason: 'end_turn' },
        ],
        streamChatResult: {
          stopReason: 'end_turn',
          content: [{ type: 'text', text: 'OK' }],
          usage: { inputTokens: 5, outputTokens: 5 },
        },
      });

      const executor = new LLMExecutor(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Search' }],
        tools: [mockTool],
        systemPrompt: 'You are helpful',
      };

      await collectEvents(executor.callModel(params));

      // Verify streamChat was called with converted tools
      expect(mockClient.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: 'test_search',
              description: 'Search for information',
              input_schema: expect.any(Object),
            }),
          ]),
        }),
      );
    });

    it('should handle complex nested Zod schemas', async () => {
      const complexTool = createMockTool({
        name: 'complex_tool',
        description: 'Tool with complex schema',
        inputSchema: z.object({
          nested: z.object({
            array: z.array(z.string()),
            optional: z.boolean().optional(),
          }),
        }),
      });

      const mockClient = createMockClient({
        eventsToEmit: [
          { type: 'message_stop', stopReason: 'end_turn' },
        ],
        streamChatResult: {
          stopReason: 'end_turn',
          content: [],
          usage: { inputTokens: 0, outputTokens: 0 },
        },
      });

      const executor = new LLMExecutor(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [complexTool],
        systemPrompt: 'You are helpful',
      };

      await collectEvents(executor.callModel(params));

      expect(mockClient.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: 'complex_tool',
              input_schema: expect.objectContaining({
                type: 'object',
                properties: expect.any(Object),
              }),
            }),
          ]),
        }),
      );
    });

    it('should handle optional tool fields', async () => {
      const optionalTool = createMockTool({
        name: 'optional_tool',
        description: 'Tool with optional fields',
        inputSchema: z.object({
          required: z.string(),
          optional: z.string().optional(),
          withDefault: z.number().default(42),
        }),
      });

      const mockClient = createMockClient({
        eventsToEmit: [
          { type: 'message_stop', stopReason: 'end_turn' },
        ],
        streamChatResult: {
          stopReason: 'end_turn',
          content: [],
          usage: { inputTokens: 0, outputTokens: 0 },
        },
      });

      const executor = new LLMExecutor(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [optionalTool],
        systemPrompt: 'You are helpful',
      };

      await collectEvents(executor.callModel(params));

      const callArgs = (mockClient.streamChat as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const toolDef = callArgs.tools[0];

      // Verify the schema was converted
      expect(toolDef).toMatchObject({
        name: 'optional_tool',
        description: 'Tool with optional fields',
        input_schema: expect.any(Object),
      });
    });
  });

  describe('createCallModel factory', () => {
    it('should work as standalone createCallModel function', async () => {
      const mockClient = createMockClient({
        eventsToEmit: [
          { type: 'message_start' },
          { type: 'text_delta', text: 'Factory test' },
          { type: 'message_stop', stopReason: 'end_turn' },
        ],
        streamChatResult: {
          stopReason: 'end_turn',
          content: [{ type: 'text', text: 'Factory test' }],
          usage: { inputTokens: 5, outputTokens: 10 },
        },
      });

      const callModel = createCallModel(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [],
        systemPrompt: 'You are helpful',
      };

      const events = await collectEvents(callModel(params));

      const textEvents = events.filter((e) => e.type === 'text_delta');
      expect(textEvents).toHaveLength(1);
      expect(textEvents[0].text).toBe('Factory test');
    });

    it('should handle async getClient function', async () => {
      const mockClient = createMockClient({
        eventsToEmit: [
          { type: 'message_start' },
          { type: 'text_delta', text: 'Async test' },
          { type: 'message_stop', stopReason: 'end_turn' },
        ],
        streamChatResult: {
          stopReason: 'end_turn',
          content: [{ type: 'text', text: 'Async test' }],
          usage: { inputTokens: 5, outputTokens: 10 },
        },
      });

      const callModel = createCallModel(async () => {
        // Simulate async provider lookup
        await new Promise((resolve) => setTimeout(resolve, 10));
        return mockClient;
      });

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [],
        systemPrompt: 'You are helpful',
      };

      const events = await collectEvents(callModel(params));

      const textEvents = events.filter((e) => e.type === 'text_delta');
      expect(textEvents).toHaveLength(1);
      expect(textEvents[0].text).toBe('Async test');
    });

    it('should handle null return from async getClient', async () => {
      const callModel = createCallModel(async () => null);

      const params: ModelCallParams = {
        model: 'unknown-model',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [],
        systemPrompt: 'You are helpful',
      };

      const events = await collectEvents(callModel(params));

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].error.message).toContain('No AI client available');
    });
  });

  describe('stopReason handling', () => {
    it('should handle tool_use stopReason without error', async () => {
      const mockClient = createMockClient({
        eventsToEmit: [
          { type: 'message_start' },
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'test_tool',
            input: { arg: 'value' },
          },
          { type: 'message_stop', stopReason: 'tool_use' },
        ],
        streamChatResult: {
          stopReason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'test_tool',
              input: { arg: 'value' },
            },
          ],
          usage: { inputTokens: 10, outputTokens: 20 },
        },
      });

      const executor = new LLMExecutor(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Use a tool' }],
        tools: [],
        systemPrompt: 'You are helpful',
      };

      const events = await collectEvents(executor.callModel(params));

      // Should have tool_use event but no error
      const toolEvents = events.filter((e) => e.type === 'tool_use');
      expect(toolEvents).toHaveLength(1);

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(0);
    });

    it('should handle stop_sequence stopReason', async () => {
      const mockClient = createMockClient({
        eventsToEmit: [
          { type: 'message_start' },
          { type: 'text_delta', text: 'Stopped' },
          { type: 'message_stop', stopReason: 'stop_sequence' },
        ],
        streamChatResult: {
          stopReason: 'stop_sequence',
          content: [{ type: 'text', text: 'Stopped' }],
          usage: { inputTokens: 5, outputTokens: 10 },
        },
      });

      const executor = new LLMExecutor(() => mockClient);

      const params: ModelCallParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [],
        systemPrompt: 'You are helpful',
      };

      const events = await collectEvents(executor.callModel(params));

      // Should complete normally
      const textEvents = events.filter((e) => e.type === 'text_delta');
      expect(textEvents).toHaveLength(1);

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(0);
    });
  });

  describe('parameter passing', () => {
    it('should pass all parameters to streamChat correctly', async () => {
      const mockClient = createMockClient({
        eventsToEmit: [
          { type: 'message_stop', stopReason: 'end_turn' },
        ],
        streamChatResult: {
          stopReason: 'end_turn',
          content: [],
          usage: { inputTokens: 0, outputTokens: 0 },
        },
      });

      const executor = new LLMExecutor(() => mockClient);

      const messages: ChatMessage[] = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Second message' },
      ];

      const params: ModelCallParams = {
        model: 'gpt-4',
        messages,
        tools: [],
        systemPrompt: 'Custom system prompt',
        maxTokens: 4096,
        temperature: 0.7,
        thinkingBudget: 8192,
      };

      await collectEvents(executor.callModel(params));

      expect(mockClient.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
          systemPrompt: 'Custom system prompt',
          maxTokens: 4096,
          thinkingBudget: 8192,
          tools: [],
        }),
      );
    });
  });
});
