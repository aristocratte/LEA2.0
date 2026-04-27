/**
 * @module Tests for sessionId propagation through the LLM call pipeline.
 *
 * These tests explicitly verify the bug fix: sessionId must flow from
 * AgentRunnerAdapter through ModelCallParams to CostTracker, NOT be
 * hardcoded as 'default'.
 */

import { describe, it, expect } from 'vitest';
import { createCallModel } from '../../runtime/LLMExecutor.js';
import type { ModelCallParams, StreamEvent } from '../../types/session-types.js';
import type { AIClient } from '../../../services/ai/AIClient.js';
import { CostTracker } from '../../analytics/CostTracker.js';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Create a fake AIClient that yields a usage event + text + stop.
 */
function createFakeClient(usage: { inputTokens: number; outputTokens: number }): AIClient {
  return {
    streamChat: async (params: any) => {
      // Fire usage event
      params.onEvent({ type: 'usage', inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
      // Fire text content
      params.onEvent({ type: 'text_delta', text: 'Hello' });
      return {
        stopReason: 'end_turn',
        model: 'test-model',
        usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
      };
    },
  } as unknown as AIClient;
}

/**
 * Collect all events from an AsyncGenerator into an array.
 */
async function collectEvents(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

// ============================================================================
// TESTS
// ============================================================================

describe('sessionId propagation through LLM pipeline', () => {
  it('tracks usage with the sessionId from ModelCallParams', async () => {
    const costTracker = new CostTracker();

    // Create callModel that uses CostTracker (same pattern as index.ts)
    const rawCallModel = createCallModel(() => createFakeClient({ inputTokens: 1000, outputTokens: 500 }));

    const callModel = async function* (params: ModelCallParams): AsyncGenerator<StreamEvent> {
      const sessionId = params.sessionId ?? 'global';
      for await (const event of rawCallModel(params)) {
        if (event.type === 'usage') {
          costTracker.track(sessionId, event.model, event.inputTokens, event.outputTokens);
        }
        yield event;
      }
    };

    // Call with a real sessionId (simulating agent: run-abc-agent-0)
    await collectEvents(callModel({
      model: 'test-model',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      systemPrompt: '',
      sessionId: 'run-abc-agent-0',
    }));

    // Verify tracking used the real sessionId
    const stats = costTracker.getSessionStats('run-abc-agent-0');
    expect(stats.callCount).toBe(1);
    expect(stats.totalInputTokens).toBe(1000);
    expect(stats.totalOutputTokens).toBe(500);
  });

  it('does NOT aggregate all calls under a single session', async () => {
    const costTracker = new CostTracker();
    const rawCallModel = createCallModel(() => createFakeClient({ inputTokens: 500, outputTokens: 200 }));

    const callModel = async function* (params: ModelCallParams): AsyncGenerator<StreamEvent> {
      const sessionId = params.sessionId ?? 'global';
      for await (const event of rawCallModel(params)) {
        if (event.type === 'usage') {
          costTracker.track(sessionId, event.model, event.inputTokens, event.outputTokens);
        }
        yield event;
      }
    };

    // Session 1: agent alpha
    await collectEvents(callModel({
      model: 'test-model',
      messages: [{ role: 'user', content: 'scan target' }],
      tools: [],
      systemPrompt: '',
      sessionId: 'run-xyz-agent-alpha',
    }));

    // Session 2: agent beta
    await collectEvents(callModel({
      model: 'test-model',
      messages: [{ role: 'user', content: 'exploit' }],
      tools: [],
      systemPrompt: '',
      sessionId: 'run-xyz-agent-beta',
    }));

    // Verify isolation
    const alpha = costTracker.getSessionStats('run-xyz-agent-alpha');
    const beta = costTracker.getSessionStats('run-xyz-agent-beta');
    expect(alpha.callCount).toBe(1);
    expect(beta.callCount).toBe(1);
    expect(alpha.totalInputTokens).toBe(500);
    expect(beta.totalInputTokens).toBe(500);

    // Verify no 'default' or 'global' session was created
    const global = costTracker.getSessionStats('default');
    const globalFallback = costTracker.getSessionStats('global');
    expect(global.callCount).toBe(0);
    expect(globalFallback.callCount).toBe(0);
  });

  it('falls back to "global" when sessionId is not provided', async () => {
    const costTracker = new CostTracker();
    const rawCallModel = createCallModel(() => createFakeClient({ inputTokens: 300, outputTokens: 100 }));

    const callModel = async function* (params: ModelCallParams): AsyncGenerator<StreamEvent> {
      const sessionId = params.sessionId ?? 'global';
      for await (const event of rawCallModel(params)) {
        if (event.type === 'usage') {
          costTracker.track(sessionId, event.model, event.inputTokens, event.outputTokens);
        }
        yield event;
      }
    };

    // Call without sessionId
    await collectEvents(callModel({
      model: 'test-model',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      systemPrompt: '',
    }));

    const globalStats = costTracker.getSessionStats('global');
    expect(globalStats.callCount).toBe(1);
    expect(globalStats.totalInputTokens).toBe(300);
  });

  it('global stats aggregate across all sessions', async () => {
    const costTracker = new CostTracker();
    const rawCallModel = createCallModel(() => createFakeClient({ inputTokens: 1000, outputTokens: 500 }));

    const callModel = async function* (params: ModelCallParams): AsyncGenerator<StreamEvent> {
      const sessionId = params.sessionId ?? 'global';
      for await (const event of rawCallModel(params)) {
        if (event.type === 'usage') {
          costTracker.track(sessionId, event.model, event.inputTokens, event.outputTokens);
        }
        yield event;
      }
    };

    // Two sessions
    await collectEvents(callModel({
      model: 'test-model',
      messages: [{ role: 'user', content: 'a' }],
      tools: [],
      systemPrompt: '',
      sessionId: 'run-1-agent-0',
    }));

    await collectEvents(callModel({
      model: 'test-model',
      messages: [{ role: 'user', content: 'b' }],
      tools: [],
      systemPrompt: '',
      sessionId: 'run-2-agent-0',
    }));

    const global = costTracker.getGlobalStats();
    expect(global.totalCalls).toBe(2);
    expect(global.sessionCount).toBe(2);
    expect(global.totalInputTokens).toBe(2000);
    expect(global.totalOutputTokens).toBe(1000);
  });

  it('SessionStats.buildSnapshotAsync returns correct data per session', async () => {
    const { SessionStats } = await import('../../analytics/SessionStats.js');
    const costTracker = new CostTracker();
    const sessionStats = new SessionStats(costTracker);

    // Track two sessions
    costTracker.track('run-alpha-agent-0', 'claude-sonnet-4-6', 5000, 2000);
    costTracker.track('run-beta-agent-1', 'glm-4', 3000, 1000);

    const alphaSnapshot = await sessionStats.buildSnapshotAsync('run-alpha-agent-0');
    const betaSnapshot = await sessionStats.buildSnapshotAsync('run-beta-agent-1');

    // Alpha: only its own calls
    expect(alphaSnapshot.llm.callCount).toBe(1);
    expect(alphaSnapshot.llm.inputTokens).toBe(5000);
    expect(alphaSnapshot.llm.outputTokens).toBe(2000);
    expect(alphaSnapshot.llm.totalTokens).toBe(7000);
    expect(alphaSnapshot.llm.models).toContain('claude-sonnet-4-6');
    expect(alphaSnapshot.llm.models).not.toContain('glm-4');

    // Beta: only its own calls
    expect(betaSnapshot.llm.callCount).toBe(1);
    expect(betaSnapshot.llm.inputTokens).toBe(3000);
    expect(betaSnapshot.llm.outputTokens).toBe(1000);
    expect(betaSnapshot.llm.totalTokens).toBe(4000);
    expect(betaSnapshot.llm.models).toContain('glm-4');
    expect(betaSnapshot.llm.models).not.toContain('claude-sonnet-4-6');
  });

  it('no session is tracked under "default" string', async () => {
    const costTracker = new CostTracker();
    const rawCallModel = createCallModel(() => createFakeClient({ inputTokens: 500, outputTokens: 200 }));

    const callModel = async function* (params: ModelCallParams): AsyncGenerator<StreamEvent> {
      const sessionId = params.sessionId ?? 'global';
      for await (const event of rawCallModel(params)) {
        if (event.type === 'usage') {
          costTracker.track(sessionId, event.model, event.inputTokens, event.outputTokens);
        }
        yield event;
      }
    };

    // Call with real sessionId
    await collectEvents(callModel({
      model: 'test-model',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      systemPrompt: '',
      sessionId: 'run-real-agent-0',
    }));

    // Call without sessionId (should go to 'global', not 'default')
    await collectEvents(callModel({
      model: 'test-model',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      systemPrompt: '',
    }));

    // Verify 'default' session has zero calls
    const defaultSession = costTracker.getSessionStats('default');
    expect(defaultSession.callCount).toBe(0);
  });
});
