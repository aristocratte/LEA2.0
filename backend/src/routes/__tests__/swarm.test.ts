import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sseManager } from '../../services/SSEManager.js';

const {
  startSwarmAuditMock,
  PentestOrchestratorMock,
  ProviderManagerMock,
  pentestOrchestratorConstructorMock,
  providerManagerConstructorMock,
} = vi.hoisted(() => {
  const startSwarmAuditMock = vi.fn();
  const pentestOrchestratorConstructorMock = vi.fn();
  const providerManagerConstructorMock = vi.fn();

  class PentestOrchestratorMock {
    startSwarmAudit = startSwarmAuditMock;

    constructor(prisma: unknown, providerManager: unknown) {
      pentestOrchestratorConstructorMock(prisma, providerManager);
    }
  }

  class ProviderManagerMock {
    constructor() {
      providerManagerConstructorMock();
    }
  }

  return {
    startSwarmAuditMock,
    PentestOrchestratorMock,
    ProviderManagerMock,
    pentestOrchestratorConstructorMock,
    providerManagerConstructorMock,
  };
});

vi.mock('../../services/PentestOrchestrator.js', () => ({
  PentestOrchestrator: PentestOrchestratorMock,
}));

vi.mock('../../services/ProviderManager.js', () => ({
  ProviderManager: ProviderManagerMock,
}));

import { swarmRoutes } from '../swarm.js';

async function buildApp(pentestRecord: unknown = { id: 'pentest-1' }) {
  const fastify = Fastify({ logger: false });
  const prisma = {
    pentest: {
      findUnique: vi.fn().mockResolvedValue(pentestRecord),
    },
  };

  fastify.decorate('prisma', prisma as any);
  await fastify.register(swarmRoutes);
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
          if (parserCompleted) {
            return;
          }

          parserCompleted = true;
          callback(error, payload);

          const rawRes = res as any;
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
          if (!parserCompleted) {
            complete(null, frame);
          }
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
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('swarmRoutes', () => {
  it('POST /api/pentests/:id/swarm/start démarre le swarm et retourne le run', async () => {
    startSwarmAuditMock.mockResolvedValue({
      swarmRunId: 'swarm-run-1',
      status: 'RUNNING',
      maxAgents: 8,
      maxConcurrentAgents: 5,
    });

    const { fastify, prisma } = await buildApp();

    try {
      const response = await request(fastify.server)
        .post('/api/pentests/pentest-1/swarm/start')
        .send({
          task: 'Run swarm against target',
          scope: ['app.example.com'],
          maxAgents: 8,
          maxConcurrentAgents: 5,
          autoPushToSysReptor: false,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: {
          swarmRunId: 'swarm-run-1',
          status: 'RUNNING',
          maxAgents: 8,
          maxConcurrentAgents: 5,
        },
      });

      expect(prisma.pentest.findUnique).toHaveBeenCalledWith({ where: { id: 'pentest-1' } });
      expect(startSwarmAuditMock).toHaveBeenCalledWith('pentest-1', 'Run swarm against target', {
        scope: ['app.example.com'],
        maxAgents: 8,
        maxConcurrentAgents: 5,
        autoPushToSysReptor: false,
      });
      expect(providerManagerConstructorMock).toHaveBeenCalledTimes(1);
      expect(pentestOrchestratorConstructorMock).toHaveBeenCalledTimes(1);
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/pentests/:id/swarm/start retourne 400 si payload invalide', async () => {
    const { fastify, prisma } = await buildApp();

    try {
      const response = await request(fastify.server)
        .post('/api/pentests/pentest-1/swarm/start')
        .send({ maxAgents: 0 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid swarm payload');
      expect(prisma.pentest.findUnique).not.toHaveBeenCalled();
      expect(startSwarmAuditMock).not.toHaveBeenCalled();
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/pentests/:id/swarm/start retourne 404 si pentest introuvable', async () => {
    const { fastify } = await buildApp(null);

    try {
      const response = await request(fastify.server)
        .post('/api/pentests/pentest-missing/swarm/start')
        .send({});

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Pentest not found' });
      expect(startSwarmAuditMock).not.toHaveBeenCalled();
    } finally {
      await fastify.close();
    }
  });

  it('GET /api/pentests/:id/swarm/stream ouvre un flux SSE et envoie swarm_connected', async () => {
    const registerSpy = vi.spyOn(sseManager, 'register');
    const { fastify } = await buildApp();

    try {
      const response = await readInitialSseFrame(
        fastify.server,
        '/api/pentests/pentest-1/swarm/stream?lastEventId=4',
        {
          Origin: 'http://localhost:3000',
          'Last-Event-ID': '9',
        }
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache, no-transform');
      expect(response.headers['connection']).toBe('keep-alive');
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');

      expect(response.frame).toContain('event: swarm_connected');
      expect(response.frame).toContain('"pentest_id":"pentest-1"');

      expect(registerSpy).toHaveBeenCalledWith(
        'pentest-1',
        expect.objectContaining({
          id: expect.any(String),
          send: expect.any(Function),
          connectedAt: expect.any(Date),
        }),
        { lastEventId: 9 }
      );
    } finally {
      await fastify.close();
    }
  });
});
