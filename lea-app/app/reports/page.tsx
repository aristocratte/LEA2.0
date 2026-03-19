'use client';

import { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';
import { LeftSidebar } from '@/components/layout/left-sidebar';
import { cn } from '@/lib/utils';
import { reportsApi } from '@/lib/api';

// Fallback direct fetch in case reportsApi isn't wired yet
const API_BASE =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : 'http://localhost:3001';

interface ReportItem {
  id: string;
  pentest_id: string;
  title: string;
  status: 'DRAFT' | 'COMPLETE' | 'ARCHIVED';
  created_at: string;
  updated_at?: string;
  findingsCount: number;
  maxSeverity: string | null;
  pentest?: { target: string };
}

interface ReportsMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ── sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReportItem['status'] }) {
  const map: Record<
    ReportItem['status'],
    { label: string; className: string; icon: React.ReactNode }
  > = {
    COMPLETE: {
      label: 'Complete',
      className: 'bg-green-100 text-green-700 border-green-200',
      icon: <CheckCircle className="w-3 h-3" />,
    },
    DRAFT: {
      label: 'Draft',
      className: 'bg-zinc-100 text-zinc-500 border-zinc-200',
      icon: <Clock className="w-3 h-3" />,
    },
    ARCHIVED: {
      label: 'Archived',
      className: 'bg-zinc-100 text-zinc-400 border-zinc-200',
      icon: <Archive className="w-3 h-3" />,
    },
  };

  const { label, className, icon } = map[status] ?? map.DRAFT;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
        className,
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function SeverityDot({ severity }: { severity: string | null }) {
  if (!severity) return <span className="text-zinc-300 text-xs">—</span>;

  const map: Record<string, { dot: string; label: string }> = {
    critical: { dot: 'bg-red-500', label: 'Critical' },
    high: { dot: 'bg-orange-500', label: 'High' },
    medium: { dot: 'bg-amber-400', label: 'Medium' },
    low: { dot: 'bg-blue-400', label: 'Low' },
    info: { dot: 'bg-zinc-300', label: 'Info' },
  };

  const key = severity.toLowerCase();
  const { dot, label } = map[key] ?? { dot: 'bg-zinc-300', label: severity };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', dot)} />
      <span className="text-[12px] text-zinc-600 capitalize">{label}</span>
    </span>
  );
}

// ── skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      {[40, 24, 16, 20, 20, 16].map((w, i) => (
        <td key={i} className="px-5 py-3.5">
          <div
            className="h-3.5 bg-gray-100 rounded-full animate-pulse"
            style={{ width: `${w}%` }}
          />
        </td>
      ))}
    </tr>
  );
}

function SkeletonStatCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-gray-100 animate-pulse" />
        <div className="h-3.5 bg-gray-100 rounded-full w-24 animate-pulse" />
      </div>
      <div className="h-7 bg-gray-100 rounded-full w-10 animate-pulse mb-1" />
      <div className="h-3 bg-gray-100 rounded-full w-32 animate-pulse" />
    </div>
  );
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="py-16 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <FileText className="w-7 h-7 text-gray-400" />
      </div>
      <h3 className="text-base font-medium text-gray-900 mb-1">No reports yet</h3>
      <p className="text-sm text-gray-500 max-w-xs">
        Reports are generated after completing a penetration test. Start a new
        scan to generate your first report.
      </p>
    </div>
  );
}

// ── export helpers ────────────────────────────────────────────────────────────

async function downloadReportJson(reportId: string) {
  try {
    let data: unknown;
    try {
      data = await reportsApi.exportJson(reportId);
    } catch {
      // fallback direct fetch
      const res = await fetch(
        `${API_BASE}/api/reports/${encodeURIComponent(reportId)}/export/json`,
      );
      data = await res.json();
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${reportId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed to export report:', err);
  }
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [meta, setMeta] = useState<ReportsMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let result: { data: ReportItem[]; meta: ReportsMeta };
      try {
        result = (await reportsApi.list({ limit: 100 })) as typeof result;
      } catch {
        // fallback direct fetch
        const res = await fetch(`${API_BASE}/api/reports?limit=100`);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        result = await res.json();
      }
      setReports(result.data ?? []);
      setMeta(result.meta ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load reports',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // ── computed stats ─────────────────────────────────────────────────────────
  const totalCount = meta?.total ?? reports.length;
  const draftCount = reports.filter((r) => r.status === 'DRAFT').length;
  const totalFindings = reports.reduce((sum, r) => sum + (r.findingsCount ?? 0), 0);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#F5F5F5]">
      <LeftSidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="max-w-4xl mx-auto">

            {/* ── header ── */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 mb-1">
                  Reports
                </h1>
                <p className="text-sm text-gray-500">
                  View and export penetration test reports
                </p>
              </div>
              <button
                onClick={fetchReports}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-zinc-600 hover:text-zinc-900 hover:bg-white border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={cn('w-3.5 h-3.5', loading && 'animate-spin')}
                />
                Refresh
              </button>
            </div>

            {/* ── stats cards ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {loading ? (
                <>
                  <SkeletonStatCard />
                  <SkeletonStatCard />
                  <SkeletonStatCard />
                </>
              ) : (
                <>
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        Total Reports
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">
                      {totalCount}
                    </p>
                    <p className="text-xs text-gray-500">Reports generated</p>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-blue-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        Active Pentests
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">
                      {draftCount}
                    </p>
                    <p className="text-xs text-gray-500">
                      Reports in draft state
                    </p>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: '#FEF3E2' }}
                      >
                        <ShieldAlert
                          className="w-4 h-4"
                          style={{ color: '#F5A623' }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        Total Findings
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">
                      {totalFindings}
                    </p>
                    <p className="text-xs text-gray-500">
                      Vulnerabilities across all reports
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* ── error state ── */}
            {error && (
              <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-700">
                    Failed to load reports
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">{error}</p>
                </div>
                <button
                  onClick={fetchReports}
                  className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {/* ── table card ── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {loading ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Target
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Findings
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Severity
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Actions
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
                      <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Target
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Findings
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Severity
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => (
                      <tr
                        key={report.id}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors"
                      >
                        {/* Target */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                              <FileText className="w-3.5 h-3.5 text-zinc-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-zinc-900 text-[13px] truncate max-w-[200px]">
                                {report.pentest?.target ?? '—'}
                              </p>
                              <p className="text-[11px] text-zinc-400 truncate max-w-[200px]">
                                {report.title}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3.5">
                          <StatusBadge status={report.status} />
                        </td>

                        {/* Findings count */}
                        <td className="px-5 py-3.5">
                          <span
                            className={cn(
                              'inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-md text-[12px] font-semibold',
                              report.findingsCount > 0
                                ? 'bg-orange-50 text-orange-600 border border-orange-100'
                                : 'bg-zinc-50 text-zinc-400 border border-zinc-100',
                            )}
                          >
                            {report.findingsCount ?? 0}
                          </span>
                        </td>

                        {/* Severity */}
                        <td className="px-5 py-3.5">
                          <SeverityDot severity={report.maxSeverity} />
                        </td>

                        {/* Created */}
                        <td className="px-5 py-3.5 text-[12px] text-zinc-500 tabular-nums whitespace-nowrap">
                          {formatDate(report.created_at)}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => downloadReportJson(report.id)}
                            title="Export JSON"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 hover:border-zinc-300 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Export
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* pagination hint */}
              {!loading && meta && meta.total > reports.length && (
                <div className="px-5 py-3 border-t border-gray-100 text-xs text-zinc-400 text-center">
                  Showing {reports.length} of {meta.total} reports
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
