import { describe, expect, it, vi } from 'vitest';
import { SwarmReplayEngine } from '../SwarmReplayEngine.js';
import { ScenarioClock } from '../ScenarioClock.js';
import type { SwarmEventEnvelope, SwarmEventPayload } from '../../../types/events.js';
import type { SwarmEmitter } from '../../../agents/PentestSwarm.js';

function makeTrace(): SwarmEventEnvelope<SwarmEventPayload>[] {
  return [
    {
      id: 'evt-1',
      sequence: 1,
      timestamp: 1000,
      runId: 'run-1',
      source: 'nia',
      audience: 'user',
      surfaceHint: 'none',
      eventType: 'swarm.started',
      payload: { type: 'swarm.started', status: 'RUNNING', target: 'api.example.com' },
    },
    {
      id: 'evt-2',
      sequence: 2,
      timestamp: 1010,
      runId: 'run-1',
      correlationId: 'corr-1',
      source: 'nia',
      audience: 'user',
      surfaceHint: 'main',
      eventType: 'assistant.message.done',
      payload: { type: 'assistant.message.done', text: 'Hello from replay' },
    },
    {
      id: 'evt-3',
      sequence: 3,
      timestamp: 1020,
      runId: 'run-1',
      source: 'nia',
      audience: 'user',
      surfaceHint: 'none',
      eventType: 'swarm.completed',
      payload: { type: 'swarm.completed', status: 'COMPLETED' },
    },
  ];
}

describe('SwarmReplayEngine', () => {
  it('supports step and jump controls deterministically', async () => {
    const emitted: SwarmEventEnvelope<SwarmEventPayload>[] = [];
    let sequence = 0;
    const emitter = {
      broadcast: vi.fn((_pentestId: string, envelopeInfo: Omit<SwarmEventEnvelope<SwarmEventPayload>, 'id' | 'sequence' | 'timestamp'>) => {
        sequence += 1;
        const event = {
          ...envelopeInfo,
          id: `out-${sequence}`,
          sequence,
          timestamp: Date.now(),
        } as SwarmEventEnvelope<SwarmEventPayload>;
        emitted.push(event);
        return event;
      }),
    } as unknown as SwarmEmitter;

    const engine = new SwarmReplayEngine('pentest-1', makeTrace(), emitter, new ScenarioClock(100));
    await engine.start(false);
    await engine.step();
    expect(emitted).toHaveLength(1);
    expect(emitted[0].eventType).toBe('swarm.started');

    await engine.jumpToCorrelation('corr-1');
    expect(emitted.map((event) => event.eventType)).toEqual(['swarm.started', 'assistant.message.done']);

    await engine.jumpToSequence(99);
    expect(emitted[2].eventType).toBe('swarm.completed');
  });
});
