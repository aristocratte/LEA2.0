/**
 * RuntimeTaskManager Tests
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuntimeTaskManager } from '../RuntimeTaskManager.js';

describe('RuntimeTaskManager', () => {
  let manager: RuntimeTaskManager;

  beforeEach(() => {
    manager = new RuntimeTaskManager(1024); // Small max size for testing
  });

  afterEach(() => {
    manager.clear();
  });

  describe('registerTask', () => {
    it('registers a new task with generated timestamp', () => {
      manager.registerTask('task-1', {
        taskId: 'task-1',
        command: 'echo test',
        agentId: 'agent-1',
        status: 'pending',
      });

      const task = manager.getTask('task-1');
      expect(task).toBeDefined();
      expect(task?.taskId).toBe('task-1');
      expect(task?.command).toBe('echo test');
      expect(task?.agentId).toBe('agent-1');
      expect(task?.status).toBe('pending');
      expect(task?.startedAt).toBeGreaterThan(0);
      expect(task?.startedAt).toBeLessThanOrEqual(Date.now());
    });

    it('initializes empty output for new task', () => {
      manager.registerTask('task-1', {
        taskId: 'task-1',
        command: 'echo test',
        status: 'pending',
      });

      const output = manager.getTaskOutput('task-1');
      expect(output).toBeDefined();
      expect(output?.output).toBe('');
      expect(output?.totalBytes).toBe(0);
    });
  });

  describe('appendOutput', () => {
    it('appends chunks to task output', () => {
      manager.registerTask('task-1', {
        taskId: 'task-1',
        command: 'echo test',
        status: 'running',
      });

      manager.appendOutput('task-1', 'hello ');
      manager.appendOutput('task-1', 'world');

      const output = manager.getTaskOutput('task-1');
      expect(output?.output).toBe('hello world');
      expect(output?.totalBytes).toBe(11);
    });

    it('truncates output when exceeding max size', () => {
      manager.registerTask('task-1', {
        taskId: 'task-1',
        command: 'cat large',
        status: 'running',
      });

      // Add output that exceeds max size
      manager.appendOutput('task-1', 'a'.repeat(500));
      manager.appendOutput('task-1', 'b'.repeat(600)); // Total would be 1100, max is 1024

      const output = manager.getTaskOutput('task-1');
      // Should be truncated to max size
      expect(output?.totalBytes).toBeLessThanOrEqual(1024);
    });

    it('preserves recent output when truncating', () => {
      manager.registerTask('task-1', {
        taskId: 'task-1',
        command: 'cat large',
        status: 'running',
      });

      // Add first chunk
      manager.appendOutput('task-1', 'old'.repeat(100));
      // Add second chunk that exceeds limit
      manager.appendOutput('task-1', 'new'.repeat(300));

      const output = manager.getTaskOutput('task-1');
      // Should contain mostly the new data
      expect(output?.output).toContain('new');
    });
  });

  describe('completeTask', () => {
    it('marks task as completed with exit code', async () => {
      manager.registerTask('task-1', {
        taskId: 'task-1',
        command: 'echo test',
        status: 'running',
      });

      const startedAt = manager.getTask('task-1')!.startedAt;

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 2));

      manager.completeTask('task-1', 0);

      const task = manager.getTask('task-1');
      expect(task?.status).toBe('completed');
      expect(task?.exitCode).toBe(0);
      expect(task?.completedAt).toBeDefined();
      expect(task?.completedAt).toBeGreaterThan(startedAt);
    });

    it('does nothing for non-existent task', () => {
      expect(() => manager.completeTask('nonexistent', 0)).not.toThrow();
    });
  });

  describe('failTask', () => {
    it('marks task as failed and appends error to output', () => {
      manager.registerTask('task-1', {
        taskId: 'task-1',
        command: 'exit 1',
        status: 'running',
      });

      manager.failTask('task-1', 'Command failed');

      const task = manager.getTask('task-1');
      expect(task?.status).toBe('failed');
      expect(task?.completedAt).toBeDefined();

      const output = manager.getTaskOutput('task-1');
      expect(output?.output).toContain('[ERROR] Command failed');
    });
  });

  describe('killTask', () => {
    it('marks task as killed and appends message', () => {
      manager.registerTask('task-1', {
        taskId: 'task-1',
        command: 'sleep 100',
        status: 'running',
      });

      manager.killTask('task-1');

      const task = manager.getTask('task-1');
      expect(task?.status).toBe('killed');

      const output = manager.getTaskOutput('task-1');
      expect(output?.output).toContain('[KILLED]');
    });
  });

  describe('getTask', () => {
    it('returns task by ID', () => {
      manager.registerTask('task-1', {
        taskId: 'task-1',
        command: 'echo test',
        status: 'pending',
      });

      const task = manager.getTask('task-1');
      expect(task).toBeDefined();
      expect(task?.taskId).toBe('task-1');
    });

    it('returns undefined for non-existent task', () => {
      expect(manager.getTask('nonexistent')).toBeUndefined();
    });
  });

  describe('getTaskOutput', () => {
    beforeEach(() => {
      manager.registerTask('task-1', {
        taskId: 'task-1',
        command: 'echo test',
        status: 'running',
      });
      manager.appendOutput('task-1', 'hello world');
    });

    it('returns output with total bytes and completion status', () => {
      const output = manager.getTaskOutput('task-1');
      expect(output?.taskId).toBe('task-1');
      expect(output?.output).toBe('hello world');
      expect(output?.totalBytes).toBe(11);
      expect(output?.isComplete).toBe(false); // Still running
    });

    it('supports offset parameter', () => {
      const output = manager.getTaskOutput('task-1', 6);
      expect(output?.output).toBe('world');
    });

    it('supports limit parameter', () => {
      const output = manager.getTaskOutput('task-1', 0, 5);
      expect(output?.output).toBe('hello');
    });

    it('supports both offset and limit', () => {
      const output = manager.getTaskOutput('task-1', 6, 3);
      expect(output?.output).toBe('wor');
    });

    it('returns undefined for non-existent task', () => {
      expect(manager.getTaskOutput('nonexistent')).toBeUndefined();
    });

    it('marks output as complete when task finishes', () => {
      manager.completeTask('task-1', 0);
      const output = manager.getTaskOutput('task-1');
      expect(output?.isComplete).toBe(true);
    });
  });

  describe('listTasks', () => {
    beforeEach(() => {
      manager.registerTask('task-1', {
        taskId: 'task-1',
        command: 'echo 1',
        agentId: 'agent-1',
        status: 'completed',
      });
      // Small delay to ensure different timestamps
      const start1 = manager.getTask('task-1')!.startedAt;

      manager.registerTask('task-2', {
        taskId: 'task-2',
        command: 'echo 2',
        agentId: 'agent-1',
        status: 'running',
      });
      const start2 = manager.getTask('task-2')!.startedAt;

      manager.registerTask('task-3', {
        taskId: 'task-3',
        command: 'echo 3',
        agentId: 'agent-2',
        status: 'pending',
      });
      const start3 = manager.getTask('task-3')!.startedAt;

      // Verify timestamps are different (or at least non-decreasing)
      expect(start3).toBeGreaterThanOrEqual(start2);
      expect(start2).toBeGreaterThanOrEqual(start1);
    });

    it('returns all tasks sorted by startedAt descending', () => {
      const tasks = manager.listTasks();
      expect(tasks).toHaveLength(3);
      // Should be sorted by startedAt descending (newest first)
      const timestamps = tasks.map(t => t.startedAt);
      expect(timestamps[0]).toBeGreaterThanOrEqual(timestamps[1]);
      expect(timestamps[1]).toBeGreaterThanOrEqual(timestamps[2]);
    });

    it('filters by agentId when provided', () => {
      const tasks = manager.listTasks('agent-1');
      expect(tasks).toHaveLength(2);
      expect(tasks.every(t => t.agentId === 'agent-1')).toBe(true);
    });

    it('returns empty array when no tasks match agentId', () => {
      const tasks = manager.listTasks('agent-nonexistent');
      expect(tasks).toEqual([]);
    });
  });

  describe('removeTask', () => {
    it('removes task and output', () => {
      manager.registerTask('task-1', {
        taskId: 'task-1',
        command: 'echo test',
        status: 'completed',
      });
      manager.appendOutput('task-1', 'output');

      expect(manager.getTask('task-1')).toBeDefined();
      expect(manager.getTaskOutput('task-1')).toBeDefined();

      manager.removeTask('task-1');

      expect(manager.getTask('task-1')).toBeUndefined();
      expect(manager.getTaskOutput('task-1')).toBeUndefined();
    });
  });

  describe('cleanupTasks', () => {
    beforeEach(() => {
      manager.registerTask('task-1', {
        taskId: 'task-1',
        command: 'echo 1',
        agentId: 'agent-1',
        status: 'completed',
      });
      manager.registerTask('task-2', {
        taskId: 'task-2',
        command: 'echo 2',
        agentId: 'agent-1',
        status: 'running',
      });
      manager.registerTask('task-3', {
        taskId: 'task-3',
        command: 'echo 3',
        agentId: 'agent-2',
        status: 'pending',
      });
    });

    it('removes all tasks for an agent', () => {
      const removed = manager.cleanupTasks('agent-1');
      expect(removed).toBe(2);
      expect(manager.getTask('task-1')).toBeUndefined();
      expect(manager.getTask('task-2')).toBeUndefined();
      expect(manager.getTask('task-3')).toBeDefined(); // Different agent
    });

    it('returns 0 when agent has no tasks', () => {
      const removed = manager.cleanupTasks('agent-nonexistent');
      expect(removed).toBe(0);
    });
  });

  describe('clear', () => {
    it('removes all tasks and outputs', () => {
      manager.registerTask('task-1', {
        taskId: 'task-1',
        command: 'echo 1',
        status: 'running',
      });
      manager.registerTask('task-2', {
        taskId: 'task-2',
        command: 'echo 2',
        status: 'running',
      });

      expect(manager.size).toBe(2);

      manager.clear();

      expect(manager.size).toBe(0);
      expect(manager.listTasks()).toEqual([]);
    });
  });

  describe('size', () => {
    it('returns the number of tasks', () => {
      expect(manager.size).toBe(0);

      manager.registerTask('task-1', {
        taskId: 'task-1',
        command: 'echo 1',
        status: 'running',
      });
      expect(manager.size).toBe(1);

      manager.registerTask('task-2', {
        taskId: 'task-2',
        command: 'echo 2',
        status: 'running',
      });
      expect(manager.size).toBe(2);

      manager.removeTask('task-1');
      expect(manager.size).toBe(1);
    });
  });
});
