'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { statsApi, type GlobalStats, type SessionStats } from '@/lib/stats-api';

interface UseSessionStatsReturn {
  global: GlobalStats | null;
  session: SessionStats | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Hook to poll session stats from the backend.
 *
 * Fetches both global stats and session-specific stats at a configurable interval.
 * Gracefully handles backend unavailability — returns null stats with no error spam.
 *
 * @param sessionId - Optional session ID for per-session stats
 * @param pollIntervalMs - Polling interval in ms (default 15s)
 */
export function useSessionStats(
  sessionId?: string,
  pollIntervalMs = 15_000,
): UseSessionStatsReturn {
  const [global, setGlobal] = useState<GlobalStats | null>(null);
  const [session, setSession] = useState<SessionStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track mounted state
  const mountedRef = useRef(true);
  const hasLoadedOnceRef = useRef(false);
  const requestIdRef = useRef(0);

  const fetchStats = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const [globalData, sessionData] = await Promise.all([
        statsApi.getGlobal(),
        sessionId ? statsApi.getSession(sessionId) : Promise.resolve(null),
      ]);

      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      setGlobal(globalData);
      setSession(sessionData);
      setError(null);
      hasLoadedOnceRef.current = true;
    } catch (err: unknown) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      // Only set error on first failure, don't spam
      if (!hasLoadedOnceRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch stats');
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [sessionId]);

  // Initial fetch + polling
  useEffect(() => {
    mountedRef.current = true;
    hasLoadedOnceRef.current = false;
    setIsLoading(true);
    fetchStats();

    const interval = setInterval(fetchStats, pollIntervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchStats, pollIntervalMs]);

  return {
    global,
    session,
    isLoading,
    error,
    refresh: fetchStats,
  };
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

export function formatCost(usd: number): string {
  if (usd < 0.001) return '<$0.001';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1_000) return `${tokens}`;
  if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}
