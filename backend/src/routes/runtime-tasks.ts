/**
 * Runtime Task Routes - REST API endpoints for runtime shell task management
 *
 * Exposes RuntimeTaskManager functionality via HTTP:
 * - List all runtime tasks (optionally filtered by agentId)
 * - Get task info by taskId
 * - Get task output with pagination support
 */

import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { RuntimeTaskManager } from '../core/runtime/RuntimeTaskManager.js';

// ============================================================================
// TYPES
// ============================================================================

export interface FastifyRuntimeTaskInstance extends FastifyInstance {
  runtimeTaskManager: RuntimeTaskManager;
}

interface RuntimeTaskRequestParams {
  taskId: string;
}

// ============================================================================
// SCHEMAS
// ============================================================================

const TaskListQuerySchema = z.object({
  agentId: z.string().optional(),
});

const TaskOutputQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(0).optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

export async function runtimeTaskRoutes(fastify: FastifyInstance): Promise<void> {
  const runtimeTaskManager = (fastify as any).runtimeTaskManager as RuntimeTaskManager | undefined;

  if (!runtimeTaskManager) {
    fastify.log.warn('RuntimeTaskManager not initialized, runtime task routes will return 503');
    fastify.addHook('onRequest', async (_, reply) => {
      reply.code(503).send({ error: 'RuntimeTaskManager not initialized' });
    });
    return;
  }

  const sendTaskError = (reply: FastifyReply, message: string, statusCode = 400) => {
    return reply.code(statusCode).send({ error: message });
  };

  // GET /api/runtime-tasks - List all runtime tasks
  fastify.get('/api/runtime-tasks', async (request, reply) => {
    const parse = TaskListQuerySchema.safeParse(request.query);
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid query parameters',
        details: parse.error.issues,
      });
    }

    const tasks = runtimeTaskManager.listTasks(parse.data.agentId);
    return { data: tasks };
  });

  // GET /api/runtime-tasks/:taskId - Get task info
  fastify.get('/api/runtime-tasks/:taskId', async (request, reply) => {
    const { taskId } = request.params as RuntimeTaskRequestParams;

    const task = runtimeTaskManager.getTask(taskId);

    if (!task) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    return { data: task };
  });

  // GET /api/runtime-tasks/:taskId/output - Get task output
  fastify.get('/api/runtime-tasks/:taskId/output', async (request, reply) => {
    const { taskId } = request.params as RuntimeTaskRequestParams;

    const parse = TaskOutputQuerySchema.safeParse(request.query);
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid query parameters',
        details: parse.error.issues,
      });
    }

    const output = runtimeTaskManager.getTaskOutput(
      taskId,
      parse.data.offset,
      parse.data.limit
    );

    if (!output) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    return { data: output };
  });
}
