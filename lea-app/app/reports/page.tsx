'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Download,
  RefreshCw,
  Loader2,
  Archive,
  ShieldAlert,
  FileJson,
  FileCode,
  FileDown,
} from 'lucide-react';
import { LeftSidebar } from '@/components/layout/left-sidebar';
import { SwarmFindingsTable } from '@/components/pentest/SwarmFindingsTable';
import { FindingEditModal } from '@/components/pentest/FindingEditModal';
import { cn } from '@/lib/utils';
import { getDevelopmentApiKey, reportsApi, requestJson } from '@/lib/api';
import type { ApiFinding, ApiReport, ApiSeverity, SwarmFinding, SwarmSeverity } from '@/types';

const API_BASE =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : 'http://localhost:3001';

type ExportFormat = 'json' | 'html' | 'pdf';

interface ReportItem {
  id: string;
  pentest_id: string;
  title: string;
  status: 'DRAFT' | 'COMPLETE' | 'ARCHIVED';
  created_at: string;
  updated_at?: string;
  findingsCount: number;
  maxSeverity: ApiSeverity | string | null;
  pentest?: { target: string };
}

interface ReportsMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type ReportDetail = ApiReport & {
  findings?: ApiFinding[];
};

type FindingUpdatePayload = {
  title: string;
  severity: ApiSeverity;
  description: string;
  evidence?: string | null;
  remediation?: string | null;
  cvss_score?: number | null;
  endpoint?: string | null;
  target_host?: string | null;
};

const API_TO_SWARM_SEVERITY: Record<ApiSeverity, SwarmSeverity> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFORMATIONAL: 'info',
};

const SWARM_TO_API_SEVERITY: Record<SwarmSeverity, ApiSeverity> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  info: 'INFORMATIONAL',
};

const SEVERITY_LABELS: Record<ApiSeverity, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  INFORMATIONAL: 'Info',
};

function normalizeSeverity(value: string | null | undefined): ApiSeverity | null {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'INFO') return 'INFORMATIONAL';
  if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'].includes(normalized)) {
    return normalized as ApiSeverity;
  }
  return null;
}

function formatDate(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-z0-9._-]/gi, '_').replace(/_+/g, '_').toLowerCase();
}

function buildApiHeaders(hasBody = false): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (hasBody) headers['Content-Type'] = 'application/json';
  const apiKey = getDevelopmentApiKey();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

