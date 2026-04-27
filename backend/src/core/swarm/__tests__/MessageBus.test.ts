/**
 * MessageBus Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageBus } from '../MessageBus.js';
import type {
  TaskAssignmentPayload,
  ShutdownRequestPayload,
  ShutdownResponsePayload,
  IdleNotificationPayload,
} from '../MessageBus.js';

// Mock Mailbox functions
const {
  writeToMailboxMock,
  readMailboxMock,
  getUnreadCountMock,
  markMessageAsReadByIdMock,
  MailboxMock,
} = vi.hoisted(() => {
  const writeToMailboxMock = vi.fn();
  const readMailboxMock = vi.fn();
  const getUnreadCountMock = vi.fn();
  const markMessageAsReadByIdMock = vi.fn();

  return {
    writeToMailboxMock,
    readMailboxMock,
    getUnreadCountMock,
    markMessageAsReadByIdMock,
    MailboxMock: {
      writeToMailbox: writeToMailboxMock,
      readMailbox: readMailboxMock,
      getUnreadCount: getUnreadCountMock,
      markMessageAsReadById: markMessageAsReadByIdMock,
    },
  };
});

vi.mock('../Mailbox.js', () => ({
  writeToMailbox: writeToMailboxMock,
  readMailbox: readMailboxMock,
  getUnreadCount: getUnreadCountMock,
  markMessageAsReadById: markMessageAsReadByIdMock,
}));

describe('MessageBus', () => {
  let messageBus: MessageBus;
  const swarmRunId = 'test-swarm-1';

  beforeEach(() => {
    messageBus = new MessageBus();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('sendDirectMessage', () => {
    it('serializes StructuredMessage as JSON and calls writeToMailbox', async () => {
      const mockMessageId = 'msg-123';
      writeToMailboxMock.mockResolvedValue(mockMessageId);

      const structuredMessage = {
        id: 'test-id',
        type: 'text' as const,
        from: 'agent-1',
        to: 'agent-2',
        payload: { text: 'Hello' },
        timestamp: Date.now(),
      };

      const result = await messageBus.sendDirectMessage(
        swarmRunId,
        'agent-1',
        'agent-2',
        structuredMessage,
      );

      expect(result).toBe(mockMessageId);
      expect(writeToMailboxMock).toHaveBeenCalledTimes(1);
      expect(writeToMailboxMock).toHaveBeenCalledWith(
        'agent-2',
        expect.objectContaining({
          from: 'agent-1',
          text: expect.stringContaining('"type":"text"'),
          read: false,
        }),
        { swarmRunId },
      );
    });

    it('includes timestamp in MailboxMessage', async () => {
      writeToMailboxMock.mockResolvedValue('msg-123');

      const timestamp = 1743456000000;
      const structuredMessage = {
        id: 'test-id',
        type: 'text' as const,
        from: 'agent-1',
        to: 'agent-2',
        payload: { text: 'Hello' },
        timestamp,
      };

      await messageBus.sendDirectMessage(
        swarmRunId,
        'agent-1',
        'agent-2',
        structuredMessage,
      );

      const mailboxCall = writeToMailboxMock.mock.calls[0];
      expect(mailboxCall[1].timestamp).toBe(new Date(timestamp).toISOString());
    });

    it('propagates writeToMailbox errors', async () => {
      const error = new Error('Mailbox write failed');
      writeToMailboxMock.mockRejectedValue(error);

      const structuredMessage = {
        id: 'test-id',
        type: 'text' as const,
        from: 'agent-1',
        to: 'agent-2',
        payload: { text: 'Hello' },
        timestamp: Date.now(),
      };

      await expect(
        messageBus.sendDirectMessage(
          swarmRunId,
          'agent-1',
          'agent-2',
          structuredMessage,
        ),
      ).rejects.toThrow('Mailbox write failed');
    });
  });

  describe('broadcast', () => {
    it('sends message to all recipients with unique IDs', async () => {
      const messageIds = ['msg-1', 'msg-2', 'msg-3'];
      let callCount = 0;
      writeToMailboxMock.mockImplementation(async () => messageIds[callCount++]);

      const result = await messageBus.broadcast(
        swarmRunId,
        'agent-1',
        ['agent-2', 'agent-3', 'agent-4'],
        {
          type: 'text',
          from: 'agent-1',
          to: '*',
          payload: { text: 'Broadcast message' },
        },
      );

      expect(result).toEqual(messageIds);
      expect(writeToMailboxMock).toHaveBeenCalledTimes(3);
      expect(writeToMailboxMock).toHaveBeenCalledWith('agent-2', expect.anything(), { swarmRunId });
      expect(writeToMailboxMock).toHaveBeenCalledWith('agent-3', expect.anything(), { swarmRunId });
      expect(writeToMailboxMock).toHaveBeenCalledWith('agent-4', expect.anything(), { swarmRunId });
    });

    it('generates unique message IDs for each recipient', async () => {
      writeToMailboxMock.mockImplementation(async () => 'msg-id');

      await messageBus.broadcast(
        swarmRunId,
        'sender',
        ['recipient-1', 'recipient-2'],
        {
          type: 'text',
          from: 'sender',
          to: '*',
          payload: { text: 'Test' },
        },
      );

      const calls = writeToMailboxMock.mock.calls;
      const message1 = JSON.parse(calls[0][1].text);
      const message2 = JSON.parse(calls[1][1].text);

      expect(message1.id).not.toBe(message2.id);
    });

    it('generates unique timestamps for each recipient', async () => {
      writeToMailboxMock.mockImplementation(async () => 'msg-id');

      const beforeTime = Date.now();
      await messageBus.broadcast(
        swarmRunId,
        'sender',
        ['recipient-1', 'recipient-2'],
        {
          type: 'text',
          from: 'sender',
          to: '*',
          payload: { text: 'Test' },
        },
      );
      const afterTime = Date.now();

      const calls = writeToMailboxMock.mock.calls;
      const message1 = JSON.parse(calls[0][1].text);
      const message2 = JSON.parse(calls[1][1].text);

      expect(message1.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(message1.timestamp).toBeLessThanOrEqual(afterTime);
      expect(message2.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(message2.timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('returns empty array for empty recipients list', async () => {
      const result = await messageBus.broadcast(
        swarmRunId,
        'sender',
        [],
        {
          type: 'text',
          from: 'sender',
          to: '*',
          payload: { text: 'Test' },
        },
      );

      expect(result).toEqual([]);
      expect(writeToMailboxMock).not.toHaveBeenCalled();
    });
  });

  describe('getInbox', () => {
    it('parses JSON from MailboxMessage.text field', async () => {
      const structuredMessages = [
        {
          id: 'msg-1',
          type: 'text' as const,
          from: 'agent-2',
          to: 'agent-1',
          payload: { text: 'Hello' },
          timestamp: Date.now(),
        },
        {
          id: 'msg-2',
          type: 'task_assignment' as const,
          from: 'team-lead',
          to: 'agent-1',
          payload: { taskId: 'task-1', subject: 'Do something' },
          timestamp: Date.now(),
        },
      ];

      readMailboxMock.mockResolvedValue(
        structuredMessages.map((msg) => ({
          id: msg.id,
          from: msg.from,
          text: JSON.stringify(msg),
          timestamp: new Date(msg.timestamp).toISOString(),
          read: false,
        })),
      );

      const result = await messageBus.getInbox('agent-1', swarmRunId);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(structuredMessages[0]);
      expect(result[1]).toEqual(structuredMessages[1]);
    });

    it('filters to unread messages when unreadOnly is true', async () => {
      readMailboxMock.mockResolvedValue([]);

      await messageBus.getInbox('agent-1', swarmRunId, { unreadOnly: true });

      expect(readMailboxMock).toHaveBeenCalledWith('agent-1', {
        swarmRunId,
        unreadOnly: true,
      });
    });

    it('skips messages that cannot be parsed as StructuredMessage', async () => {
      readMailboxMock.mockResolvedValue([
        {
          id: 'msg-1',
          from: 'agent-2',
          text: JSON.stringify({
            id: 'msg-1',
            type: 'text',
            from: 'agent-2',
            to: 'agent-1',
            payload: { text: 'Valid message' },
            timestamp: Date.now(),
          }),
          timestamp: new Date().toISOString(),
          read: false,
        },
        {
          id: 'msg-2',
          from: 'agent-3',
          text: 'Invalid JSON{{{',
          timestamp: new Date().toISOString(),
          read: false,
        },
        {
          id: 'msg-3',
          from: 'agent-4',
          text: 'Plain text legacy message',
          timestamp: new Date().toISOString(),
          read: false,
        },
      ]);

      const result = await messageBus.getInbox('agent-1', swarmRunId);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
    });

    it('returns empty array when mailbox is empty', async () => {
      readMailboxMock.mockResolvedValue([]);

      const result = await messageBus.getInbox('agent-1', swarmRunId);

      expect(result).toEqual([]);
    });
  });

  describe('getUnreadCount', () => {
    it('delegates to Mailbox getUnreadCount', async () => {
      getUnreadCountMock.mockResolvedValue(5);

      const result = await messageBus.getUnreadCount('agent-1', swarmRunId);

      expect(result).toBe(5);
      expect(getUnreadCountMock).toHaveBeenCalledWith('agent-1', swarmRunId);
    });

    it('returns 0 when no unread messages', async () => {
      getUnreadCountMock.mockResolvedValue(0);

      const result = await messageBus.getUnreadCount('agent-1', swarmRunId);

      expect(result).toBe(0);
    });
  });

  describe('markAsRead', () => {
    it('delegates to Mailbox markMessageAsReadById', async () => {
      markMessageAsReadByIdMock.mockResolvedValue(undefined);

      await messageBus.markAsRead('agent-1', swarmRunId, 'msg-123');

      expect(markMessageAsReadByIdMock).toHaveBeenCalledWith(
        'agent-1',
        'msg-123',
        swarmRunId,
      );
    });

    it('propagates errors from Mailbox', async () => {
      const error = new Error('Message not found');
      markMessageAsReadByIdMock.mockRejectedValue(error);

      await expect(
        messageBus.markAsRead('agent-1', swarmRunId, 'msg-123'),
      ).rejects.toThrow('Message not found');
    });
  });

  describe('convenience methods', () => {
    describe('sendText', () => {
      it('creates and sends text message', async () => {
        writeToMailboxMock.mockResolvedValue('msg-123');

        const result = await messageBus.sendText(
          swarmRunId,
          'agent-1',
          'agent-2',
          'Hello, world!',
        );

        expect(result).toBe('msg-123');
        expect(writeToMailboxMock).toHaveBeenCalledTimes(1);

        const mailboxMessage = writeToMailboxMock.mock.calls[0][1];
        const structuredMessage = JSON.parse(mailboxMessage.text);

        expect(structuredMessage.type).toBe('text');
        expect(structuredMessage.payload).toEqual({ text: 'Hello, world!' });
      });
    });

    describe('sendTaskAssignment', () => {
      it('creates and sends task assignment message', async () => {
        writeToMailboxMock.mockResolvedValue('msg-123');

        const payload: TaskAssignmentPayload = {
          taskId: 'task-1',
          subject: 'Implement feature',
          description: 'Add OAuth login',
          priority: 5,
        };

        const result = await messageBus.sendTaskAssignment(
          swarmRunId,
          'team-lead',
          'agent-1',
          payload,
        );

        expect(result).toBe('msg-123');
        expect(writeToMailboxMock).toHaveBeenCalledTimes(1);

        const mailboxMessage = writeToMailboxMock.mock.calls[0][1];
        const structuredMessage = JSON.parse(mailboxMessage.text);

        expect(structuredMessage.type).toBe('task_assignment');
        expect(structuredMessage.payload).toEqual(payload);
      });
    });

    describe('sendShutdownRequest', () => {
      it('creates and sends shutdown request message', async () => {
        writeToMailboxMock.mockResolvedValue('msg-123');

        const payload: ShutdownRequestPayload = {
          requestId: 'req-1',
          reason: 'Task completed',
        };

        const result = await messageBus.sendShutdownRequest(
          swarmRunId,
          'team-lead',
          'agent-1',
          payload,
        );

        expect(result).toBe('msg-123');

        const mailboxMessage = writeToMailboxMock.mock.calls[0][1];
        const structuredMessage = JSON.parse(mailboxMessage.text);

        expect(structuredMessage.type).toBe('shutdown_request');
        expect(structuredMessage.payload).toEqual(payload);
      });
    });

    describe('sendShutdownResponse', () => {
      it('creates and sends shutdown response message', async () => {
        writeToMailboxMock.mockResolvedValue('msg-123');

        const payload: ShutdownResponsePayload = {
          requestId: 'req-1',
          approve: true,
          reason: 'All done',
        };

        const result = await messageBus.sendShutdownResponse(
          swarmRunId,
          'agent-1',
          'team-lead',
          payload,
        );

        expect(result).toBe('msg-123');

        const mailboxMessage = writeToMailboxMock.mock.calls[0][1];
        const structuredMessage = JSON.parse(mailboxMessage.text);

        expect(structuredMessage.type).toBe('shutdown_response');
        expect(structuredMessage.payload).toEqual(payload);
      });
    });

    describe('sendIdleNotification', () => {
      it('creates and sends idle notification message', async () => {
        writeToMailboxMock.mockResolvedValue('msg-123');

        const payload: IdleNotificationPayload = {
          idleReason: 'available',
          lastTaskId: 'task-1',
          message: 'Ready for new work',
        };

        const result = await messageBus.sendIdleNotification(
          swarmRunId,
          'agent-1',
          'team-lead',
          payload,
        );

        expect(result).toBe('msg-123');

        const mailboxMessage = writeToMailboxMock.mock.calls[0][1];
        const structuredMessage = JSON.parse(mailboxMessage.text);

        expect(structuredMessage.type).toBe('idle_notification');
        expect(structuredMessage.payload).toEqual(payload);
      });
    });
  });
});
