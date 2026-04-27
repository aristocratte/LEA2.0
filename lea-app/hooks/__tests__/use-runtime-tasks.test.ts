// @vitest-environment jsdom
/**
 * useRuntimeTasks Hook Tests
 *
 * Tests for the useRuntimeTasks hook covering:
 * - Fetches tasks on mount (when enabled)
 * - Does not fetch when disabled
 * - Returns loading=true initially
 * - Returns error on fetch failure
 * - Clears error on successful retry
 * - refresh works
 * - getOutput calls API
 * - getTaskStatus returns correct status
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useRuntimeTasks } from '../use-runtime-tasks';
import { runtimeTasksApi, type RuntimeTaskInfo } from '@/lib/runtime-tasks-api';

// Mock the runtime-tasks-api module
vi.mock('@/lib/runtime-tasks-api', () => ({
  runtimeTasksApi: {
    listRuntimeTasks: vi.fn(),
    getRuntimeTask: vi.fn(),
    getRuntimeTaskOutput: vi.fn(),
  },
}));

const mockTasks: RuntimeTaskInfo[] = [
  {
    taskId: 'task-1',
    command: 'nmap -sV target.com',
    agentId: 'agent-1',
    status: 'running',
    startedAt: Date.now() - 5000,
    completedAt: undefined,
  },
  {
    taskId: 'task-2',
    command: 'nikto -h http://target.com',
    agentId: 'agent-2',
    status: 'completed',
    exitCode: 0,
    startedAt: Date.now() - 60000,
    completedAt: Date.now() - 30000,
  },
  {
    taskId: 'task-3',
    command: 'exit 1',
    agentId: 'agent-1',
    status: 'failed',
    exitCode: 1,
    startedAt: Date.now() - 10000,
    completedAt: Date.now() - 5000,
  },
];

describe('useRuntimeTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Fetch', () => {
    it('fetches tasks on mount when enabled', async () => {
      vi.mocked(runtimeTasksApi.listRuntimeTasks).mockResolvedValue(mockTasks);

      const { result } = await act(async () => {
        return renderHook(() => useRuntimeTasks({ enabled: true }));
      });

      await waitFor(() => {
        expect(runtimeTasksApi.listRuntimeTasks).toHaveBeenCalledWith(undefined);
      });
      await waitFor(() => {
        expect(result.current.tasks).toEqual(mockTasks);
        expect(result.current.loading).toBe(false);
      });
    });

    it('fetches tasks with agentId filter', async () => {
      vi.mocked(runtimeTasksApi.listRuntimeTasks).mockResolvedValue(mockTasks);

      await act(async () => {
        renderHook(() => useRuntimeTasks({ agentId: 'agent-1', enabled: true }));
      });

      await waitFor(() => {
        expect(runtimeTasksApi.listRuntimeTasks).toHaveBeenCalledWith('agent-1');
      });
    });

    it('does not fetch when enabled=false', async () => {
      vi.mocked(runtimeTasksApi.listRuntimeTasks).mockResolvedValue(mockTasks);

      const { result } = await act(async () => {
        return renderHook(() => useRuntimeTasks({ enabled: false }));
      });

      expect(runtimeTasksApi.listRuntimeTasks).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(true);
      expect(result.current.tasks).toEqual([]);
    });

    it('returns loading=true initially', async () => {
      vi.mocked(runtimeTasksApi.listRuntimeTasks).mockResolvedValue(mockTasks);

      const { result } = await act(async () => {
        return renderHook(() => useRuntimeTasks({ enabled: false }));
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('returns error on fetch failure', async () => {
      vi.mocked(runtimeTasksApi.listRuntimeTasks).mockRejectedValue(new Error('Network error'));

      const { result } = await act(async () => {
        return renderHook(() => useRuntimeTasks({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
        expect(result.current.loading).toBe(false);
        expect(result.current.tasks).toEqual([]);
      });
    });

    it('clears error on successful retry', async () => {
      vi.mocked(runtimeTasksApi.listRuntimeTasks)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockTasks);

      const { result } = await act(async () => {
        return renderHook(() => useRuntimeTasks({ enabled: false }));
      });

      // First call -> error
      await act(async () => {
        await result.current.refresh();
      });
      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
      });

      // Retry -> success
      await act(async () => {
        await result.current.refresh();
      });
      await waitFor(() => {
        expect(result.current.error).toBeNull();
        expect(result.current.tasks).toEqual(mockTasks);
      });
    });
  });

  describe('refresh', () => {
    it('calls listRuntimeTasks and updates state', async () => {
      vi.mocked(runtimeTasksApi.listRuntimeTasks).mockResolvedValue(mockTasks);

      const { result } = await act(async () => {
        return renderHook(() => useRuntimeTasks({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.tasks).toEqual(mockTasks);
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeNull();
      });
    });
  });

  describe('getOutput', () => {
    it('calls getRuntimeTaskOutput with correct parameters', async () => {
      const mockOutput = {
        taskId: 'task-1',
        output: 'scan results here',
        totalBytes: 100,
        isComplete: true,
      };

      vi.mocked(runtimeTasksApi.getRuntimeTaskOutput).mockResolvedValue(mockOutput);

      const { result } = await act(async () => {
        return renderHook(() => useRuntimeTasks({ enabled: false }));
      });

      let output;
      await act(async () => {
        output = await result.current.getOutput('task-1', 0, 1000);
      });

      expect(runtimeTasksApi.getRuntimeTaskOutput).toHaveBeenCalledWith('task-1', 0, 1000);
      expect(output).toEqual(mockOutput);
    });

    it('calls getRuntimeTaskOutput without optional parameters', async () => {
      const mockOutput = {
        taskId: 'task-1',
        output: 'scan results',
        totalBytes: 50,
        isComplete: true,
      };

      vi.mocked(runtimeTasksApi.getRuntimeTaskOutput).mockResolvedValue(mockOutput);

      const { result } = await act(async () => {
        return renderHook(() => useRuntimeTasks({ enabled: false }));
      });

      await act(async () => {
        await result.current.getOutput('task-1');
      });

      expect(runtimeTasksApi.getRuntimeTaskOutput).toHaveBeenCalledWith('task-1', undefined, undefined);
    });
  });

  describe('getTaskStatus', () => {
    it('returns correct status for existing task', async () => {
      vi.mocked(runtimeTasksApi.listRuntimeTasks).mockResolvedValue(mockTasks);

      const { result } = await act(async () => {
        return renderHook(() => useRuntimeTasks({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.getTaskStatus('task-1')).toBe('running');
        expect(result.current.getTaskStatus('task-2')).toBe('completed');
        expect(result.current.getTaskStatus('task-3')).toBe('failed');
      });
    });

    it('returns undefined for non-existing task', async () => {
      vi.mocked(runtimeTasksApi.listRuntimeTasks).mockResolvedValue(mockTasks);

      const { result } = await act(async () => {
        return renderHook(() => useRuntimeTasks({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.getTaskStatus('non-existent')).toBeUndefined();
      });
    });
  });

  describe('Polling', () => {
    it('polls at the specified interval', async () => {
      vi.mocked(runtimeTasksApi.listRuntimeTasks).mockResolvedValue(mockTasks);

      const { unmount } = await act(async () => {
        return renderHook(() => useRuntimeTasks({ pollInterval: 100, enabled: true }));
      });

      // Initial call
      await waitFor(() => {
        expect(runtimeTasksApi.listRuntimeTasks).toHaveBeenCalled();
      });

      // Wait for at least one more poll (should be called at least twice)
      await waitFor(() => {
        expect(vi.mocked(runtimeTasksApi.listRuntimeTasks).mock.calls.length).toBeGreaterThanOrEqual(2);
      }, { timeout: 500 });

      // Cleanup to stop polling
      unmount();
    });

    it('uses default poll interval of 5000ms', async () => {
      vi.mocked(runtimeTasksApi.listRuntimeTasks).mockResolvedValue(mockTasks);

      const { unmount } = await act(async () => {
        return renderHook(() => useRuntimeTasks({ enabled: true }));
      });

      // Initial call should happen
      await waitFor(() => {
        expect(runtimeTasksApi.listRuntimeTasks).toHaveBeenCalled();
      });

      // Cleanup to stop polling
      unmount();
    });
  });

  describe('Return Values', () => {
    it('returns correct state structure', async () => {
      vi.mocked(runtimeTasksApi.listRuntimeTasks).mockResolvedValue(mockTasks);

      const { result } = await act(async () => {
        return renderHook(() => useRuntimeTasks({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current).toHaveProperty('tasks');
        expect(result.current).toHaveProperty('loading');
        expect(result.current).toHaveProperty('error');
        expect(result.current).toHaveProperty('refresh');
        expect(result.current).toHaveProperty('getOutput');
        expect(result.current).toHaveProperty('getTaskStatus');
      });
    });
  });
});
