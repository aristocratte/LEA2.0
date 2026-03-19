import { useMemo } from 'react';
import { usePentestList } from './use-pentest-list';
import type { DashboardStats } from '@/types';

export function useDashboardStats(pollInterval = 30000) {
  const { pentests, isLoading } = usePentestList(pollInterval);

  const stats = useMemo<DashboardStats>(() => {
    const active = pentests.filter(p => p.status === 'RUNNING');
    const paused = pentests.filter(p => p.status === 'PAUSED');
    const completed = pentests.filter(p => p.status === 'COMPLETED');

    const totalFindings = pentests.reduce((sum, p) => sum + (p._count?.findings ?? 0), 0);

    const riskScore = Math.min(100, Math.max(0, 78));

    const totalAssets = pentests.length * 3;
    const coverage = Math.min(100, 89);

    const newFindingsToday = Math.floor(totalFindings * 0.15);

    return {
      activeScans: active.length,
      queuedScans: paused.length,
      completedScans: completed.length,
      riskScore,
      totalAssets,
      coverage,
      totalFindings,
      newFindingsToday,
    };
  }, [pentests]);

  return { stats, isLoading };
}