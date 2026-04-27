/**
 * MessageBus — Structured inter-agent messaging facade
 *
 * Provides a typed layer over the filesystem-based Mailbox IPC system.
 * Wraps structured messages as JSON within the MailboxMessage.text field.
 *
 * This is a FACADE over Mailbox, not a replacement. It adds type safety
 * and structured message handling while delegating all storage to Mailbox.
 */

import { randomUUID } from 'node:crypto';
import type { MailboxMessage } from './types.js';
import {
  writeToMailbox,
  readMailbox,
  getUnreadCount,
  markMessageAsReadById,
} from './Mailbox.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Structured message types for inter-agent communication.
 */
export type StructuredMessageType =
  | 'task_assignment'
  | 'shutdown_request'
  | 'shutdown_response'
  | 'idle_notification'
  | 'text';

/**
 * Structured message envelope for inter-agent communication.
 *
 * The MessageBus serializes this as JSON in the MailboxMessage.text field.
 */
export interface StructuredMessage {
  /** Unique message ID */
  id: string;
  /** Message type determining payload structure */
  type: StructuredMessageType;
  /** Sender agent name */
  from: string;
  /** Recipient agent name, 'team-lead', or '*' for broadcast */
  to: string;
  /** Message payload (structure depends on type) */
  payload: unknown;
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

/**
 * Payload for task_assignment messages.
 */
export interface TaskAssignmentPayload {
  taskId: string;
  subject: string;
  description?: string;
  priority?: number;
}

/**
 * Payload for shutdown_request messages.
 */
export interface ShutdownRequestPayload {
  reason?: string;
  requestId: string;
}

/**
 * Payload for shutdown_response messages.
 */
export interface ShutdownResponsePayload {
  requestId: string;
  approve: boolean;
  reason?: string;
}

/**
 * Payload for idle_notification messages.
 */
export interface IdleNotificationPayload {
  lastTaskId?: string;
  message?: string;
  idleReason: 'available' | 'interrupted' | 'failed';
}

/**
 * Payload for plain text messages.
 */
export interface TextMessagePayload {
  text: string;
}

// ============================================================================
// MESSAGE BUS
// ============================================================================

/**
 * MessageBus provides a typed facade over the Mailbox IPC system.
 *
 * All messages are stored as JSON-serialized StructuredMessage objects
 * within the MailboxMessage.text field. This bridges structured and
 * unstructured messaging while maintaining type safety.
 */
export class MessageBus {
  /**
   * Send a direct message from one agent to another.
   *
   * Serializes the StructuredMessage as JSON and routes via Mailbox.
   *
   * @param swarmRunId - The swarm run ID for mailbox isolation
   * @param from - Sender agent name
   * @param to - Recipient agent name or 'team-lead'
   * @param message - The structured message to send
   * @returns The message ID
   */
  async sendDirectMessage(
    swarmRunId: string,
    from: string,
    to: string,
    message: StructuredMessage,
  ): Promise<string> {
    // Serialize StructuredMessage as JSON for MailboxMessage.text
    const mailboxMessage: MailboxMessage = {
      from,
      text: JSON.stringify(message),
      timestamp: new Date(message.timestamp).toISOString(),
      read: false,
    };

    // Write to recipient's mailbox via Mailbox
    return await writeToMailbox(to, mailboxMessage, { swarmRunId });
  }

  /**
   * Broadcast a message to multiple agents.
   *
   * Sends the same message to all recipients individually.
   *
   * @param swarmRunId - The swarm run ID for mailbox isolation
   * @param from - Sender agent name
   * @param recipients - Array of recipient agent names
   * @param message - The message template (id and timestamp will be generated per recipient)
   * @returns Array of message IDs (one per recipient)
   */
  async broadcast(
    swarmRunId: string,
    from: string,
    recipients: string[],
    message: Omit<StructuredMessage, 'id' | 'timestamp'>,
  ): Promise<string[]> {
    const messageIds: string[] = [];

    for (const to of recipients) {
      // Create unique message for each recipient
      const structuredMessage: StructuredMessage = {
        ...message,
        id: randomUUID(),
        timestamp: Date.now(),
      };

      const messageId = await this.sendDirectMessage(
        swarmRunId,
        from,
        to,
        structuredMessage,
      );

      messageIds.push(messageId);
    }

    return messageIds;
  }

  /**
   * Get inbox for an agent.
   *
   * Reads all messages from the agent's mailbox and parses them
   * as StructuredMessage objects.
   *
   * @param agentName - The agent whose inbox to read
   * @param swarmRunId - The swarm run ID for mailbox isolation
   * @param options - Optional filters
   * @returns Array of structured messages
   */
  async getInbox(
    agentName: string,
    swarmRunId: string,
    options?: { unreadOnly?: boolean },
  ): Promise<StructuredMessage[]> {
    const mailboxMessages = await readMailbox(agentName, {
      swarmRunId,
      unreadOnly: options?.unreadOnly,
    });

    // Parse JSON from MailboxMessage.text field
    const structuredMessages: StructuredMessage[] = [];

    for (const mailboxMessage of mailboxMessages) {
      try {
        const parsed = JSON.parse(mailboxMessage.text) as StructuredMessage;
        structuredMessages.push(parsed);
      } catch {
        // Skip messages that can't be parsed as StructuredMessage
        // They might be legacy plain-text messages
        continue;
      }
    }

    return structuredMessages;
  }

