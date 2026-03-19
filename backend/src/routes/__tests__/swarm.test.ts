import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sseManager } from '../../services/SSEManager.js';

const {
  startSwarmAuditMock,
  getSwarmRunMock,
  getSwarmHistoryMock,
  controlSwarmRuntimeMock,
  listSwarmTracesMock,
  getSwarmTraceMock,
  approveSwarmSensitiveToolMock,
  denySwarmSensitiveToolMock,
  renderReportMock,
  PentestOrchestratorMock,
  ProviderManagerMock,
  SysReptorServiceMock,
  pentestOrchestratorConstructorMock,
  providerManagerConstructorMock,
  sysReptorServiceConstructorMock,
} = vi.hoisted(() => {
  const startSwarmAuditMock = vi.fn();
  const getSwarmRunMock = vi.fn();
  const getSwarmHistoryMock = vi.fn();
  const controlSwarmRuntimeMock = vi.fn();
  const listSwarmTracesMock = vi.fn();
  const getSwarmTraceMock = vi.fn();
  const approveSwarmSensitiveToolMock = vi.fn();
  const denySwarmSensitiveToolMock = vi.fn();
  const renderReportMock = vi.fn();
  const pentestOrchestratorConstructorMock = vi.fn();
  const providerManagerConstructorMock = vi.fn();
  const sysReptorServiceConstructorMock = vi.fn();

  class PentestOrchestratorMock {
    startSwarmAudit = startSwarmAuditMock;
    getSwarmRun = getSwarmRunMock;
    getSwarmHistory = getSwarmHistoryMock;
    controlSwarmRuntime = controlSwarmRuntimeMock;
    listSwarmTraces = listSwarmTracesMock;
    getSwarmTrace = getSwarmTraceMock;
    approveSwarmSensitiveTool = approveSwarmSensitiveToolMock;
    denySwarmSensitiveTool = denySwarmSensitiveToolMock;

    constructor(prisma: unknown, providerManager: unknown) {
      pentestOrchestratorConstructorMock(prisma, providerManager);
    }
  }

  class ProviderManagerMock {
    constructor() {
      providerManagerConstructorMock();
    }
  }

  class SysReptorServiceMock {
    renderReport = renderReportMock;

    constructor() {
      sysReptorServiceConstructorMock();
    }
  }

  return {
    startSwarmAuditMock,
    getSwarmRunMock,
    getSwarmHistoryMock,
    controlSwarmRuntimeMock,
    listSwarmTracesMock,
    getSwarmTraceMock,
    approveSwarmSensitiveToolMock,
    denySwarmSensitiveToolMock,
    renderReportMock,
    PentestOrchestratorMock,
    ProviderManagerMock,
    SysReptorServiceMock,
    pentestOrchestratorConstructorMock,
    providerManagerConstructorMock,
    sysReptorServiceConstructorMock,
  };
});

vi.mock('../../services/PentestOrchestrator.js', () => ({
  PentestOrchestrator: PentestOrchestratorMock,
}));

vi.mock('../../services/ProviderManager.js', () => ({
  ProviderManager: ProviderManagerMock,
  providerManager: {},
}));

vi.mock('../../services/SysReptorService.js', () => ({
  SysReptorService: SysReptorServiceMock,
}));

import { swarmRoutes } from '../swarm.js';

