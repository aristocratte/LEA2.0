/**
 * Runtime Task Routes Tests
 */

import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Create mock objects that will be used throughout
const {
  RuntimeTaskManagerMock,
  runtimeTaskManagerConstructorMock,
  getTaskMock,
  getTaskOutputMock,
  listTasksMock,
} = vi.hoisted(() => {
  const getTaskMock = vi.fn();
  const getTaskOutputMock = vi.fn();
  const listTasksMock = vi.fn();
  const runtimeTaskManagerConstructorMock = vi.fn();

  class RuntimeTaskManagerMock {
    getTask = getTaskMock;
    getTaskOutput = getTaskOutputMock;
    listTasks = listTasksMock;

    constructor() {
      runtimeTaskManagerConstructorMock();
    }
  }

  return {
    RuntimeTaskManagerMock,
    runtimeTaskManagerConstructorMock,
    getTaskMock,
    getTaskOutputMock,
    listTasksMock,
  };
});

vi.mock('../core/runtime/RuntimeTaskManager.js', () => ({
  RuntimeTaskManager: RuntimeTaskManagerMock,
}));

import { runtimeTaskRoutes } from '../runtime-tasks.js';

async function buildApp() {
  const fastify = Fastify({ logger: false });
  const runtimeTaskManager = new RuntimeTaskManagerMock();

  (fastify as any).runtimeTaskManager = runtimeTaskManager;
  await fastify.register(runtimeTaskRoutes);
  await fastify.ready();

  return { fastify, runtimeTaskManager };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const mockTask = {
  taskId: 'task-1',
  command: 'echo test',
  agentId: 'agent-1',
  status: 'completed' as const,
  exitCode: 0,
  startedAt: 1704067200000,
  completedAt: 1704067201000,
};

describe('runtimeTaskRoutes', () => {
  describe('GET /api/runtime-tasks', () => {
    it('returns 200 with list of all tasks', async () => {
      listTasksMock.mockReturnValue([mockTask]);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).get('/api/runtime-tasks');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          data: [mockTask],
        });

        expect(listTasksMock).toHaveBeenCalledWith(undefined);
      } finally {
        await fastify.close();
      }
    });

    it('filters by agentId when query param provided', async () => {
      listTasksMock.mockReturnValue([mockTask]);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).get('/api/runtime-tasks?agentId=agent-1');

        expect(response.status).toBe(200);
        expect(listTasksMock).toHaveBeenCalledWith('agent-1');
      } finally {
        await fastify.close();
      }
    });

    it('returns empty array when no tasks', async () => {
      listTasksMock.mockReturnValue([]);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).get('/api/runtime-tasks');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ data: [] });
      } finally {
        await fastify.close();
      }
    });
  });

  describe('GET /api/runtime-tasks/:taskId', () => {
    it('returns 200 with task data', async () => {
      getTaskMock.mockReturnValue(mockTask);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).get('/api/runtime-tasks/task-1');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          data: mockTask,
        });

        expect(getTaskMock).toHaveBeenCalledWith('task-1');
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 when task not found', async () => {
      getTaskMock.mockReturnValue(undefined);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).get('/api/runtime-tasks/nonexistent');

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Task not found');
      } finally {
        await fastify.close();
      }
    });
  });

  describe('GET /api/runtime-tasks/:taskId/output', () => {
    const mockOutput = {
      taskId: 'task-1',
      output: 'hello world',
      totalBytes: 11,
      isComplete: true,
    };

    it('returns 200 with task output', async () => {
      getTaskOutputMock.mockReturnValue(mockOutput);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).get('/api/runtime-tasks/task-1/output');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          data: mockOutput,
        });

        expect(getTaskOutputMock).toHaveBeenCalledWith('task-1', undefined, undefined);
      } finally {
        await fastify.close();
      }
    });

    it('passes offset and limit query parameters', async () => {
      getTaskOutputMock.mockReturnValue(mockOutput);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/runtime-tasks/task-1/output?offset=10&limit=100');

        expect(response.status).toBe(200);
        expect(getTaskOutputMock).toHaveBeenCalledWith('task-1', 10, 100);
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 when task not found', async () => {
      getTaskOutputMock.mockReturnValue(undefined);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).get('/api/runtime-tasks/nonexistent/output');

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Task not found');
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for invalid offset parameter', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/runtime-tasks/task-1/output?offset=invalid');

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid query parameters');
        expect(getTaskOutputMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for invalid limit parameter', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/runtime-tasks/task-1/output?limit=abc');

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid query parameters');
        expect(getTaskOutputMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });
  });
});
