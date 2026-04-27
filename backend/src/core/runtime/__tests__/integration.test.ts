/**
 * @module core/runtime/__tests__/integration
 * @description Integration tests for the full runtime pipeline.
 *
 * These tests verify the complete end-to-end flow from SessionLoop through
 * LLMExecutor and ToolExecutor, using real components and only mocking external
 * dependencies (AIClient).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { SessionLoop } from '../SessionLoop.js';
import { ToolRegistry, buildTool, createToolExecutionError } from '../ToolRegistry.js';
import { ToolExecutor } from '../ToolExecutor.js';
import type {
  SessionConfig,
  StreamEvent,
  QueryParams,
  ModelCallParams,
} from '../../types/session-types.js';
import type { Tool, ToolUseContext } from '../../types/tool-types.js';
import type { ChatMessage } from '../../../services/ai/AIClient.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Create a mock callModel function that yields the provided events.
 */
function createMockCallModel(events: StreamEvent[]) {
  return vi.fn(async function* (params: ModelCallParams): AsyncGenerator<StreamEvent> {
    for (const event of events) {
      yield event;
    }
  });
}

/**
 * Create a basic session config for testing.
 */
function createBasicConfig(overrides?: Partial<SessionConfig>): SessionConfig {
  return {
    sessionId: 'test-session',
    model: 'test-model',
    systemPrompt: 'You are a helpful assistant.',
    tools: [],
    commands: [],
    maxTurns: 3,
    ...overrides,
  };
}

/**
 * Create basic user message for testing.
 */
