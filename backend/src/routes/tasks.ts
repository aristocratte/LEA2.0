/**
 * Task Routes - REST API endpoints for persistent task management
 *
 * Exposes PersistentTaskManager functionality via HTTP:
 * - Create, list, get, update, delete tasks
 * - Block/unblock tasks
 * - Claim tasks for agents
 * - Get agent statuses
 */

import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { PersistentTaskManager } from '../core/swarm/PersistentTaskManager.js';
import { PersistentTaskManagerError } from '../core/swarm/PersistentTaskManager.js';

// ============================================
// TYPES
// ============================================

export interface FastifyTaskInstance extends FastifyInstance {
  persistentTaskManager: PersistentTaskManager;
}

interface TaskRequestParams {
  taskId: string;
}

// ============================================
// SCHEMAS
// ============================================

const CreateTaskRequestSchema = z.object({
  subject: z.string().min(1).max(200),
  description: z.string().optional(),
  owner: z.string().optional(),
  activeForm: z.string().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  output: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  blocks: z.array(z.string()).optional(),
  blockedBy: z.array(z.string()).optional(),
  pentestId: z.string().optional(),
  teamId: z.string().optional(),
}).refine(
  (data) => (data.pentestId ? !data.teamId : !!data.teamId),
  {
    message: 'Exactly one of pentestId or teamId must be provided',
    path: ['pentestId', 'teamId'],
  }
);

