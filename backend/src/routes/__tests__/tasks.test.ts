/**
 * Task Routes Tests
 */

import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Create mock objects that will be used throughout
const {
  createTaskMock,
  getTaskMock,
  listTasksMock,
  updateTaskMock,
  deleteTaskMock,
  blockTaskMock,
  claimTaskMock,
  getAgentStatusesMock,
  unassignAgentTasksMock,
  PersistentTaskManagerMock,
  persistentTaskManagerConstructorMock,
} = vi.hoisted(() => {
  const createTaskMock = vi.fn();
  const getTaskMock = vi.fn();
  const listTasksMock = vi.fn();
  const updateTaskMock = vi.fn();
  const deleteTaskMock = vi.fn();
  const blockTaskMock = vi.fn();
  const claimTaskMock = vi.fn();
  const getAgentStatusesMock = vi.fn();
  const unassignAgentTasksMock = vi.fn();
  const persistentTaskManagerConstructorMock = vi.fn();

  class PersistentTaskManagerMock {
    createTask = createTaskMock;
    getTask = getTaskMock;
    listTasks = listTasksMock;
    updateTask = updateTaskMock;
    deleteTask = deleteTaskMock;
    blockTask = blockTaskMock;
    claimTask = claimTaskMock;
    getAgentStatuses = getAgentStatusesMock;
    unassignAgentTasks = unassignAgentTasksMock;

    constructor() {
      persistentTaskManagerConstructorMock();
    }
  }

  return {
    createTaskMock,
    getTaskMock,
    listTasksMock,
    updateTaskMock,
    deleteTaskMock,
    blockTaskMock,
    claimTaskMock,
    getAgentStatusesMock,
    unassignAgentTasksMock,
    PersistentTaskManagerMock,
    persistentTaskManagerConstructorMock,
  };
});

vi.mock('../core/swarm/PersistentTaskManager.js', () => ({
  PersistentTaskManager: PersistentTaskManagerMock,
}));

vi.mock('../core/swarm/PersistentTaskManager.js', () => ({
  PersistentTaskManager: PersistentTaskManagerMock,
  PersistentTaskManagerError: class PersistentTaskManagerError extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = 'PersistentTaskManagerError';
    }
  },
}));

import { taskRoutes } from '../tasks.js';