  /**
   * Get unread message count for an agent.
   *
   * @param agentName - The agent whose unread count to get
   * @param swarmRunId - The swarm run ID for mailbox isolation
   * @returns Number of unread messages
   */
  async getUnreadCount(
    agentName: string,
    swarmRunId: string,
  ): Promise<number> {
    return await getUnreadCount(agentName, swarmRunId);
  }

  /**
   * Mark a message as read.
   *
   * @param agentName - The agent whose message to mark
   * @param swarmRunId - The swarm run ID for mailbox isolation
   * @param messageId - The message ID to mark as read
   */
  async markAsRead(
    agentName: string,
    swarmRunId: string,
    messageId: string,
  ): Promise<void> {
    // First try direct mailbox file ID.
    await markMessageAsReadById(agentName, messageId, swarmRunId);

    // Then also support structured message IDs returned to the UI.
    const mailboxMessages = await readMailbox(agentName, { swarmRunId });
    for (const mailboxMessage of mailboxMessages) {
      try {
        const parsed = JSON.parse(mailboxMessage.text) as StructuredMessage;
        if (parsed.id === messageId) {
          await markMessageAsReadById(agentName, mailboxMessage.id, swarmRunId);
          break;
        }
      } catch {
        // Ignore non-structured mailbox entries.
      }
    }
  }

  /**
   * Send a text message (convenience method).
   *
   * @param swarmRunId - The swarm run ID
   * @param from - Sender agent name
   * @param to - Recipient agent name
   * @param text - Message text
   * @returns The message ID
   */
  async sendText(
    swarmRunId: string,
    from: string,
    to: string,
    text: string,
  ): Promise<string> {
    const message: StructuredMessage = {
      id: randomUUID(),
      type: 'text',
      from,
      to,
      payload: { text } as TextMessagePayload,
      timestamp: Date.now(),
    };

    return await this.sendDirectMessage(swarmRunId, from, to, message);
  }

  /**
   * Send a task assignment (convenience method).
   *
   * @param swarmRunId - The swarm run ID
   * @param from - Sender agent name
   * @param to - Recipient agent name
   * @param payload - Task assignment payload
   * @returns The message ID
   */
  async sendTaskAssignment(
    swarmRunId: string,
    from: string,
    to: string,
    payload: TaskAssignmentPayload,
  ): Promise<string> {
    const message: StructuredMessage = {
      id: randomUUID(),
      type: 'task_assignment',
      from,
      to,
      payload,
      timestamp: Date.now(),
    };

    return await this.sendDirectMessage(swarmRunId, from, to, message);
  }

  /**
   * Send a shutdown request (convenience method).
   *
   * @param swarmRunId - The swarm run ID
   * @param from - Sender agent name
   * @param to - Recipient agent name
   * @param payload - Shutdown request payload
   * @returns The message ID
   */
  async sendShutdownRequest(
    swarmRunId: string,
    from: string,
    to: string,
    payload: ShutdownRequestPayload,
  ): Promise<string> {
    const message: StructuredMessage = {
      id: randomUUID(),
      type: 'shutdown_request',
      from,
      to,
      payload,
      timestamp: Date.now(),
    };

    return await this.sendDirectMessage(swarmRunId, from, to, message);
  }

  /**
   * Send a shutdown response (convenience method).
   *
   * @param swarmRunId - The swarm run ID
   * @param from - Sender agent name
   * @param to - Recipient agent name
   * @param payload - Shutdown response payload
   * @returns The message ID
   */
  async sendShutdownResponse(
    swarmRunId: string,
    from: string,
    to: string,
    payload: ShutdownResponsePayload,
  ): Promise<string> {
    const message: StructuredMessage = {
      id: randomUUID(),
      type: 'shutdown_response',
      from,
      to,
      payload,
      timestamp: Date.now(),
    };

    return await this.sendDirectMessage(swarmRunId, from, to, message);
  }

  /**
   * Send an idle notification (convenience method).
   *
   * @param swarmRunId - The swarm run ID
   * @param from - Sender agent name
   * @param to - Recipient (typically 'team-lead')
   * @param payload - Idle notification payload
   * @returns The message ID
   */
  async sendIdleNotification(
    swarmRunId: string,
    from: string,
    to: string,
    payload: IdleNotificationPayload,
  ): Promise<string> {
    const message: StructuredMessage = {
      id: randomUUID(),
      type: 'idle_notification',
      from,
      to,
      payload,
      timestamp: Date.now(),
    };

    return await this.sendDirectMessage(swarmRunId, from, to, message);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default MessageBus;
