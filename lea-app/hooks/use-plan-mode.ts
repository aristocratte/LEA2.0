/**
 * usePlanMode Hook
 *
 * Polls the plan mode API every 5 seconds to keep agent plan mode state fresh.
 * Handles loading, error, and retry states.
 *
 * This is the SINGLE SOURCE OF TRUTH for plan mode data in the frontend.
 * All components should use this hook instead of calling planModeApi directly.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  planModeApi,
  type PlanModeState,
} from '@/lib/plan-mode-api';

interface UsePlanModeOptions {
  /**
   * Specific agent ID to track (optional)
   */
  agentId?: string;
  /**
   * Polling interval in milliseconds (default: 5000)
   */
  interval?: number;
  /**
   * Whether to enable polling (default: true)
   */
  enabled?: boolean;
}

export function usePlanMode(options: UsePlanModeOptions = {}) {
  const { agentId, interval = 5000, enabled = true } = options;

  const [agentsInPlanMode, setAgentsInPlanMode] = useState<PlanModeState[]>([]);
  const [currentAgentState, setCurrentAgentState] = useState<PlanModeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use ref to track if component is mounted
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const agents = await planModeApi.listAgents();
      if (mountedRef.current) {
        setAgentsInPlanMode(agents);
        setError(null);
      }

      // Also fetch current agent if specified
      if (agentId) {
        const state = await planModeApi.getState(agentId);
        if (mountedRef.current) {
          setCurrentAgentState(state);
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch plan mode state';
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

  // Enter plan mode action
  const enterPlanMode = useCallback(async (targetAgentId?: string, reason?: string) => {
    const id = targetAgentId ?? agentId;
    if (!id) return;
    try {
      await planModeApi.enter(id, reason);
      await refresh();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to enter plan mode');
      }
    }
  }, [agentId, refresh]);

  // Exit plan mode action
  const exitPlanMode = useCallback(async (targetAgentId?: string, reason?: string) => {
    const id = targetAgentId ?? agentId;
    if (!id) return;
    try {
      await planModeApi.exit(id, reason);
      await refresh();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to exit plan mode');
      }
    }
  }, [agentId, refresh]);

  // Derived: whether the current agent is in plan mode
  const isInPlanMode = currentAgentState?.mode === 'plan';
  const planModeAgentsCount = agentsInPlanMode.length;

  return {
    agentsInPlanMode,
    currentAgentState,
    isInPlanMode,
    planModeAgentsCount,
    loading,
    error,
    refresh,
    enterPlanMode,
    exitPlanMode,
  };
}
