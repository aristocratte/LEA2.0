'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { requestJson } from '@/lib/api';

// ============================================================================
// TYPES
// ============================================================================

export interface AwayHighlight {
  kind: 'finding' | 'memory' | 'agent' | 'task' | 'error';
  text: string;
  detail?: string;
}

export interface AwaySummary {
  hasActivity: boolean;
  headline: string;
  highlights: AwayHighlight[];
  stats: {
    agentsActive: number;
    agentsCompleted: number;
    findingsNew: number;
    memoriesExtracted: number;
    tasksCompleted: number;
    errorsCount: number;
  };
  period: {
    since: string;
    until: string;
  };
}

interface UseAwaySummaryReturn {
  summary: AwaySummary | null;
  isLoading: boolean;
  dismissed: boolean;
  dismiss: () => void;
}

// ============================================================================
// LOCAL STORAGE — visitedAt tracking
// ============================================================================

const VISITED_AT_KEY = (pentestId: string) => `lea:visitedAt:${pentestId}`;

function getVisitedAt(pentestId: string): string | null {
  try {
    return localStorage.getItem(VISITED_AT_KEY(pentestId));
  } catch {
    return null;
  }
}

function setVisitedAt(pentestId: string): void {
  try {
    localStorage.setItem(VISITED_AT_KEY(pentestId), new Date().toISOString());
  } catch {
    // Storage full or unavailable — non-critical
  }
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Fetches "while you were away" summary for a pentest session.
 *
 * - Reads `visitedAt` from localStorage to determine `since` timestamp
 * - Fetches once on mount (not polling — this is a one-shot recap)
 * - Updates `visitedAt` after successful fetch so next visit gets fresh window
 * - Returns null summary when no activity or on error
 */
export function useAwaySummary(pentestId: string | null): UseAwaySummaryReturn {
  const [summary, setSummary] = useState<AwaySummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const fetchedRef = useRef(false);

  const fetchSummary = useCallback(async () => {
    if (!pentestId || fetchedRef.current) return;

    fetchedRef.current = true;
    setIsLoading(true);

    try {
      const since = getVisitedAt(pentestId);
      const query: Record<string, string> = {};
      if (since) query.since = since;

      const payload = await requestJson<{ data: AwaySummary | null; error?: string }>(
        `/api/pentests/${encodeURIComponent(pentestId)}/away-summary`,
        { query },
      );

      if (!payload || !payload.data) {
        setSummary(null);
      } else {
        setSummary(payload.data);
      }

      // Mark visit time for next recap window
      setVisitedAt(pentestId);
    } catch {
      // Backend unavailable or error — silently no-op
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  }, [pentestId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return {
    summary,
    isLoading,
    dismissed,
    dismiss: useCallback(() => setDismissed(true), []),
  };
}
