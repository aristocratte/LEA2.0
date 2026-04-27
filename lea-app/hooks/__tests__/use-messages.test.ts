// @vitest-environment jsdom
/**
 * useMessages Hook Tests
 *
 * Tests for the useMessages hook covering:
 * - Fetches inbox on mount (when enabled)
 * - Does not fetch when disabled
 * - Returns loading=true initially
 * - Returns error on fetch failure
 * - Clears error on successful retry
 * - send calls API and refreshes
 * - broadcast calls API and refreshes
 * - getMessagesByType filters correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMessages } from '../use-messages';
import { messagesApi, type StructuredMessage } from '@/lib/messages-api';

// Mock the messages-api module
vi.mock('@/lib/messages-api', () => ({
  messagesApi: {
    sendMessage: vi.fn(),
    broadcastMessage: vi.fn(),
    getInbox: vi.fn(),
    getUnreadCount: vi.fn(),
    markAsRead: vi.fn(),
  },
}));

const mockMessages: StructuredMessage[] = [
  {
    id: 'msg-1',
    type: 'task_assignment',
    from: 'supervisor',
    to: 'recon-agent',
    payload: { task: 'Scan target ports' },
    timestamp: Date.now() - 5000,
  },
  {
    id: 'msg-2',
    type: 'shutdown_request',
    from: 'operator',
    to: 'recon-agent',
    payload: { reason: 'User request' },
    timestamp: Date.now() - 10000,
  },
  {
    id: 'msg-3',
    type: 'idle_notification',
    from: 'recon-agent',
    to: 'supervisor',
    payload: { status: 'waiting for work' },
    timestamp: Date.now() - 15000,
  },
];

describe('useMessages', () => {
  const agentName = 'recon-agent';
  const swarmRunId = 'swarm-run-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Fetch', () => {
    it('fetches inbox on mount when enabled', async () => {
      vi.mocked(messagesApi.getInbox).mockResolvedValue(mockMessages);
      vi.mocked(messagesApi.getUnreadCount).mockResolvedValue(mockMessages.length);

      const { result } = await act(async () => {
        return renderHook(() => useMessages(agentName, swarmRunId, { enabled: true }));
      });

      await waitFor(() => {
        expect(messagesApi.getInbox).toHaveBeenCalledWith({
          agentName,
          swarmRunId,
        });
      });
      await waitFor(() => {
        expect(result.current.messages).toEqual(mockMessages);
        expect(result.current.loading).toBe(false);
      });
    });

    it('does not fetch when enabled=false', async () => {
      vi.mocked(messagesApi.getInbox).mockResolvedValue(mockMessages);
      vi.mocked(messagesApi.getUnreadCount).mockResolvedValue(mockMessages.length);

      const { result } = await act(async () => {
        return renderHook(() => useMessages(agentName, swarmRunId, { enabled: false }));
      });

      expect(messagesApi.getInbox).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(true);
      expect(result.current.messages).toEqual([]);
    });

    it('returns loading=true initially', async () => {
      vi.mocked(messagesApi.getInbox).mockResolvedValue(mockMessages);
      vi.mocked(messagesApi.getUnreadCount).mockResolvedValue(mockMessages.length);

      const { result } = await act(async () => {
        return renderHook(() => useMessages(agentName, swarmRunId, { enabled: false }));
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('sets unreadCount based on message count', async () => {
      vi.mocked(messagesApi.getInbox).mockResolvedValue(mockMessages);
      vi.mocked(messagesApi.getUnreadCount).mockResolvedValue(mockMessages.length);

      const { result } = await act(async () => {
        return renderHook(() => useMessages(agentName, swarmRunId, { enabled: true }));
      });

      await waitFor(() => {
        expect(result.current.unreadCount).toBe(mockMessages.length);
      });
    });
  });

  describe('Error Handling', () => {
    it('returns error on fetch failure', async () => {
      vi.mocked(messagesApi.getInbox).mockRejectedValue(new Error('Network error'));
      vi.mocked(messagesApi.getUnreadCount).mockResolvedValue(0);

      const { result } = await act(async () => {
        return renderHook(() => useMessages(agentName, swarmRunId, { enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
        expect(result.current.loading).toBe(false);
        expect(result.current.messages).toEqual([]);
      });
    });

    it('clears error on successful retry', async () => {
      vi.mocked(messagesApi.getInbox)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockMessages);
      vi.mocked(messagesApi.getUnreadCount).mockResolvedValue(mockMessages.length);

      const { result } = await act(async () => {
        return renderHook(() => useMessages(agentName, swarmRunId, { enabled: false }));
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
        expect(result.current.messages).toEqual(mockMessages);
      });
    });
  });

  describe('send', () => {
    it('calls sendMessage with correct parameters and refreshes', async () => {
      vi.mocked(messagesApi.getInbox).mockResolvedValue(mockMessages);
      vi.mocked(messagesApi.sendMessage).mockResolvedValue({ success: true });
      vi.mocked(messagesApi.getUnreadCount).mockResolvedValue(mockMessages.length);

      const { result } = await act(async () => {
        return renderHook(() => useMessages(agentName, swarmRunId, { enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.messages).toEqual(mockMessages);
      });

      await act(async () => {
        await result.current.send('supervisor', 'Hello from agent');
      });

      expect(messagesApi.sendMessage).toHaveBeenCalledWith({
        from: agentName,
        to: 'supervisor',
        swarmRunId,
        message: 'Hello from agent',
        type: 'text',
      });
      expect(messagesApi.getInbox).toHaveBeenCalledTimes(2);
    });

    it('calls sendMessage with type parameter', async () => {
      vi.mocked(messagesApi.getInbox).mockResolvedValue(mockMessages);
      vi.mocked(messagesApi.sendMessage).mockResolvedValue({ success: true });
      vi.mocked(messagesApi.getUnreadCount).mockResolvedValue(mockMessages.length);

      const { result } = await act(async () => {
        return renderHook(() => useMessages(agentName, swarmRunId, { enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.send('supervisor', 'Status update', 'text');
      });

      expect(messagesApi.sendMessage).toHaveBeenCalledWith({
        from: agentName,
        to: 'supervisor',
        swarmRunId,
        message: 'Status update',
        type: 'text',
      });
    });
  });

  describe('broadcast', () => {
    it('calls broadcastMessage with correct parameters and refreshes', async () => {
      vi.mocked(messagesApi.getInbox).mockResolvedValue(mockMessages);
      vi.mocked(messagesApi.broadcastMessage).mockResolvedValue({ success: true });
      vi.mocked(messagesApi.getUnreadCount).mockResolvedValue(mockMessages.length);

      const { result } = await act(async () => {
        return renderHook(() => useMessages(agentName, swarmRunId, { enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.messages).toEqual(mockMessages);
      });

      const recipients = ['agent-1', 'agent-2', 'agent-3'];
      await act(async () => {
        await result.current.broadcast(recipients, 'Broadcast message');
      });

      expect(messagesApi.broadcastMessage).toHaveBeenCalledWith({
        from: agentName,
        swarmRunId,
        recipients,
        message: 'Broadcast message',
      });
      // getInbox called once for initial refresh, once after broadcast
      expect(messagesApi.getInbox).toHaveBeenCalledTimes(2);
    });
  });

  describe('getMessagesByType', () => {
    it('filters messages by type correctly', async () => {
      vi.mocked(messagesApi.getInbox).mockResolvedValue(mockMessages);
      vi.mocked(messagesApi.getUnreadCount).mockResolvedValue(mockMessages.length);

      const { result } = await act(async () => {
        return renderHook(() => useMessages(agentName, swarmRunId, { enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.messages).toEqual(mockMessages);
      });

      const taskAssignments = result.current.getMessagesByType('task_assignment');
      expect(taskAssignments).toHaveLength(1);
      expect(taskAssignments[0].id).toBe('msg-1');

      const shutdownRequests = result.current.getMessagesByType('shutdown_request');
      expect(shutdownRequests).toHaveLength(1);
      expect(shutdownRequests[0].id).toBe('msg-2');

      const idleNotifications = result.current.getMessagesByType('idle_notification');
      expect(idleNotifications).toHaveLength(1);
      expect(idleNotifications[0].id).toBe('msg-3');

      const shutdownResponses = result.current.getMessagesByType('shutdown_response');
      expect(shutdownResponses).toHaveLength(0);
    });
  });

  describe('refresh', () => {
    it('calls getInbox and updates state', async () => {
      vi.mocked(messagesApi.getInbox).mockResolvedValue(mockMessages);
      vi.mocked(messagesApi.getUnreadCount).mockResolvedValue(mockMessages.length);

      const { result } = await act(async () => {
        return renderHook(() => useMessages(agentName, swarmRunId, { enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.messages).toEqual(mockMessages);
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeNull();
      });
    });
  });

  describe('Polling', () => {
    it('polls at the specified interval', async () => {
      vi.mocked(messagesApi.getInbox).mockResolvedValue(mockMessages);

      const { unmount } = await act(async () => {
        return renderHook(() => useMessages(agentName, swarmRunId, { pollInterval: 100, enabled: true }));
      });

      // Initial call
      await waitFor(() => {
        expect(messagesApi.getInbox).toHaveBeenCalled();
      });

      // Wait for at least one more poll (should be called at least twice)
      await waitFor(() => {
        expect(vi.mocked(messagesApi.getInbox).mock.calls.length).toBeGreaterThanOrEqual(2);
      }, { timeout: 500 });

      // Cleanup to stop polling
      unmount();
    });

    it('uses default poll interval of 5000ms', async () => {
      vi.mocked(messagesApi.getInbox).mockResolvedValue(mockMessages);

      const { unmount } = await act(async () => {
        return renderHook(() => useMessages(agentName, swarmRunId, { enabled: true }));
      });

      // Initial call should happen
      await waitFor(() => {
        expect(messagesApi.getInbox).toHaveBeenCalled();
      });

      // Cleanup to stop polling
      unmount();
    });
  });

  describe('Return Values', () => {
    it('returns correct state structure', async () => {
      vi.mocked(messagesApi.getInbox).mockResolvedValue(mockMessages);

      const { result } = await act(async () => {
        return renderHook(() => useMessages(agentName, swarmRunId, { enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current).toHaveProperty('messages');
        expect(result.current).toHaveProperty('unreadCount');
        expect(result.current).toHaveProperty('loading');
        expect(result.current).toHaveProperty('error');
        expect(result.current).toHaveProperty('refresh');
        expect(result.current).toHaveProperty('send');
        expect(result.current).toHaveProperty('broadcast');
        expect(result.current).toHaveProperty('getMessagesByType');
      });
    });
  });
});
