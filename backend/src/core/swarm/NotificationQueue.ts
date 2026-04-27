/**
 * NotificationQueue — Queues notifications for background tasks.
 *
 * Background tasks cannot directly interrupt the user's workflow.
 * Instead, notifications are queued and drained when the user is ready.
 *
 * Adapted from Claude Code's message queue pattern.
 */

import type { QueuedNotification } from './types.js';

/** Default notification expiry in ms (1 hour) */
const DEFAULT_EXPIRY_MS = 60 * 60 * 1000;

/**
 * Internal queued notification with timestamp for expiry.
 */
interface StoredNotification extends QueuedNotification {
  /** When this notification was enqueued (ms since epoch) */
  enqueuedAt: number;
  /** Expiry time in ms since epoch */
  expiresAt: number;
}

// ────────────────────────────────────────────────────────────
// NotificationQueue
// ────────────────────────────────────────────────────────────

/**
 * Queue system for notifications destined for background tasks.
 *
 * Notifications are stored per-task and auto-expire after a configurable
 * TTL. Supports priority ordering and agent-scoped delivery.
 */
export class NotificationQueue {
  private queues = new Map<string, StoredNotification[]>();
  private expiryMs: number;

  /**
   * Create a new NotificationQueue.
   *
   * @param options - Optional configuration
   */
  constructor(options?: { expiryMs?: number }) {
    this.expiryMs = options?.expiryMs ?? DEFAULT_EXPIRY_MS;
  }

  /**
   * Enqueue a notification for a background task.
   *
   * @param taskId - The task ID to deliver to
   * @param notification - The notification to enqueue
   */
  enqueue(taskId: string, notification: QueuedNotification): void {
    let queue = this.queues.get(taskId);
    if (!queue) {
      queue = [];
      this.queues.set(taskId, queue);
    }

    const now = Date.now();
    queue.push({
      ...notification,
      enqueuedAt: now,
      expiresAt: now + this.expiryMs,
    });
  }

  /**
   * Drain all pending (non-expired) notifications for a task.
   * Removes and returns the drained notifications.
   *
   * @param taskId - The task ID to drain
   * @returns Array of pending notifications (expired ones are silently dropped)
   */
  drain(taskId: string): QueuedNotification[] {
    const queue = this.queues.get(taskId);
    if (!queue) return [];

    const now = Date.now();

    // Purge expired notifications
    const valid = queue.filter(n => n.expiresAt > now);

    // Sort by priority: 'next' first, then by enqueuedAt
    valid.sort((a, b) => {
      if (a.priority === 'next' && b.priority !== 'next') return -1;
      if (a.priority !== 'next' && b.priority === 'next') return 1;
      return a.enqueuedAt - b.enqueuedAt;
    });

    // Clear the queue
    this.queues.delete(taskId);

    // Strip internal fields
    return valid.map(({ enqueuedAt: _1, expiresAt: _2, ...rest }) => rest);
  }

  /**
   * Peek at pending notifications without removing them.
   * Expired notifications are silently dropped.
   *
   * @param taskId - The task ID to peek
   * @returns Array of pending notifications (copy)
   */
  peek(taskId: string): QueuedNotification[] {
    const queue = this.queues.get(taskId);
    if (!queue) return [];

    const now = Date.now();

    // Filter and sort (same as drain, but don't remove)
    return queue
      .filter(n => n.expiresAt > now)
      .sort((a, b) => {
        if (a.priority === 'next' && b.priority !== 'next') return -1;
        if (a.priority !== 'next' && b.priority === 'next') return 1;
        return a.enqueuedAt - b.enqueuedAt;
      })
      .map(({ enqueuedAt: _1, expiresAt: _2, ...rest }) => rest);
  }

  /**
   * Check if a task has any pending notifications.
   *
   * @param taskId - The task ID to check
   */
  hasPending(taskId: string): boolean {
    const queue = this.queues.get(taskId);
    if (!queue) return false;

    const now = Date.now();
    return queue.some(n => n.expiresAt > now);
  }

  /**
   * Get the count of pending notifications for a task.
   *
   * @param taskId - The task ID to count
   */
  count(taskId: string): number {
    const queue = this.queues.get(taskId);
    if (!queue) return 0;

    const now = Date.now();
    return queue.filter(n => n.expiresAt > now).length;
  }

  /**
   * Clear all notifications for a specific task.
   *
   * @param taskId - The task ID to clear
   */
  clear(taskId: string): void {
    this.queues.delete(taskId);
  }

  /**
   * Purge expired notifications from all queues.
   * Returns the number of expired notifications removed.
   */
  purgeExpired(): number {
    const now = Date.now();
    let purged = 0;

    for (const [taskId, queue] of Array.from(this.queues)) {
      const before = queue.length;
      const valid = queue.filter(n => n.expiresAt > now);
      purged += before - valid.length;

      if (valid.length === 0) {
        this.queues.delete(taskId);
      } else {
        this.queues.set(taskId, valid);
      }
    }

    return purged;
  }

  /**
   * Get all task IDs that have pending notifications.
   */
  getActiveTaskIds(): string[] {
    const now = Date.now();
    const result: string[] = [];

    for (const [taskId, queue] of Array.from(this.queues)) {
      if (queue.some(n => n.expiresAt > now)) {
        result.push(taskId);
      }
    }

    return result;
  }

  /**
   * Clear all queues.
   */
  clearAll(): void {
    this.queues.clear();
  }
}
