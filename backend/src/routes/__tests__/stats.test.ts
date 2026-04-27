import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { statsRoutes } from '../stats.js';
import { CostTracker } from '../../core/analytics/CostTracker.js';
import { SessionStats } from '../../core/analytics/SessionStats.js';

describe('stats routes', () => {
  let app: FastifyInstance;
  let costTracker: CostTracker;
  let sessionStats: SessionStats;

  beforeEach(async () => {
    costTracker = new CostTracker();
    sessionStats = new SessionStats(costTracker);

    app = Fastify();
    app.decorate('costTracker', costTracker);
    app.decorate('sessionStats', sessionStats);
    // SwarmOrchestrator mock (async listAgents)
    (app as any).swarmOrchestrator = {
      listAgents: async () => [],
    };
    (app as any).runtimeTaskManager = {
      listTasks: () => [],
    };
    (app as any).permissionRequestStore = {
      listPending: () => [],
    };

    await app.register(statsRoutes);
  });

  describe('GET /api/stats/global', () => {
    it('returns global stats', async () => {
      costTracker.track('s1', 'claude-sonnet-4-6', 1000, 500);

      const response = await app.inject({
        method: 'GET',
        url: '/api/stats/global',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.totalCalls).toBe(1);
      expect(body.data.totalInputTokens).toBe(1000);
      expect(body.data.totalOutputTokens).toBe(500);
      expect(body.data.totalCostUsd).toBeGreaterThan(0);
      expect(body.data.sessionCount).toBe(1);
      expect(body.data.activeModels).toContain('claude-sonnet-4-6');
    });

    it('returns empty stats when no calls tracked', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/stats/global',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.totalCalls).toBe(0);
    });
  });

  describe('GET /api/stats/session/:sessionId', () => {
    it('returns session stats', async () => {
      costTracker.track('session-abc', 'claude-sonnet-4-6', 5000, 2000);

      const response = await app.inject({
        method: 'GET',
        url: '/api/stats/session/session-abc',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.sessionId).toBe('session-abc');
      expect(body.data.llm.callCount).toBe(1);
      expect(body.data.llm.inputTokens).toBe(5000);
      expect(body.data.llm.outputTokens).toBe(2000);
      expect(body.data.llm.totalTokens).toBe(7000);
      expect(body.data.llm.costUsd).toBeGreaterThan(0);
      expect(body.data.swarm).toBeDefined();
      expect(body.data.tasks).toBeDefined();
      expect(body.data.permissions).toBeDefined();
      expect(body.data.timestamp).toBeDefined();
    });

    it('returns zero stats for unknown session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/stats/session/unknown',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.llm.callCount).toBe(0);
    });
  });
});
