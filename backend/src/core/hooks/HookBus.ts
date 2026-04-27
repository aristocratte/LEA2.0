/**
 * @module core/hooks/HookBus
 * @description Minimal event bus for runtime hook emission.
 *
 * Provides on/off/emit with:
 * - Type-safe event names and payloads
 * - Async handler support
 * - Error isolation (throwing handlers don't crash emitter)
 * - Multiple handlers per event (order preserved)
 *
 * @example
 * ```typescript
 * const bus = new HookBus();
 * bus.on('pre-tool', async (p) => { console.log('tool:', p.toolName); });
 * await bus.emit('pre-tool', { sessionId: '...', agentId: 'a1', toolName: 'bash', input: {}, timestamp: '...' });
 * ```
 */

import type {
  HookEventName,
  HookEventMap,
  HookHandler,
  StoredHandler,
} from './types.js';

// ============================================================================
// HOOKBUS
// ============================================================================

/**
 * Lightweight event bus for runtime hooks.
 *
 * Design decisions:
 * - Handlers are fire-and-forget observers, NOT middleware.
 *   They cannot modify payloads or block execution.
 * - Errors in handlers are caught and logged — never re-thrown.
 * - All handler invocations run concurrently via Promise.allSettled().
 * - No ordering guarantee between handlers of different events,
 *   but same-event handlers execute in registration order.
 */
export class HookBus {
  /** Per-event handler lists (registration order preserved) */
  private readonly handlers: Map<HookEventName, Set<StoredHandler>> = new Map();

  /**
   * Register a handler for an event.
   *
   * The same function reference can only be registered once per event
   * (duplicate registration is silently ignored).
   *
   * @param event - Event name to listen for
   * @param handler - Async or sync handler function
   * @returns Unsubscribe function (calls `off` internally)
   */
  on<E extends HookEventName>(event: E, handler: HookHandler<E>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }

    const set = this.handlers.get(event)!;
    const stored: StoredHandler = handler as StoredHandler;

    // Deduplicate by reference
    if (!set.has(stored)) {
      set.add(stored);
    }

    // Return unsubscribe closure
    return () => this.off(event, handler);
  }

  /**
   * Remove a previously registered handler.
   *
   * If the handler was not registered, this is a no-op.
   *
   * @param event - Event name
   * @param handler - The exact function reference passed to `on()`
   */
  off<E extends HookEventName>(event: E, handler: HookHandler<E>): void {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler as StoredHandler);
      if (set.size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  /**
   * Emit an event to all registered handlers.
   *
   * All handlers are invoked concurrently. Errors in individual
   * handlers are caught and logged — they do NOT prevent other
   * handlers from running, and they do NOT throw back to caller.
   *
   * @param event - Event name to emit
   * @param payload - Typed payload for this event
   * @returns Promise that resolves when all handlers have completed (or errored)
   */
  async emit<E extends HookEventName>(
    event: E,
    payload: HookEventMap[E],
  ): Promise<void> {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) {
      return; // Fast path: no listeners
    }

    // Snapshot handlers to avoid mutation during iteration
    const snapshot = Array.from(set);

    // Run all handlers concurrently; isolate errors
    await Promise.allSettled(
      snapshot.map((handler) => this.safeInvoke(handler, payload)),
    );
  }

  /**
   * Check if any handlers are registered for an event.
   *
   * @param event - Event name
   * @returns True if at least one handler is listening
   */
  hasListeners(event: HookEventName): boolean {
    const set = this.handlers.get(event);
    return set !== undefined && set.size > 0;
  }

  /**
   * Get count of handlers for an event (useful for debugging/testing).
   *
   * @param event - Event name
   * @returns Number of registered handlers
  */
  listenerCount(event: HookEventName): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /**
   * Remove ALL handlers for all events.
   * Useful for teardown/shutdown.
   */
  removeAll(): void {
    this.handlers.clear();
  }

  // ============================================================================
  // PRIVATE
  // ============================================================================

  /**
   * Invoke a single handler with error isolation.
   *
   * Catches both synchronous throws and rejected promises.
   * Logs the error but never propagates it.
   */
  private async safeInvoke(
    handler: StoredHandler,
    payload: unknown,
  ): Promise<void> {
    try {
      await handler(payload);
    } catch (error) {
      // Error isolation: log but never re-throw
      // Using console.error to avoid coupling to any logger dependency
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[HookBus] Handler threw error (isolated): ${message}`,
      );
    }
  }
}
