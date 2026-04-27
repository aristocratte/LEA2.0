/**
 * Message Routes - REST API endpoints for structured inter-agent messaging
 *
 * Exposes MessageBus functionality via HTTP:
 * - Send direct messages between agents
 * - Broadcast messages to multiple recipients
 * - Get inbox contents for an agent
 * - Get unread message counts
 * - Mark messages as read
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { MessageBus } from '../core/swarm/MessageBus.js';
import type {
  StructuredMessage,
  TaskAssignmentPayload,
  TextMessagePayload,
} from '../core/swarm/MessageBus.js';

// ============================================================================
// TYPES
// ============================================================================

export interface FastifyMessageInstance extends FastifyInstance {
  messageBus: MessageBus;
}

interface MessageRequestParams {
  messageId: string;
}

// ============================================================================
// SCHEMAS
// ============================================================================

const SendMessageRequestSchema = z.object({
  from: z.string().min(1, 'Sender agent name is required'),
  to: z.string().min(1, 'Recipient agent name is required'),
  swarmRunId: z.string().min(1, 'Swarm run ID is required'),
  message: z.union([
    z.string(),
    z.record(z.unknown()),
  ]).optional(),
  type: z.enum(['text', 'task_assignment', 'shutdown_request', 'shutdown_response', 'idle_notification']).default('text'),
  taskId: z.string().optional(),
  subject: z.string().optional(),
  description: z.string().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  requestId: z.string().optional(),
  approve: z.boolean().optional(),
  reason: z.string().optional(),
  idleReason: z.enum(['available', 'interrupted', 'failed']).optional(),
  lastTaskId: z.string().optional(),
});

const BroadcastMessageRequestSchema = z.object({
  from: z.string().min(1, 'Sender agent name is required'),
  swarmRunId: z.string().min(1, 'Swarm run ID is required'),
  recipients: z.array(z.string().min(1)).min(1, 'At least one recipient is required'),
  message: z.union([
    z.string(),
    z.record(z.unknown()),
  ]).optional(),
  type: z.enum(['text', 'task_assignment', 'shutdown_request']).default('text'),
  taskId: z.string().optional(),
  subject: z.string().optional(),
  description: z.string().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  requestId: z.string().optional(),
  reason: z.string().optional(),
});

const GetInboxRequestSchema = z.object({
  agentName: z.string().min(1, 'Agent name is required'),
  swarmRunId: z.string().min(1, 'Swarm run ID is required'),
  unreadOnly: z.string().optional().transform((val) => val === 'true').optional(),
});

const MarkAsReadRequestSchema = z.object({
  agentName: z.string().min(1, 'Agent name is required'),
  swarmRunId: z.string().min(1, 'Swarm run ID is required'),
});

const GetUnreadCountRequestSchema = z.object({
  agentName: z.string().min(1, 'Agent name is required'),
  swarmRunId: z.string().min(1, 'Swarm run ID is required'),
});

// ============================================================================
// ROUTES
// ============================================================================

export async function messageRoutes(fastify: FastifyInstance): Promise<void> {
  const messageBus = (fastify as any).messageBus as MessageBus | undefined;

  if (!messageBus) {
    fastify.log.warn('MessageBus not initialized, message routes will return 503');
    fastify.addHook('onRequest', async (_, reply) => {
      reply.code(503).send({ error: 'MessageBus not initialized' });
    });
    return;
  }

  /**
   * Helper to send error responses
   */
  const sendError = (reply: FastifyReply, message: string, statusCode = 400) => {
    return reply.code(statusCode).send({ error: message });
  };

  /**
   * POST /api/messages/send
   *
   * Send a direct message from one agent to another.
   */
  fastify.post('/api/messages/send', async (request, reply) => {
    const parse = SendMessageRequestSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid message payload',
        details: parse.error.issues,
      });
    }

    const data = parse.data;

    try {
      let messageId: string;

      switch (data.type) {
        case 'task_assignment': {
          if (!data.taskId || !data.subject) {
            return sendError(reply, 'Task assignment requires taskId and subject');
          }
          const payload: TaskAssignmentPayload = {
            taskId: data.taskId,
            subject: data.subject,
            description: data.description,
            priority: data.priority,
          };
          messageId = await messageBus.sendTaskAssignment(
            data.swarmRunId,
            data.from,
            data.to,
            payload,
          );
          break;
        }

        case 'shutdown_request': {
          if (!data.requestId) {
            return sendError(reply, 'Shutdown request requires requestId');
          }
          messageId = await messageBus.sendShutdownRequest(
            data.swarmRunId,
            data.from,
            data.to,
            {
              requestId: data.requestId,
              reason: data.reason,
            },
          );
          break;
        }

        case 'shutdown_response': {
          if (!data.requestId || typeof data.approve !== 'boolean') {
            return sendError(reply, 'Shutdown response requires requestId and approve');
          }
          messageId = await messageBus.sendShutdownResponse(
            data.swarmRunId,
            data.from,
            data.to,
            {
              requestId: data.requestId,
              approve: data.approve,
              reason: data.reason,
            },
          );
          break;
        }

        case 'idle_notification': {
          messageId = await messageBus.sendIdleNotification(
            data.swarmRunId,
            data.from,
            data.to,
            {
              idleReason: data.idleReason || 'available',
              lastTaskId: data.lastTaskId,
              message: typeof data.message === 'string' ? data.message : undefined,
            },
          );
          break;
        }

        case 'text':
        default: {
          if (!data.message) {
            return sendError(reply, 'Text messages require message content');
          }
          const text = typeof data.message === 'string'
            ? data.message
            : JSON.stringify(data.message);
          messageId = await messageBus.sendText(
            data.swarmRunId,
            data.from,
            data.to,
            text,
          );
          break;
        }
      }

      return reply.code(201).send({
        data: {
          success: true,
          messageId,
        },
      });
    } catch (error: any) {
      fastify.log.error(error);
      return sendError(reply, error?.message || 'Failed to send message', 500);
    }
  });

  /**
   * POST /api/messages/broadcast
   *
   * Broadcast a message to multiple recipients.
   */
  fastify.post('/api/messages/broadcast', async (request, reply) => {
    const parse = BroadcastMessageRequestSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid broadcast payload',
        details: parse.error.issues,
      });
    }

    const data = parse.data;

    try {
      const messageIds: string[] = [];

      // Build message template (without id/timestamp which are generated per recipient)
      const messageTemplate = {
        type: data.type as StructuredMessage['type'],
        from: data.from,
        to: '*', // Broadcast indicator
        payload: (() => {
          switch (data.type) {
            case 'task_assignment':
              return {
                taskId: data.taskId,
                subject: data.subject,
                description: data.description,
                priority: data.priority,
              } as TaskAssignmentPayload;

            case 'shutdown_request':
              return {
                requestId: data.requestId,
                reason: data.reason,
              };

            default:
              return {
                text: typeof data.message === 'string'
                  ? data.message
                  : JSON.stringify(data.message),
              } as TextMessagePayload;
          }
        })(),
      };

      const messageIdsResult = await messageBus.broadcast(
        data.swarmRunId,
        data.from,
        data.recipients,
        messageTemplate,
      );

      return reply.code(201).send({
        data: {
          success: true,
          messageIds: messageIdsResult,
          count: messageIdsResult.length,
        },
      });
    } catch (error: any) {
      fastify.log.error(error);
      return sendError(reply, error?.message || 'Failed to broadcast message', 500);
    }
  });

  /**
   * GET /api/messages/inbox
   *
   * Get inbox contents for an agent.
   */
  fastify.get('/api/messages/inbox', async (request, reply) => {
    const parse = GetInboxRequestSchema.safeParse(request.query || {});
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid inbox query',
        details: parse.error.issues,
      });
    }

    const data = parse.data;

    try {
      const options = data.unreadOnly !== undefined ? { unreadOnly: data.unreadOnly } : undefined;
      const messages = await messageBus.getInbox(
        data.agentName,
        data.swarmRunId,
        options,
      );

      return {
        data: messages,
        count: messages.length,
      };
    } catch (error: any) {
      fastify.log.error(error);
      return sendError(reply, error?.message || 'Failed to get inbox', 500);
    }
  });

  /**
   * GET /api/messages/unread-count
   *
   * Get unread message count for an agent.
   */
  fastify.get('/api/messages/unread-count', async (request, reply) => {
    const parse = GetUnreadCountRequestSchema.safeParse(request.query || {});
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid unread count query',
        details: parse.error.issues,
      });
    }

    const data = parse.data;

    try {
      const count = await messageBus.getUnreadCount(
        data.agentName,
        data.swarmRunId,
      );

      return {
        data: {
          agentName: data.agentName,
          swarmRunId: data.swarmRunId,
          unreadCount: count,
        },
      };
    } catch (error: any) {
      fastify.log.error(error);
      return sendError(reply, error?.message || 'Failed to get unread count', 500);
    }
  });

  /**
   * PATCH /api/messages/:messageId/read
   *
   * Mark a message as read.
   */
  fastify.patch('/api/messages/:messageId/read', async (request, reply) => {
    const { messageId } = request.params as MessageRequestParams;

    const parse = MarkAsReadRequestSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid mark as read payload',
        details: parse.error.issues,
      });
    }

    const data = parse.data;

    try {
      await messageBus.markAsRead(
        data.agentName,
        data.swarmRunId,
        messageId,
      );

      return reply.code(200).send({
        data: {
          success: true,
          messageId,
        },
      });
    } catch (error: any) {
      fastify.log.error(error);
      return sendError(reply, error?.message || 'Failed to mark message as read', 500);
    }
  });
}
