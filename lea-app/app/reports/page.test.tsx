import { act } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReportsPage from './page';

const mocks = vi.hoisted(() => ({
  listReports: vi.fn(),
  getReport: vi.fn(),
  requestJson: vi.fn(),
}));

vi.mock('@/components/layout/left-sidebar', () => ({
  LeftSidebar: () => <aside data-testid="left-sidebar" />,
}));

vi.mock('@/lib/api', () => ({
  reportsApi: {
    list: mocks.listReports,
    get: mocks.getReport,
    exportJson: vi.fn(),
  },
  requestJson: mocks.requestJson,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function reportSummary(id: string, target: string) {
  return {
    id,
    pentest_id: `pentest-${id}`,
    title: `Report ${target}`,
    status: 'COMPLETE' as const,
    created_at: '2026-04-26T10:00:00.000Z',
    updated_at: '2026-04-26T10:00:00.000Z',
    findingsCount: 0,
    maxSeverity: null,
    pentest: { target },
  };
}

function reportDetail(id: string, target: string) {
  return {
    data: {
      ...reportSummary(id, target),
      executive_summary: `Executive summary for ${target}`,
      findings: [],
    },
  };
}

describe('ReportsPage detail loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listReports.mockResolvedValue({
      data: [reportSummary('report-a', 'alpha.example'), reportSummary('report-b', 'beta.example')],
      meta: { total: 2, page: 1, limit: 100, totalPages: 1 },
    });
  });

  it('ignores stale report detail responses after selecting another report', async () => {
    const firstDetail = deferred<ReturnType<typeof reportDetail>>();
    const secondDetail = deferred<ReturnType<typeof reportDetail>>();
    mocks.getReport.mockImplementation((id: string) => {
      if (id === 'report-a') return firstDetail.promise;
      if (id === 'report-b') return secondDetail.promise;
      throw new Error(`Unexpected report id ${id}`);
    });

    render(<ReportsPage />);

    await screen.findByText('alpha.example');
    const betaRow = screen.getByText('beta.example').closest('tr');
    expect(betaRow).not.toBeNull();

    fireEvent.click(betaRow!);
    secondDetail.resolve(reportDetail('report-b', 'beta.example'));

    await waitFor(() => {
      const detailPanel = screen.getByRole('heading', { name: 'beta.example' }).closest('section');
      expect(detailPanel).not.toBeNull();
      expect(within(detailPanel!).getByText('Executive summary for beta.example')).toBeInTheDocument();
    });

    await act(async () => {
      firstDetail.resolve(reportDetail('report-a', 'alpha.example'));
      await firstDetail.promise;
    });

    await waitFor(() => {
      const detailPanel = screen.getByRole('heading', { name: 'beta.example' }).closest('section');
      expect(detailPanel).not.toBeNull();
      expect(within(detailPanel!).queryByText('Executive summary for alpha.example')).not.toBeInTheDocument();
    });
  });

  it('saves finding edits through the configured API client', async () => {
    mocks.getReport.mockResolvedValue({
      data: {
        ...reportSummary('report-a', 'alpha.example'),
        executive_summary: 'Executive summary for alpha.example',
        findings: [
          {
            id: 'finding-1',
            pentest_id: 'pentest-report-a',
            report_id: 'report-a',
            title: 'Editable finding',
            description: 'Stored description',
            severity: 'HIGH',
            evidence: 'stored evidence',
            remediation: 'stored remediation',
            cvss_score: 8.7,
            status: 'OPEN',
            verified: false,
            false_positive: false,
            verification_state: 'PROVISIONAL',
            evidence_score: 55,
            endpoint: '/api/login',
            target_host: null,
            created_at: '2026-04-26T10:00:00.000Z',
            updated_at: '2026-04-26T10:00:00.000Z',
          },
        ],
      },
    });
    mocks.requestJson.mockResolvedValue({
      data: {
        id: 'finding-1',
        pentest_id: 'pentest-report-a',
        report_id: 'report-a',
        title: 'Editable finding',
        description: 'Stored description',
        severity: 'HIGH',
        evidence: null,
        remediation: null,
        cvss_score: null,
        endpoint: null,
        target_host: null,
        created_at: '2026-04-26T10:00:00.000Z',
        updated_at: '2026-04-26T10:00:00.000Z',
      },
    });

    render(<ReportsPage />);

    await screen.findByText('Editable finding');
    fireEvent.click(screen.getByRole('button', { name: /review editable finding/i }));
    fireEvent.change(screen.getByLabelText(/cvss score/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/evidence/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/remediation/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/affected components/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(mocks.requestJson).toHaveBeenCalledTimes(1));
    expect(mocks.requestJson).toHaveBeenCalledWith(
      '/api/reports/report-a/findings/finding-1',
      expect.objectContaining({
        method: 'PUT',
        body: expect.objectContaining({
          evidence: null,
          remediation: null,
          cvss_score: null,
          endpoint: null,
          target_host: null,
          status: 'OPEN',
        }),
      }),
    );
  });

  it('shows report readiness and blocks exports until findings are validated with evidence', async () => {
    mocks.getReport.mockResolvedValue({
      data: {
        ...reportSummary('report-a', 'alpha.example'),
        executive_summary: 'Executive summary for alpha.example',
        findings: [
          {
            id: 'finding-1',
            pentest_id: 'pentest-report-a',
            report_id: 'report-a',
            title: 'Validated finding',
            description: 'Stored description',
            severity: 'HIGH',
            evidence: 'HTTP/1.1 200 OK',
            remediation: 'stored remediation',
            status: 'CONFIRMED',
            verified: true,
            false_positive: false,
            verification_state: 'CONFIRMED',
            evidence_score: 90,
            endpoint: '/api/login',
            target_host: null,
            created_at: '2026-04-26T10:00:00.000Z',
            updated_at: '2026-04-26T10:00:00.000Z',
          },
          {
            id: 'finding-2',
            pentest_id: 'pentest-report-a',
            report_id: 'report-a',
            title: 'Draft missing evidence',
            description: 'Needs proof',
            severity: 'LOW',
            evidence: '',
            remediation: 'stored remediation',
            status: 'OPEN',
            verified: false,
            false_positive: false,
            verification_state: 'PROVISIONAL',
            evidence_score: 20,
            endpoint: '/debug',
            target_host: null,
            created_at: '2026-04-26T10:00:00.000Z',
            updated_at: '2026-04-26T10:00:00.000Z',
          },
        ],
      },
    });

    render(<ReportsPage />);

    expect(await screen.findByText('Needs review before export')).toBeInTheDocument();
    expect(screen.getByText('1 validated')).toBeInTheDocument();
    expect(screen.getByText('1 draft')).toBeInTheDocument();
    expect(screen.getByText('1 missing evidence')).toBeInTheDocument();
    expect(screen.getAllByTitle(/Exports unlock after every finding/i)).toHaveLength(3);
    expect(screen.getByText('Evidence missing')).toBeInTheDocument();
  });
});