function createUserMessage(content: string): ChatMessage {
  return { role: 'user', content };
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Runtime Integration Tests', () => {
  let toolRegistry: ToolRegistry;
  let mockConfig: SessionConfig;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    mockConfig = createBasicConfig();
  });

  describe('Full Session Loop with Text Response', () => {
    it('should complete a full pipeline with text response only', async () => {
      // Arrange: Register a simple echo tool (not used in this test)
      const echoTool = buildTool({
        name: 'echo',
        description: 'Echo input',
        inputSchema: z.object({ message: z.string() }),
        call: async (args) => ({ data: args.message }),
        maxResultSizeChars: 10000,
      });
      toolRegistry.registerTool(echoTool);

      // Update config with the tool
      mockConfig = createBasicConfig({
        tools: [echoTool],
      });

      // Create mock callModel that returns text only
      const mockCallModel = createMockCallModel([
        { type: 'text_delta', text: 'Hello' },
        { type: 'text_delta', text: ' world' },
      ]);

      // Create SessionLoop
      const params: QueryParams = {
        config: mockConfig,
        messages: [createUserMessage('Say hello')],
        deps: { callModel: mockCallModel, uuid: () => 'test-uuid' },
      };

      const loop = new SessionLoop(params);
      const events: StreamEvent[] = [];

      // Act: Run the loop and collect events
      for await (const event of loop.run()) {
        events.push(event);
        if (event.type === 'turn_end') break; // Exit after first turn
      }

      // Assert: Verify events are in correct order
      expect(events[0].type).toBe('turn_start');
      expect((events[0] as any).turn).toBe(1);

      const textDeltas = events.filter((e) => e.type === 'text_delta');
      expect(textDeltas).toHaveLength(2);
      expect(textDeltas[0].text).toBe('Hello');
      expect(textDeltas[1].text).toBe(' world');

      const turnEnd = events.filter((e) => e.type === 'turn_end');
      expect(turnEnd).toHaveLength(1);
    });
  });

  describe('Tool Execution Pipeline', () => {
    it('should execute tool through ToolExecutor with valid params', async () => {
      // Arrange: Create and register a tool
      const calculatorTool = buildTool({
        name: 'calculator',
        description: 'Perform basic math',
        inputSchema: z.object({ operation: z.string(), a: z.number(), b: z.number() }),
        call: async (args) => {
          const { operation, a, b } = args;
          let result: number;
          switch (operation) {
            case 'add':
              result = a + b;
              break;
            case 'multiply':
              result = a * b;
              break;
            default:
              result = 0;
          }
          return { data: result };
        },
        maxResultSizeChars: 1000,
      });
      toolRegistry.registerTool(calculatorTool);

      const toolExecutor = new ToolExecutor(toolRegistry);

      // Act: Execute the tool
      const result = await toolExecutor.execute({
        toolUseId: 'call-123',
        toolName: 'calculator',
        input: { operation: 'add', a: 5, b: 3 },
        sessionId: 'sess-456',
        abortController: new AbortController(),
      });

      // Assert: Verify result (ToolExecutor converts result to string via truncateResult)
      expect(result.event.type).toBe('tool_result');
      expect(result.event.id).toBe('call-123');
      expect(result.event.toolName).toBe('calculator');
      // Result is converted to string by truncateResult
      expect(result.event.result).toBe('8');
      expect(result.recoverable).toBe(true);
    });

    it('should return validation error for invalid tool input', async () => {
      // Arrange: Create a tool with strict schema
      const strictTool = buildTool({
        name: 'strict_tool',
        description: 'Tool with strict validation',
        inputSchema: z.object({
          required: z.string(),
          optional: z.number().optional(),
        }),
        call: async (args) => ({ data: args }),
        maxResultSizeChars: 1000,
      });
      toolRegistry.registerTool(strictTool);

      const toolExecutor = new ToolExecutor(toolRegistry);

      // Act: Execute with invalid input (missing required field)
      const result = await toolExecutor.execute({
        toolUseId: 'call-456',
        toolName: 'strict_tool',
        input: { optional: 42 }, // Missing 'required'
        sessionId: 'sess-789',
        abortController: new AbortController(),
      });

      // Assert: Verify validation error
      expect(result.event.type).toBe('tool_result');
      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('Input validation failed');
      expect(result.recoverable).toBe(true); // Validation errors are recoverable
      expect(result.suggestions).toBeDefined();
    });

    it('should return not found error for unregistered tool', async () => {
      // Arrange: Create executor with empty registry
      const toolExecutor = new ToolExecutor(toolRegistry);

      // Act: Try to execute non-existent tool
      const result = await toolExecutor.execute({
        toolUseId: 'call-789',
        toolName: 'nonexistent_tool',
        input: { foo: 'bar' },
        sessionId: 'sess-123',
        abortController: new AbortController(),
      });

      // Assert: Verify not found error
      expect(result.event.type).toBe('tool_result');
      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('not found in registry');
      expect(result.recoverable).toBe(false); // Not found is fatal
    });
  });

  describe('Tool Result Truncation', () => {
    it('should truncate oversized tool results', async () => {
      // Arrange: Create a tool that returns large data
      const largeDataTool = buildTool({
        name: 'large_data',
        description: 'Returns large data',
        inputSchema: z.object({ size: z.number() }),
        call: async (args) => ({
          data: 'x'.repeat(args.size),
        }),
        maxResultSizeChars: 100, // Small limit
      });
      toolRegistry.registerTool(largeDataTool);

      const toolExecutor = new ToolExecutor(toolRegistry);

      // Act: Execute with data larger than limit
      const result = await toolExecutor.execute({
        toolUseId: 'call-large',
        toolName: 'large_data',
        input: { size: 500 }, // Much larger than maxResultSizeChars
        sessionId: 'sess-truncate',
        abortController: new AbortController(),
      });

      // Assert: Verify truncation
      expect(result.event.type).toBe('tool_result');
      const resultStr = String(result.event.result);
      expect(resultStr.length).toBeLessThanOrEqual(100 + '\n...[truncated]'.length);
      expect(resultStr).toContain('...[truncated]');
    });
  });

  describe('Tool Alias Resolution', () => {
    it('should resolve tool aliases through registry', async () => {
      // Arrange: Register tool with alias
      const searchTool = buildTool({
        name: 'web_search',
        description: 'Search the web',
        aliases: ['search', 'find'],
        inputSchema: z.object({ query: z.string() }),
        call: async (args) => ({ data: `Results for: ${args.query}` }),
        maxResultSizeChars: 1000,
      });
      toolRegistry.registerTool(searchTool);

      const toolExecutor = new ToolExecutor(toolRegistry);

      // Act: Execute using alias
      const result = await toolExecutor.execute({
        toolUseId: 'call-alias',
        toolName: 'search', // Using alias
        input: { query: 'test' },
        sessionId: 'sess-alias',
        abortController: new AbortController(),
      });

      // Assert: Verify tool was found and executed
      expect(result.event.type).toBe('tool_result');
      expect(result.event.toolName).toBe('search');
      expect(result.event.result).toBe('Results for: test');
      expect(result.event.isError).toBeUndefined();
    });
  });

  describe('Complex Multi-Tool Scenario', () => {
    it('should handle multiple tool calls in a single turn', async () => {
      // Arrange: Register multiple tools
      const tool1 = buildTool({
        name: 'tool1',
        description: 'First tool',
        inputSchema: z.object({ value: z.string() }),
        call: async (args) => ({ data: `tool1: ${args.value}` }),
        maxResultSizeChars: 1000,
      });

      const tool2 = buildTool({
        name: 'tool2',
        description: 'Second tool',
        inputSchema: z.object({ value: z.string() }),
        call: async (args) => ({ data: `tool2: ${args.value}` }),
        maxResultSizeChars: 1000,
      });

      toolRegistry.registerTool(tool1);
      toolRegistry.registerTool(tool2);

      mockConfig = createBasicConfig({
        tools: [tool1, tool2],
      });

      // Mock that calls both tools
      const mockCallModel = vi.fn(async function* (params: ModelCallParams): AsyncGenerator<StreamEvent> {
        yield { type: 'tool_use', id: 'call-1', toolName: 'tool1', input: { value: 'a' } };
        yield { type: 'tool_use', id: 'call-2', toolName: 'tool2', input: { value: 'b' } };
      });

      const params: QueryParams = {
        config: mockConfig,
        messages: [createUserMessage('Use both tools')],
        deps: { callModel: mockCallModel, uuid: () => 'test-uuid' },
      };

      const loop = new SessionLoop(params);
      const events: StreamEvent[] = [];

      // Act: Run the loop
      for await (const event of loop.run()) {
        events.push(event);
        if (event.type === 'turn_end') break;
      }

      // Assert: Verify both tools were executed
      const toolUseEvents = events.filter((e) => e.type === 'tool_use');
      expect(toolUseEvents).toHaveLength(2);

      const toolResultEvents = events.filter((e) => e.type === 'tool_result');
      expect(toolResultEvents).toHaveLength(2);

      expect(toolResultEvents[0].toolName).toBe('tool1');
      expect(toolResultEvents[0].result).toBe('tool1: a');
      expect(toolResultEvents[1].toolName).toBe('tool2');
      expect(toolResultEvents[1].result).toBe('tool2: b');
    });
  });

  describe('Empty and Minimal Sessions', () => {
    it('should handle session with no tools', async () => {
      // Arrange: Config with no tools
      mockConfig = createBasicConfig({ tools: [] });

      const mockCallModel = createMockCallModel([
        { type: 'text_delta', text: 'Hello without tools' },
      ]);

      const params: QueryParams = {
        config: mockConfig,
        messages: [createUserMessage('Say hello')],
        deps: { callModel: mockCallModel, uuid: () => 'test-uuid' },
      };

      const loop = new SessionLoop(params);
      const events: StreamEvent[] = [];

      // Act: Run the loop
      for await (const event of loop.run()) {
        events.push(event);
        if (event.type === 'turn_end') break;
      }

      // Assert: Should complete normally
      const textDeltas = events.filter((e) => e.type === 'text_delta');
      expect(textDeltas.length).toBeGreaterThan(0);
      expect(loop.getStatus()).toBe('completed');
    });

    it('should handle session with empty message history', async () => {
      // Arrange: Start with empty messages
      mockConfig = createBasicConfig();

      const mockCallModel = createMockCallModel([
        { type: 'text_delta', text: 'Response to empty history' },
      ]);

      const params: QueryParams = {
        config: mockConfig,
        messages: [], // Empty history
        deps: { callModel: mockCallModel, uuid: () => 'test-uuid' },
      };

      const loop = new SessionLoop(params);
      const events: StreamEvent[] = [];

      // Act: Run the loop
      for await (const event of loop.run()) {
        events.push(event);
        if (event.type === 'turn_end') break;
      }

      // Assert: Should handle gracefully
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('turn_start');
    });
  });

  describe('Thinking Events', () => {
    it('should propagate thinking events through the pipeline', async () => {
      // Arrange
      mockConfig = createBasicConfig();

      const mockCallModel = createMockCallModel([
        { type: 'thinking', content: 'Let me think about this...' },
        { type: 'text_delta', text: 'After thinking, here is my answer' },
      ]);

      const params: QueryParams = {
        config: mockConfig,
        messages: [createUserMessage('Complex question')],
        deps: { callModel: mockCallModel, uuid: () => 'test-uuid' },
      };

      const loop = new SessionLoop(params);
      const events: StreamEvent[] = [];

      // Act: Run the loop
      for await (const event of loop.run()) {
        events.push(event);
        if (event.type === 'turn_end') break;
      }

      // Assert: Verify thinking event
      const thinkingEvents = events.filter((e) => e.type === 'thinking');
      expect(thinkingEvents).toHaveLength(1);
      expect(thinkingEvents[0].content).toBe('Let me think about this...');
    });
  });

  describe('Session Lifecycle', () => {
    it('should handle pause and resume state changes', () => {
      // Arrange
      const params: QueryParams = {
        config: mockConfig,
        messages: [createUserMessage('Test')],
        deps: {
          callModel: createMockCallModel([{ type: 'text_delta', text: 'Response' }]),
          uuid: () => 'test-uuid',
        },
      };

      const loop = new SessionLoop(params);

      // Act & Assert: Pause
      loop.pause();
      expect(loop.getStatus()).toBe('paused');

      // Act & Assert: Resume
      loop.resume();
      expect(loop.getStatus()).toBe('running');
    });

    it('should handle abort and set cancelled status', () => {
      // Arrange
      const params: QueryParams = {
        config: mockConfig,
        messages: [createUserMessage('Test')],
        deps: {
          callModel: createMockCallModel([{ type: 'text_delta', text: 'Response' }]),
          uuid: () => 'test-uuid',
        },
      };

      const loop = new SessionLoop(params);

      // Act: Abort
      loop.abort();

      // Assert: Verify abort state
      expect(loop.getState().abortController.signal.aborted).toBe(true);
      const result = loop.getResult();
      expect(result.reason).toBe('aborted');
    });
  });

  describe('State Management', () => {
    it('should return immutable state copies', () => {
      // Arrange
      const params: QueryParams = {
        config: mockConfig,
        messages: [createUserMessage('Test')],
        deps: {
          callModel: createMockCallModel([{ type: 'text_delta', text: 'Response' }]),
          uuid: () => 'test-uuid',
        },
      };

      const loop = new SessionLoop(params);

      // Act: Get state multiple times
      const state1 = loop.getState();
      const state2 = loop.getState();

      // Assert: States should be equal but different references
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('should track initial turn count', () => {
      // Arrange
      const params: QueryParams = {
        config: mockConfig,
        messages: [createUserMessage('Test')],
        deps: {
          callModel: createMockCallModel([{ type: 'text_delta', text: 'Response' }]),
          uuid: () => 'test-uuid',
        },
      };

      const loop = new SessionLoop(params);

      // Assert: Initial turn count is 0
      expect(loop.getState().turnCount).toBe(0);
    });
  });

  describe('Tool Registry Integration', () => {
    it('should register and retrieve tools correctly', () => {
      // Arrange: Create a tool
      const testTool = buildTool({
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: z.object({ input: z.string() }),
        call: async (args) => ({ data: args.input }),
        maxResultSizeChars: 1000,
      });

      // Act: Register the tool
      toolRegistry.registerTool(testTool);

      // Assert: Verify registration
      expect(toolRegistry.has('test_tool')).toBe(true);
      expect(toolRegistry.get('test_tool')).toBeDefined();
      expect(toolRegistry.get('test_tool')?.name).toBe('test_tool');
      expect(toolRegistry.size).toBe(1);
    });

    it('should unregister tools correctly', () => {
      // Arrange: Register a tool
      const testTool = buildTool({
        name: 'temp_tool',
        description: 'Temporary tool',
        inputSchema: z.object({ input: z.string() }),
        call: async (args) => ({ data: args.input }),
        maxResultSizeChars: 1000,
      });
      toolRegistry.registerTool(testTool);
      expect(toolRegistry.has('temp_tool')).toBe(true);

      // Act: Unregister
      const unregistered = toolRegistry.unregister('temp_tool');

      // Assert: Verify removal
      expect(unregistered).toBe(true);
      expect(toolRegistry.has('temp_tool')).toBe(false);
    });

    it('should resolve aliases correctly', () => {
      // Arrange: Register tool with alias
      const tool = buildTool({
        name: 'main_tool',
        description: 'Main tool',
        aliases: ['alias1', 'alias2'],
        inputSchema: z.object({ input: z.string() }),
        call: async (args) => ({ data: args.input }),
        maxResultSizeChars: 1000,
      });
      toolRegistry.registerTool(tool);

      // Act & Assert: Verify alias resolution
      expect(toolRegistry.resolveAlias('alias1')).toBe('main_tool');
      expect(toolRegistry.resolveAlias('alias2')).toBe('main_tool');
      expect(toolRegistry.resolveAlias('main_tool')).toBe('main_tool');
      expect(toolRegistry.resolveAlias('nonexistent')).toBeUndefined();
    });
  });

  describe('Tool Methods', () => {
    it('should call tool methods correctly', async () => {
      // Arrange: Create a tool
      const tool = buildTool({
        name: 'comprehensive_tool',
        description: 'Tool with various methods',
        inputSchema: z.object({ input: z.string() }),
        call: async (args) => ({ data: `Processed: ${args.input}` }),
        isEnabled: () => true,
        isReadOnly: () => true,
        isConcurrencySafe: () => false,
        userFacingName: (args) => `Process ${args.input}`,
        getActivityDescription: (args) => `Processing ${args.input}`,
        maxResultSizeChars: 1000,
      });

      // Act & Assert: Verify methods
      expect(tool.isEnabled()).toBe(true);
      expect(tool.isReadOnly({ input: 'test' })).toBe(true);
      expect(tool.isConcurrencySafe({ input: 'test' })).toBe(false);
      expect(tool.userFacingName({ input: 'test' })).toBe('Process test');
      // getActivityDescription is optional - check if it exists first
      const activityDesc = tool.getActivityDescription?.({ input: 'test' });
      expect(activityDesc).toBe('Processing test');
    });

    it('should execute tool call with context', async () => {
      // Arrange: Create a tool that uses context
      const contextTool = buildTool({
        name: 'context_tool',
        description: 'Tool that uses context',
        inputSchema: z.object({ input: z.string() }),
        call: async (args, context) => {
          return {
            data: `Session: ${context.sessionId}, Input: ${args.input}`,
          };
        },
        maxResultSizeChars: 1000,
      });

      const mockContext: ToolUseContext = {
        sessionId: 'test-session-123',
        permissions: {} as any,
        abortController: new AbortController(),
        provider: null,
      };

      // Act: Call the tool
      const result = await contextTool.call({ input: 'test' }, mockContext);

      // Assert: Verify context was used
      expect(result.data).toBe('Session: test-session-123, Input: test');
    });
  });

  describe('Error Handling', () => {
    it('should create tool execution error correctly', () => {
      // Arrange
      const cause = new Error('Original error');
      const error = createToolExecutionError(
        'test_tool',
        { input: 'test' },
        cause,
        true,
        ['Retry with different input']
      );

      // Assert: Verify error structure
      expect(error.toolName).toBe('test_tool');
      expect(error.input).toEqual({ input: 'test' });
      expect(error.cause).toBe(cause);
      expect(error.recoverable).toBe(true);
      expect(error.suggestions).toEqual(['Retry with different input']);
    });
  });

  describe('Max Turns Configuration', () => {
    it('should respect maxTurns limit in result', () => {
      // Arrange
      const params: QueryParams = {
        config: createBasicConfig({ maxTurns: 5 }),
        messages: [createUserMessage('Test')],
        deps: {
          callModel: createMockCallModel([{ type: 'text_delta', text: 'Response' }]),
          uuid: () => 'test-uuid',
        },
      };

      const loop = new SessionLoop(params);

      // Simulate reaching max turns
      (loop as any).state.turnCount = 5;

      // Act: Get result
      const result = loop.getResult();

      // Assert: Should report max_turns
      expect(result.reason).toBe('max_turns');
    });
  });
});
