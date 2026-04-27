/**
 * useTasks Hook
 *
 * Polls the tasks API every 10 seconds to keep the task list fresh.
 * Handles loading, error, and retry states.
 *
 * This is the SINGLE SOURCE OF TRUTH for task data in the frontend.
 * All components should use this hook instead of calling tasksApi directly.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  tasksApi,
  type Task,
  type TaskScope,
  type CreateTaskParams,
  type UpdateTaskParams,
} from '@/lib/tasks-api';

interface UseTasksOptions {
  /**
   * Polling interval in milliseconds (default: 10000)
   */
  interval?: number;
  /**
   * Whether to enable polling (default: true)
   */
  enabled?: boolean;
}

export function useTasks(scope: TaskScope, options: UseTasksOptions = {}) {
  const { interval = 10000, enabled = true } = options;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);

  // Use ref to track if component is mounted
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const data = await tasksApi.listTasks(scope);
      if (mountedRef.current) {
        setTasks(data);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch tasks';
        setError(msg);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [scope]);

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

  // Create task action
  const createTask = useCallback(async (params: CreateTaskParams) => {
    const result = await tasksApi.createTask(params);
    // Refresh after creating
    await refresh();
    return result;
  }, [refresh]);

  // Update task action
  const updateTask = useCallback(async (taskId: string, params: UpdateTaskParams) => {
    const result = await tasksApi.updateTask(scope, taskId, params);
    // Refresh after updating
    await refresh();
    return result;
  }, [scope, refresh]);

  // Delete task action
  const deleteTask = useCallback(async (taskId: string) => {
    await tasksApi.deleteTask(scope, taskId);
    // Refresh after deleting
    await refresh();
  }, [scope, refresh]);

  // Claim task action
  const claimTask = useCallback(async (taskId: string, agentId: string) => {
    const result = await tasksApi.claimTask(scope, taskId, agentId);
    // Refresh after claiming
    await refresh();
    return result;
  }, [scope, refresh]);

  // Block task action
  const blockTask = useCallback(async (taskId: string, targetTaskId: string) => {
    const result = await tasksApi.blockTask(scope, taskId, targetTaskId);
    // Refresh after blocking
    await refresh();
    return result;
  }, [scope, refresh]);

  // Select task to view details
  const selectTask = useCallback(async (taskId: string | null) => {
    if (!taskId) {
      setSelectedTask(null);
      return;
    }
    setTaskLoading(true);
    try {
      const task = await tasksApi.getTask(scope, taskId);
      setSelectedTask(task);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load task details';
      setError(msg);
      setSelectedTask(null);
    } finally {
      setTaskLoading(false);
    }
  }, [scope]);

  return {
    tasks,
    loading,
    error,
    refresh,
    selectedTask,
    selectTask,
    taskLoading,
    createTask,
    updateTask,
    deleteTask,
    claimTask,
    blockTask,
  };
}
