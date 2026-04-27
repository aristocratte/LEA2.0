/**
 * Message Routes Tests
 */

import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Create mock objects that will be used throughout
const {
  sendDirectMessageMock,
  sendTextMock,
  sendTaskAssignmentMock,
  sendShutdownRequestMock,
  sendShutdownResponseMock,
  sendIdleNotificationMock,
  broadcastMock,
  getInboxMock,
  getUnreadCountMock,
  markAsReadMock,
  MessageBusMock,
  messageBusConstructorMock,
} = vi.hoisted(() => {
  const sendDirectMessageMock = vi.fn();
  const sendTextMock = vi.fn();
  const sendTaskAssignmentMock = vi.fn();
  const sendShutdownRequestMock = vi.fn();
  const sendShutdownResponseMock = vi.fn();
  const sendIdleNotificationMock = vi.fn();
  const broadcastMock = vi.fn();
  const getInboxMock = vi.fn();
  const getUnreadCountMock = vi.fn();
  const markAsReadMock = vi.fn();
  const messageBusConstructorMock = vi.fn();

  class MessageBusMock {
    sendDirectMessage = sendDirectMessageMock;
    sendText = sendTextMock;
    sendTaskAssignment = sendTaskAssignmentMock;
    sendShutdownRequest = sendShutdownRequestMock;
    sendShutdownResponse = sendShutdownResponseMock;
    sendIdleNotification = sendIdleNotificationMock;
    broadcast = broadcastMock;
    getInbox = getInboxMock;
    getUnreadCount = getUnreadCountMock;
    markAsRead = markAsReadMock;

    constructor() {
      messageBusConstructorMock();
    }
  }

  return {
    sendDirectMessageMock,
    sendTextMock,
    sendTaskAssignmentMock,
    sendShutdownRequestMock,
    sendShutdownResponseMock,
    sendIdleNotificationMock,
    broadcastMock,
    getInboxMock,
    getUnreadCountMock,
    markAsReadMock,
    MessageBusMock,
    messageBusConstructorMock,
  };
});

vi.mock('../core/swarm/MessageBus.js', () => ({
  MessageBus: MessageBusMock,
}));

import { messageRoutes } from '../messages.js';