async function buildApp(
  pentestRecord: unknown = { id: 'pentest-1' },
  swarmEvents: Array<{ event_data: unknown }> = [],
  prismaOverrides: Record<string, unknown> = {}
) {
  const fastify = Fastify({ logger: false });
  const prisma = {
    pentest: {
      findUnique: vi.fn().mockResolvedValue(pentestRecord),
    },
    pentestEvent: {
      findMany: vi.fn().mockResolvedValue(swarmEvents),
    },
    ...prismaOverrides,
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

  it('POST /api/pentests/:id/swarm/start forward runtime modes to the orchestrator', async () => {
    startSwarmAuditMock.mockResolvedValue({
      swarmRunId: 'swarm-run-scenario',
      status: 'RUNNING',
      maxAgents: 4,
      maxConcurrentAgents: 2,
    });

    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .post('/api/pentests/pentest-1/swarm/start')
        .send({
          task: 'Scenario driven run',
          runtime: {
            mode: 'scenario',
            scenarioId: 'multi-agent-approval',
            speed: 5,
            capture: true,
          },
        });

      expect(response.status).toBe(200);
      expect(startSwarmAuditMock).toHaveBeenCalledWith('pentest-1', 'Scenario driven run', {
        scope: undefined,
        maxAgents: undefined,
        maxConcurrentAgents: undefined,
        autoPushToSysReptor: undefined,
        runtime: {
          mode: 'scenario',
          scenarioId: 'multi-agent-approval',
          speed: 5,
          capture: true,
        },
      });
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/pentests/:id/swarm/start returns 400 for unknown replay trace ids', async () => {
    startSwarmAuditMock.mockRejectedValue(new Error('Trace missing-trace is empty or missing'));
    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .post('/api/pentests/pentest-1/swarm/start')
        .send({
          task: 'Replay run',
          runtime: {
            mode: 'replay',
            traceId: 'missing-trace',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Trace missing-trace is empty or missing' });
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/pentests/:id/swarm/start returns 400 for unknown scenario ids', async () => {
    startSwarmAuditMock.mockRejectedValue(new Error('Unknown scenario no-such-scenario'));
    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .post('/api/pentests/pentest-1/swarm/start')
        .send({
          task: 'Scenario run',
          runtime: {
            mode: 'scenario',
            scenarioId: 'no-such-scenario',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Unknown scenario no-such-scenario' });
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

  it('POST /api/pentests/:id/swarm/tools/approve valide une approval pending', async () => {
    approveSwarmSensitiveToolMock.mockResolvedValue(true);
    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .post('/api/pentests/pentest-1/swarm/tools/approve')
        .send({ approvalId: 'approval-1' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: {
          approvalId: 'approval-1',
          decision: 'APPROVED',
        },
      });
      expect(approveSwarmSensitiveToolMock).toHaveBeenCalledWith('pentest-1', 'approval-1');
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/pentests/:id/swarm/runtime/control forwards replay controls', async () => {
    controlSwarmRuntimeMock.mockResolvedValue({ id: 'run-1', status: 'PAUSED' });
    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .post('/api/pentests/pentest-1/swarm/runtime/control')
        .send({ action: 'step' });

      expect(response.status).toBe(200);
      expect(controlSwarmRuntimeMock).toHaveBeenCalledWith('pentest-1', { action: 'step' });
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/pentests/:id/swarm/runtime/control returns 400 for invalid transitions', async () => {
    controlSwarmRuntimeMock.mockRejectedValue(new Error('Runtime live does not support control commands'));
    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .post('/api/pentests/pentest-1/swarm/runtime/control')
        .send({ action: 'step' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Runtime live does not support control commands' });
    } finally {
      await fastify.close();
    }
  });

  it('GET /api/pentests/:id/swarm/traces returns trace metadata', async () => {
    listSwarmTracesMock.mockResolvedValue([{ traceId: 'trace-1', status: 'completed' }]);
    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .get('/api/pentests/pentest-1/swarm/traces');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [{ traceId: 'trace-1', status: 'completed' }] });
      expect(listSwarmTracesMock).toHaveBeenCalledWith('pentest-1');
    } finally {
      await fastify.close();
    }
  });

  it('GET /api/swarm/traces/:traceId returns 404 for unknown traces', async () => {
    getSwarmTraceMock.mockResolvedValue(null);
    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .get('/api/swarm/traces/missing-trace');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Trace not found' });
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/pentests/:id/swarm/tools/deny refuse une approval pending', async () => {
    denySwarmSensitiveToolMock.mockResolvedValue(true);
    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .post('/api/pentests/pentest-1/swarm/tools/deny')
        .send({ approvalId: 'approval-2', reason: 'Denied by operator' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: {
          approvalId: 'approval-2',
          decision: 'DENIED',
          reason: 'Denied by operator',
        },
      });
      expect(denySwarmSensitiveToolMock).toHaveBeenCalledWith(
        'pentest-1',
        'approval-2',
        'Denied by operator'
      );
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/pentests/:id/swarm/tools/approve retourne 404 si approval inconnue', async () => {
    approveSwarmSensitiveToolMock.mockRejectedValue(new Error('Tool approval request not found'));
    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .post('/api/pentests/pentest-1/swarm/tools/approve')
        .send({ approvalId: 'missing' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Tool approval request not found' });
    } finally {
      await fastify.close();
    }
  });

  it('GET /api/pentests/:id/swarm/report.pdf télécharge le PDF SysReptor', async () => {
    const pdfPayload = Buffer.from('%PDF-1.4 mocked swarm report');
    renderReportMock.mockResolvedValue({
      contentType: 'application/pdf',
      data: pdfPayload,
      mock: false,
    });

    const { fastify, prisma } = await buildApp(
      { id: 'pentest-1' },
      [{ event_data: { sysReptorProjectId: 'project-42' } }]
    );

    try {
      const response = await request(fastify.server)
        .get('/api/pentests/pentest-1/swarm/report.pdf')
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          res.on('end', () => callback(null, Buffer.concat(chunks)));
          res.on('error', (error) => callback(error as Error, null));
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('swarm-report-pentest-1.pdf');
      expect(Buffer.isBuffer(response.body)).toBe(true);
      expect((response.body as Buffer).equals(pdfPayload)).toBe(true);

      expect(prisma.pentestEvent.findMany).toHaveBeenCalledWith({
        where: { pentest_id: 'pentest-1', event_type: 'swarm_run_completed' },
        orderBy: { sequence: 'desc' },
        take: 20,
        select: { event_data: true },
      });
      expect(sysReptorServiceConstructorMock).toHaveBeenCalledTimes(1);
      expect(renderReportMock).toHaveBeenCalledWith('project-42');
    } finally {
      await fastify.close();
    }
  });

  it('GET /api/pentests/:id/swarm/report.pdf retourne 404 sans projet SysReptor', async () => {
    const { fastify } = await buildApp(
      { id: 'pentest-1' },
      [{ event_data: { sysReptorProjectId: '' } }]
    );

    try {
      const response = await request(fastify.server).get('/api/pentests/pentest-1/swarm/report.pdf');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: 'No SysReptor project linked for this pentest',
      });
      expect(renderReportMock).not.toHaveBeenCalled();
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
        { lastEventId: '9' }
      );
    } finally {
      await fastify.close();
    }
  });

  it('GET /api/pentests/:id/swarm/history preserves findings when DB runs and in-memory snapshots overlap', async () => {
    const startedAt = new Date('2026-03-18T10:00:00.000Z');
    const completedAt = new Date('2026-03-18T10:12:00.000Z');
    const historyFinding = {
      id: 'finding-history-1',
      pentestId: 'pentest-1',
      swarmRunId: 'swarm-run-history-1',
      agentId: 'agent-1',
      title: 'Stored swarm finding',
      description: 'Recovered from the in-memory snapshot',
      severity: 'high' as const,
      cvss: 8.1,
      proof: 'proof',
      remediation: 'patch',
      affected_components: ['api.example.com'],
      pushed: false,
      createdAt: startedAt.toISOString(),
      updatedAt: completedAt.toISOString(),
    };

    const { fastify, prisma } = await buildApp(
      { id: 'pentest-1', target: 'api.example.com' },
      [],
      {
        swarmRun: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'swarm-run-history-1',
              pentestId: 'pentest-1',
              status: 'COMPLETED',
              target: 'api.example.com',
              maxAgents: 6,
              maxConcurrent: 3,
              sysReptorProjectId: null,
              startedAt,
              completedAt,
              createdAt: startedAt,
              agents: [
                {
                  id: 'agent-1',
                  swarmRunId: 'swarm-run-history-1',
                  name: 'Recon Alpha',
                  role: 'Recon',
                  status: 'DONE',
                  progress: 100,
                  lastMessage: 'done',
                  spawnedAt: startedAt,
                  completedAt,
                },
              ],
            },
          ]),
        },
      },
    );

    getSwarmHistoryMock.mockImplementation(async (pentestId: string) => {
      const { PentestSwarm, createSwarmState } = await import('../../agents/PentestSwarm.js');
      const state = createSwarmState();
      state.historyByPentestId.set(pentestId, [
        {
          id: 'swarm-run-history-1',
          pentestId,
          target: 'api.example.com',
          task: 'Enumerate the attack surface',
          status: 'COMPLETED',
          maxAgents: 6,
          maxConcurrentAgents: 3,
          forceMerged: false,
          sysReptorProjectId: undefined,
          agents: [
            {
              id: 'agent-1',
              swarmRunId: 'swarm-run-history-1',
              name: 'Recon Alpha',
              role: 'Recon',
              status: 'DONE',
              progress: 100,
              lastMessage: 'done',
              createdAt: startedAt.toISOString(),
              updatedAt: completedAt.toISOString(),
            },
          ],
          findings: [historyFinding],
          tasks: [],
          startedAt: startedAt.toISOString(),
          endedAt: completedAt.toISOString(),
        },
      ]);

      const swarm = new PentestSwarm(prisma as any, {} as any, undefined, undefined, undefined, state);
      return swarm.getHistory(pentestId);
    });

    try {
      const response = await request(fastify.server).get('/api/pentests/pentest-1/swarm/history');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([
        expect.objectContaining({
          id: 'swarm-run-history-1',
          task: 'Enumerate the attack surface',
          findings: [
            expect.objectContaining({
              id: 'finding-history-1',
              title: 'Stored swarm finding',
              severity: 'high',
            }),
          ],
        }),
      ]);
      expect((prisma as any).swarmRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { pentestId: 'pentest-1' },
          include: { agents: true },
        }),
      );
    } finally {
      await fastify.close();
    }
  });
});
