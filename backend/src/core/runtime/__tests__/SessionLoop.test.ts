/**
 * Tests for SessionLoop
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { SessionLoop, createSessionLoop, DEFAULT_DEPS } from '../SessionLoop.js';
import type { SessionConfig, StreamEvent, QueryParams, ModelCallParams } from '../../types/session-types.js';
import type { Tool, ToolDef, ToolUseContext } from '../../types/tool-types.js';
import type { ChatMessage } from '../../../services/ai/AIClient.js';

describe('SessionLoop', () => {
  let mockConfig: SessionConfig;
  let mockMessages: ChatMessage[];
  let mockTools: Tool[];

  beforeEach(() => {
    mockConfig = {
      sessionId: 'test-session',
      model: 'test-model',
      systemPrompt: 'You are a helpful assistant.',
      tools: [],
      commands: [],
      maxTurns: 3,
    };

    mockMessages = [
      { role: 'user', content: 'Hello, assistant!' },
    ];

    // Create a simple mock tool
    const mockTool: ToolDef<{ query: string }, string> = {
      name: 'search',
      description: 'Search for something',
      inputSchema: z.object({ query: z.string() }) as any,
      call: async (args) => ({ data: `Results for: ${args.query}` }),
      maxResultSizeChars: 1000,
    };

    mockTools = [mockTool as unknown as Tool];
    Object.defineProperty(mockConfig, 'tools', { value: mockTools, writable: true });
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const params: QueryParams = {
        config: mockConfig,
        messages: mockMessages,
      };

      const loop = new SessionLoop(params);

      expect(loop.getStatus()).toBe('initializing');
      const state = loop.getState();
      expect(state.turnCount).toBe(0);
      expect(state.messages).toEqual(mockMessages);
    });

    it('should use default dependencies when not provided', () => {
      const params: QueryParams = {
        config: mockConfig,
        messages: mockMessages,
      };

      const loop = new SessionLoop(params);

      expect(loop).toBeDefined();
    });

    it('should accept custom dependencies', () => {
      const customUuid = vi.fn(() => 'custom-uuid');
      const customCallModel = vi.fn(async function* (_params: ModelCallParams): AsyncGenerator<StreamEvent> {
        yield { type: 'text_delta', text: 'Response' };
      });

      const params: QueryParams = {
        config: mockConfig,
        messages: mockMessages,
        deps: {
          uuid: customUuid,
          callModel: customCallModel,
        },
      };

      const loop = new SessionLoop(params);

      expect(loop).toBeDefined();
    });
  });

  describe('lifecycle methods', () => {
    it('should pause and resume', () => {
      const params: QueryParams = {
        config: mockConfig,
        messages: mockMessages,
      };

      const loop = new SessionLoop(params);

      loop.pause();
      expect(loop.getStatus()).toBe('paused');

      loop.resume();
      expect(loop.getStatus()).toBe('running');
    });

    it('should abort', () => {
      const params: QueryParams = {
        config: mockConfig,
        messages: mockMessages,
      };

      const loop = new SessionLoop(params);

      loop.abort();
      expect(loop.getStatus()).toBe('cancelled');
      expect(loop.getState().abortController.signal.aborted).toBe(true);
    });
  });

  describe('getResult', () => {
    it('should return completed result when finished normally', () => {
      const params: QueryParams = {
        config: mockConfig,
        messages: mockMessages,
      };

      const loop = new SessionLoop(params);
      // Simulate completion
      (loop as any).currentStatus = 'completed';

      const result = loop.getResult();

      expect(result.reason).toBe('completed');
      expect(result.messages).toEqual(mockMessages);
      expect(result.turnCount).toBe(0);
    });

    it('should return aborted result when cancelled', () => {
      const params: QueryParams = {
        config: mockConfig,
        messages: mockMessages,
      };

      const loop = new SessionLoop(params);
      loop.abort();

      const result = loop.getResult();

      expect(result.reason).toBe('aborted');
    });

    it('should return max_turns when limit reached', () => {
      const params: QueryParams = {
        config: {
          ...mockConfig,
          maxTurns: 1,
        },
        messages: mockMessages,
      };

      const loop = new SessionLoop(params);
      // Simulate reaching max turns
      (loop as any).state.turnCount = 1;

      const result = loop.getResult();

      expect(result.reason).toBe('max_turns');
    });
  });

  describe('state management', () => {
    it('should return immutable state copy', () => {
      const params: QueryParams = {
        config: mockConfig,
        messages: mockMessages,
      };

      const loop = new SessionLoop(params);
      const state1 = loop.getState();
      const state2 = loop.getState();

      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // Different references
    });

    it('should track turn count', () => {
      const params: QueryParams = {
        config: mockConfig,
        messages: mockMessages,
      };

      const loop = new SessionLoop(params);

      expect(loop.getState().turnCount).toBe(0);

      // Manually increment for testing
      (loop as any).state.turnCount = 1;

      expect(loop.getState().turnCount).toBe(1);
    });
  });
});

describe('createSessionLoop', () => {
  it('should create and run a session loop', async () => {
    const mockConfig: SessionConfig = {
      sessionId: 'test-session',
      model: 'test-model',
      systemPrompt: 'You are helpful.',
      tools: [],
      commands: [],
    };

    const mockMessages: ChatMessage[] = [
      { role: 'user', content: 'Test' },
    ];

    // Mock the model caller to return events
    const mockCallModel = vi.fn(async function* (_params: ModelCallParams): AsyncGenerator<StreamEvent> {
      yield { type: 'text_delta', text: 'Hello' };
      yield { type: 'text_delta', text: ' world' };
    });

    const params: QueryParams = {
      config: mockConfig,
      messages: mockMessages,
      deps: {
        callModel: mockCallModel,
        uuid: () => 'test-uuid',
      },
    };

    const events: StreamEvent[] = [];

    // Collect all events (but loop will try to continue, so we'll just test a few)
    for await (const event of createSessionLoop(params)) {
      events.push(event);
      if (events.length > 5) break; // Limit for testing
    }

    expect(events.length).toBeGreaterThan(0);
    expect(mockCallModel).toHaveBeenCalled();
  });
});

describe('DEFAULT_DEPS', () => {
  it('should have uuid function', () => {
    expect(DEFAULT_DEPS.uuid).toBeDefined();
    expect(typeof DEFAULT_DEPS.uuid).toBe('function');

    const id = DEFAULT_DEPS.uuid();
    expect(typeof id).toBe('string');
    expect(id).toBeTruthy();
  });

  it('should have callModel function', () => {
    expect(DEFAULT_DEPS.callModel).toBeDefined();
    expect(typeof DEFAULT_DEPS.callModel).toBe('function');
  });

  it('should callModel throw when used without implementation', async () => {
    const generator = DEFAULT_DEPS.callModel({
      model: 'test',
      messages: [],
      tools: [],
      systemPrompt: 'test',
    });

    let errorThrown = false;
    try {
      for await (const _event of generator) {
        // Should not reach here
      }
    } catch (error) {
      errorThrown = true;
      expect((error as Error).message).toContain('not provided');
    }

    expect(errorThrown).toBe(true);
  });
});