async function buildApp() {
  const fastify = Fastify({ logger: false });
  const persistentTaskManager = new PersistentTaskManagerMock();

  (fastify as any).persistentTaskManager = persistentTaskManager;
  await fastify.register(taskRoutes);
  await fastify.ready();

  return { fastify, persistentTaskManager };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const mockTask = {
  id: 'task-1',
  subject: 'Implement authentication',
  description: 'Add OAuth2 login flow',
  status: 'PENDING' as const,
  owner: null,
  activeForm: null,
  priority: 5,
  output: null,
  metadata: null,
  blocks: [],
  blockedBy: [],
  pentestId: 'pentest-1',
  teamId: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

describe('taskRoutes', () => {
  describe('POST /api/tasks', () => {
    it('creates task and returns 201 with { data: task }', async () => {
      createTaskMock.mockResolvedValue(mockTask);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/tasks')
          .send({
            subject: 'Implement authentication',
            description: 'Add OAuth2 login flow',
            pentestId: 'pentest-1',
          });

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
          data: mockTask,
        });

        expect(createTaskMock).toHaveBeenCalledWith({
          subject: 'Implement authentication',
          description: 'Add OAuth2 login flow',
          pentestId: 'pentest-1',
        });
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when missing subject', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/tasks')
          .send({
            pentestId: 'pentest-1',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid task payload');
        expect(createTaskMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when both pentestId and teamId provided', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/tasks')
          .send({
            subject: 'Test task',
            pentestId: 'pentest-1',
            teamId: 'team-1',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid task payload');
        expect(createTaskMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when neither pentestId nor teamId provided', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/tasks')
          .send({
            subject: 'Test task',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid task payload');
        expect(createTaskMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });
  });

  describe('GET /api/tasks', () => {
    it('returns 200 with list of tasks', async () => {
      listTasksMock.mockResolvedValue([mockTask]);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/tasks?pentestId=pentest-1');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          data: [mockTask],
        });

        expect(listTasksMock).toHaveBeenCalledWith({ pentestId: 'pentest-1' }, false);
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when no scope provided', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).get('/api/tasks');

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Exactly one of');
        expect(listTasksMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when both pentestId and teamId provided in query', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/tasks?pentestId=pentest-1&teamId=team-1');

        expect(response.status).toBe(400);
        expect(listTasksMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('respects includeDeleted query parameter', async () => {
      listTasksMock.mockResolvedValue([mockTask]);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/tasks?pentestId=pentest-1&includeDeleted=true');

        expect(response.status).toBe(200);
        expect(listTasksMock).toHaveBeenCalledWith({ pentestId: 'pentest-1' }, true);
      } finally {
        await fastify.close();
      }
    });

    it('returns empty array when no tasks', async () => {
      listTasksMock.mockResolvedValue([]);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/tasks?pentestId=pentest-1');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ data: [] });
      } finally {
        await fastify.close();
      }
    });
  });

  describe('GET /api/tasks/:taskId', () => {
    it('returns 200 with task data', async () => {
      getTaskMock.mockResolvedValue(mockTask);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/tasks/task-1?pentestId=pentest-1');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          data: mockTask,
        });

        expect(getTaskMock).toHaveBeenCalledWith({ pentestId: 'pentest-1' }, 'task-1');
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 when not found', async () => {
      getTaskMock.mockResolvedValue(null);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/tasks/task-1?pentestId=pentest-1');

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Task not found');
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when no scope provided', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).get('/api/tasks/task-1');

        expect(response.status).toBe(400);
        expect(getTaskMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });
  });

  describe('PATCH /api/tasks/:taskId', () => {
    it('returns 200 on successful update', async () => {
      const updatedTask = { ...mockTask, status: 'IN_PROGRESS' as const };
      updateTaskMock.mockResolvedValue(updatedTask);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .patch('/api/tasks/task-1?pentestId=pentest-1')
          .send({ status: 'IN_PROGRESS' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          data: updatedTask,
        });

        expect(updateTaskMock).toHaveBeenCalledWith(
          { pentestId: 'pentest-1' },
          'task-1',
          { status: 'IN_PROGRESS' }
        );
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 when not found', async () => {
      const error: any = new Error('Task not found: task-1');
      error.code = 'TASK_NOT_FOUND';
      updateTaskMock.mockRejectedValue(error);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .patch('/api/tasks/task-1?pentestId=pentest-1')
          .send({ status: 'IN_PROGRESS' });

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Task not found: task-1');
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for invalid payload', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .patch('/api/tasks/task-1?pentestId=pentest-1')
          .send({ status: 'INVALID_STATUS' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid task update payload');
        expect(updateTaskMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when no scope provided', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .patch('/api/tasks/task-1')
          .send({ status: 'IN_PROGRESS' });

        expect(response.status).toBe(400);
        expect(updateTaskMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });
  });

  describe('DELETE /api/tasks/:taskId', () => {
    it('returns 202 on successful delete', async () => {
      deleteTaskMock.mockResolvedValue(mockTask);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .delete('/api/tasks/task-1?pentestId=pentest-1');

        expect(response.status).toBe(202);
        expect(response.body).toEqual({
          data: { message: 'Task deleted' },
        });

        expect(deleteTaskMock).toHaveBeenCalledWith({ pentestId: 'pentest-1' }, 'task-1');
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 when not found', async () => {
      const error: any = new Error('Task not found: task-1');
      error.code = 'TASK_NOT_FOUND';
      deleteTaskMock.mockRejectedValue(error);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .delete('/api/tasks/task-1?pentestId=pentest-1');

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Task not found: task-1');
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when no scope provided', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).delete('/api/tasks/task-1');

        expect(response.status).toBe(400);
        expect(deleteTaskMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });
  });

  describe('POST /api/tasks/:taskId/block', () => {
    it('returns 201 on success', async () => {
      blockTaskMock.mockResolvedValue(undefined);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/tasks/task-1/block?pentestId=pentest-1')
          .send({ targetTaskId: 'task-2' });

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
          data: { message: 'Task blocked' },
        });

        expect(blockTaskMock).toHaveBeenCalledWith(
          { pentestId: 'pentest-1' },
          'task-1',
          'task-2'
        );
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 when source task not found', async () => {
      const error: any = new Error('Task not found: task-1');
      error.code = 'TASK_NOT_FOUND';
      blockTaskMock.mockRejectedValue(error);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/tasks/task-1/block?pentestId=pentest-1')
          .send({ targetTaskId: 'task-2' });

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Task not found: task-1');
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 when target task not found', async () => {
      const error: any = new Error('Task not found: task-2');
      error.code = 'TASK_NOT_FOUND';
      blockTaskMock.mockRejectedValue(error);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/tasks/task-1/block?pentestId=pentest-1')
          .send({ targetTaskId: 'task-2' });

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Task not found: task-2');
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for invalid payload (missing targetTaskId)', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/tasks/task-1/block?pentestId=pentest-1')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid block payload');
        expect(blockTaskMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when no scope provided', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/tasks/task-1/block')
          .send({ targetTaskId: 'task-2' });

        expect(response.status).toBe(400);
        expect(blockTaskMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });
  });

  describe('POST /api/tasks/:taskId/claim', () => {
    it('returns 200 on successful claim', async () => {
      claimTaskMock.mockResolvedValue({
        success: true,
        status: 'claimed' as const,
        task: { ...mockTask, status: 'IN_PROGRESS' as const, owner: 'agent-1' },
        message: 'Task task-1 claimed by agent-1',
      });

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/tasks/task-1/claim?pentestId=pentest-1')
          .send({ agentId: 'agent-1' });

        expect(response.status).toBe(200);
        expect(response.body.data.success).toBe(true);
        expect(response.body.data.status).toBe('claimed');

        expect(claimTaskMock).toHaveBeenCalledWith(
          { pentestId: 'pentest-1' },
          'task-1',
          'agent-1'
        );
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 on claim failure (blocked)', async () => {
      claimTaskMock.mockResolvedValue({
        success: false,
        status: 'blocked' as const,
        message: 'Task task-1 is blocked by 1 incomplete task(s)',
      });

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/tasks/task-1/claim?pentestId=pentest-1')
          .send({ agentId: 'agent-1' });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('blocked by');
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 on claim failure (already claimed)', async () => {
      claimTaskMock.mockResolvedValue({
        success: false,
        status: 'already_claimed' as const,
        message: 'Task task-1 is already claimed by agent-2',
      });

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/tasks/task-1/claim?pentestId=pentest-1')
          .send({ agentId: 'agent-1' });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('already claimed');
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for invalid payload (missing agentId)', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/tasks/task-1/claim?pentestId=pentest-1')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid claim payload');
        expect(claimTaskMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when no scope provided', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/tasks/task-1/claim')
          .send({ agentId: 'agent-1' });

        expect(response.status).toBe(400);
        expect(claimTaskMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });
  });

  describe('GET /api/tasks/agents/status', () => {
    it('returns 200 with agent statuses', async () => {
      getAgentStatusesMock.mockResolvedValue({
        'agent-1': { idle: false, taskCount: 2 },
        'agent-2': { idle: true, taskCount: 0 },
      });

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/tasks/agents/status?pentestId=pentest-1');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          data: {
            'agent-1': { idle: false, taskCount: 2 },
            'agent-2': { idle: true, taskCount: 0 },
          },
        });

        expect(getAgentStatusesMock).toHaveBeenCalledWith({ pentestId: 'pentest-1' });
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when no scope provided', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).get('/api/tasks/agents/status');

        expect(response.status).toBe(400);
        expect(getAgentStatusesMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });
  });

  describe('POST /api/tasks/agents/:agentId/unassign', () => {
    it('returns 202 on successful unassign', async () => {
      unassignAgentTasksMock.mockResolvedValue(3);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/tasks/agents/agent-1/unassign?pentestId=pentest-1');

        expect(response.status).toBe(202);
        expect(response.body).toEqual({
          data: { message: 'Unassigned 3 task(s)' },
        });

        expect(unassignAgentTasksMock).toHaveBeenCalledWith(
          { pentestId: 'pentest-1' },
          'agent-1'
        );
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when no scope provided', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/tasks/agents/agent-1/unassign');

        expect(response.status).toBe(400);
        expect(unassignAgentTasksMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });
  });
});
