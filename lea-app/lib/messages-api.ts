/**
 * Messages API Client
 *
 * Functions for interacting with the agent messaging endpoints.
 * All calls hit /api/messages on the real backend.
 */

import { requestJson } from './api';

// ============================================
// TYPES
// ============================================

export type MessageType = 'text' | 'task_assignment' | 'shutdown_request' | 'shutdown_response' | 'idle_notification';

export interface StructuredMessage {
  id: string;
  type: MessageType;
  from: string;
  to: string;
  payload: unknown;
  timestamp: number;
  read?: boolean;
}

type RawMessageType = 'TEXT' | 'TASK_ASSIGNMENT' | 'SHUTDOWN_REQUEST' | 'SHUTDOWN_RESPONSE' | 'IDLE_NOTIFICATION' | MessageType;

interface RawStructuredMessage {
  id: string;
  type: RawMessageType;
  from: string;
  to: string;
  payload: unknown;
  timestamp: number;
}

interface SendMessageParams {
  from: string;
  to: string;
  swarmRunId: string;
  message: string;
  type?: string;
}

interface BroadcastMessageParams {
  from: string;
  swarmRunId: string;
  recipients: string[];
  message: string;
}

interface GetInboxParams {
  agentName: string;
  swarmRunId: string;
  unreadOnly?: boolean;
}

interface GetUnreadCountParams {
  agentName: string;
  swarmRunId: string;
}

function normalizeMessageType(type: RawMessageType): MessageType {
  const upper = String(type).toUpperCase();
  if (upper === 'TEXT') return 'text';
  if (upper === 'TASK_ASSIGNMENT') return 'task_assignment';
  if (upper === 'SHUTDOWN_REQUEST') return 'shutdown_request';
  if (upper === 'SHUTDOWN_RESPONSE') return 'shutdown_response';
  if (upper === 'IDLE_NOTIFICATION') return 'idle_notification';
  return 'text';
}

function normalizeStructuredMessage(message: RawStructuredMessage): StructuredMessage {
  return {
    id: message.id,
    type: normalizeMessageType(message.type),
    from: message.from,
    to: message.to,
    payload: message.payload,
    timestamp: message.timestamp,
  };
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Send a message from one agent to another
 * POST /api/messages/send
 */
export async function sendMessage(params: SendMessageParams): Promise<{ success: boolean }> {
  const res = await requestJson<{ data: { success: boolean } }>('/api/messages/send', {
    method: 'POST',
    body: params,
  });
  return res.data;
}

/**
 * Broadcast a message to multiple recipients
 * POST /api/messages/broadcast
 */
export async function broadcastMessage(params: BroadcastMessageParams): Promise<{ success: boolean }> {
  const res = await requestJson<{ data: { success: boolean } }>('/api/messages/broadcast', {
    method: 'POST',
    body: params,
  });
  return res.data;
}

/**
 * Get inbox messages for an agent
 * GET /api/messages/inbox?agentName=...&swarmRunId=...&unreadOnly=...
 */
export async function getInbox(params: GetInboxParams): Promise<StructuredMessage[]> {
  const query: Record<string, string | boolean> = {
    agentName: params.agentName,
    swarmRunId: params.swarmRunId,
  };
  if (params.unreadOnly !== undefined) {
    query.unreadOnly = params.unreadOnly;
  }

  const res = await requestJson<{ data: RawStructuredMessage[] }>('/api/messages/inbox', {
    query,
  });
  return res.data.map(normalizeStructuredMessage);
}

export async function getUnreadCount(params: GetUnreadCountParams): Promise<number> {
  const res = await requestJson<{
    data: {
      agentName: string;
      swarmRunId: string;
      unreadCount: number;
    };
  }>('/api/messages/unread-count', {
    query: {
      agentName: params.agentName,
      swarmRunId: params.swarmRunId,
    },
  });
  return res.data.unreadCount;
}

export async function markAsRead(
  messageId: string,
  params: GetUnreadCountParams,
): Promise<{ success: boolean; messageId: string }> {
  const res = await requestJson<{ data: { success: boolean; messageId: string } }>(
    `/api/messages/${encodeURIComponent(messageId)}/read`,
    {
      method: 'PATCH',
      body: {
        agentName: params.agentName,
        swarmRunId: params.swarmRunId,
      },
    },
  );
  return res.data;
}

// Export all functions as a grouped API object
export const messagesApi = {
  sendMessage,
  broadcastMessage,
  getInbox,
  getUnreadCount,
  markAsRead,
};