async function buildApp() {
  const fastify = Fastify({ logger: false });
  const messageBus = new MessageBusMock();

  (fastify as any).messageBus = messageBus;
  await fastify.register(messageRoutes);
  await fastify.ready();

  return { fastify, messageBus };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const mockStructuredMessage = {
  id: 'msg-1',
  type: 'text' as const,
  from: 'agent-1',
  to: 'agent-2',
  payload: { text: 'Hello' },
  timestamp: Date.now(),
};

describe('messageRoutes', () => {
  describe('POST /api/messages/send', () => {
    beforeEach(async () => {
      sendTextMock.mockResolvedValue('msg-123');
      sendTaskAssignmentMock.mockResolvedValue('msg-124');
      sendShutdownRequestMock.mockResolvedValue('msg-125');
      sendShutdownResponseMock.mockResolvedValue('msg-126');
      sendIdleNotificationMock.mockResolvedValue('msg-127');
    });

    it('sends text message and returns 201 with messageId', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/messages/send')
          .send({
            from: 'agent-1',
            to: 'agent-2',
            swarmRunId: 'swarm-1',
            message: 'Hello, world!',
            type: 'text',
          });

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
          data: {
            success: true,
            messageId: 'msg-123',
          },
        });

        expect(sendTextMock).toHaveBeenCalledWith(
          'swarm-1',
          'agent-1',
          'agent-2',
          'Hello, world!',
        );
      } finally {
        await fastify.close();
      }
    });

    it('sends task assignment message', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/messages/send')
          .send({
            from: 'team-lead',
            to: 'agent-1',
            swarmRunId: 'swarm-1',
            type: 'task_assignment',
            taskId: 'task-1',
            subject: 'Implement feature',
            description: 'Add OAuth login',
            priority: 5,
          });

        expect(response.status).toBe(201);
        expect(response.body.data.success).toBe(true);

        expect(sendTaskAssignmentMock).toHaveBeenCalledWith(
          'swarm-1',
          'team-lead',
          'agent-1',
          {
            taskId: 'task-1',
            subject: 'Implement feature',
            description: 'Add OAuth login',
            priority: 5,
          },
        );
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when task assignment missing taskId', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/messages/send')
          .send({
            from: 'team-lead',
            to: 'agent-1',
            swarmRunId: 'swarm-1',
            type: 'task_assignment',
            subject: 'Implement feature',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Task assignment requires taskId and subject');
        expect(sendTaskAssignmentMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when task assignment missing subject', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/messages/send')
          .send({
            from: 'team-lead',
            to: 'agent-1',
            swarmRunId: 'swarm-1',
            type: 'task_assignment',
            taskId: 'task-1',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Task assignment requires taskId and subject');
      } finally {
        await fastify.close();
      }
    });

    it('sends shutdown request message', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/messages/send')
          .send({
            from: 'team-lead',
            to: 'agent-1',
            swarmRunId: 'swarm-1',
            type: 'shutdown_request',
            requestId: 'req-1',
            reason: 'Work complete',
          });

        expect(response.status).toBe(201);
        expect(sendShutdownRequestMock).toHaveBeenCalledWith(
          'swarm-1',
          'team-lead',
          'agent-1',
          {
            requestId: 'req-1',
            reason: 'Work complete',
          },
        );
      } finally {
        await fastify.close();
      }
    });

    it('sends shutdown response message', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/messages/send')
          .send({
            from: 'agent-1',
            to: 'team-lead',
            swarmRunId: 'swarm-1',
            type: 'shutdown_response',
            requestId: 'req-1',
            approve: true,
            reason: 'Accepted',
          });

        expect(response.status).toBe(201);
        expect(sendShutdownResponseMock).toHaveBeenCalledWith(
          'swarm-1',
          'agent-1',
          'team-lead',
          {
            requestId: 'req-1',
            approve: true,
            reason: 'Accepted',
          },
        );
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for missing required fields', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/messages/send')
          .send({
            from: 'agent-1',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid message payload');
        expect(sendTextMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('handles JSON message content', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/messages/send')
          .send({
            from: 'agent-1',
            to: 'agent-2',
            swarmRunId: 'swarm-1',
            message: { data: 'custom' },
            type: 'text',
          });

        expect(response.status).toBe(201);
        expect(sendTextMock).toHaveBeenCalledWith(
          'swarm-1',
          'agent-1',
          'agent-2',
          '{"data":"custom"}',
        );
      } finally {
        await fastify.close();
      }
    });
  });

  describe('POST /api/messages/broadcast', () => {
    it('broadcasts text message to all recipients', async () => {
      broadcastMock.mockResolvedValue(['msg-1', 'msg-2', 'msg-3']);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/messages/broadcast')
          .send({
            from: 'team-lead',
            swarmRunId: 'swarm-1',
            recipients: ['agent-1', 'agent-2', 'agent-3'],
            message: 'Update available',
            type: 'text',
          });

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
          data: {
            success: true,
            messageIds: ['msg-1', 'msg-2', 'msg-3'],
            count: 3,
          },
        });

        expect(broadcastMock).toHaveBeenCalledWith(
          'swarm-1',
          'team-lead',
          ['agent-1', 'agent-2', 'agent-3'],
          expect.objectContaining({
            type: 'text',
            from: 'team-lead',
            to: '*',
          }),
        );
      } finally {
        await fastify.close();
      }
    });

    it('broadcasts task assignment', async () => {
      broadcastMock.mockResolvedValue(['msg-1', 'msg-2']);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/messages/broadcast')
          .send({
            from: 'team-lead',
            swarmRunId: 'swarm-1',
            recipients: ['agent-1', 'agent-2'],
            type: 'task_assignment',
            taskId: 'task-1',
            subject: 'Review code',
            priority: 3,
          });

        expect(response.status).toBe(201);
        expect(broadcastMock).toHaveBeenCalledWith(
          'swarm-1',
          'team-lead',
          ['agent-1', 'agent-2'],
          expect.objectContaining({
            type: 'task_assignment',
            payload: expect.objectContaining({
              taskId: 'task-1',
              subject: 'Review code',
              priority: 3,
            }),
          }),
        );
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for empty recipients array', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/messages/broadcast')
          .send({
            from: 'team-lead',
            swarmRunId: 'swarm-1',
            recipients: [],
            message: 'Test',
          });

        expect(response.status).toBe(400);
        expect(broadcastMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for missing recipients field', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/messages/broadcast')
          .send({
            from: 'team-lead',
            swarmRunId: 'swarm-1',
            message: 'Test',
          });

        expect(response.status).toBe(400);
        expect(broadcastMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });
  });

  describe('GET /api/messages/inbox', () => {
    it('returns inbox messages', async () => {
      getInboxMock.mockResolvedValue([mockStructuredMessage]);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/messages/inbox?agentName=agent-1&swarmRunId=swarm-1');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          data: [mockStructuredMessage],
          count: 1,
        });

        expect(getInboxMock).toHaveBeenCalledWith(
          'agent-1',
          'swarm-1',
          undefined,
        );
      } finally {
        await fastify.close();
      }
    });

    it('filters to unread only when specified', async () => {
      getInboxMock.mockResolvedValue([]);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/messages/inbox?agentName=agent-1&swarmRunId=swarm-1&unreadOnly=true');

        expect(response.status).toBe(200);

        expect(getInboxMock).toHaveBeenCalledWith(
          'agent-1',
          'swarm-1',
          { unreadOnly: true },
        );
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for missing agentName', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/messages/inbox?swarmRunId=swarm-1');

        expect(response.status).toBe(400);
        expect(getInboxMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for missing swarmRunId', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/messages/inbox?agentName=agent-1');

        expect(response.status).toBe(400);
        expect(getInboxMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('returns empty array when no messages', async () => {
      getInboxMock.mockResolvedValue([]);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/messages/inbox?agentName=agent-1&swarmRunId=swarm-1');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          data: [],
          count: 0,
        });
      } finally {
        await fastify.close();
      }
    });
  });

  describe('GET /api/messages/unread-count', () => {
    it('returns unread count', async () => {
      getUnreadCountMock.mockResolvedValue(5);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/messages/unread-count?agentName=agent-1&swarmRunId=swarm-1');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          data: {
            agentName: 'agent-1',
            swarmRunId: 'swarm-1',
            unreadCount: 5,
          },
        });

        expect(getUnreadCountMock).toHaveBeenCalledWith('agent-1', 'swarm-1');
      } finally {
        await fastify.close();
      }
    });

    it('returns 0 when no unread messages', async () => {
      getUnreadCountMock.mockResolvedValue(0);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/messages/unread-count?agentName=agent-1&swarmRunId=swarm-1');

        expect(response.status).toBe(200);
        expect(response.body.data.unreadCount).toBe(0);
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for missing agentName', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/messages/unread-count?swarmRunId=swarm-1');

        expect(response.status).toBe(400);
        expect(getUnreadCountMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for missing swarmRunId', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/messages/unread-count?agentName=agent-1');

        expect(response.status).toBe(400);
        expect(getUnreadCountMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });
  });

  describe('PATCH /api/messages/:messageId/read', () => {
    it('marks message as read', async () => {
      markAsReadMock.mockResolvedValue(undefined);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .patch('/api/messages/msg-123/read')
          .send({
            agentName: 'agent-1',
            swarmRunId: 'swarm-1',
          });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          data: {
            success: true,
            messageId: 'msg-123',
          },
        });

        expect(markAsReadMock).toHaveBeenCalledWith(
          'agent-1',
          'swarm-1',
          'msg-123',
        );
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for missing agentName', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .patch('/api/messages/msg-123/read')
          .send({
            swarmRunId: 'swarm-1',
          });

        expect(response.status).toBe(400);
        expect(markAsReadMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for missing swarmRunId', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .patch('/api/messages/msg-123/read')
          .send({
            agentName: 'agent-1',
          });

        expect(response.status).toBe(400);
        expect(markAsReadMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });
  });
});
