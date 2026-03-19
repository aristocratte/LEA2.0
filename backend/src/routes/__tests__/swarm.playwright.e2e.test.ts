import Fastify from 'fastify';
import { request as playwrightRequest } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  runState,
  PentestOrchestratorMock,
  ProviderManagerMock,
  SysReptorServiceMock,
} = vi.hoisted(() => {
  const nowIso = () => new Date().toISOString();
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const runState: { run: any | null } = { run: null };

  const buildFinding = (swarmRunId: string, pentestId: string) => ({
    id: `finding-${swarmRunId}-1`,
    pentestId,
    swarmRunId,
    agentId: 'agent-e2e-1',
    title: 'Mock finding from E2E flow',
    description: 'Generated during resume step',
    severity: 'medium',
    cvss: 6.4,
    proof: 'mock-proof',
    remediation: 'mock-remediation',
    affected_components: ['api.example.com'],
    pushed: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  class PentestOrchestratorMock {
    constructor(private readonly prisma: any) {}

    async startSwarmAudit(
      pentestId: string,
      task: string,
      options?: { maxAgents?: number; maxConcurrentAgents?: number }
    ) {
      const pentest = await this.prisma.pentest.findUnique({ where: { id: pentestId } });
      if (!pentest) {
        throw new Error('Pentest not found');
      }

      runState.run = {
        id: 'swarm-run-e2e',
        pentestId,
        target: pentest.target,
        task,
        status: 'RUNNING',
        maxAgents: options?.maxAgents ?? 8,
        maxConcurrentAgents: options?.maxConcurrentAgents ?? 4,
        forceMerged: false,
        agents: [],
        findings: [],
        startedAt: nowIso(),
      };

      return {
        swarmRunId: runState.run.id,
        status: runState.run.status,
        maxAgents: runState.run.maxAgents,
        maxConcurrentAgents: runState.run.maxConcurrentAgents,
      };
    }

    async pauseSwarmAudit(_pentestId: string) {
      if (!runState.run) {
        throw new Error('No active swarm run for this pentest');
      }
      runState.run.status = 'PAUSED';
      return clone(runState.run);
    }

    async resumeSwarmAudit(_pentestId: string) {
      if (!runState.run) {
        throw new Error('No active swarm run for this pentest');
      }
      runState.run.status = 'RUNNING';
      if (runState.run.findings.length === 0) {
        runState.run.findings.push(buildFinding(runState.run.id, runState.run.pentestId));
      }
      return clone(runState.run);
    }

    async forceMergeSwarmAudit(_pentestId: string) {
      if (!runState.run) {
        throw new Error('No active swarm run for this pentest');
      }
      runState.run.status = 'MERGING';
      runState.run.forceMerged = true;
      return clone(runState.run);
    }

    async getSwarmRun(_pentestId: string) {
      return runState.run ? clone(runState.run) : null;
    }

    async getSwarmHistory(_pentestId: string) {
      return runState.run ? [clone(runState.run)] : [];
    }
  }

  class ProviderManagerMock {}

  class SysReptorServiceMock {
    async renderReport(_projectId: string) {
      return {
        data: Buffer.from('%PDF-1.4\n%mock swarm report\n'),
        contentType: 'application/pdf',
      };
    }
  }

  return {
    runState,
    PentestOrchestratorMock,
    ProviderManagerMock,
    SysReptorServiceMock,
  };
});

vi.mock('../../services/PentestOrchestrator.js', () => ({
  PentestOrchestrator: PentestOrchestratorMock,
}));

vi.mock('../../services/ProviderManager.js', () => ({
  ProviderManager: ProviderManagerMock,
}));

vi.mock('../../services/SysReptorService.js', () => ({
  SysReptorService: SysReptorServiceMock,
}));

import { swarmRoutes } from '../swarm.js';

afterEach(() => {
  runState.run = null;
  vi.clearAllMocks();
});

describe('swarm E2E (backend + Playwright)', () => {
  it('execute le flux start -> pause -> resume -> findings -> PDF', async () => {
    const fastify = Fastify({ logger: false });
    const prisma = {
      pentest: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'pentest-e2e',
          target: 'api.example.com',
        }),
      },
      pentestEvent: {
        findMany: vi.fn().mockResolvedValue([
          { event_data: { sysReptorProjectId: 'sysreptor-project-e2e' } },
        ]),
      },
    };

    fastify.decorate('prisma', prisma as any);
    await fastify.register(swarmRoutes);
    await fastify.ready();

    const baseUrl = await fastify.listen({ port: 0, host: '127.0.0.1' });
    const api = await playwrightRequest.newContext({ baseURL: baseUrl });

    try {
      const startResponse = await api.post('/api/pentests/pentest-e2e/swarm/start', {
        data: {
          task: 'E2E swarm flow',
          scope: ['api.example.com'],
          maxAgents: 8,
          maxConcurrentAgents: 3,
          autoPushToSysReptor: false,
        },
      });
      expect(startResponse.status()).toBe(200);
      expect(await startResponse.json()).toEqual({
        data: {
          swarmRunId: 'swarm-run-e2e',
          status: 'RUNNING',
          maxAgents: 8,
          maxConcurrentAgents: 3,
        },
      });

      const pauseResponse = await api.post('/api/pentests/pentest-e2e/swarm/pause');
      expect(pauseResponse.status()).toBe(200);
      expect((await pauseResponse.json()).data.status).toBe('PAUSED');

      const resumeResponse = await api.post('/api/pentests/pentest-e2e/swarm/resume');
      expect(resumeResponse.status()).toBe(200);
      expect((await resumeResponse.json()).data.status).toBe('RUNNING');

      const stateResponse = await api.get('/api/pentests/pentest-e2e/swarm/state');
      expect(stateResponse.status()).toBe(200);
      const stateBody = await stateResponse.json();
      expect(stateBody.data.findings.length).toBeGreaterThan(0);

      const pdfResponse = await api.get('/api/pentests/pentest-e2e/swarm/report.pdf');
      expect(pdfResponse.status()).toBe(200);
      expect(pdfResponse.headers()['content-type']).toContain('application/pdf');
      const pdfBytes = await pdfResponse.body();
      expect(pdfBytes.byteLength).toBeGreaterThan(0);
      expect(pdfBytes.subarray(0, 4).toString('utf8')).toBe('%PDF');

      expect(prisma.pentest.findUnique).toHaveBeenCalled();
      expect(prisma.pentestEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            pentest_id: 'pentest-e2e',
            event_type: 'swarm_run_completed',
          },
        })
      );
    } finally {
      await api.dispose();
      await fastify.close();
    }
  });
});
