/**
 * @module core/runtime/tests/integration
 * @description Integration tests for ToolExecutor with HookBus
 *
 * Tests that ToolExecutor correctly emits hook events at the right times
 * with the correct payloads.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { ToolExecutor } from '../ToolExecutor.js';
import { ToolRegistry, buildTool } from '../ToolRegistry.js';
import { HookBus } from '../../hooks/HookBus.js';
import type { PreToolPayload, PostToolPayload, ToolFailurePayload } from '../../hooks/types.js';

describe('ToolExecutor with HookBus integration', () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;
  let hookBus: HookBus;
  let mockAbortController: AbortController;

  beforeEach(() => {
    registry = new ToolRegistry();
    executor = new ToolExecutor(registry);
    hookBus = new HookBus();
    executor.setHookBus(hookBus);
    mockAbortController = new AbortController();
  });

  describe('pre-tool hook', () => {
    it('emits pre-tool event before executing a tool', async () => {
      const handler = vi.fn();
      hookBus.on('pre-tool', handler);

      registry.registerTool(
        buildTool({
          name: 'echo',
          description: 'Echo input back',
          inputSchema: z.object({ message: z.string() }),
          call: async ({ message }) => ({ data: `Echo: ${message}` }),
          maxResultSizeChars: 1000,
        }),
      );

      const result = await executor.execute({
        toolUseId: 'call_001',
        toolName: 'echo',
        input: { message: 'hello' },
        sessionId: 'test-session-123',
        abortController: mockAbortController,
        agentId: 'agent-1',
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const payload = handler.mock.calls[0][0] as PreToolPayload;
      expect(payload.sessionId).toBe('test-session-123');
      expect(payload.agentId).toBe('agent-1');
      expect(payload.toolName).toBe('echo');
      expect(payload.input).toEqual({ message: 'hello' });
      expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('includes agentId as "unknown" when not provided', async () => {
      const handler = vi.fn();
      hookBus.on('pre-tool', handler);

      registry.registerTool(
        buildTool({
          name: 'test_tool',
          description: 'Test tool',
          inputSchema: z.object({}),
          call: async () => ({ data: 'result' }),
          maxResultSizeChars: 1000,
        }),
      );

      await executor.execute({
        toolUseId: 'call_001',
        toolName: 'test_tool',
        input: {},
        sessionId: 'session-1',
        abortController: mockAbortController,
        // agentId not provided
      });

      const payload = handler.mock.calls[0][0] as PreToolPayload;
      expect(payload.agentId).toBe('unknown');
    });

    it('emits pre-tool even when tool execution fails', async () => {
      const handler = vi.fn();
      hookBus.on('pre-tool', handler);

      registry.registerTool(
        buildTool({
          name: 'failing_tool',
          description: 'Tool that throws',
          inputSchema: z.object({}),
          call: async () => {
            throw new Error('Tool execution failed');
          },
          maxResultSizeChars: 1000,
        }),
      );

      const result = await executor.execute({
        toolUseId: 'call_001',
        toolName: 'failing_tool',
        input: {},
        sessionId: 'session-1',
        abortController: mockAbortController,
        agentId: 'agent-1',
      });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('post-tool hook', () => {
    it('emits post-tool event after successful tool execution', async () => {
      const handler = vi.fn();
      hookBus.on('post-tool', handler);

      registry.registerTool(
        buildTool({
          name: 'calculator',
          description: 'Add two numbers',
          inputSchema: z.object({ a: z.number(), b: z.number() }),
          call: async ({ a, b }) => ({ data: a + b }),
          maxResultSizeChars: 1000,
        }),
      );

      const result = await executor.execute({
        toolUseId: 'call_001',
        toolName: 'calculator',
        input: { a: 5, b: 3 },
        sessionId: 'test-session-123',
        abortController: mockAbortController,
        agentId: 'agent-calculator',
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const payload = handler.mock.calls[0][0] as PostToolPayload;
      expect(payload.sessionId).toBe('test-session-123');
      expect(payload.agentId).toBe('agent-calculator');
      expect(payload.toolName).toBe('calculator');
      expect(payload.input).toEqual({ a: 5, b: 3 });
      expect(payload.result).toBe(8);
      expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('does not emit post-tool when tool validation fails', async () => {
      const handler = vi.fn();
      hookBus.on('post-tool', handler);

      registry.registerTool(
        buildTool({
          name: 'validated',
          description: 'Tool with validation',
          inputSchema: z.object({ count: z.number().positive() }),
          call: async () => ({ data: 'ok' }),
          maxResultSizeChars: 1000,
        }),
      );

      const result = await executor.execute({
        toolUseId: 'call_001',
        toolName: 'validated',
        input: { count: -1 }, // Invalid input
        sessionId: 'session-1',
        abortController: mockAbortController,
        agentId: 'agent-1',
      });

      expect(handler).not.toHaveBeenCalled();
      expect(result.event.isError).toBe(true);
    });

    it('does not emit post-tool when tool is not found', async () => {
      const handler = vi.fn();
      hookBus.on('post-tool', handler);

      const result = await executor.execute({
        toolUseId: 'call_001',
        toolName: 'nonexistent',
        input: {},
        sessionId: 'session-1',
        abortController: mockAbortController,
        agentId: 'agent-1',
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('tool-failure hook', () => {
    it('emits tool-failure event when tool throws an error', async () => {
      const handler = vi.fn();
      hookBus.on('tool-failure', handler);

      registry.registerTool(
        buildTool({
          name: 'explosive_tool',
          description: 'Tool that explodes',
          inputSchema: z.object({}),
          call: async () => {
            throw new Error('Boom!');
          },
          maxResultSizeChars: 1000,
        }),
      );

      const result = await executor.execute({
        toolUseId: 'call_001',
        toolName: 'explosive_tool',
        input: {},
        sessionId: 'session-1',
        abortController: mockAbortController,
        agentId: 'agent-1',
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const payload = handler.mock.calls[0][0] as ToolFailurePayload;
      expect(payload.sessionId).toBe('session-1');
      expect(payload.agentId).toBe('agent-1');
      expect(payload.toolName).toBe('explosive_tool');
      expect(payload.input).toEqual({});
      expect(payload.error).toBeInstanceOf(Error);
      expect((payload.error as Error).message).toBe('Boom!');
      expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('includes error message when tool throws a string', async () => {
      const handler = vi.fn();
      hookBus.on('tool-failure', handler);

      registry.registerTool(
        buildTool({
          name: 'string_error_tool',
          description: 'Tool that throws string',
          inputSchema: z.object({}),
          call: async () => {
            throw 'String error message';
          },
          maxResultSizeChars: 1000,
        }),
      );

      await executor.execute({
        toolUseId: 'call_001',
        toolName: 'string_error_tool',
        input: {},
        sessionId: 'session-1',
        abortController: mockAbortController,
        agentId: 'agent-1',
      });

      const payload = handler.mock.calls[0][0] as ToolFailurePayload;
      expect(payload.error).toBe('String error message');
    });

    it('does not emit tool-failure for validation errors', async () => {
      const handler = vi.fn();
      hookBus.on('tool-failure', handler);

      registry.registerTool(
        buildTool({
          name: 'validated',
          description: 'Tool with validation',
          inputSchema: z.object({ count: z.number().positive() }),
          call: async () => ({ data: 'ok' }),
          maxResultSizeChars: 1000,
        }),
      );

      const result = await executor.execute({
        toolUseId: 'call_001',
        toolName: 'validated',
        input: { count: -1 }, // Invalid input
        sessionId: 'session-1',
        abortController: mockAbortController,
        agentId: 'agent-1',
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('does not emit tool-failure for unknown tools', async () => {
      const handler = vi.fn();
      hookBus.on('tool-failure', handler);

      const result = await executor.execute({
        toolUseId: 'call_001',
        toolName: 'nonexistent',
        input: {},
        sessionId: 'session-1',
        abortController: mockAbortController,
        agentId: 'agent-1',
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('hook execution order', () => {
    it('emits hooks in correct order: pre-tool -> post-tool', async () => {
      const order: string[] = [];

      hookBus.on('pre-tool', async () => {
        order.push('pre-tool');
      });
      hookBus.on('post-tool', async () => {
        order.push('post-tool');
      });

      registry.registerTool(
        buildTool({
          name: 'order_test',
          description: 'Test hook order',
          inputSchema: z.object({}),
          call: async () => ({ data: 'result' }),
          maxResultSizeChars: 1000,
        }),
      );

      await executor.execute({
        toolUseId: 'call_001',
        toolName: 'order_test',
        input: {},
        sessionId: 'session-1',
        abortController: mockAbortController,
        agentId: 'agent-1',
      });

      expect(order).toEqual(['pre-tool', 'post-tool']);
    });

    it('emits hooks in correct order: pre-tool -> tool-failure', async () => {
      const order: string[] = [];

      hookBus.on('pre-tool', async () => {
        order.push('pre-tool');
      });
      hookBus.on('tool-failure', async () => {
        order.push('tool-failure');
      });

      registry.registerTool(
        buildTool({
          name: 'failing_tool',
          description: 'Tool that fails',
          inputSchema: z.object({}),
          call: async () => {
            throw new Error('Failed');
          },
          maxResultSizeChars: 1000,
        }),
      );

      await executor.execute({
        toolUseId: 'call_001',
        toolName: 'failing_tool',
        input: {},
        sessionId: 'session-1',
        abortController: mockAbortController,
        agentId: 'agent-1',
      });

      expect(order).toEqual(['pre-tool', 'tool-failure']);
    });
  });

  describe('hook isolation', () => {
    it('tool execution continues even if pre-tool handler throws', async () => {
      hookBus.on('pre-tool', () => {
        throw new Error('Hook failed');
      });

      registry.registerTool(
        buildTool({
          name: 'resilient_tool',
          description: 'Tool that should still run',
          inputSchema: z.object({}),
          call: async () => ({ data: 'success' }),
          maxResultSizeChars: 1000,
        }),
      );

      const result = await executor.execute({
        toolUseId: 'call_001',
        toolName: 'resilient_tool',
        input: {},
        sessionId: 'session-1',
        abortController: mockAbortController,
        agentId: 'agent-1',
      });

      expect(result.event.result).toBe('success');
      expect(result.recoverable).toBe(true);
    });

    it('tool execution continues even if post-tool handler throws', async () => {
      hookBus.on('post-tool', () => {
        throw new Error('Post-hook failed');
      });

      registry.registerTool(
        buildTool({
          name: 'tool_with_bad_hook',
          description: 'Tool with failing post-hook',
          inputSchema: z.object({}),
          call: async () => ({ data: 'success' }),
          maxResultSizeChars: 1000,
        }),
      );

      const result = await executor.execute({
        toolUseId: 'call_001',
        toolName: 'tool_with_bad_hook',
        input: {},
        sessionId: 'session-1',
        abortController: mockAbortController,
        agentId: 'agent-1',
      });

      expect(result.event.result).toBe('success');
      expect(result.recoverable).toBe(true);
    });
  });

  describe('without HookBus', () => {
    beforeEach(() => {
      executor = new ToolExecutor(registry);
      // Don't set HookBus - testing behavior without hooks
    });

    it('executes tools normally when no HookBus is set', async () => {
      registry.registerTool(
        buildTool({
          name: 'no_hook_tool',
          description: 'Tool without hooks',
          inputSchema: z.object({ value: z.string() }),
          call: async ({ value }) => ({ data: `Got: ${value}` }),
          maxResultSizeChars: 1000,
        }),
      );

      const result = await executor.execute({
        toolUseId: 'call_001',
        toolName: 'no_hook_tool',
        input: { value: 'test' },
        sessionId: 'session-1',
        abortController: mockAbortController,
        agentId: 'agent-1',
      });

      expect(result.event.result).toBe('Got: test');
      expect(result.recoverable).toBe(true);
    });
  });
});
