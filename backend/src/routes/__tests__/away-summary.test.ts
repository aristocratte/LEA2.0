import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { awaySummaryRoutes } from '../away-summary.js';

describe('away-summary routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();

    // Mock pentestOrchestrator
    (app as any).pentestOrchestrator = {
      getSwarmHistory: vi.fn(async () => []),
      getSwarmRun: vi.fn(async () => null),
    };

    // Mock swarmOrchestrator
    (app as any).swarmOrchestrator = {};

    // Mock memoryExtractor with real-ish data
    (app as any).memoryExtractor = {
      listByProject: vi.fn(async (_projectKey: string, _options?: any) => []),
    };

    // Decorate prisma (required by route)
    app.decorate('prisma', {} as any);

    await app.register(awaySummaryRoutes);
  });

  describe('GET /api/pentests/:pentestId/away-summary', () => {
    it('returns summary when services available', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/pentests/pt-1/away-summary',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toBeDefined();
      expect(body.data.headline).toBeDefined();
      expect(body.data.highlights).toBeInstanceOf(Array);
      expect(body.data.stats).toBeDefined();
      expect(body.data.period).toBeDefined();
    });

    it('returns degraded summary when services missing', async () => {
      delete (app as any).swarmOrchestrator;
      delete (app as any).memoryExtractor;

      const response = await app.inject({
        method: 'GET',
        url: '/api/pentests/pt-1/away-summary',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.hasActivity).toBe(false);
    });

    it('accepts optional since query param', async () => {
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min ago

      const response = await app.inject({
        method: 'GET',
        url: `/api/pentests/pt-1/away-summary?since=${encodeURIComponent(since)}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.period.since).toBe(since);
    });

    it('rejects invalid since timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/pentests/pt-1/away-summary?since=not-a-date',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toBeNull();
      expect(response.json().error).toContain('Invalid');
    });

    it('rejects future since timestamp', async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const response = await app.inject({
        method: 'GET',
        url: `/api/pentests/pt-1/away-summary?since=${encodeURIComponent(future)}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toBeNull();
      expect(response.json().error).toContain('Invalid');
    });
  });
});
