/**
 * useRuntimeTasks Hook
 *
 * Polls the runtime tasks API every 5 seconds to keep the task list fresh.
 * Handles loading, error, and retry states.
 *
 * This is the SINGLE SOURCE OF TRUTH for runtime task data in the frontend.
 * All components should use this hook instead of calling runtimeTasksApi directly.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  runtimeTasksApi,
  type RuntimeTaskInfo,
  type RuntimeTaskOutput,
  type RuntimeTaskStatus,
} from '@/lib/runtime-tasks-api';

interface UseRuntimeTasksOptions {
  /**
   * Optional agent ID to filter tasks
   */
  agentId?: string;
  /**
   * Polling interval in milliseconds (default: 5000)
   */
  pollInterval?: number;
  /**
   * Whether to enable polling (default: true)
   */
  enabled?: boolean;
}

export function useRuntimeTasks(options: UseRuntimeTasksOptions = {}) {
  const { agentId, pollInterval = 5000, enabled = true } = options;

  const [tasks, setTasks] = useState<RuntimeTaskInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use ref to track if component is mounted
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const data = await runtimeTasksApi.listRuntimeTasks(agentId);
      if (mountedRef.current) {
        setTasks(data);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch runtime tasks';
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
    const intervalId = setInterval(refresh, pollInterval);

    // Cleanup
    return () => {
      mountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [enabled, pollInterval, refresh]);

  // Get task output
  const getOutput = useCallback(async (
    taskId: string,
    offset?: number,
    limit?: number
  ): Promise<RuntimeTaskOutput> => {
    return await runtimeTasksApi.getRuntimeTaskOutput(taskId, offset, limit);
  }, []);

  // Get task status helper
  const getTaskStatus = useCallback((taskId: string): RuntimeTaskStatus | undefined => {
    return tasks.find(t => t.taskId === taskId)?.status;
  }, [tasks]);

  return {
    tasks,
    loading,
    error,
    refresh,
    getOutput,
    getTaskStatus,
  };
}
