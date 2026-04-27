/**
 * Mailbox — Filesystem-based IPC between agents
 *
 * Implements inter-agent communication using filesystem-based message queues
 * in the system temp directory. Each agent has a mailbox directory where other
 * agents can write messages, and agents poll their mailbox for new messages.
 *
 * Adapted from Claude Code's teammateMailbox.ts for LEA's swarm architecture.
 * Uses Node.js fs/promises for all filesystem operations.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MAILBOX_DIR_NAME, MAILBOX_MAX_AGE_MS, MAILBOX_MAX_RETRIES, MAILBOX_RETRY_DELAY_MS } from './constants.js';
import type { MailboxMessage } from './types.js';

/** Get the base mailbox directory */
function getMailboxBaseDir(swarmRunId?: string): string {
  if (swarmRunId) {
    return join(tmpdir(), MAILBOX_DIR_NAME, sanitize(swarmRunId));
  }
  return join(tmpdir(), MAILBOX_DIR_NAME);
}

/** Sanitize a name for use as a directory name */
function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Ensure a directory exists */
async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Get the mailbox directory for a specific agent */
function getAgentMailboxDir(agentName: string, swarmRunId?: string): string {
  return join(getMailboxBaseDir(swarmRunId), sanitize(agentName));
}

/** Get the path for a specific message file */
function getMessagePath(agentName: string, messageId: string, swarmRunId?: string): string {
  return join(getAgentMailboxDir(agentName, swarmRunId), `${messageId}.json`);
}

/**
 * Write a message to an agent's mailbox.
 *
 * @param recipientName - Name of the receiving agent
 * @param message - The message to send
 * @param options - Optional configuration
 * @returns The message ID
 */
export async function writeToMailbox(
  recipientName: string,
  message: MailboxMessage,
  options?: {
    swarmRunId?: string;
  },
): Promise<string> {
  const messageId = randomUUID();
  const dir = getAgentMailboxDir(recipientName, options?.swarmRunId);
  await ensureDir(dir);

  const messagePath = getMessagePath(recipientName, messageId, options?.swarmRunId);
  const payload: MailboxMessage & { id: string } = {
    ...message,
    id: messageId,
    timestamp: message.timestamp || new Date().toISOString(),
  };

  // Retry on transient filesystem errors
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < MAILBOX_MAX_RETRIES; attempt++) {
    try {
      await writeFile(messagePath, JSON.stringify(payload), 'utf-8');
      return messageId;
    } catch (err) {
      lastError = err as Error;
      if (attempt < MAILBOX_MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, MAILBOX_RETRY_DELAY_MS));
      }
    }
  }

  throw new Error(`Failed to write mailbox message: ${lastError?.message}`);
}

/**
 * Read all messages from an agent's mailbox.
 *
 * Messages are sorted by timestamp (oldest first).
 *
 * @param agentName - Name of the agent whose mailbox to read
 * @param options - Optional configuration
 * @returns Array of messages with their IDs
 */
export async function readMailbox(
  agentName: string,
  options?: {
    swarmRunId?: string;
    unreadOnly?: boolean;
  },
): Promise<Array<MailboxMessage & { id: string }>> {
  const dir = getAgentMailboxDir(agentName, options?.swarmRunId);

  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    // Mailbox directory doesn't exist yet — no messages
    return [];
  }

  // Filter to JSON message files
  const messageFiles = files.filter(f => f.endsWith('.json'));

  const messages: Array<MailboxMessage & { id: string }> = [];
  for (const file of Array.from(messageFiles)) {
    try {
      const content = await readFile(join(dir, file), 'utf-8');
      const parsed = JSON.parse(content) as MailboxMessage & { id: string };
      if (options?.unreadOnly && parsed.read) {
        continue;
      }
      messages.push(parsed);
    } catch {
      // Skip corrupt or unreadable files
    }
  }

  // Sort by timestamp (oldest first)
  messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return messages;
}

/**
 * Mark a specific message as read by its index in the mailbox.
 *
 * @param agentName - Agent whose mailbox to update
 * @param swarmRunId - Swarm run ID
 * @param index - Index of the message to mark as read
 */
export async function markMessageAsReadByIndex(
  agentName: string,
  swarmRunId: string,
  index: number,
): Promise<void> {
  const messages = await readMailbox(agentName, { swarmRunId });
  if (index < 0 || index >= messages.length) {
    return;
  }

  const message = messages[index];
  if (!message) return;

  const messagePath = getMessagePath(agentName, message.id, swarmRunId);
  try {
    const content = await readFile(messagePath, 'utf-8');
    const parsed = JSON.parse(content);
    parsed.read = true;
    await writeFile(messagePath, JSON.stringify(parsed), 'utf-8');
  } catch {
    // Ignore errors — message may have been cleaned up
  }
}

/**
 * Mark a specific message as read by its ID.
 */
export async function markMessageAsReadById(
  agentName: string,
  messageId: string,
  swarmRunId?: string,
): Promise<void> {
  const messagePath = getMessagePath(agentName, messageId, swarmRunId);
  try {
    const content = await readFile(messagePath, 'utf-8');
    const parsed = JSON.parse(content);
    parsed.read = true;
    await writeFile(messagePath, JSON.stringify(parsed), 'utf-8');
  } catch {
    // Ignore
  }
}

/**
 * Delete a specific message from a mailbox.
 */
export async function deleteMessage(
  agentName: string,
  messageId: string,
  swarmRunId?: string,
): Promise<void> {
  try {
    await unlink(getMessagePath(agentName, messageId, swarmRunId));
  } catch {
    // Ignore if already deleted
  }
}

/**
 * Clean up an agent's entire mailbox directory.
 */
export async function cleanupMailbox(agentName: string, swarmRunId?: string): Promise<void> {
  try {
    await rm(getAgentMailboxDir(agentName, swarmRunId), { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

/**
 * Clean up the entire swarm mailbox directory (all agents).
 */
export async function cleanupSwarmMailbox(swarmRunId: string): Promise<void> {
  try {
    await rm(getMailboxBaseDir(swarmRunId), { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

/**
 * Clean up all stale mailbox directories older than MAILBOX_MAX_AGE_MS.
 * Should be called periodically to prevent disk bloat.
 */
export async function cleanupStaleMailboxes(): Promise<number> {
  const baseDir = getMailboxBaseDir();
  let cleaned = 0;
  const now = Date.now();

  try {
    const entries = await readdir(baseDir);
    for (const entry of entries) {
      const entryPath = join(baseDir, entry);
      try {
        const stat = await import('node:fs/promises').then(fs => fs.stat(entryPath));
        if (now - stat.mtimeMs > MAILBOX_MAX_AGE_MS) {
          await rm(entryPath, { recursive: true, force: true });
          cleaned++;
        }
      } catch {
        // Skip entries we can't stat
      }
    }
  } catch {
    // Base directory doesn't exist
  }

  return cleaned;
}

/**
 * Get the unread message count for an agent's mailbox.
 */
export async function getUnreadCount(agentName: string, swarmRunId?: string): Promise<number> {
  const messages = await readMailbox(agentName, { swarmRunId, unreadOnly: true });
  return messages.length;
}
