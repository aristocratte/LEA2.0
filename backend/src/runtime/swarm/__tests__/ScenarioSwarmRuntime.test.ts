import { describe, expect, it, vi } from 'vitest';
import { ScenarioSwarmRuntime } from '../ScenarioSwarmRuntime.js';
import { scenarioRegistry } from '../../scenarios/index.js';
import type { SwarmEventEnvelope, SwarmEventPayload } from '../../../types/events.js';
import type { SwarmEmitter } from '../../../agents/PentestSwarm.js';

function createEmitter() {
  const events: SwarmEventEnvelope<SwarmEventPayload>[] = [];
  let sequence = 0;
  return {
    events,
    emitter: {
      broadcast: vi.fn((pentestId: string, envelopeInfo: Omit<SwarmEventEnvelope<SwarmEventPayload>, 'id' | 'sequence' | 'timestamp'>) => {
        sequence += 1;
        const event = {
          ...envelopeInfo,
          id: `evt-${sequence}`,
          sequence,
          timestamp: Date.now(),
        } as SwarmEventEnvelope<SwarmEventPayload>;
        events.push(event);
        return event;
      }),
    } as unknown as SwarmEmitter,
  };
}

describe('ScenarioSwarmRuntime', () => {
  it('replays a deterministic Nia-only scenario to completion', async () => {
    const { emitter, events } = createEmitter();
    const runtime = new ScenarioSwarmRuntime(emitter, scenarioRegistry);

    const run = await runtime.start({
      pentestId: 'pentest-1',
      target: 'api.example.com',
      task: 'Respond directly',
      runtime: {
        mode: 'scenario',
        scenarioId: 'nia-only-reply',
        speed: 100,
      },
    });

    expect(run.status).toBe('RUNNING');

    await new Promise((resolve) => setTimeout(resolve, 25));

    const current = await runtime.getCurrentRun('pentest-1');
    expect(current?.status).toBe('COMPLETED');
    expect(events.map((event) => event.eventType)).toContain('assistant.message.done');
    expect(events.map((event) => event.eventType)).toContain('swarm.completed');
  });

  it('waits for approval resolution in the approval scenario', async () => {
    const { emitter, events } = createEmitter();
    const runtime = new ScenarioSwarmRuntime(emitter, scenarioRegistry);

    await runtime.start({
      pentestId: 'pentest-2',
      target: 'api.example.com',
      task: 'Require approval',
      runtime: {
        mode: 'scenario',
        scenarioId: 'multi-agent-approval',
        speed: 100,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(events.map((event) => event.eventType)).toContain('approval.requested');

    await runtime.approveSensitiveTool('pentest-2', 'approval-sensitive-sqlmap');
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(events.map((event) => event.eventType)).toContain('approval.resolved');
    expect(events.some((event) => {
      if (event.eventType !== 'assistant.message.done') {
        return false;
      }
      const text = 'text' in event.payload ? String(event.payload.text || '') : '';
      return text.includes('Approval received');
    })).toBe(true);
  });
});
