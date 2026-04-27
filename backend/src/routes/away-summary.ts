/**
 * @module routes/away-summary
 * @description Away Summary API — "while you were away" session recap.
 */

import type { FastifyInstance } from 'fastify';
import { AwaySummaryGenerator } from '../core/memory/AwaySummaryGenerator.js';

export async function awaySummaryRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/pentests/:pentestId/away-summary
   *
   * Query params:
   *   - since: ISO timestamp of last visit (optional, defaults to 1h ago)
   */
  fastify.get('/api/pentests/:pentestId/away-summary', async (request) => {
    const { pentestId } = request.params as { pentestId: string };
    const query = request.query as { since?: string };

    const orchestrator = (fastify as any).swarmOrchestrator;
    const memoryExtractor = (fastify as any).memoryExtractor;

    if (!orchestrator || !memoryExtractor) {
      return { data: { hasActivity: false, headline: 'Summary unavailable', highlights: [], stats: { agentsActive: 0, agentsCompleted: 0, findingsNew: 0, memoriesExtracted: 0, tasksCompleted: 0, errorsCount: 0 }, period: { since: new Date().toISOString(), until: new Date().toISOString() } } };
    }

    // Resolve getSwarmHistory / getSwarmRun from PentestOrchestrator (via swarm route pattern)
    const pentestOrchestrator = (fastify as any).pentestOrchestrator;
    const getSwarmHistory = pentestOrchestrator
      ? (id: string) => pentestOrchestrator.getSwarmHistory(id)
      : async () => [];
    const getSwarmRun = pentestOrchestrator
      ? (id: string) => pentestOrchestrator.getSwarmRun(id)
      : async () => null;

    const generator = new AwaySummaryGenerator({
      prisma: fastify.prisma,
      getSwarmHistory,
      getSwarmRun,
      listMemories: (projectKey, options) => memoryExtractor.listByProject(projectKey, options),
    });

    // Validate `since` if provided
    let sinceIso: string | undefined;
    if (query.since) {
      const parsed = new Date(query.since);
      if (isNaN(parsed.getTime()) || parsed.getTime() > Date.now()) {
        return { data: null, error: 'Invalid `since` timestamp' };
      }
      sinceIso = parsed.toISOString();
    }

    const summary = await generator.generate(pentestId, sinceIso);
    return { data: summary };
  });
}
