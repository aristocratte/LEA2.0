import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sseManager } from '../../services/SSEManager.js';

const {
  createReportFromPentestMock,
  generatePdfMock,
} = vi.hoisted(() => ({
  createReportFromPentestMock: vi.fn(),
  generatePdfMock: vi.fn(),
}));

vi.mock('../../services/ReportService.js', () => ({
  ReportService: class ReportService {
    createReportFromPentest = createReportFromPentestMock;
  },
}));

vi.mock('../../services/ExportService.js', () => ({
  ExportService: class ExportService {
    generatePdf = generatePdfMock;
  },
}));

import { reportRoutes } from '../reports.js';

beforeEach(() => {
  vi.clearAllMocks();
});

async function buildApp(prismaOverrides: Record<string, unknown> = {}) {
  const fastify = Fastify({ logger: false });
  const prisma = {
    pentest: {
      update: vi.fn().mockResolvedValue(undefined),
    },
    report: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      delete: vi.fn(),
    },
    finding: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...prismaOverrides,
  };

  fastify.decorate('prisma', prisma as never);
  await fastify.register(reportRoutes);
  await fastify.ready();
  return { fastify, prisma };
}

describe('reportRoutes', () => {
  it('completes a pentest and emits a session_complete event', async () => {
    const broadcast = vi.spyOn(sseManager, 'broadcast').mockImplementation(() => ({
      id: 'evt-1',
      sequence: 1,
      timestamp: Date.now(),
      runId: 'pentest-1',
      source: 'system',
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'session_complete',
      payload: { type: 'session_complete', reportId: 'report-1' },
    }));
    createReportFromPentestMock.mockResolvedValue({ id: 'report-1' });

    const { fastify, prisma } = await buildApp();

    try {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/pentests/pentest-1/complete',
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.pentest.update).toHaveBeenCalledWith({
        where: { id: 'pentest-1' },
        data: {
          status: 'COMPLETED',
          ended_at: expect.any(Date),
        },
      });
      expect(createReportFromPentestMock).toHaveBeenCalledWith('pentest-1');
      expect(broadcast).toHaveBeenCalledWith(
        'pentest-1',
        expect.objectContaining({ eventType: 'session_complete' })
      );
    } finally {
      await fastify.close();
    }
  });

  it('returns paginated report listings', async () => {
    const { fastify } = await buildApp({
      report: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'report-1',
            title: 'Assessment',
            _count: { findings: 1 },
            pentest: { target: 'app.example.com' },
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
      finding: {
        findMany: vi.fn().mockResolvedValue([{ severity: 'HIGH' }]),
      },
    });

    try {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/reports?page=1&limit=10',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.meta.total).toBe(1);
      expect(payload.data[0]).toMatchObject({
        id: 'report-1',
        findingsCount: 1,
        maxSeverity: 'HIGH',
      });
    } finally {
      await fastify.close();
    }
  });
});
