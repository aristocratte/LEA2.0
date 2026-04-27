/**
 * @module routes/stats
 * @description Stats API — cost tracking and session statistics.
 */

import type { FastifyInstance } from 'fastify';

export async function statsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/stats/global
   * Global usage stats across all sessions.
   */
  fastify.get('/api/stats/global', async (_request, reply) => {
    const costTracker = fastify.costTracker;
    if (!costTracker) {
      return reply.code(503).send({ error: 'Cost tracker not available' });
    }

    const global = costTracker.getGlobalStats();
    return {
      data: {
        totalInputTokens: global.totalInputTokens,
        totalOutputTokens: global.totalOutputTokens,
        totalCostUsd: global.totalCostUsd,
        totalCalls: global.totalCalls,
        sessionCount: global.sessionCount,
        activeModels: global.activeModels,
      },
    };
  });

  /**
   * GET /api/stats/session/:sessionId
   * Per-session usage stats.
   */
  fastify.get('/api/stats/session/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const costTracker = fastify.costTracker;
    const sessionStats = fastify.sessionStats;

    if (!costTracker || !sessionStats) {
      return reply.code(503).send({ error: 'Stats services not available' });
    }

    const swarmOrchestrator = (fastify as any).swarmOrchestrator;
    const runtimeTaskManager = (fastify as any).runtimeTaskManager;
    const permissionRequestStore = fastify.permissionRequestStore;

    const snapshot = await sessionStats.buildSnapshotAsync(sessionId, {
      swarmOrchestrator: swarmOrchestrator ?? undefined,
      taskManager: runtimeTaskManager ?? undefined,
      permissionRequestStore: permissionRequestStore ?? undefined,
    });

    return { data: snapshot };
  });
}
