import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { sseManager } from '../../services/SSEManager.js';
import { streamRoutes } from '../stream.js';

async function buildApp(prismaOverrides: Record<string, unknown> = {}) {
  const fastify = Fastify({ logger: false });
  const prisma = {
    pentestEvent: {
      findMany: async () => [],
      findFirst: async () => null,
    },
    ...prismaOverrides,
  };
  fastify.decorate('prisma', prisma as never);
  await fastify.register(streamRoutes);
  await fastify.ready();
  return { fastify, prisma };
}

async function readInitialSseFrame(server: Parameters<typeof request>[0], path: string, headers?: Record<string, string>) {
  return new Promise<{ status: number; headers: Record<string, string>; frame: string }>((resolve, reject) => {
    let parserCompleted = false;
    let frame = '';

    const req = request(server)
      .get(path)
      .buffer(false)
      .parse((res, callback) => {
        res.setEncoding('utf8');

        const complete = (error: Error | null, payload: string) => {
          if (parserCompleted) return;
          parserCompleted = true;
          callback(error, payload);

          const rawRes = res as unknown as { destroyed?: boolean; destroy?: () => void };
          if (!rawRes.destroyed && typeof rawRes.destroy === 'function') {
            rawRes.destroy();
          }
        };

        res.on('data', (chunk: string) => {
          frame += chunk;
          if (frame.includes('\n\n')) {
            complete(null, frame);
          }
        });

        res.on('end', () => {
          if (!parserCompleted) complete(null, frame);
        });

        res.on('error', (error) => {
          if (!parserCompleted) {
            parserCompleted = true;
            callback(error as Error, frame);
          }
        });
      });

    if (headers) {
      Object.entries(headers).forEach(([key, value]) => {
        req.set(key, value);
      });
    }

    req.end((error, response) => {
      if (error && (error as NodeJS.ErrnoException).code !== 'ECONNRESET') {
        reject(error);
        return;
      }

      resolve({
        status: response?.status ?? 0,
        headers: (response?.headers as Record<string, string>) || {},
        frame: (typeof response?.body === 'string' ? response.body : frame) || '',
      });
    });
  });
}

afterEach(() => {
  for (const pentestId of sseManager.getActivePentests()) {
    sseManager.disconnectAll(pentestId);
  }
});

describe('streamRoutes', () => {
  it('replays durable PentestEvent rows before the connected envelope', async () => {
    const { fastify, prisma } = await buildApp({
      pentestEvent: {
        findMany: async () => [
          {
            id: 'db-event-2',
            pentest_id: 'pentest-1',
            event_type: 'status_change',
            event_data: {
              runId: 'pentest-1',
              source: 'system',
              audience: 'internal',
              surfaceHint: 'activity',
              eventType: 'status_change',
              payload: { type: 'status_change', status: 'RUNNING' },
            },
            sequence: 2,
            created_at: new Date('2026-04-27T12:00:00.000Z'),
          },
        ],
        findFirst: async () => ({ sequence: 2 }),
      },
    });

    try {
      const response = await readInitialSseFrame(
        fastify.server,
        '/api/pentests/pentest-1/stream?sinceSeq=1'
      );

      expect(response.status).toBe(200);
      expect(String(response.headers['content-type'])).toContain('text/event-stream');
      expect(response.frame).toContain('id: evt-2-');
      expect(response.frame).toContain('event: status_change');
      expect(response.frame).toContain('"sequence":2');
      expect(prisma.pentestEvent.findMany).toBeDefined();
    } finally {
      await fastify.close();
    }
  });

  it('sets credentials CORS headers only for allowed origins', async () => {
    const { fastify } = await buildApp();

    try {
      const response = await readInitialSseFrame(
        fastify.server,
        '/api/pentests/pentest-1/stream',
        { Origin: 'http://localhost:3000' }
      );

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers.vary).toContain('Origin');
    } finally {
      await fastify.close();
    }
  });

  it('rejects disallowed browser origins before opening the stream', async () => {
    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .get('/api/pentests/pentest-1/stream')
        .set('Origin', 'http://evil.test');

      expect(response.status).toBe(403);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.body).toEqual({ error: 'Origin not allowed' });
    } finally {
      await fastify.close();
    }
  });

  it('opens streams without permissive CORS headers when Origin is absent', async () => {
    const { fastify } = await buildApp();

    try {
      const response = await readInitialSseFrame(
        fastify.server,
        '/api/pentests/pentest-1/stream'
      );

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.frame).toContain('event: connected');
    } finally {
      await fastify.close();
    }
  });
});
