import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { memoriesRoutes } from '../memories.js';

describe('memories routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    (app as any).memoryExtractor = {
      listByProject: vi.fn(async (_projectKey: string, _options?: any) => []),
    };

    await app.register(memoriesRoutes);
  });

  describe('GET /api/memories', () => {
    it('returns empty array when no projectKey', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/memories',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual([]);
    });

    it('returns empty array when memoryExtractor not available', async () => {
      delete (app as any).memoryExtractor;

      const response = await app.inject({
        method: 'GET',
        url: '/api/memories?projectKey=pt-1',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual([]);
    });

    it('passes projectKey to listByProject', async () => {
      const mockMemories = [
        { id: 'm1', type: 'TARGET_FACT', title: 'Port 22 open' },
      ];
      (app as any).memoryExtractor.listByProject.mockResolvedValue(mockMemories);

      const response = await app.inject({
        method: 'GET',
        url: '/api/memories?projectKey=pt-1',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual(mockMemories);
      expect((app as any).memoryExtractor.listByProject).toHaveBeenCalledWith(
        'pt-1',
        expect.any(Object),
      );
    });

    it('parses types filter as comma-separated array', async () => {
      (app as any).memoryExtractor.listByProject.mockResolvedValue([]);

      await app.inject({
        method: 'GET',
        url: '/api/memories?projectKey=pt-1&types=TARGET_FACT,FINDING',
      });

      const callArgs = (app as any).memoryExtractor.listByProject.mock.calls[0];
      expect(callArgs[1].types).toEqual(['TARGET_FACT', 'FINDING']);
    });

    it('parses limit filter as integer', async () => {
      (app as any).memoryExtractor.listByProject.mockResolvedValue([]);

      await app.inject({
        method: 'GET',
        url: '/api/memories?projectKey=pt-1&limit=10',
      });

      const callArgs = (app as any).memoryExtractor.listByProject.mock.calls[0];
      expect(callArgs[1].limit).toBe(10);
    });

    it('parses since filter as Date', async () => {
      (app as any).memoryExtractor.listByProject.mockResolvedValue([]);

      await app.inject({
        method: 'GET',
        url: '/api/memories?projectKey=pt-1&since=2026-01-01T00:00:00Z',
      });

      const callArgs = (app as any).memoryExtractor.listByProject.mock.calls[0];
      expect(callArgs[1].since).toEqual(new Date('2026-01-01T00:00:00Z'));
    });

    it('ignores invalid limit and since values', async () => {
      (app as any).memoryExtractor.listByProject.mockResolvedValue([]);

      await app.inject({
        method: 'GET',
        url: '/api/memories?projectKey=pt-1&limit=abc&since=not-a-date',
      });

      const callArgs = (app as any).memoryExtractor.listByProject.mock.calls[0];
      expect(callArgs[1].limit).toBeUndefined();
      expect(callArgs[1].since).toBeUndefined();
    });
  });
});
