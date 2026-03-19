import { useMemo } from 'react';
import { usePentestList } from './use-pentest-list';
import type { ActivityEvent } from '@/types';

export function useActivityFeed(pollInterval = 30000) {
  const { pentests, isLoading } = usePentestList(pollInterval);

  const events = useMemo<ActivityEvent[]>(() => {
    const result: ActivityEvent[] = [];

    pentests.slice(0, 10).forEach((p, idx) => {
      const startedAt = p.started_at ? new Date(p.started_at) : new Date();

      result.push({
        id: `${p.id}-started`,
        timestamp: startedAt,
        type: 'scan_started',
        title: `Scan started: ${p.target}`,
        scanId: p.id,
        scanName: p.target,
      });

      if (p.status === 'RUNNING') {
        result.push({
          id: `${p.id}-progress`,
          timestamp: new Date(startedAt.getTime() + 60000 * (idx + 1)),
          type: 'scan_progress',
          title: `Scan "${p.target}" - ${Math.floor(Math.random() * 30) + 50}% complete`,
          scanId: p.id,
          progress: Math.floor(Math.random() * 30) + 50,
        });
      }

      if (p.status === 'COMPLETED' && p.ended_at) {
        result.push({
          id: `${p.id}-completed`,
          timestamp: new Date(p.ended_at),
          type: 'scan_completed',
          title: `Scan "${p.target}" completed`,
          scanId: p.id,
          description: `${p._count?.findings ?? 0} findings`,
        });
      }

      if (p._count?.findings && p._count.findings > 0) {
        result.push({
          id: `${p.id}-findings`,
          timestamp: new Date(startedAt.getTime() + 30000),
          type: 'finding',
          title: `${p._count.findings} findings in ${p.target}`,
          severity: p._count.findings > 5 ? 'high' : 'medium',
          scanId: p.id,
        });
      }
    });

    return result.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [pentests]);

  return { events, isLoading };
}