'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, RotateCcw, Trash2, Search, ChevronDown, Loader2 } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { ScanHistoryItem } from '@/types';

interface ScanHistoryTableProps {
  history: ScanHistoryItem[];
  isLoading?: boolean;
  className?: string;
  onView?: (id: string) => void;
  onRerun?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const STATUS_STYLES: Record<ScanHistoryItem['status'], { bg: string; text: string; dot: string }> = {
  running: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400 animate-pulse' },
  paused: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  completed: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' },
  failed: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400' },
  cancelled: { bg: 'bg-zinc-50', text: 'text-zinc-500', dot: 'bg-zinc-400' },
};

const STATUS_LABELS: Record<ScanHistoryItem['status'], string> = {
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds <3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function ScanHistoryTable({
  history,
  isLoading,
  className,
  onView,
  onRerun,
  onDelete,
}: ScanHistoryTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ScanHistoryItem['status'] | 'all'>('all');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  const filteredHistory = history.filter((item) => {
    const matchesSearch = item.target.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className={cn('bg-white rounded-xl border border-zinc-200 p-4', className)}>
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-32 animate-pulse bg-zinc-200 rounded" />
          <div className="flex gap-2">
            <div className="h-8 w-48 animate-pulse bg-zinc-200 rounded" />
            <div className="h-8 w-32 animate-pulse bg-zinc-200 rounded" />
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse bg-zinc-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-white rounded-xl border border-zinc-200 p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-900">Scan History</h3>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search targets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48 pl-8 pr-3 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="relative">
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium bg-zinc-50 border border-zinc-200 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              {statusFilter === 'all' ? 'All Status' : STATUS_LABELS[statusFilter]}
              <ChevronDown className="h-3 w-3" />
            </button>

            <AnimatePresence>
              {showStatusDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowStatusDropdown(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute right-0 top-full mt-1 z-50 w-36 bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden"
                  >
                    <button
                      onClick={() => { setStatusFilter('all'); setShowStatusDropdown(false); }}
                      className={cn(
                        'w-full px-3 py-2 text-xs text-left hover:bg-zinc-50',
                        statusFilter === 'all' && 'bg-zinc-50 font-medium'
                      )}
                    >
                      All Status
                    </button>
                    {(['running', 'paused', 'completed', 'failed', 'cancelled'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => { setStatusFilter(status); setShowStatusDropdown(false); }}
                        className={cn(
                          'w-full px-3 py-2 text-xs text-left hover:bg-zinc-50',
                          statusFilter === status && 'bg-zinc-50 font-medium'
                        )}
                      >
                        {STATUS_LABELS[status]}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="text-left py-2 px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                Target
              </th>
              <th className="text-left py-2 px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                Status
              </th>
              <th className="text-left py-2 px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                Started
              </th>
              <th className="text-left py-2 px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                Duration
              </th>
              <th className="text-left py-2 px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                Findings
              </th>
              <th className="text-right py-2 px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-zinc-400">
                    No scans found
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item, index) => {
                  const statusStyle = STATUS_STYLES[item.status];
                  return (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15, delay: index * 0.02 }}
                      className="border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors"
                    >
                      <td className="py-3 px-3">
                        <span className="text-sm font-medium text-zinc-900">{item.target}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium',
                          statusStyle.bg,
                          statusStyle.text
                        )}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', statusStyle.dot)} />
                          {STATUS_LABELS[item.status]}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-sm text-zinc-600">
                          {formatDistanceToNow(item.startedAt, { addSuffix: true })}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-sm text-zinc-600">
                          {formatDuration(item.duration)}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-sm font-medium text-zinc-900">{item.findings}</span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-end gap-1">
                          {onView && (
                            <button
                              onClick={() => onView(item.id)}
                              className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
                              title="View"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {onRerun && (
                            <button
                              onClick={() => onRerun(item.id)}
                              className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
                              title="Re-run"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => onDelete(item.id)}
                              className="p-1.5 rounded-md hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
}