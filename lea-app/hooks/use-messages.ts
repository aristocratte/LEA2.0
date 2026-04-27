/**
 * useMessages Hook
 *
 * Polls the messages API every 5 seconds to keep the inbox fresh.
 * Handles loading, error, and retry states.
 *
 * This is the SINGLE SOURCE OF TRUTH for agent message data in the frontend.
 * All components should use this hook instead of calling messagesApi directly.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  messagesApi,
  type StructuredMessage,
  type MessageType,
} from '@/lib/messages-api';

interface UseMessagesOptions {
  /**
   * Polling interval in milliseconds (default: 5000)
   */
  pollInterval?: number;
  /**
   * Whether to enable polling (default: true)
   */
  enabled?: boolean;
}

export function useMessages(
  agentName: string,
  swarmRunId: string,
  options: UseMessagesOptions = {}
) {
  const { pollInterval = 5000, enabled = true } = options;

  const [messages, setMessages] = useState<StructuredMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use ref to track if component is mounted
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const [data, unreadCount] = await Promise.all([
        messagesApi.getInbox({
          agentName,
          swarmRunId,
        }),
        messagesApi.getUnreadCount({
          agentName,
          swarmRunId,
        }),
      ]);
      if (mountedRef.current) {
        setMessages(data);
        setUnreadCount(unreadCount);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch messages';
        setError(msg);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [agentName, swarmRunId]);

  // Initial fetch and polling
  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    refresh();

    // Set up polling
    const intervalId = setInterval(refresh, pollInterval);

    // Cleanup
    return () => {
      mountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [enabled, pollInterval, refresh]);

  // Send message to a specific recipient
  const send = useCallback(async (
    to: string,
    message: string,
    type: MessageType = 'text'
  ) => {
    const result = await messagesApi.sendMessage({
      from: agentName,
      to,
      swarmRunId,
      message,
      type,
    });
    // Refresh after sending
    await refresh();
    return result;
  }, [agentName, swarmRunId, refresh]);

  // Broadcast message to multiple recipients
  const broadcast = useCallback(async (
    recipients: string[],
    message: string
  ) => {
    const result = await messagesApi.broadcastMessage({
      from: agentName,
      swarmRunId,
      recipients,
      message,
    });
    // Refresh after broadcasting
    await refresh();
    return result;
  }, [agentName, swarmRunId, refresh]);

  // Get messages by type helper
  const getMessagesByType = useCallback((type: MessageType): StructuredMessage[] => {
    return messages.filter(m => m.type === type);
  }, [messages]);

  const markAsRead = useCallback(async (messageId: string) => {
    await messagesApi.markAsRead(messageId, { agentName, swarmRunId });
    await refresh();
  }, [agentName, swarmRunId, refresh]);

  return {
    messages,
    unreadCount,
    loading,
    error,
    refresh,
    send,
    broadcast,
    getMessagesByType,
    markAsRead,
  };
}
