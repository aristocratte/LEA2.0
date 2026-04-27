/**
 * @module routes/memories
 * @description Extracted Memories API — query cross-session stable facts.
 */

import type { FastifyInstance } from 'fastify';

export async function memoriesRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/memories
   * List extracted memories, filterable by project, type, date.
   */
  fastify.get('/api/memories', async (request) => {
    const query = request.query as {
      projectKey?: string;
      types?: string;
      limit?: string;
      since?: string;
    };

    if (!query.projectKey) {
      return { data: [] };
    }

    const memoryExtractor = (fastify as any).memoryExtractor;
    if (!memoryExtractor) {
      return { data: [] };
    }

    const options: { types?: string[]; limit?: number; since?: Date } = {};

    if (query.types) {
      options.types = query.types.split(',').map(t => t.trim());
    }
    if (query.limit) {
      const parsed = parseInt(query.limit, 10);
      if (!isNaN(parsed) && parsed > 0) options.limit = parsed;
    }
    if (query.since) {
      const d = new Date(query.since);
      if (!isNaN(d.getTime())) options.since = d;
    }

    const memories = await memoryExtractor.listByProject(query.projectKey, options);
    return { data: memories };
  });
}
