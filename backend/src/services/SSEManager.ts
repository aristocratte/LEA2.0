/**
 * SSE Manager - Server-Sent Events Management
 *
 * Gère les connexions SSE pour le streaming temps réel des pentests
 */

interface SSEClient {
  id: string;
  send: (event: string, data: any, eventId?: number) => void;
  connectedAt: Date;
}

interface SSEEvent {
  id: number;
  type: string;
  data: any;
  timestamp: number;
}

export class SSEManager {
  // Map<pentestId, Map<clientId, Client>>
  private clients: Map<string, Map<string, SSEClient>> = new Map();
  private eventSequenceByPentest: Map<string, number> = new Map();

  // Event queue for reconnection (last N events per pentest, max 5 minutes old)
  private eventQueue: Map<string, SSEEvent[]> = new Map();

  // Queue TTL: 5 minutes (events older than this are not sent to reconnecting clients)
  private readonly QUEUE_TTL = 5 * 60 * 1000;
  private readonly MAX_QUEUE_SIZE = 1000;

  /**
   * Register a new SSE client for a pentest
   */
  register(pentestId: string, client: SSEClient, options?: { lastEventId?: number }): string {
    if (!this.clients.has(pentestId)) {
      this.clients.set(pentestId, new Map());
    }

    this.clients.get(pentestId)!.set(client.id, client);

    const lastEventId = Number.isFinite(options?.lastEventId)
      ? Number(options?.lastEventId)
      : undefined;

    // Send queued events for reconnection (only recent events within TTL)
    const queue = this.eventQueue.get(pentestId) || [];
    const now = Date.now();
    let sentCount = 0;
    queue.forEach(event => {
      // Only send events that are within the TTL window
      if (now - event.timestamp >= this.QUEUE_TTL) {
        return;
      }
      // If client provides Last-Event-ID, replay only missing events.
      if (typeof lastEventId === 'number' && event.id <= lastEventId) {
        return;
      }
      try {
        client.send(event.type, event.data, event.id);
        sentCount++;
      } catch (error) {
        console.error(`[SSE] Error replaying event ${event.id} to client ${client.id}:`, error);
      }
    });

    if (sentCount > 0) {
      console.log(`[SSE] Sent ${sentCount} cached events to client ${client.id} (lastEventId=${lastEventId ?? 'none'})`);
    }

    console.log(`[SSE] ✓ Client ${client.id} registered for pentest ${pentestId}`);
    return client.id;
  }

  /**
   * Unregister a client
   */
  unregister(pentestId: string, clientId: string): void {
    const clients = this.clients.get(pentestId);
    clients?.delete(clientId);
    // Clean up empty client maps to prevent memory leaks
    if (clients?.size === 0) {
      this.clients.delete(pentestId);
      // Also clean up event queue for this pentest
      this.eventQueue.delete(pentestId);
      this.eventSequenceByPentest.delete(pentestId);
    }
    console.log(`[SSE] ✗ Client ${clientId} unregistered for pentest ${pentestId}`);
  }

  /**
   * Emit an event to all clients of a pentest
   */
  emit(pentestId: string, event: Omit<SSEEvent, 'id'> & Partial<Pick<SSEEvent, 'id'>>): SSEEvent {
    const normalizedEvent: SSEEvent = {
      id: typeof event.id === 'number' ? event.id : this.nextEventId(pentestId),
      type: event.type,
      data: event.data,
      timestamp: event.timestamp,
    };

    // Queue event (keep last MAX_QUEUE_SIZE events)
    if (!this.eventQueue.has(pentestId)) {
      this.eventQueue.set(pentestId, []);
    }
    const queue = this.eventQueue.get(pentestId)!;
    queue.push(normalizedEvent);

    // Remove old events beyond max size
    if (queue.length > this.MAX_QUEUE_SIZE) {
      queue.shift();
    }

    // Also clean up events older than TTL (to prevent queue bloat)
    const now = Date.now();
    while (queue.length > 0 && (now - queue[0].timestamp) > this.QUEUE_TTL) {
      queue.shift();
    }

    // Send to all connected clients
    const clients = this.clients.get(pentestId);
    if (clients) {
      clients.forEach(client => {
        try {
          client.send(normalizedEvent.type, normalizedEvent.data, normalizedEvent.id);
        } catch (error) {
          console.error(`[SSE] Error sending to client ${client.id}:`, error);
        }
      });
    }

    return normalizedEvent;
  }

  /**
   * Broadcast an event (convenience method)
   */
  broadcast(pentestId: string, event: { type: string; data: any }): SSEEvent {
    return this.emit(pentestId, {
      ...event,
      timestamp: Date.now(),
    });
  }

  getLatestEventId(pentestId: string): number {
    return this.eventSequenceByPentest.get(pentestId) || 0;
  }

  private nextEventId(pentestId: string): number {
    const next = (this.eventSequenceByPentest.get(pentestId) || 0) + 1;
    this.eventSequenceByPentest.set(pentestId, next);
    return next;
  }

  /**
   * Get number of connected clients for a pentest
   */
  getClientsCount(pentestId: string): number {
    return this.clients.get(pentestId)?.size || 0;
  }

  /**
   * Disconnect all clients for a pentest
   */
  disconnectAll(pentestId: string): void {
    const clients = this.clients.get(pentestId);
    if (clients) {
      clients.forEach((client, clientId) => {
        this.unregister(pentestId, clientId);
      });
    }
  }

  /**
   * Get all active pentests (with at least one connected client)
   */
  getActivePentests(): string[] {
    return Array.from(this.clients.keys()).filter(
      pentestId => this.getClientsCount(pentestId) > 0
    );
  }
}

// Singleton instance
export const sseManager = new SSEManager();
