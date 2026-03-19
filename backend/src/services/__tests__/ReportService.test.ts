import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  pentestFindUniqueMock,
  reportFindUniqueMock,
  reportCreateMock,
} = vi.hoisted(() => ({
  pentestFindUniqueMock: vi.fn(),
  reportFindUniqueMock: vi.fn(),
  reportCreateMock: vi.fn(),
}));

vi.mock('@prisma/client', () => {
  class PrismaClient {
    pentest = {
      findUnique: pentestFindUniqueMock,
    };

    report = {
      findUnique: reportFindUniqueMock,
      create: reportCreateMock,
    };
  }

  return {
    PrismaClient,
    Severity: {
      CRITICAL: 'CRITICAL',
      HIGH: 'HIGH',
      MEDIUM: 'MEDIUM',
      LOW: 'LOW',
      INFORMATIONAL: 'INFORMATIONAL',
    },
  };
});

import { ReportService } from '../ReportService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReportService', () => {
  it('returns an existing report without creating a new one', async () => {
    pentestFindUniqueMock.mockResolvedValue({
      id: 'pentest-1',
      target: 'app.example.com',
      scope: { inScope: ['app.example.com'] },
      findings: [],
    });
    reportFindUniqueMock.mockResolvedValue({ id: 'report-existing', pentest_id: 'pentest-1' });

    const service = new ReportService();
    const report = await service.createReportFromPentest('pentest-1');

    expect(report).toEqual({ id: 'report-existing', pentest_id: 'pentest-1' });
    expect(reportCreateMock).not.toHaveBeenCalled();
  });

  it('creates a completed report with computed stats when none exists', async () => {
    pentestFindUniqueMock.mockResolvedValue({
      id: 'pentest-2',
      target: 'api.example.com',
      scope: { inScope: ['api.example.com'] },
      findings: [
        { id: 'finding-1', severity: 'HIGH', category: 'Auth', cvss_score: 8.4 },
        { id: 'finding-2', severity: 'LOW', category: 'Headers', cvss_score: 3.1 },
      ],
    });
    reportFindUniqueMock.mockResolvedValue(null);
    reportCreateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'report-2',
      ...data,
      findings: [{ id: 'finding-1' }, { id: 'finding-2' }],
    }));

    const service = new ReportService();
    const report = await service.createReportFromPentest('pentest-2', { source: 'swarm' });

    expect(reportCreateMock).toHaveBeenCalledTimes(1);
    const createPayload = reportCreateMock.mock.calls[0][0].data as Record<string, unknown>;
    expect(createPayload.title).toBe('Security Assessment - api.example.com');
    expect(createPayload.status).toBe('COMPLETE');
    expect(createPayload.stats).toMatchObject({
      totalFindings: 2,
      source: 'swarm',
    });
    expect(report.id).toBe('report-2');
  });

  it('throws when the pentest does not exist', async () => {
    pentestFindUniqueMock.mockResolvedValue(null);

    const service = new ReportService();

    await expect(service.createReportFromPentest('missing')).rejects.toThrow('Pentest not found');
    expect(reportFindUniqueMock).not.toHaveBeenCalled();
  });
});
