/**
 * @module core/hooks/tests
 * @description Unit and integration tests for HookBus
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HookBus } from '../HookBus.js';
import type {
  HookEventName,
  PreToolPayload,
  PostToolPayload,
  ToolFailurePayload,
  AgentIdlePayload,
  AgentCompletedPayload,
} from '../types.js';

describe('HookBus', () => {
  let bus: HookBus;

  beforeEach(() => {
    bus = new HookBus();
  });

  describe('on/off', () => {
    it('registers and removes a handler', () => {
      const handler = vi.fn();
      const unsub = bus.on('pre-tool', handler);

      expect(bus.listenerCount('pre-tool')).toBe(1);

      unsub();

      expect(bus.listenerCount('pre-tool')).toBe(0);
    });

    it('allows multiple handlers for the same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      bus.on('pre-tool', handler1);
      bus.on('pre-tool', handler2);
      bus.on('pre-tool', handler3);

      expect(bus.listenerCount('pre-tool')).toBe(3);
    });

    it('prevents duplicate registration of the same handler reference', () => {
      const handler = vi.fn();

      bus.on('pre-tool', handler);
      bus.on('pre-tool', handler); // Duplicate - should be ignored

      expect(bus.listenerCount('pre-tool')).toBe(1);
    });

    it('returns unsubscribe function that removes the specific handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      const unsub1 = bus.on('pre-tool', handler1);
      const unsub2 = bus.on('pre-tool', handler2);
      bus.on('pre-tool', handler3);

      expect(bus.listenerCount('pre-tool')).toBe(3);

      unsub2();

      expect(bus.listenerCount('pre-tool')).toBe(2);
    });

    it('handles off() for non-existent handler gracefully', () => {
      const handler = vi.fn();

      expect(() => bus.off('pre-tool', handler)).not.toThrow();
      expect(bus.listenerCount('pre-tool')).toBe(0);
    });

    it('handles off() for handler registered for different event', () => {
      const handler = vi.fn();

      bus.on('pre-tool', handler);
      bus.off('post-tool', handler);

      expect(bus.listenerCount('pre-tool')).toBe(1);
      expect(bus.listenerCount('post-tool')).toBe(0);
    });
  });

  describe('emit', () => {
    it('invokes all registered handlers for an event', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      bus.on('pre-tool', handler1);
      bus.on('pre-tool', handler2);
      bus.on('pre-tool', handler3);

      const payload: PreToolPayload = {
        sessionId: 'session-1',
        agentId: 'agent-1',
        toolName: 'test_tool',
        input: { foo: 'bar' },
        timestamp: new Date().toISOString(),
      };

      await bus.emit('pre-tool', payload);

      expect(handler1).toHaveBeenCalledWith(payload);
      expect(handler2).toHaveBeenCalledWith(payload);
      expect(handler3).toHaveBeenCalledWith(payload);
    });

    it('invokes handlers in registration order', async () => {
      const order: number[] = [];
      const handler1 = vi.fn(() => { order.push(1); });
      const handler2 = vi.fn(() => { order.push(2); });
      const handler3 = vi.fn(() => { order.push(3); });

      bus.on('pre-tool', handler1);
      bus.on('pre-tool', handler2);
      bus.on('pre-tool', handler3);

      const payload: PreToolPayload = {
        sessionId: 'session-1',
        agentId: 'agent-1',
        toolName: 'test_tool',
        input: {},
        timestamp: new Date().toISOString(),
      };

      await bus.emit('pre-tool', payload);

      expect(order).toEqual([1, 2, 3]);
    });

    it('does nothing when no handlers are registered', async () => {
      const payload: PreToolPayload = {
        sessionId: 'session-1',
        agentId: 'agent-1',
        toolName: 'test_tool',
        input: {},
        timestamp: new Date().toISOString(),
      };

      await expect(bus.emit('pre-tool', payload)).resolves.toBeUndefined();
    });

    it('supports async handlers', async () => {
      const handler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      bus.on('pre-tool', handler);

      const payload: PreToolPayload = {
        sessionId: 'session-1',
        agentId: 'agent-1',
        toolName: 'test_tool',
        input: {},
        timestamp: new Date().toISOString(),
      };

      await bus.emit('pre-tool', payload);

      expect(handler).toHaveBeenCalled();
    });

    it('runs all handlers concurrently', async () => {
      vi.useFakeTimers();
      const started: string[] = [];
      const completed: string[] = [];
      const handler1 = vi.fn(async () => {
        started.push('handler1');
        await new Promise((resolve) => setTimeout(resolve, 20));
        completed.push('handler1');
      });
      const handler2 = vi.fn(async () => {
        started.push('handler2');
        await new Promise((resolve) => setTimeout(resolve, 10));
        completed.push('handler2');
      });

      bus.on('pre-tool', handler1);
      bus.on('pre-tool', handler2);

      const payload: PreToolPayload = {
        sessionId: 'session-1',
        agentId: 'agent-1',
        toolName: 'test_tool',
        input: {},
        timestamp: new Date().toISOString(),
      };

      try {
        const emitPromise = bus.emit('pre-tool', payload);
        await vi.advanceTimersByTimeAsync(10);

        expect(started).toEqual(['handler1', 'handler2']);
        expect(completed).toEqual(['handler2']);

        await vi.advanceTimersByTimeAsync(10);
        await emitPromise;

        expect(completed).toEqual(['handler2', 'handler1']);
      } finally {
        vi.useRealTimers();
      }
    });

    describe('error isolation', () => {
      it('continues executing other handlers when one throws', async () => {
        const handler1 = vi.fn(() => {
          throw new Error('Handler 1 failed');
        });
        const handler2 = vi.fn();
        const handler3 = vi.fn();

        bus.on('pre-tool', handler1);
        bus.on('pre-tool', handler2);
        bus.on('pre-tool', handler3);

        const payload: PreToolPayload = {
          sessionId: 'session-1',
          agentId: 'agent-1',
          toolName: 'test_tool',
          input: {},
          timestamp: new Date().toISOString(),
        };

        await bus.emit('pre-tool', payload);

        expect(handler1).toHaveBeenCalled();
        expect(handler2).toHaveBeenCalled();
        expect(handler3).toHaveBeenCalled();
      });

      it('continues executing other handlers when one rejects', async () => {
        const handler1 = vi.fn(async () => {
          throw new Error('Handler 1 rejected');
        });
        const handler2 = vi.fn();
        const handler3 = vi.fn();

        bus.on('pre-tool', handler1);
        bus.on('pre-tool', handler2);
        bus.on('pre-tool', handler3);

        const payload: PreToolPayload = {
          sessionId: 'session-1',
          agentId: 'agent-1',
          toolName: 'test_tool',
          input: {},
          timestamp: new Date().toISOString(),
        };

        await bus.emit('pre-tool', payload);

        expect(handler1).toHaveBeenCalled();
        expect(handler2).toHaveBeenCalled();
        expect(handler3).toHaveBeenCalled();
      });

      it('does not throw when all handlers fail', async () => {
        const handler1 = vi.fn(() => {
          throw new Error('Handler 1 failed');
        });
        const handler2 = vi.fn(() => {
          throw new Error('Handler 2 failed');
        });

        bus.on('pre-tool', handler1);
        bus.on('pre-tool', handler2);

        const payload: PreToolPayload = {
          sessionId: 'session-1',
          agentId: 'agent-1',
          toolName: 'test_tool',
          input: {},
          timestamp: new Date().toISOString(),
        };

        await expect(bus.emit('pre-tool', payload)).resolves.toBeUndefined();
      });

      it('logs errors from failing handlers', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const handler = vi.fn(() => {
          throw new Error('Test error');
        });

        bus.on('pre-tool', handler);

        const payload: PreToolPayload = {
          sessionId: 'session-1',
          agentId: 'agent-1',
          toolName: 'test_tool',
          input: {},
          timestamp: new Date().toISOString(),
        };

        await bus.emit('pre-tool', payload);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[HookBus] Handler threw error (isolated): Test error',
        );

        consoleErrorSpy.mockRestore();
      });
    });
  });

  describe('hasListeners', () => {
    it('returns false when no handlers are registered', () => {
      expect(bus.hasListeners('pre-tool')).toBe(false);
    });

    it('returns true when at least one handler is registered', () => {
      bus.on('pre-tool', vi.fn());
      expect(bus.hasListeners('pre-tool')).toBe(true);
    });

    it('returns false after all handlers are removed', () => {
      const handler = vi.fn();
      bus.on('pre-tool', handler);
      bus.off('pre-tool', handler);

      expect(bus.hasListeners('pre-tool')).toBe(false);
    });
  });

  describe('listenerCount', () => {
    it('returns 0 when no handlers are registered', () => {
      expect(bus.listenerCount('pre-tool')).toBe(0);
    });

    it('returns the number of registered handlers', () => {
      bus.on('pre-tool', vi.fn());
      bus.on('pre-tool', vi.fn());
      bus.on('pre-tool', vi.fn());

      expect(bus.listenerCount('pre-tool')).toBe(3);
    });

    it('returns 0 for unrelated events', () => {
      bus.on('pre-tool', vi.fn());

      expect(bus.listenerCount('post-tool')).toBe(0);
    });
  });

  describe('removeAll', () => {
    it('removes all handlers for all events', () => {
      bus.on('pre-tool', vi.fn());
      bus.on('post-tool', vi.fn());
      bus.on('tool-failure', vi.fn());

      bus.removeAll();

      expect(bus.listenerCount('pre-tool')).toBe(0);
      expect(bus.listenerCount('post-tool')).toBe(0);
      expect(bus.listenerCount('tool-failure')).toBe(0);
    });

    it('allows re-registration after removeAll', () => {
      const handler = vi.fn();

      bus.on('pre-tool', handler);
      bus.removeAll();
      bus.on('pre-tool', handler);

      expect(bus.listenerCount('pre-tool')).toBe(1);
    });
  });

  describe('type safety', () => {
    it('enforces correct payload types for each event', async () => {
      const preToolHandler = vi.fn((payload: PreToolPayload) => {
        expect(payload).toHaveProperty('sessionId');
        expect(payload).toHaveProperty('agentId');
        expect(payload).toHaveProperty('toolName');
        expect(payload).toHaveProperty('input');
        expect(payload).toHaveProperty('timestamp');
      });

      const postToolHandler = vi.fn((payload: PostToolPayload) => {
        expect(payload).toHaveProperty('sessionId');
        expect(payload).toHaveProperty('agentId');
        expect(payload).toHaveProperty('toolName');
        expect(payload).toHaveProperty('input');
        expect(payload).toHaveProperty('result');
        expect(payload).toHaveProperty('timestamp');
      });

      const toolFailureHandler = vi.fn((payload: ToolFailurePayload) => {
        expect(payload).toHaveProperty('sessionId');
        expect(payload).toHaveProperty('agentId');
        expect(payload).toHaveProperty('toolName');
        expect(payload).toHaveProperty('input');
        expect(payload).toHaveProperty('error');
        expect(payload).toHaveProperty('timestamp');
      });

      const agentIdleHandler = vi.fn((payload: AgentIdlePayload) => {
        expect(payload).toHaveProperty('agentId');
        expect(payload).toHaveProperty('swarmRunId');
        expect(payload).toHaveProperty('pentestId');
        expect(payload).toHaveProperty('timestamp');
      });

      const agentCompletedHandler = vi.fn((payload: AgentCompletedPayload) => {
        expect(payload).toHaveProperty('agentId');
        expect(payload).toHaveProperty('swarmRunId');
        expect(payload).toHaveProperty('pentestId');
        expect(payload).toHaveProperty('turnCount');
        expect(payload).toHaveProperty('timestamp');
      });

      bus.on('pre-tool', preToolHandler);
      bus.on('post-tool', postToolHandler);
      bus.on('tool-failure', toolFailureHandler);
      bus.on('agent-idle', agentIdleHandler);
      bus.on('agent-completed', agentCompletedHandler);

      await bus.emit('pre-tool', {
        sessionId: 's1',
        agentId: 'a1',
        toolName: 't1',
        input: {},
        timestamp: new Date().toISOString(),
      });

      await bus.emit('post-tool', {
        sessionId: 's1',
        agentId: 'a1',
        toolName: 't1',
        input: {},
        result: 'success',
        timestamp: new Date().toISOString(),
      });

      await bus.emit('tool-failure', {
        sessionId: 's1',
        agentId: 'a1',
        toolName: 't1',
        input: {},
        error: new Error('failed'),
        timestamp: new Date().toISOString(),
      });

      await bus.emit('agent-idle', {
        agentId: 'a1',
        swarmRunId: 'sr1',
        pentestId: 'p1',
        timestamp: new Date().toISOString(),
      });

      await bus.emit('agent-completed', {
        agentId: 'a1',
        swarmRunId: 'sr1',
        pentestId: 'p1',
        turnCount: 5,
        timestamp: new Date().toISOString(),
      });

      expect(preToolHandler).toHaveBeenCalled();
      expect(postToolHandler).toHaveBeenCalled();
      expect(toolFailureHandler).toHaveBeenCalled();
      expect(agentIdleHandler).toHaveBeenCalled();
      expect(agentCompletedHandler).toHaveBeenCalled();
    });
  });

  describe('unsubscribe during emit', () => {
    it('handles handler unsubscribing during emit', async () => {
      const handler2 = vi.fn();
      let unsub1: (() => void) | null = null;

      const handler1 = vi.fn(() => {
        if (unsub1) {
          unsub1();
        }
      });

      unsub1 = bus.on('pre-tool', handler1);
      bus.on('pre-tool', handler2);

      const payload: PreToolPayload = {
        sessionId: 'session-1',
        agentId: 'agent-1',
        toolName: 'test_tool',
        input: {},
        timestamp: new Date().toISOString(),
      };

      await bus.emit('pre-tool', payload);

      // Both handlers should have been called (snapshot taken before unsubscribe)
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });
});
