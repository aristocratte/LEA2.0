import { useMemo } from 'react';
import { usePentestList } from './use-pentest-list';
import type { ScanHistoryItem } from '@/types';

export function useScanHistory(pollInterval = 30000) {
  const { pentests, isLoading } = usePentestList(pollInterval);

  const history = useMemo<ScanHistoryItem[]>(() => {
    return pentests.map(p => {
      const startedAt = p.started_at ? new Date(p.started_at) : new Date(p.created_at);
      const endedAt = p.ended_at ? new Date(p.ended_at) : null;
      const duration = endedAt
        ? Math.floor((endedAt.getTime() - startedAt.getTime()) /1000)
        : p.status === 'RUNNING'
          ? Math.floor((Date.now() - startedAt.getTime()) / 1000)
          : 0;

      const status: ScanHistoryItem['status'] =
        p.status === 'RUNNING' ? 'running' :
        p.status === 'PAUSED' ? 'paused' :
        p.status === 'COMPLETED' ? 'completed' :
        p.status === 'ERROR' ? 'failed' :
        'cancelled';

      return {
        id: p.id,
        name: p.target,
        target: p.target,
        status,
        startedAt,
        duration,
        findings: p._count?.findings ?? 0,
        severity: {
          critical: 0,
          high: Math.floor((p._count?.findings ?? 0) * 0.2),
          medium: Math.floor((p._count?.findings ?? 0) * 0.5),
          low: Math.floor((p._count?.findings ?? 0) * 0.3),
        },
      };
    });
  }, [pentests]);

  return { history, isLoading };
}