const UpdateTaskRequestSchema = z.object({
  subject: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELETED']).optional(),
  owner: z.string().nullable().optional(),
  activeForm: z.string().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  output: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const BlockTaskRequestSchema = z.object({
  targetTaskId: z.string().min(1),
});

const ClaimTaskRequestSchema = z.object({
  agentId: z.string().min(1),
});

const TaskScopeQuerySchema = z.object({
  pentestId: z.string().optional(),
  teamId: z.string().optional(),
}).refine(
  (data) => (data.pentestId ? !data.teamId : !!data.teamId),
  {
    message: 'Exactly one of pentestId or teamId must be provided',
  }
);

// ============================================
// ROUTES
// ============================================

export async function taskRoutes(fastify: FastifyInstance): Promise<void> {
  const persistentTaskManager = (fastify as any).persistentTaskManager as PersistentTaskManager | undefined;

  if (!persistentTaskManager) {
    fastify.log.warn('PersistentTaskManager not initialized, task routes will return 503');
    fastify.addHook('onRequest', async (_, reply) => {
      reply.code(503).send({ error: 'PersistentTaskManager not initialized' });
    });
    return;
  }

  const sendTaskError = (reply: FastifyReply, error: any, fallbackMessage: string, statusCode = 400) => {
    const message = error?.message || fallbackMessage;
    return reply.code(statusCode).send({ error: message });
  };

  const getTaskErrorStatusCode = (error: unknown): number => {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';

    switch (code) {
      case 'TASK_NOT_FOUND':
        return 404;
      case 'INVALID_SCOPE':
        return 400;
      default:
        return 400;
    }
  };

  // Helper to extract and validate scope from query
  const getScopeFromQuery = (query: any): { pentestId: string } | { teamId: string } => {
    const parse = TaskScopeQuerySchema.safeParse(query);
    if (!parse.success) {
      throw new PersistentTaskManagerError('INVALID_SCOPE', parse.error.issues[0].message);
    }
    const data = parse.data;
    // At this point, exactly one of pentestId or teamId is defined (guaranteed by schema refinement)
    if (data.pentestId) {
      return { pentestId: data.pentestId };
    }
    return { teamId: data.teamId! };
  };

  // POST /api/tasks - Create a new task
  fastify.post('/api/tasks', async (request, reply) => {
    const parse = CreateTaskRequestSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid task payload',
        details: parse.error.issues,
      });
    }

    try {
      const task = await persistentTaskManager.createTask(parse.data);
      return reply.code(201).send({ data: task });
    } catch (error: any) {
      return sendTaskError(reply, error, 'Unable to create task', getTaskErrorStatusCode(error));
    }
  });

  // GET /api/tasks - List tasks by scope
  fastify.get('/api/tasks', async (request, reply) => {
    try {
      const scope = getScopeFromQuery(request.query);
      const query = request.query as { includeDeleted?: string };
      const includeDeleted = query.includeDeleted === 'true';

      const tasks = await persistentTaskManager.listTasks(scope, includeDeleted);
      return { data: tasks };
    } catch (error: any) {
      return sendTaskError(reply, error, 'Unable to list tasks', getTaskErrorStatusCode(error));
    }
  });

  // GET /api/tasks/:taskId - Get single task
  fastify.get('/api/tasks/:taskId', async (request, reply) => {
    const { taskId } = request.params as TaskRequestParams;

    try {
      const scope = getScopeFromQuery(request.query);
      const task = await persistentTaskManager.getTask(scope, taskId);

      if (!task) {
        return reply.code(404).send({ error: 'Task not found' });
      }

      return { data: task };
    } catch (error: any) {
      return sendTaskError(reply, error, 'Unable to get task', getTaskErrorStatusCode(error));
    }
  });

  // PATCH /api/tasks/:taskId - Update a task
  fastify.patch('/api/tasks/:taskId', async (request, reply) => {
    const { taskId } = request.params as TaskRequestParams;

    const parse = UpdateTaskRequestSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid task update payload',
        details: parse.error.issues,
      });
    }

    try {
      const scope = getScopeFromQuery(request.query);
      const task = await persistentTaskManager.updateTask(scope, taskId, parse.data);
      return { data: task };
    } catch (error: any) {
      return sendTaskError(reply, error, 'Unable to update task', getTaskErrorStatusCode(error));
    }
  });

  // DELETE /api/tasks/:taskId - Delete a task (soft delete)
  fastify.delete('/api/tasks/:taskId', async (request, reply) => {
    const { taskId } = request.params as TaskRequestParams;

    try {
      const scope = getScopeFromQuery(request.query);
      await persistentTaskManager.deleteTask(scope, taskId);
      return reply.code(202).send({ data: { message: 'Task deleted' } });
    } catch (error: any) {
      return sendTaskError(reply, error, 'Unable to delete task', getTaskErrorStatusCode(error));
    }
  });

  // POST /api/tasks/:taskId/block - Create a blocking relationship
  fastify.post('/api/tasks/:taskId/block', async (request, reply) => {
    const { taskId } = request.params as TaskRequestParams;

    const parse = BlockTaskRequestSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid block payload',
        details: parse.error.issues,
      });
    }

    try {
      const scope = getScopeFromQuery(request.query);
      await persistentTaskManager.blockTask(scope, taskId, parse.data.targetTaskId);
      return reply.code(201).send({ data: { message: 'Task blocked' } });
    } catch (error: any) {
      return sendTaskError(reply, error, 'Unable to block task', getTaskErrorStatusCode(error));
    }
  });

  // POST /api/tasks/:taskId/claim - Claim a task for an agent
  fastify.post('/api/tasks/:taskId/claim', async (request, reply) => {
    const { taskId } = request.params as TaskRequestParams;

    const parse = ClaimTaskRequestSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid claim payload',
        details: parse.error.issues,
      });
    }

    try {
      const scope = getScopeFromQuery(request.query);
      const result = await persistentTaskManager.claimTask(scope, taskId, parse.data.agentId);

      if (!result.success) {
        return reply.code(400).send({ error: result.message });
      }

      return { data: result };
    } catch (error: any) {
      return sendTaskError(reply, error, 'Unable to claim task', getTaskErrorStatusCode(error));
    }
  });

  // GET /api/tasks/agents/status - Get agent statuses
  fastify.get('/api/tasks/agents/status', async (request, reply) => {
    try {
      const scope = getScopeFromQuery(request.query);
      const statuses = await persistentTaskManager.getAgentStatuses(scope);
      return { data: statuses };
    } catch (error: any) {
      return sendTaskError(reply, error, 'Unable to get agent statuses', getTaskErrorStatusCode(error));
    }
  });

  // POST /api/tasks/agents/:agentId/unassign - Unassign all tasks for an agent
  fastify.post('/api/tasks/agents/:agentId/unassign', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };

    try {
      const scope = getScopeFromQuery(request.query);
      const count = await persistentTaskManager.unassignAgentTasks(scope, agentId);
      return reply.code(202).send({ data: { message: `Unassigned ${count} task(s)` } });
    } catch (error: any) {
      return sendTaskError(reply, error, 'Unable to unassign tasks', getTaskErrorStatusCode(error));
    }
  });
}
