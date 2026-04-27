/**
 * SSE Manager - Server-Sent Events Management
 *
 * Gère les connexions SSE pour le streaming temps réel des pentests
 */

import type { SwarmEventEnvelope, SwarmEventPayload } from '../types/events.js';
import type { SwarmTraceRecorder } from '../runtime/swarm/SwarmTraceRecorder.js';

interface SSEClient {
  id: string;
  send: (event: string, data: any, eventId?: string) => void;
  connectedAt: Date;
}

export class SSEManager {
  // Map<pentestId, Map<clientId, Client>>
  private clients: Map<string, Map<string, SSEClient>> = new Map();
  private eventSequenceByPentest: Map<string, number> = new Map();

  // Event queue for reconnection (last N events per pentest, max 5 minutes old)
  private eventQueue: Map<string, SwarmEventEnvelope<SwarmEventPayload>[]> = new Map();
  private cleanupTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // Queue TTL: 5 minutes (events older than this are not sent to reconnecting clients)
  private readonly QUEUE_TTL = 5 * 60 * 1000;
  private readonly MAX_QUEUE_SIZE = 1000;
  private traceRecorder: SwarmTraceRecorder | null = null;

  setTraceRecorder(recorder: SwarmTraceRecorder): void {
    this.traceRecorder = recorder;
  }

  /**
   * Register a new SSE client for a pentest
   */
  register(pentestId: string, client: SSEClient, options?: { lastEventId?: string }): string {
    this.cancelCleanup(pentestId);

    if (!this.clients.has(pentestId)) {
      this.clients.set(pentestId, new Map());
    }

    this.clients.get(pentestId)!.set(client.id, client);

    const lastSequence = this.parseLastEventSequence(options?.lastEventId);

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
      if (typeof lastSequence === 'number' && event.sequence <= lastSequence) {
        return;
      }
      try {
        client.send(event.eventType, event, event.id);
        sentCount++;
      } catch (error) {
        console.error(`[SSE] Error replaying event ${event.id} to client ${client.id}:`, error);
      }
    });

    if (sentCount > 0) {
      console.log(`[SSE] Sent ${sentCount} cached events to client ${client.id} (lastSequence=${lastSequence ?? 'none'})`);
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
    // Clean up empty client maps, but keep replay queues/sequences briefly so
    // reconnecting clients can recover events emitted while no client was open.
    if (clients?.size === 0) {
      this.clients.delete(pentestId);
      this.scheduleCleanup(pentestId);
    }
    console.log(`[SSE] ✗ Client ${clientId} unregistered for pentest ${pentestId}`);
  }

  /**
   * Emit a strongly typed SwarmEvent
   */
  emit<T extends SwarmEventPayload>(pentestId: string, envelopeInfo: Omit<SwarmEventEnvelope<T>, 'sequence' | 'timestamp' | 'id'> & Partial<Pick<SwarmEventEnvelope<T>, 'id'>>): SwarmEventEnvelope<T> {
    const sequence = this.nextSequence(pentestId);
    const eventId = envelopeInfo.id || `evt-${sequence}-${Date.now()}`;

    const event: SwarmEventEnvelope<T> = {
      ...envelopeInfo,
      id: eventId,
      sequence,
      timestamp: Date.now(),
    };

    // Queue event (keep last MAX_QUEUE_SIZE events)
    if (!this.eventQueue.has(pentestId)) {
      this.eventQueue.set(pentestId, []);
    }
    const queue = this.eventQueue.get(pentestId)!;
    queue.push(event as SwarmEventEnvelope<SwarmEventPayload>);

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
          client.send(event.eventType, event, event.id);
        } catch (error) {
          console.error(`[SSE] Error sending to client ${client.id}:`, error);
        }
      });
    }

    this.traceRecorder?.recordEnvelope(pentestId, event as SwarmEventEnvelope<SwarmEventPayload>);

    return event;
  }

  /**
   * Broadcast an event dynamically
   */
  broadcast<T extends SwarmEventPayload>(pentestId: string, envelopeInfo: Omit<SwarmEventEnvelope<T>, 'sequence' | 'timestamp' | 'id'>): SwarmEventEnvelope<T> {
    return this.emit(pentestId, envelopeInfo);
  }

  getLatestSequence(pentestId: string): number {
    return this.eventSequenceByPentest.get(pentestId) || 0;
  }

  private nextSequence(pentestId: string): number {
    const next = (this.eventSequenceByPentest.get(pentestId) || 0) + 1;
    this.eventSequenceByPentest.set(pentestId, next);
    return next;
  }

  private parseLastEventSequence(lastEventId?: string): number | undefined {
    if (!lastEventId) {
      return undefined;
    }

    const trimmed = lastEventId.trim();
    if (!trimmed) {
      return undefined;
    }

    if (/^\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }

    const match = /^evt-(\d+)(?:-|$)/.exec(trimmed);
    if (!match) {
      return undefined;
    }

    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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
      Array.from(clients.keys()).forEach((clientId) => {
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

  private scheduleCleanup(pentestId: string): void {
    this.cancelCleanup(pentestId);
    const timer = setTimeout(() => {
      if (this.getClientsCount(pentestId) > 0) return;
      this.eventQueue.delete(pentestId);
      this.eventSequenceByPentest.delete(pentestId);
      this.cleanupTimers.delete(pentestId);
    }, this.QUEUE_TTL);
    this.cleanupTimers.set(pentestId, timer);
  }

  private cancelCleanup(pentestId: string): void {
    const timer = this.cleanupTimers.get(pentestId);
    if (!timer) return;
    clearTimeout(timer);
    this.cleanupTimers.delete(pentestId);
  }
}

// Singleton instance
export const sseManager = new SSEManager();
