import { beforeEach, describe, expect, it } from 'vitest';
import { useSwarmStore } from '../use-swarm-store';
import type { SwarmEventEnvelope, SwarmEventPayload } from '@/types';

function makeEvent(overrides: Partial<SwarmEventEnvelope<SwarmEventPayload>> = {}): SwarmEventEnvelope<SwarmEventPayload> {
  const payload = overrides.payload ?? { type: 'status_change', status: 'RUNNING' };

  return {
    id: overrides.id ?? 'evt-1',
    sequence: overrides.sequence ?? 1,
    timestamp: overrides.timestamp ?? Date.now(),
    runId: overrides.runId ?? 'pentest-1',
    source: overrides.source ?? 'system',
    audience: overrides.audience ?? 'internal',
    surfaceHint: overrides.surfaceHint ?? 'activity',
    eventType: overrides.eventType ?? payload.type,
    payload,
  } as SwarmEventEnvelope<SwarmEventPayload>;
}

describe('useSwarmStore event log replay', () => {
  beforeEach(() => {
    useSwarmStore.getState().clear();
  });

  it('ignores replayed duplicate events by durable run sequence', () => {
    const first = makeEvent({ id: 'evt-2-db-row-a', sequence: 2 });
    const replayDuplicate = makeEvent({ id: 'evt-2-db-row-b', sequence: 2 });
    const next = makeEvent({ id: 'evt-3-db-row-c', sequence: 3 });

    useSwarmStore.getState().addEvent(first);
    useSwarmStore.getState().addEvent(replayDuplicate);
    useSwarmStore.getState().addEvent(next);

    const state = useSwarmStore.getState();
    expect(state.eventLog.map((event) => event.sequence)).toEqual([2, 3]);
  });
});
