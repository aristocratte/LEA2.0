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
      findUnique: vi.fn().mockResolvedValue({ status: 'RUNNING', failure_reason: null }),
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
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
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

  it('does not mark failed pentests as completed', async () => {
    const { fastify, prisma } = await buildApp({
      pentest: {
        findUnique: vi.fn().mockResolvedValue({
          status: 'ERROR',
          failure_reason: 'Zhipu API error 500',
        }),
        update: vi.fn(),
      },
    });

    try {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/pentests/pentest-1/complete',
      });

      expect(response.statusCode).toBe(409);
      expect(prisma.pentest.update).not.toHaveBeenCalled();
      expect(createReportFromPentestMock).not.toHaveBeenCalled();
      expect(response.json()).toMatchObject({
        error: 'Pentest failed and cannot be completed',
        failure_reason: 'Zhipu API error 500',
      });
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

  it('updates editable finding fields within a report', async () => {
    const updatedFinding = {
      id: 'finding-1',
      report_id: 'report-1',
      title: 'Verified reflected XSS',
      severity: 'HIGH',
      category: 'Cross-site scripting',
      description: 'The search endpoint reflects script payloads.',
      evidence: 'GET /search?q=<script>alert(1)</script>',
      remediation: 'Encode user-controlled output.',
      cvss_score: 8.1,
      endpoint: '/search',
      updated_at: new Date('2026-04-26T10:00:00.000Z'),
    };
    const { fastify, prisma } = await buildApp({
      finding: {
        findFirst: vi.fn().mockResolvedValue({ id: 'finding-1', report_id: 'report-1' }),
        update: vi.fn().mockResolvedValue(updatedFinding),
      },
    });

    try {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/reports/report-1/findings/finding-1',
        payload: {
          title: 'Verified reflected XSS',
          severity: 'HIGH',
          category: 'Cross-site scripting',
          description: 'The search endpoint reflects script payloads.',
          evidence: 'GET /search?q=<script>alert(1)</script>',
          remediation: 'Encode user-controlled output.',
          cvss_score: 8.1,
          endpoint: '/search',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.finding.findFirst).toHaveBeenCalledWith({
        where: { id: 'finding-1', report_id: 'report-1' },
        select: { id: true },
      });
      expect(prisma.finding.update).toHaveBeenCalledWith({
        where: { id: 'finding-1' },
        data: {
          title: 'Verified reflected XSS',
          severity: 'HIGH',
          category: 'Cross-site scripting',
          description: 'The search endpoint reflects script payloads.',
          evidence: 'GET /search?q=<script>alert(1)</script>',
          remediation: 'Encode user-controlled output.',
          cvss_score: 8.1,
          endpoint: '/search',
        },
      });
      expect(response.json()).toMatchObject({
        data: {
          ...updatedFinding,
          updated_at: '2026-04-26T10:00:00.000Z',
        },
      });
    } finally {
      await fastify.close();
    }
  });

  it('does not update findings outside the requested report', async () => {
    const { fastify, prisma } = await buildApp({
      finding: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    });

    try {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/reports/report-1/findings/finding-2',
        payload: { title: 'Out of report finding' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: 'Finding not found in report' });
      expect(prisma.finding.update).not.toHaveBeenCalled();
    } finally {
      await fastify.close();
    }
  });

  it('exports a report PDF with the expected response headers', async () => {
    const pdf = Buffer.from('%PDF-1.4 mocked report');
    generatePdfMock.mockResolvedValue(pdf);

    const { fastify } = await buildApp({
      report: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn().mockResolvedValue({
          id: 'report-1',
          pentest: { target: 'app.example.com' },
          findings: [],
        }),
        update: vi.fn(),
        delete: vi.fn(),
      },
    });

    try {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/reports/report-1/export/pdf',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('report-app.example.com.pdf');
      expect(Buffer.from(response.rawPayload).equals(pdf)).toBe(true);
      expect(generatePdfMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'report-1' }));
    } finally {
      await fastify.close();
    }
  });
});