async function fetchReportDetail(reportId: string): Promise<ReportDetail> {
  try {
    const response = await reportsApi.get(reportId);
    return response.data as ReportDetail;
  } catch {
    const res = await fetch(`${API_BASE}/api/reports/${encodeURIComponent(reportId)}`, {
      headers: buildApiHeaders(),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const payload = await res.json();
    return payload.data as ReportDetail;
  }
}

async function updateReportFinding(
  reportId: string,
  findingId: string,
  payload: FindingUpdatePayload,
): Promise<ApiFinding> {
  const body = await requestJson<{ data: ApiFinding }>(
    `/api/reports/${encodeURIComponent(reportId)}/findings/${encodeURIComponent(findingId)}`,
    {
      method: 'PUT',
      body: payload,
    },
  );
  return body.data as ApiFinding;
}

async function downloadReportExport(report: ReportItem | ReportDetail, format: ExportFormat) {
  const target = report.pentest?.target || report.title || report.id;
  const filenameBase = `report_${sanitizeFilePart(target)}`;

  if (format === 'json') {
    let data: unknown;
    try {
      data = await reportsApi.exportJson(report.id);
    } catch {
      const res = await fetch(`${API_BASE}/api/reports/${encodeURIComponent(report.id)}/export/json`, {
        headers: buildApiHeaders(),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      data = await res.json();
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${filenameBase}.json`);
    return;
  }

  const res = await fetch(`${API_BASE}/api/reports/${encodeURIComponent(report.id)}/export/${format}`, {
    headers: buildApiHeaders(),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const blob = await res.blob();
  downloadBlob(blob, `${filenameBase}.${format}`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function findingToSwarmFinding(finding: ApiFinding, reportId: string): SwarmFinding {
  const affectedComponents = [
    finding.endpoint,
    finding.target_host,
    typeof finding.port === 'number'
      ? `${finding.protocol || 'tcp'}/${finding.port}`
      : undefined,
  ].filter((item): item is string => Boolean(item));

  return {
    id: finding.id,
    pentestId: finding.pentest_id,
    swarmRunId: reportId,
    agentId: finding.tool_used || 'report',
    title: finding.title,
    description: finding.description,
    severity: API_TO_SWARM_SEVERITY[finding.severity] || 'info',
    cvss: typeof finding.cvss_score === 'number' ? finding.cvss_score : undefined,
    proof: finding.evidence || undefined,
    remediation: finding.remediation || undefined,
    affected_components: affectedComponents,
    pushed: Boolean(finding.report_id),
    createdAt: finding.created_at || finding.discovered_at,
    updatedAt: finding.updated_at,
  };
}

function buildFindingUpdatePayload(finding: SwarmFinding): FindingUpdatePayload {
  const components = finding.affected_components || [];
  const endpoint = components.find((item) => item.startsWith('/') || /^https?:\/\//i.test(item));
  const targetHost = components.find((item) => item !== endpoint && !/^(tcp|udp)\/\d+$/i.test(item));

  return {
    title: finding.title.trim(),
    severity: SWARM_TO_API_SEVERITY[finding.severity],
    description: finding.description.trim(),
    evidence: finding.proof?.trim() || null,
    remediation: finding.remediation?.trim() || null,
    cvss_score: typeof finding.cvss === 'number' && Number.isFinite(finding.cvss)
      ? finding.cvss
      : null,
    endpoint: endpoint || null,
    target_host: targetHost || null,
  };
}

function StatusBadge({ status }: { status: ReportItem['status'] }) {
  const map: Record<
    ReportItem['status'],
    { label: string; className: string; icon: React.ReactNode }
  > = {
    COMPLETE: {
      label: 'Complete',
      className: 'bg-green-100 text-green-700 border-green-200',
      icon: <CheckCircle className="h-3 w-3" />,
    },
    DRAFT: {
      label: 'Draft',
      className: 'bg-zinc-100 text-zinc-500 border-zinc-200',
      icon: <Clock className="h-3 w-3" />,
    },
    ARCHIVED: {
      label: 'Archived',
      className: 'bg-zinc-100 text-zinc-400 border-zinc-200',
      icon: <Archive className="h-3 w-3" />,
    },
  };

  const { label, className, icon } = map[status] ?? map.DRAFT;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        className,
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function SeverityDot({ severity }: { severity: string | null }) {
  const normalized = normalizeSeverity(severity);
  if (!normalized) return <span className="text-xs text-zinc-300">-</span>;

  const map: Record<ApiSeverity, string> = {
    CRITICAL: 'bg-red-500',
    HIGH: 'bg-orange-500',
    MEDIUM: 'bg-amber-400',
    LOW: 'bg-blue-400',
    INFORMATIONAL: 'bg-zinc-300',
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', map[normalized])} />
      <span className="text-[12px] text-zinc-600">{SEVERITY_LABELS[normalized]}</span>
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      {[42, 22, 16, 22, 20, 18].map((w, i) => (
        <td key={i} className="px-5 py-3.5">
          <div
            className="h-3.5 animate-pulse rounded-full bg-gray-100"
            style={{ width: `${w}%` }}
          />
        </td>
      ))}
    </tr>
  );
}

function SkeletonStatCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-3.5 w-24 animate-pulse rounded-full bg-gray-100" />
      </div>
      <div className="mb-1 h-7 w-10 animate-pulse rounded-full bg-gray-100" />
      <div className="h-3 w-32 animate-pulse rounded-full bg-gray-100" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
        <FileText className="h-7 w-7 text-gray-400" />
      </div>
      <h3 className="mb-1 text-base font-medium text-gray-900">No reports yet</h3>
      <p className="max-w-xs text-sm text-gray-500">
        Reports are generated after completing a penetration test.
      </p>
    </div>
  );
}

function ExportButton({
  format,
  onClick,
  compact = false,
}: {
  format: ExportFormat;
  onClick: () => void;
  compact?: boolean;
}) {
  const meta = {
    json: { label: 'JSON', icon: FileJson },
    html: { label: 'HTML', icon: FileCode },
    pdf: { label: 'PDF', icon: FileDown },
  }[format];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Export ${meta.label}`}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 text-[12px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900',
        compact ? 'h-8 w-8 px-0' : 'px-2.5 py-1.5',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {!compact && meta.label}
    </button>
  );
}

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [meta, setMeta] = useState<ReportsMeta | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<ReportDetail | null>(null);
  const [editingFinding, setEditingFinding] = useState<SwarmFinding | null>(null);
  const [savingFindingId, setSavingFindingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detailRequestRef = useRef(0);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let result: { data: ReportItem[]; meta: ReportsMeta };
      try {
        result = (await reportsApi.list({ limit: 100 })) as typeof result;
      } catch {
        const res = await fetch(`${API_BASE}/api/reports?limit=100`, {
          headers: buildApiHeaders(),
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        result = await res.json();
      }

      const nextReports = result.data ?? [];
      setReports(nextReports);
      setMeta(result.meta ?? null);
      setSelectedReportId((current) =>
        current && nextReports.some((report) => report.id === current)
          ? current
          : nextReports[0]?.id ?? null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReportDetail = useCallback(async (reportId: string) => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setDetailLoading(true);
    setError(null);
    try {
      const detail = await fetchReportDetail(reportId);
      if (detailRequestRef.current !== requestId) return;
      setSelectedReport(detail);
    } catch (err) {
      if (detailRequestRef.current !== requestId) return;
      setSelectedReport(null);
      setError(err instanceof Error ? err.message : 'Failed to load report detail');
    } finally {
      if (detailRequestRef.current === requestId) {
        setDetailLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    if (!selectedReportId) {
      detailRequestRef.current += 1;
      setSelectedReport(null);
      setDetailLoading(false);
      return;
    }
    void loadReportDetail(selectedReportId);
  }, [loadReportDetail, selectedReportId]);

  const totalCount = meta?.total ?? reports.length;
  const draftCount = reports.filter((r) => r.status === 'DRAFT').length;
  const totalFindings = reports.reduce((sum, r) => sum + (r.findingsCount ?? 0), 0);
  const selectedSummary = reports.find((report) => report.id === selectedReportId) ?? null;
  const selectedTarget = selectedReport?.pentest?.target || selectedSummary?.pentest?.target || '-';
  const swarmFindings = useMemo(() => {
    if (!selectedReport) return [];
    return (selectedReport.findings ?? []).map((finding) =>
      findingToSwarmFinding(finding, selectedReport.id),
    );
  }, [selectedReport]);

  const handleExport = async (report: ReportItem | ReportDetail, format: ExportFormat) => {
    try {
      await downloadReportExport(report, format);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to export ${format.toUpperCase()}`);
    }
  };

  const handleSaveFinding = async (updated: SwarmFinding) => {
    if (!selectedReport) return;

    setSavingFindingId(updated.id);
    setError(null);
    try {
      const saved = await updateReportFinding(
        selectedReport.id,
        updated.id,
        buildFindingUpdatePayload(updated),
      );
      setSelectedReport((current) => {
        if (!current) return current;
        return {
          ...current,
          findings: (current.findings ?? []).map((finding) =>
            finding.id === saved.id ? saved : finding,
          ),
        };
      });
      setEditingFinding(null);
      await fetchReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save finding');
    } finally {
      setSavingFindingId(null);
    }
  };

  return (
    <div className="flex h-screen bg-[#F5F5F5]">
      <LeftSidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mx-auto max-w-[1440px]">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="mb-1 text-2xl font-semibold text-gray-900">Reports</h1>
                <p className="text-sm text-gray-500">
                  Review findings, edit report evidence, and export deliverables.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchReports}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:border-gray-300 hover:bg-white hover:text-zinc-900 disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                Refresh
              </button>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              {loading ? (
                <>
                  <SkeletonStatCard />
                  <SkeletonStatCard />
                  <SkeletonStatCard />
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">Total Reports</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
                    <p className="text-xs text-gray-500">Reports generated</p>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                        <Clock className="h-4 w-4 text-blue-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">Draft Reports</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{draftCount}</p>
                    <p className="text-xs text-gray-500">Reports awaiting review</p>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50">
                        <ShieldAlert className="h-4 w-4 text-orange-500" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">Total Findings</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{totalFindings}</p>
                    <p className="text-xs text-gray-500">Findings across reports</p>
                  </div>
                </>
              )}
            </div>

            {error && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-red-700">Reports action failed</p>
                  <p className="mt-0.5 text-xs text-red-600">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={fetchReports}
                  className="text-xs font-medium text-red-600 transition-colors hover:text-red-800"
                >
                  Retry
                </button>
              </div>
            )}

            <div className="grid gap-5 2xl:grid-cols-[minmax(640px,0.95fr)_minmax(520px,0.85fr)]">
              <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                {loading ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Target
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Status
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Findings
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Severity
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Created
                        </th>
                        <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Export
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 4 }).map((_, i) => (
                        <SkeletonRow key={i} />
                      ))}
                    </tbody>
                  </table>
                ) : reports.length === 0 ? (
                  <EmptyState />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Target
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Status
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Findings
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Severity
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Created
                        </th>
                        <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Export
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((report) => (
                        <tr
                          key={report.id}
                          tabIndex={0}
                          onClick={() => setSelectedReportId(report.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              setSelectedReportId(report.id);
                            }
                          }}
                          className={cn(
                            'cursor-pointer border-b border-gray-100 align-top transition-colors last:border-0 hover:bg-gray-50/80',
                            selectedReportId === report.id && 'bg-orange-50/50 hover:bg-orange-50/70',
                          )}
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-100">
                                <FileText className="h-3.5 w-3.5 text-zinc-400" />
                              </div>
                              <div className="min-w-0">
                                <p className="max-w-[200px] truncate text-[13px] font-medium text-zinc-900">
                                  {report.pentest?.target ?? '-'}
                                </p>
                                <p className="max-w-[200px] truncate text-[11px] text-zinc-400">
                                  {report.title}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-3.5">
                            <StatusBadge status={report.status} />
                          </td>

                          <td className="px-5 py-3.5">
                            <span
                              className={cn(
                                'inline-flex h-6 min-w-[24px] items-center justify-center rounded-md border px-2 text-[12px] font-semibold',
                                report.findingsCount > 0
                                  ? 'border-orange-100 bg-orange-50 text-orange-600'
                                  : 'border-zinc-100 bg-zinc-50 text-zinc-400',
                              )}
                            >
                              {report.findingsCount ?? 0}
                            </span>
                          </td>

                          <td className="px-5 py-3.5">
                            <SeverityDot severity={report.maxSeverity} />
                          </td>

                          <td className="whitespace-nowrap px-5 py-3.5 text-[12px] tabular-nums text-zinc-500">
                            {formatDate(report.created_at)}
                          </td>

                          <td className="px-5 py-3.5">
                            <div className="flex justify-end gap-1.5">
                              <ExportButton
                                compact
                                format="json"
                                onClick={() => void handleExport(report, 'json')}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {!loading && meta && meta.total > reports.length && (
                  <div className="border-t border-gray-100 px-5 py-3 text-center text-xs text-zinc-400">
                    Showing {reports.length} of {meta.total} reports
                  </div>
                )}
              </section>

              <section className="min-h-[420px] rounded-2xl border border-gray-200 bg-white shadow-sm">
                {detailLoading ? (
                  <div className="flex h-full min-h-[420px] items-center justify-center">
                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading report
                    </div>
                  </div>
                ) : !selectedReport ? (
                  <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-8 text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100">
                      <FileText className="h-6 w-6 text-zinc-400" />
                    </div>
                    <h2 className="text-sm font-semibold text-zinc-900">Select a report</h2>
                    <p className="mt-1 max-w-sm text-sm text-zinc-500">
                      Report findings and export actions appear here.
                    </p>
                  </div>
                ) : (
                  <div className="p-5">
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="mb-2 flex items-center gap-2">
                          <StatusBadge status={selectedReport.status} />
                          <SeverityDot severity={selectedSummary?.maxSeverity ?? null} />
                        </div>
                        <h2 className="truncate text-lg font-semibold text-zinc-900">
                          {selectedTarget}
                        </h2>
                        <p className="mt-1 line-clamp-2 text-sm text-zinc-500">
                          {selectedReport.title}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 gap-2">
                        <ExportButton
                          format="json"
                          onClick={() => void handleExport(selectedReport, 'json')}
                        />
                        <ExportButton
                          format="html"
                          onClick={() => void handleExport(selectedReport, 'html')}
                        />
                        <ExportButton
                          format="pdf"
                          onClick={() => void handleExport(selectedReport, 'pdf')}
                        />
                      </div>
                    </div>

                    <div className="mb-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                          Findings
                        </p>
                        <p className="mt-1 text-xl font-semibold text-zinc-900">
                          {selectedReport.findings?.length ?? 0}
                        </p>
                      </div>
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                          Created
                        </p>
                        <p className="mt-1 text-sm font-medium text-zinc-900">
                          {formatDate(selectedReport.created_at)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                          Updated
                        </p>
                        <p className="mt-1 text-sm font-medium text-zinc-900">
                          {formatDate(selectedReport.updated_at)}
                        </p>
                      </div>
                    </div>

                    <div className="mb-5 rounded-xl border border-zinc-200 bg-white p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <Download className="h-3.5 w-3.5 text-zinc-400" />
                        <h3 className="text-sm font-semibold text-zinc-900">Executive Summary</h3>
                      </div>
                      <p className="whitespace-pre-line text-sm leading-6 text-zinc-600">
                        {selectedReport.executive_summary || 'No executive summary has been generated yet.'}
                      </p>
                    </div>

                    <div>
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-zinc-900">Findings Review</h3>
                        <span className="text-xs text-zinc-400">
                          {swarmFindings.length} item{swarmFindings.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      {swarmFindings.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center">
                          <p className="text-sm font-medium text-zinc-700">No findings recorded</p>
                          <p className="mt-1 text-xs text-zinc-400">
                            Completed scans with findings will populate this review table.
                          </p>
                        </div>
                      ) : (
                        <SwarmFindingsTable
                          findings={swarmFindings}
                          editMode="modal"
                          tone="light"
                          onOpenFinding={setEditingFinding}
                        />
                      )}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </main>

      {editingFinding && (
        <FindingEditModal
          finding={editingFinding}
          onClose={() => setEditingFinding(null)}
          onSave={handleSaveFinding}
          isSaving={savingFindingId === editingFinding.id}
        />
      )}
    </div>
  );
}
