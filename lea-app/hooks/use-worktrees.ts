/**
 * useWorktrees Hook
 *
 * Polls the worktree API every 10 seconds to keep worktree state fresh.
 * Handles loading, error, and retry states.
 *
 * This is the SINGLE SOURCE OF TRUTH for worktree data in the frontend.
 * All components should use this hook instead of calling worktreesApi directly.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  worktreesApi,
  type WorktreeInfo,
  type WorktreeSession,
  type ActiveWorktree,
} from '@/lib/worktrees-api';

interface UseWorktreesOptions {
  /** Agent ID to track active worktree for. */
  agentId?: string;
  /**
   * Polling interval in milliseconds (default: 10000)
   */
  interval?: number;
  /**
   * Whether to enable polling (default: true)
   */
  enabled?: boolean;
}

export function useWorktrees(options: UseWorktreesOptions = {}) {
  const { interval = 10000, enabled = true, agentId } = options;

  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [activeWorktree, setActiveWorktree] = useState<ActiveWorktree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use ref to track if component is mounted
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const list = await worktreesApi.list();

      // Determine active worktree from the real source of truth:
      // - If agentId is provided, use backend's agent-scoped active endpoint
      // - If no agentId (session-level), use backend's session-level active endpoint
      let active: ActiveWorktree | null = null;
      if (agentId) {
        active = await worktreesApi.getActive(agentId);
      } else {
        active = await worktreesApi.getSessionActive();
      }

      if (mountedRef.current) {
        setWorktrees(list);
        setActiveWorktree(active);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch worktrees';
        setError(msg);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [agentId]);

  // Initial fetch and polling
  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    refresh();

    // Set up polling
    const intervalId = setInterval(refresh, interval);

    // Cleanup
    return () => {
      mountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [enabled, interval, refresh]);

  // Create (enter) a worktree — activates at session level by default
  const enterWorktree = useCallback(
    async (opts?: { slug?: string; agentId?: string }): Promise<WorktreeSession | null> => {
      try {
        const session = await worktreesApi.create({
          ...opts,
          activate: !opts?.agentId, // activate at session level when no agentId
        });
        await refresh();
        return session;
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to enter worktree');
        }
        return null;
      }
    },
    [refresh],
  );

  // Remove (exit) a worktree — deactivates session + removes
  const exitWorktree = useCallback(
    async (
      slug: string,
      opts?: { force?: boolean; removeBranch?: boolean },
    ): Promise<boolean> => {
      try {
        await worktreesApi.deactivateSession();
        await worktreesApi.remove(slug, opts);
        await refresh();
        return true;
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to exit worktree');
        }
        return false;
      }
    },
    [refresh],
  );

  return {
    worktrees,
    activeWorktree,
    loading,
    error,
    refresh,
    enterWorktree,
    exitWorktree,
  };
}
