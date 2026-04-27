/**
 * PersistentTaskManager Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PersistentTaskManager, PersistentTaskManagerError } from '../PersistentTaskManager.js';

// Mock Prisma
const {
  prismaMock,
  taskCreateMock,
  taskFindFirstMock,
  taskFindManyMock,
  taskUpdateMock,
  taskUpdateManyMock,
} = vi.hoisted(() => {
  const taskCreateMock = vi.fn();
  const taskFindFirstMock = vi.fn();
  const taskFindManyMock = vi.fn();
  const taskUpdateMock = vi.fn();
  const taskUpdateManyMock = vi.fn();

  const prismaMock = {
    task: {
      create: taskCreateMock,
      findFirst: taskFindFirstMock,
      findMany: taskFindManyMock,
      update: taskUpdateMock,
      updateMany: taskUpdateManyMock,
    },
  };

  return {
    prismaMock,
    taskCreateMock,
    taskFindFirstMock,
    taskFindManyMock,
    taskUpdateMock,
    taskUpdateManyMock,
  };
});

vi.mock('@prisma/client', () => ({
  Prisma: {
    prisma: prismaMock,
  },
}));

describe('PersistentTaskManager', () => {
  let manager: PersistentTaskManager;

  beforeEach(() => {
    manager = new PersistentTaskManager({ prisma: prismaMock as any });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockPrismaTask = (overrides = {}) => ({
    id: 'task-1',
    subject: 'Test task',
    description: 'Test description',
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
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  });

  describe('createTask', () => {
    it('creates task with pentestId scope successfully', async () => {
      const taskData = mockPrismaTask();
      taskCreateMock.mockResolvedValue(taskData);

      const result = await manager.createTask({
        subject: 'Test task',
        description: 'Test description',
        pentestId: 'pentest-1',
      });

      expect(result).toEqual({
        id: 'task-1',
        subject: 'Test task',
        description: 'Test description',
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
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });

      expect(taskCreateMock).toHaveBeenCalledWith({
        data: {
          subject: 'Test task',
          description: 'Test description',
          status: 'PENDING',
          owner: undefined,
          activeForm: undefined,
          priority: 0,
          output: undefined,
          metadata: undefined,
          blocks: [],
          blockedBy: [],
          pentestId: 'pentest-1',
          teamId: undefined,
        },
      });
    });

    it('creates task with teamId scope successfully', async () => {
      const taskData = mockPrismaTask({ pentestId: null, teamId: 'team-1' });
      taskCreateMock.mockResolvedValue(taskData);

      const result = await manager.createTask({
        subject: 'Test task',
        teamId: 'team-1',
      });

      expect(result.teamId).toBe('team-1');
      expect(result.pentestId).toBeNull();
    });

    it('throws when both pentestId and teamId provided', async () => {
      await expect(
        manager.createTask({
          subject: 'Test task',
          pentestId: 'pentest-1',
          teamId: 'team-1',
        })
      ).rejects.toThrow(PersistentTaskManagerError);

      try {
        await manager.createTask({
          subject: 'Test task',
          pentestId: 'pentest-1',
          teamId: 'team-1',
        });
      } catch (e) {
        expect((e as PersistentTaskManagerError).code).toBe('INVALID_SCOPE');
      }
    });

    it('throws when neither pentestId nor teamId provided', async () => {
      await expect(
        manager.createTask({
          subject: 'Test task',
        })
      ).rejects.toThrow(PersistentTaskManagerError);

      try {
        await manager.createTask({
          subject: 'Test task',
        });
      } catch (e) {
        expect((e as PersistentTaskManagerError).code).toBe('INVALID_SCOPE');
      }
    });

    it('creates with default values (status PENDING, priority 0)', async () => {
      const taskData = mockPrismaTask();
      taskCreateMock.mockResolvedValue(taskData);

      await manager.createTask({
        subject: 'Test task',
        pentestId: 'pentest-1',
      });

      expect(taskCreateMock).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'PENDING',
          priority: 0,
        }),
      });
    });
  });

  describe('getTask', () => {
    it('returns task when found in scope', async () => {
      const taskData = mockPrismaTask();
      taskFindFirstMock.mockResolvedValue(taskData);

      const result = await manager.getTask({ pentestId: 'pentest-1' }, 'task-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('task-1');
      expect(taskFindFirstMock).toHaveBeenCalledWith({
        where: {
          id: 'task-1',
          pentestId: 'pentest-1',
        },
      });
    });

    it('returns null when not found', async () => {
      taskFindFirstMock.mockResolvedValue(null);

      const result = await manager.getTask({ pentestId: 'pentest-1' }, 'task-1');

      expect(result).toBeNull();
    });

    it('returns null when found but wrong scope', async () => {
      taskFindFirstMock.mockResolvedValue(null);

      const result = await manager.getTask({ pentestId: 'different-pentest' }, 'task-1');

      expect(result).toBeNull();
      expect(taskFindFirstMock).toHaveBeenCalledWith({
        where: {
          id: 'task-1',
          pentestId: 'different-pentest',
        },
      });
    });
  });

  describe('listTasks', () => {
    it('returns tasks for a scope, ordered by priority DESC', async () => {
      const tasks = [
        mockPrismaTask({ id: 'task-1', priority: 10 }),
        mockPrismaTask({ id: 'task-2', priority: 5 }),
        mockPrismaTask({ id: 'task-3', priority: 1 }),
      ];
      taskFindManyMock.mockResolvedValue(tasks);

      const result = await manager.listTasks({ pentestId: 'pentest-1' });

      expect(result).toHaveLength(3);
      expect(taskFindManyMock).toHaveBeenCalledWith({
        where: {
          pentestId: 'pentest-1',
          status: { not: 'DELETED' },
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' },
        ],
      });
    });

    it('excludes DELETED tasks by default', async () => {
      taskFindManyMock.mockResolvedValue([]);

      await manager.listTasks({ pentestId: 'pentest-1' });

      expect(taskFindManyMock).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: { not: 'DELETED' },
        }),
        orderBy: expect.any(Array),
      });
    });

    it('includes DELETED tasks when includeDeleted is true', async () => {
      taskFindManyMock.mockResolvedValue([]);

      await manager.listTasks({ pentestId: 'pentest-1' }, true);

      expect(taskFindManyMock).toHaveBeenCalledWith({
        where: {
          pentestId: 'pentest-1',
        },
        orderBy: expect.any(Array),
      });
    });

    it('returns empty array when no tasks', async () => {
      taskFindManyMock.mockResolvedValue([]);

      const result = await manager.listTasks({ pentestId: 'pentest-1' });

      expect(result).toEqual([]);
    });
  });

  describe('updateTask', () => {
    it('updates status from PENDING to IN_PROGRESS', async () => {
      const existingTask = mockPrismaTask({ status: 'PENDING' });
      const updatedTask = mockPrismaTask({ status: 'IN_PROGRESS' });
      taskFindFirstMock.mockResolvedValueOnce(existingTask);
      taskUpdateMock.mockResolvedValue(updatedTask);

      const result = await manager.updateTask(
        { pentestId: 'pentest-1' },
        'task-1',
        { status: 'IN_PROGRESS' }
      );

      expect(result.status).toBe('IN_PROGRESS');
      expect(taskUpdateMock).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'IN_PROGRESS' },
      });
    });

    it('updates owner', async () => {
      const existingTask = mockPrismaTask({ owner: null });
      const updatedTask = mockPrismaTask({ owner: 'agent-1' });
      taskFindFirstMock.mockResolvedValueOnce(existingTask);
      taskUpdateMock.mockResolvedValue(updatedTask);

      const result = await manager.updateTask(
        { pentestId: 'pentest-1' },
        'task-1',
        { owner: 'agent-1' }
      );

      expect(result.owner).toBe('agent-1');
    });

    it('updates output field', async () => {
      const existingTask = mockPrismaTask({ output: null });
      const updatedTask = mockPrismaTask({ output: 'Task completed successfully' });
      taskFindFirstMock.mockResolvedValueOnce(existingTask);
      taskUpdateMock.mockResolvedValue(updatedTask);

      const result = await manager.updateTask(
        { pentestId: 'pentest-1' },
        'task-1',
        { output: 'Task completed successfully' }
      );

      expect(result.output).toBe('Task completed successfully');
    });

    it('throws when task not found in scope', async () => {
      taskFindFirstMock.mockResolvedValue(null);

      await expect(
        manager.updateTask({ pentestId: 'pentest-1' }, 'task-1', { status: 'IN_PROGRESS' })
      ).rejects.toThrow(PersistentTaskManagerError);

      try {
        await manager.updateTask({ pentestId: 'pentest-1' }, 'task-1', { status: 'IN_PROGRESS' });
      } catch (e) {
        expect((e as PersistentTaskManagerError).code).toBe('TASK_NOT_FOUND');
      }
    });
  });

  describe('deleteTask', () => {
    it('sets status to DELETED (soft delete)', async () => {
      const existingTask = mockPrismaTask({ status: 'PENDING' });
      const deletedTask = mockPrismaTask({ status: 'DELETED' });
      taskFindFirstMock.mockResolvedValueOnce(existingTask);
      taskUpdateMock.mockResolvedValue(deletedTask);
      taskFindManyMock.mockResolvedValue([]);

      const result = await manager.deleteTask({ pentestId: 'pentest-1' }, 'task-1');

      expect(result.status).toBe('DELETED');
      expect(taskUpdateMock).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'DELETED' },
      });
    });

    it('cleans blocks references in other tasks', async () => {
      const existingTask = mockPrismaTask({ status: 'PENDING' });
      const deletedTask = mockPrismaTask({ status: 'DELETED' });
      const otherTask = mockPrismaTask({
        id: 'task-2',
        blocks: ['task-1'],
        blockedBy: [],
      });

      taskFindFirstMock.mockResolvedValueOnce(existingTask);
      taskUpdateMock.mockResolvedValue(deletedTask);
      taskFindManyMock.mockResolvedValue([otherTask]);
      taskUpdateManyMock.mockResolvedValue({ count: 0 });

      await manager.deleteTask({ pentestId: 'pentest-1' }, 'task-1');

      // Should update tasks that had task-1 in blockedBy
      expect(taskUpdateManyMock).toHaveBeenCalledWith({
        where: expect.objectContaining({
          blockedBy: { has: 'task-1' },
        }),
        data: { blocks: { set: [] } },
      });

      // Should update tasks that had task-1 in blocks
      expect(taskUpdateManyMock).toHaveBeenCalledWith({
        where: expect.objectContaining({
          blocks: { has: 'task-1' },
        }),
        data: { blockedBy: { set: [] } },
      });
    });

    it('cleans blockedBy references in other tasks', async () => {
      const existingTask = mockPrismaTask({ status: 'PENDING' });
      const deletedTask = mockPrismaTask({ status: 'DELETED' });
      const otherTask = mockPrismaTask({
        id: 'task-2',
        blocks: [],
        blockedBy: ['task-1'],
      });

      taskFindFirstMock.mockResolvedValueOnce(existingTask);
      taskUpdateMock.mockResolvedValue(deletedTask);
      taskFindManyMock.mockResolvedValue([otherTask]);
      taskUpdateManyMock.mockResolvedValue({ count: 0 });

      await manager.deleteTask({ pentestId: 'pentest-1' }, 'task-1');

      expect(taskUpdateManyMock).toHaveBeenCalledTimes(2);
    });

    it('throws when task not found', async () => {
      taskFindFirstMock.mockResolvedValue(null);

      await expect(
        manager.deleteTask({ pentestId: 'pentest-1' }, 'task-1')
      ).rejects.toThrow(PersistentTaskManagerError);

      try {
        await manager.deleteTask({ pentestId: 'pentest-1' }, 'task-1');
      } catch (e) {
        expect((e as PersistentTaskManagerError).code).toBe('TASK_NOT_FOUND');
      }
    });
  });

  describe('blockTask', () => {
    it('creates bidirectional relationship', async () => {
      const fromTask = mockPrismaTask({ id: 'task-1', blocks: [], blockedBy: [] });
      const toTask = mockPrismaTask({ id: 'task-2', blocks: [], blockedBy: [] });

      taskFindFirstMock
        .mockResolvedValueOnce(fromTask)
        .mockResolvedValueOnce(toTask);
      taskUpdateMock.mockResolvedValue(fromTask);

      await manager.blockTask({ pentestId: 'pentest-1' }, 'task-1', 'task-2');

      expect(taskUpdateMock).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { blocks: { push: 'task-2' } },
      });

      expect(taskUpdateMock).toHaveBeenCalledWith({
        where: { id: 'task-2' },
        data: { blockedBy: { push: 'task-1' } },
      });
    });

    it('throws when source task not found', async () => {
      taskFindFirstMock.mockResolvedValueOnce(null);

      await expect(
        manager.blockTask({ pentestId: 'pentest-1' }, 'task-1', 'task-2')
      ).rejects.toThrow(PersistentTaskManagerError);

      try {
        await manager.blockTask({ pentestId: 'pentest-1' }, 'task-1', 'task-2');
      } catch (e) {
        expect((e as PersistentTaskManagerError).code).toBe('TASK_NOT_FOUND');
      }
    });

    it('throws when target task not found', async () => {
      const fromTask = mockPrismaTask({ id: 'task-1' });
      taskFindFirstMock.mockResolvedValueOnce(fromTask).mockResolvedValueOnce(null);

      await expect(
        manager.blockTask({ pentestId: 'pentest-1' }, 'task-1', 'task-2')
      ).rejects.toThrow(PersistentTaskManagerError);

      try {
        await manager.blockTask({ pentestId: 'pentest-1' }, 'task-1', 'task-2');
      } catch (e) {
        expect((e as PersistentTaskManagerError).code).toBe('TASK_NOT_FOUND');
      }
    });
  });

  describe('claimTask', () => {
    it('succeeds when no blockers and no owner', async () => {
      const taskData = mockPrismaTask({
        status: 'PENDING',
        owner: null,
        blockedBy: [],
      });
      const claimedTask = mockPrismaTask({
        status: 'IN_PROGRESS',
        owner: 'agent-1',
      });
      taskFindFirstMock.mockResolvedValueOnce(taskData);
      taskFindManyMock.mockResolvedValue([]);
      taskUpdateMock.mockResolvedValue(claimedTask);

      const result = await manager.claimTask({ pentestId: 'pentest-1' }, 'task-1', 'agent-1');

      expect(result.success).toBe(true);
      expect(result.status).toBe('claimed');
      expect(result.task).toBeDefined();
      expect(result.task?.status).toBe('IN_PROGRESS');
      expect(result.task?.owner).toBe('agent-1');
    });

    it('sets status to IN_PROGRESS when claimed', async () => {
      const taskData = mockPrismaTask({
        status: 'PENDING',
        owner: null,
        blockedBy: [],
      });
      const claimedTask = mockPrismaTask({
        status: 'IN_PROGRESS',
        owner: 'agent-1',
      });
      taskFindFirstMock.mockResolvedValueOnce(taskData);
      taskFindManyMock.mockResolvedValue([]);
      taskUpdateMock.mockResolvedValue(claimedTask);

      const result = await manager.claimTask({ pentestId: 'pentest-1' }, 'task-1', 'agent-1');

      expect(result.task?.status).toBe('IN_PROGRESS');
      expect(taskUpdateMock).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: {
          owner: 'agent-1',
          status: 'IN_PROGRESS',
        },
      });
    });

    it('fails with task_not_found when task does not exist', async () => {
      taskFindFirstMock.mockResolvedValue(null);

      const result = await manager.claimTask({ pentestId: 'pentest-1' }, 'task-1', 'agent-1');

      expect(result.success).toBe(false);
      expect(result.status).toBe('task_not_found');
      expect(result.message).toContain('Task not found');
    });

    it('fails with deleted when task is DELETED', async () => {
      const taskData = mockPrismaTask({ status: 'DELETED' });
      taskFindFirstMock.mockResolvedValueOnce(taskData);

      const result = await manager.claimTask({ pentestId: 'pentest-1' }, 'task-1', 'agent-1');

      expect(result.success).toBe(false);
      expect(result.status).toBe('deleted');
      expect(result.message).toContain('deleted');
    });

    it('fails with already_resolved when task is COMPLETED', async () => {
      const taskData = mockPrismaTask({ status: 'COMPLETED' });
      taskFindFirstMock.mockResolvedValueOnce(taskData);

      const result = await manager.claimTask({ pentestId: 'pentest-1' }, 'task-1', 'agent-1');

      expect(result.success).toBe(false);
      expect(result.status).toBe('already_resolved');
      expect(result.message).toContain('already completed');
    });

    it('fails with already_claimed when owned by different agent', async () => {
      const taskData = mockPrismaTask({
        status: 'IN_PROGRESS',
        owner: 'agent-2',
      });
      taskFindFirstMock.mockResolvedValueOnce(taskData);

      const result = await manager.claimTask({ pentestId: 'pentest-1' }, 'task-1', 'agent-1');

      expect(result.success).toBe(false);
      expect(result.status).toBe('already_claimed');
      expect(result.message).toContain('already claimed by agent-2');
    });

    it('fails with blocked when blockers not resolved', async () => {
      const taskData = mockPrismaTask({
        status: 'PENDING',
        owner: null,
        blockedBy: ['task-2'],
      });
      const blockingTask = mockPrismaTask({ id: 'task-2', status: 'PENDING' });
      taskFindFirstMock.mockResolvedValueOnce(taskData);
      taskFindManyMock.mockResolvedValue([blockingTask]);

      const result = await manager.claimTask({ pentestId: 'pentest-1' }, 'task-1', 'agent-1');

      expect(result.success).toBe(false);
      expect(result.status).toBe('blocked');
      expect(result.message).toContain('blocked by');
    });

    it('succeeds when already owned by same agent (idempotent)', async () => {
      const taskData = mockPrismaTask({
        status: 'IN_PROGRESS',
        owner: 'agent-1',
        blockedBy: [],
      });
      const claimedTask = mockPrismaTask({
        status: 'IN_PROGRESS',
        owner: 'agent-1',
      });
      taskFindFirstMock.mockResolvedValueOnce(taskData);
      taskFindManyMock.mockResolvedValue([]);
      taskUpdateMock.mockResolvedValue(claimedTask);

      const result = await manager.claimTask({ pentestId: 'pentest-1' }, 'task-1', 'agent-1');

      expect(result.success).toBe(true);
      expect(result.status).toBe('claimed');
    });
  });

  describe('getAgentStatuses', () => {
    it('returns idle=true for agents with no tasks', async () => {
      taskFindManyMock.mockResolvedValue([]);

      const result = await manager.getAgentStatuses({ pentestId: 'pentest-1' });

      expect(result).toEqual({});
    });

    it('returns idle=false for agents with in-progress tasks', async () => {
      taskFindManyMock.mockResolvedValue([
        mockPrismaTask({ owner: 'agent-1', status: 'IN_PROGRESS' }),
      ]);

      const result = await manager.getAgentStatuses({ pentestId: 'pentest-1' });

      expect(result['agent-1']).toEqual({
        idle: false,
        taskCount: 1,
      });
    });

    it('returns idle=true for unassigned tasks', async () => {
      taskFindManyMock.mockResolvedValue([
        mockPrismaTask({ owner: null, status: 'PENDING' }),
      ]);

      const result = await manager.getAgentStatuses({ pentestId: 'pentest-1' });

      expect(result['unassigned']).toEqual({
        idle: true,
        taskCount: 1,
      });
    });

    it('aggregates multiple tasks per agent', async () => {
      taskFindManyMock.mockResolvedValue([
        mockPrismaTask({ owner: 'agent-1', status: 'IN_PROGRESS' }),
        mockPrismaTask({ owner: 'agent-1', status: 'PENDING' }),
        mockPrismaTask({ owner: 'agent-2', status: 'IN_PROGRESS' }),
      ]);

      const result = await manager.getAgentStatuses({ pentestId: 'pentest-1' });

      expect(result['agent-1']).toEqual({
        idle: false,
        taskCount: 2,
      });
      expect(result['agent-2']).toEqual({
        idle: false,
        taskCount: 1,
      });
    });

    it('excludes DELETED tasks', async () => {
      taskFindManyMock.mockResolvedValue([
        mockPrismaTask({ owner: 'agent-1', status: 'PENDING' }),
      ]);

      const result = await manager.getAgentStatuses({ pentestId: 'pentest-1' });

      // Verify the filter excludes DELETED tasks
      expect(taskFindManyMock).toHaveBeenCalledWith({
        where: {
          pentestId: 'pentest-1',
          status: { not: 'DELETED' },
        },
        select: { owner: true },
      });
      expect(result['agent-1']).toEqual({
        idle: false,
        taskCount: 1,
      });
    });
  });

  describe('unassignAgentTasks', () => {
    it('resets owner to null for agent tasks', async () => {
      taskUpdateManyMock.mockResolvedValue({ count: 3 });

      const result = await manager.unassignAgentTasks({ pentestId: 'pentest-1' }, 'agent-1');

      expect(result).toBe(3);
      expect(taskUpdateManyMock).toHaveBeenCalledWith({
        where: {
          pentestId: 'pentest-1',
          owner: 'agent-1',
          status: { notIn: ['COMPLETED', 'DELETED'] },
        },
        data: { owner: null },
      });
    });

    it('does not modify completed tasks', async () => {
      taskUpdateManyMock.mockResolvedValue({ count: 0 });

      await manager.unassignAgentTasks({ pentestId: 'pentest-1' }, 'agent-1');

      expect(taskUpdateManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { notIn: ['COMPLETED', 'DELETED'] },
          }),
        })
      );
    });

    it('does not modify deleted tasks', async () => {
      taskUpdateManyMock.mockResolvedValue({ count: 0 });

      await manager.unassignAgentTasks({ pentestId: 'pentest-1' }, 'agent-1');

      expect(taskUpdateManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { notIn: expect.arrayContaining(['DELETED']) },
          }),
        })
      );
    });
  });
});
