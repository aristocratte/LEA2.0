'use client';

import { Shield, LayoutDashboard, Settings, MoreHorizontal, Plus, ChevronDown, Target, FileText } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { usePentestList } from '@/hooks/use-pentest-list';
import { usePentestStore } from '@/store/pentest-store';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href: string;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/pentest/dashboard' },
  { id: 'overview', label: 'Active Scan', icon: Target, href: '/pentest' },
  { id: 'reports', label: 'Reports', icon: FileText, href: '/reports' },
  { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
];

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function mapPentestStatus(status: string): 'active' | 'paused' | 'completed' | 'config' {
  switch (status) {
    case 'RUNNING': return 'active';
    case 'PAUSED': return 'paused';
    case 'COMPLETED':
    case 'CANCELLED':
    case 'ERROR':
      return 'completed';
    default:
      return 'config';
  }
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case 'RUNNING': return 'Running';
    case 'PAUSED': return 'Paused';
    case 'COMPLETED': return 'Complete';
    case 'CANCELLED': return 'Cancelled';
    case 'ERROR': return 'Error';
    case 'PREFLIGHT': return 'Preflight';
    default: return 'Config';
  }
}

function formatFindingCount(count?: number): string | null {
  if (!count) return null;
  return `${count} finding${count === 1 ? '' : 's'}`;
}

const STATUS_DOT: Record<string, string> = {
  active: 'bg-emerald-400 animate-pulse',
  paused: 'bg-amber-400',
  completed: 'bg-zinc-300',
  config: 'bg-blue-400',
};

export function LeftSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [scansExpanded, setScansExpanded] = useState(true);
  const { pentests, isLoading: pentestsLoading, error: pentestsError, refresh: refreshPentests } = usePentestList();
  const storePentestId = usePentestStore((s) => s.pentestId);
  const activePentestId = searchParams?.get('id') || storePentestId;
  const resetPentest = usePentestStore((s) => s.reset);

  const isActive = (href: string) => {
    if (href === '/pentest') return pathname === '/pentest';
    return pathname?.startsWith(href.split('?')[0]);
  };

  return (
    <aside className="w-[220px] h-screen bg-white border-r border-zinc-100 flex flex-col flex-shrink-0">

      {/* Logo */}
      <div className="px-4 py-[14px] border-b border-zinc-100">
        <Link href="/pentest" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
            <Shield className="w-[14px] h-[14px] text-white" />
          </div>
          <div>
            <h1 className="text-[13px] font-semibold text-zinc-900 tracking-tight leading-none">LEA</h1>
            <p className="text-[10px] text-zinc-400 mt-[2px] leading-none">Security platform</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <div className="space-y-[2px] mb-5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] transition-colors duration-100',
                  active
                    ? 'bg-zinc-50 text-zinc-900 font-semibold'
                    : 'text-zinc-600 hover:bg-[rgba(0,0,0,0.02)] hover:text-zinc-800',
                )}
              >
                <Icon
                  style={{ width: 15, height: 15 }}
                  className={cn(
                    'shrink-0',
                    active ? 'text-zinc-700' : 'text-zinc-400',
                  )}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Recent scans */}
        <div>
          <button
            onClick={() => setScansExpanded(!scansExpanded)}
            className="flex w-full items-center justify-between px-3 py-1 mb-1 group"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 group-hover:text-zinc-500 transition-colors">
              Recent
            </span>
            <motion.div
              animate={{ rotate: scansExpanded ? 0 : -90 }}
              transition={{ duration: 0.18, ease: 'easeInOut' }}
            >
              <ChevronDown className="h-3 w-3 text-zinc-400" />
            </motion.div>
          </button>

          <AnimatePresence initial={false}>
            {scansExpanded && (
              <motion.div
                key="recent-scans"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="space-y-[2px]">
                  {pentestsLoading && pentests.length === 0 ? (
                    <div className="px-3 py-4 space-y-2">
                      <div className="h-4 bg-zinc-100 rounded animate-pulse" />
                      <div className="h-4 bg-zinc-100 rounded animate-pulse w-3/4" />
                      <div className="h-4 bg-zinc-100 rounded animate-pulse w-1/2" />
                    </div>
                  ) : pentestsError && pentests.length === 0 ? (
                    <div className="px-3 py-4 text-center">
                      <p className="text-[11px] leading-4 text-zinc-400">Recent scans unavailable</p>
                      <button
                        type="button"
                        onClick={refreshPentests}
                        className="mt-2 text-[11px] font-medium text-zinc-700 hover:text-zinc-950"
                      >
                        Retry
                      </button>
                    </div>
                  ) : pentests.length === 0 ? (
                    <p className="px-3 py-4 text-center text-[11px] text-zinc-400">No pentests yet</p>
                  ) : (
                    pentests.slice(0, 20).map((pentest) => {
                      const status = mapPentestStatus(pentest.status);
                      const findingCount = formatFindingCount(pentest._count?.findings);
                      const isCurrent = pentest.id === activePentestId;
                      return (
                        <button
                          key={pentest.id}
                          onClick={() => {
                            usePentestStore.getState().loadFromApi(pentest);
                            router.push(`/pentest?id=${encodeURIComponent(pentest.id)}`);
                          }}
                          aria-current={isCurrent ? 'page' : undefined}
                          className={cn(
                            'w-full flex items-start gap-2 px-3 py-[7px] rounded-lg text-left transition-colors group',
                            isCurrent ? 'bg-zinc-50' : 'hover:bg-[rgba(0,0,0,0.03)]',
                          )}
                        >
                          <div className={cn('mt-[5px] h-[6px] w-[6px] rounded-full shrink-0', STATUS_DOT[status])} />
                          <div className="min-w-0 flex-1">
                            <span className={cn(
                              'block truncate text-[12px] transition-colors',
                              isCurrent ? 'text-zinc-900 font-medium' : 'text-zinc-600 group-hover:text-zinc-800',
                            )}>
                              {pentest.target}
                            </span>
                            <span className="mt-[2px] block truncate text-[10px] text-zinc-400">
                              {[formatStatusLabel(pentest.status), findingCount].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-400 shrink-0 tabular-nums">
                            {formatRelativeDate(pentest.updated_at)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>

      {/* Bottom section */}
      <div className="p-3 border-t border-zinc-100">
        {/* New scan button */}
        <motion.button
          whileHover="hover"
          onClick={() => {
            const returnTo = activePentestId
              ? `/pentest?id=${encodeURIComponent(activePentestId)}`
              : '/pentest/dashboard';
            resetPentest();
            router.push(`/pentest/new?returnTo=${encodeURIComponent(returnTo)}`);
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 text-[13px] text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 transition-colors group"
        >
          <motion.span
            variants={{ hover: { rotate: 90 } }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="flex items-center justify-center"
          >
            <Plus className="h-[13px] w-[13px]" />
          </motion.span>
          New scan
        </motion.button>

        {/* User profile */}
        <div className="flex items-center gap-2.5 px-2 py-2 mt-1 rounded-xl hover:bg-[rgba(0,0,0,0.03)] cursor-pointer transition-colors group">
          <div className="h-[26px] w-[26px] rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0 select-none">
            AR
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-zinc-700 truncate">Aris Rao</p>
          </div>
          <MoreHorizontal className="h-[14px] w-[14px] text-zinc-300 group-hover:text-zinc-500 transition-colors opacity-0 group-hover:opacity-100" />
        </div>
      </div>
    </aside>
  );
}
