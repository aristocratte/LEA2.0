// @vitest-environment jsdom
/**
 * useTasks Hook Tests
 *
 * Tests for the useTasks hook covering:
 * - Fetches tasks on mount (when enabled)
 * - Does not fetch when disabled
 * - Returns loading=true initially
 * - Returns error on fetch failure
 * - Clears error on successful retry
 * - createTask calls API and refreshes
 * - updateTask calls API and refreshes
 * - deleteTask calls API and refreshes
 * - claimTask calls API and refreshes
 * - selectTask loads task detail via getTask
 * - selectTask(null) clears selected task
 * - Returns correct state structure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTasks } from '../use-tasks';
import { tasksApi, type Task, type TaskScope } from '@/lib/tasks-api';

// Mock the tasks-api module
vi.mock('@/lib/tasks-api', () => ({
  tasksApi: {
    createTask: vi.fn(),
    listTasks: vi.fn(),
    getTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    blockTask: vi.fn(),
    claimTask: vi.fn(),
  },
}));

const defaultScope: TaskScope = { pentestId: 'pentest-1' };

const mockTasks: Task[] = [
  {
    id: 'task-1',
    subject: 'Scan target ports',
    description: 'Full port scan of the target',
    status: 'PENDING',
    owner: null,
    activeForm: null,
    priority: 1,
    output: null,
    metadata: null,
    blocks: [],
    blockedBy: [],
    pentestId: 'pentest-1',
    teamId: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'task-2',
    subject: 'Enumerate web services',
    description: null,
    status: 'IN_PROGRESS',
    owner: 'agent-1',
    activeForm: 'Running nikto scan',
    priority: 0,
    output: null,
    metadata: null,
    blocks: ['task-3'],
    blockedBy: [],
    pentestId: 'pentest-1',
    teamId: null,
    createdAt: '2025-01-01T00:01:00Z',
    updatedAt: '2025-01-01T00:02:00Z',
  },
];

describe('useTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Fetch', () => {
    it('fetches tasks on mount when enabled', async () => {
      vi.mocked(tasksApi.listTasks).mockResolvedValue(mockTasks);

      const { result } = await act(async () => {
        return renderHook(() => useTasks(defaultScope, { enabled: true }));
      });

      await waitFor(() => {
        expect(tasksApi.listTasks).toHaveBeenCalledWith(defaultScope);
      });
      await waitFor(() => {
        expect(result.current.tasks).toEqual(mockTasks);
        expect(result.current.loading).toBe(false);
      });
    });

    it('does not fetch when enabled=false', async () => {
      vi.mocked(tasksApi.listTasks).mockResolvedValue(mockTasks);

      const { result } = await act(async () => {
        return renderHook(() => useTasks(defaultScope, { enabled: false }));
      });

      expect(tasksApi.listTasks).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(true);
      expect(result.current.tasks).toEqual([]);
    });

    it('returns loading=true initially', async () => {
      vi.mocked(tasksApi.listTasks).mockResolvedValue(mockTasks);

      const { result } = await act(async () => {
        return renderHook(() => useTasks(defaultScope, { enabled: false }));
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('returns error on fetch failure', async () => {
      vi.mocked(tasksApi.listTasks).mockRejectedValue(new Error('Network error'));

      const { result } = await act(async () => {
        return renderHook(() => useTasks(defaultScope, { enabled: false }));
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
      vi.mocked(tasksApi.listTasks)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockTasks);

      const { result } = await act(async () => {
        return renderHook(() => useTasks(defaultScope, { enabled: false }));
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

  describe('createTask', () => {
    it('calls tasksApi.createTask and refreshes', async () => {
      const newTask: Task = {
        id: 'task-new',
        subject: 'New task',
        description: null,
        status: 'PENDING',
        owner: null,
        activeForm: null,
        priority: 0,
        output: null,
        metadata: null,
        blocks: [],
        blockedBy: [],
        pentestId: 'pentest-1',
        teamId: null,
        createdAt: '2025-01-02T00:00:00Z',
        updatedAt: '2025-01-02T00:00:00Z',
      };

      vi.mocked(tasksApi.listTasks).mockResolvedValue(mockTasks);
      vi.mocked(tasksApi.createTask).mockResolvedValue(newTask);

      const { result } = await act(async () => {
        return renderHook(() => useTasks(defaultScope, { enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });
      await waitFor(() => {
        expect(result.current.tasks).toEqual(mockTasks);
      });

      const params = { subject: 'New task', pentestId: 'pentest-1' };
      await act(async () => {
        await result.current.createTask(params);
      });

      expect(tasksApi.createTask).toHaveBeenCalledWith(params);
      // listTasks called once for initial refresh, once after create
      expect(tasksApi.listTasks).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateTask', () => {
    it('calls tasksApi.updateTask and refreshes', async () => {
      vi.mocked(tasksApi.listTasks).mockResolvedValue(mockTasks);
      vi.mocked(tasksApi.updateTask).mockResolvedValue({
        ...mockTasks[0],
        status: 'IN_PROGRESS',
      });

      const { result } = await act(async () => {
        return renderHook(() => useTasks(defaultScope, { enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.updateTask('task-1', { status: 'IN_PROGRESS' });
      });

      expect(tasksApi.updateTask).toHaveBeenCalledWith(defaultScope, 'task-1', { status: 'IN_PROGRESS' });
      expect(tasksApi.listTasks).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteTask', () => {
    it('calls tasksApi.deleteTask and refreshes', async () => {
      vi.mocked(tasksApi.listTasks).mockResolvedValue(mockTasks);
      vi.mocked(tasksApi.deleteTask).mockResolvedValue({ message: 'Task deleted' });

      const { result } = await act(async () => {
        return renderHook(() => useTasks(defaultScope, { enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.deleteTask('task-1');
      });

      expect(tasksApi.deleteTask).toHaveBeenCalledWith(defaultScope, 'task-1');
      expect(tasksApi.listTasks).toHaveBeenCalledTimes(2);
    });
  });

  describe('claimTask', () => {
    it('calls tasksApi.claimTask and refreshes', async () => {
      vi.mocked(tasksApi.listTasks).mockResolvedValue(mockTasks);
      vi.mocked(tasksApi.claimTask).mockResolvedValue({
        success: true,
        status: 'IN_PROGRESS',
        task: { ...mockTasks[0], owner: 'agent-1', status: 'IN_PROGRESS' },
        message: 'Task claimed',
      });

      const { result } = await act(async () => {
        return renderHook(() => useTasks(defaultScope, { enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.claimTask('task-1', 'agent-1');
      });

      expect(tasksApi.claimTask).toHaveBeenCalledWith(defaultScope, 'task-1', 'agent-1');
      expect(tasksApi.listTasks).toHaveBeenCalledTimes(2);
    });
  });

  describe('selectTask', () => {
    it('loads task detail via getTask', async () => {
      const detailTask: Task = {
        ...mockTasks[0],
        description: 'Detailed description of the task',
        output: 'scan results here',
      };

      vi.mocked(tasksApi.listTasks).mockResolvedValue(mockTasks);
      vi.mocked(tasksApi.getTask).mockResolvedValue(detailTask);

      const { result } = await act(async () => {
        return renderHook(() => useTasks(defaultScope, { enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.selectTask('task-1');
      });

      expect(tasksApi.getTask).toHaveBeenCalledWith(defaultScope, 'task-1');
      await waitFor(() => {
        expect(result.current.selectedTask).toEqual(detailTask);
        expect(result.current.taskLoading).toBe(false);
      });
    });

    it('sets selectedTask to null when called with null', async () => {
      vi.mocked(tasksApi.listTasks).mockResolvedValue(mockTasks);

      const { result } = await act(async () => {
        return renderHook(() => useTasks(defaultScope, { enabled: false }));
      });

      await act(async () => {
        await result.current.selectTask(null);
      });

      await waitFor(() => {
        expect(result.current.selectedTask).toBeNull();
      });
    });

    it('sets error when getTask fails', async () => {
      vi.mocked(tasksApi.listTasks).mockResolvedValue(mockTasks);
      vi.mocked(tasksApi.getTask).mockRejectedValue(new Error('Not found'));

      const { result } = await act(async () => {
        return renderHook(() => useTasks(defaultScope, { enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.selectTask('task-999');
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Not found');
        expect(result.current.selectedTask).toBeNull();
        expect(result.current.taskLoading).toBe(false);
      });
    });
  });

  describe('Return Values', () => {
    it('returns correct state structure', async () => {
      vi.mocked(tasksApi.listTasks).mockResolvedValue(mockTasks);

      const { result } = await act(async () => {
        return renderHook(() => useTasks(defaultScope, { enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current).toHaveProperty('tasks');
        expect(result.current).toHaveProperty('loading');
        expect(result.current).toHaveProperty('error');
        expect(result.current).toHaveProperty('refresh');
        expect(result.current).toHaveProperty('selectedTask');
        expect(result.current).toHaveProperty('selectTask');
        expect(result.current).toHaveProperty('taskLoading');
        expect(result.current).toHaveProperty('createTask');
        expect(result.current).toHaveProperty('updateTask');
        expect(result.current).toHaveProperty('deleteTask');
        expect(result.current).toHaveProperty('claimTask');
        expect(result.current).toHaveProperty('blockTask');
      });
    });
  });
});
