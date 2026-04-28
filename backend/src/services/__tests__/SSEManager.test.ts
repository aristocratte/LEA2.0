import { describe, expect, it, vi } from 'vitest';
import { SSEManager } from '../SSEManager.js';

describe('SSEManager replay retention', () => {
  it('seeds sequences from durable storage before emitting new events', () => {
    const manager = new SSEManager();

    manager.seedSequence('pt-1', 41);

    const event = manager.emit('pt-1', {
      runId: 'pt-1',
      source: 'system',
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'status_change',
      payload: { type: 'status_change', status: 'RUNNING' },
    });

    expect(event.sequence).toBe(42);
    expect(event.id).toMatch(/^evt-42-/);
  });

  it('persists emitted envelopes through the configured persistent event store', () => {
    const manager = new SSEManager();
    const persist = vi.fn().mockResolvedValue(undefined);
    manager.setPersistentEventStore({ persist });

    const event = manager.emit('pt-1', {
      runId: 'pt-1',
      source: 'system',
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'status_change',
      payload: { type: 'status_change', status: 'RUNNING' },
    });

    expect(persist).toHaveBeenCalledWith('pt-1', event);
  });

  it('keeps event replay state after the last client disconnects', () => {
    const manager = new SSEManager();
    const received: Array<{ event: string; id?: string; payload: unknown }> = [];

    const firstClient = {
      id: 'client-1',
      connectedAt: new Date(),
      send: (event: string, payload: unknown, id?: string) => {
        received.push({ event, payload, id });
      },
    };

    manager.register('pt-1', firstClient);
    const first = manager.emit('pt-1', {
      runId: 'pt-1',
      source: 'system',
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'status_change',
      payload: { type: 'status_change', status: 'RUNNING' },
    });
    const second = manager.emit('pt-1', {
      runId: 'pt-1',
      source: 'system',
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'status_change',
      payload: { type: 'status_change', status: 'RUNNING' },
    });

    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);

    manager.unregister('pt-1', 'client-1');

    const third = manager.emit('pt-1', {
      runId: 'pt-1',
      source: 'system',
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'status_change',
      payload: { type: 'status_change', status: 'RUNNING' },
    });

    expect(third.sequence).toBe(3);

    const replayed: Array<{ event: string; id?: string; payload: unknown }> = [];
    manager.register('pt-1', {
      id: 'client-2',
      connectedAt: new Date(),
      send: (event: string, payload: unknown, id?: string) => {
        replayed.push({ event, payload, id });
      },
    }, { lastEventId: second.id });

    expect(replayed).toHaveLength(1);
    expect(replayed[0].id).toBe(third.id);
  });
});
