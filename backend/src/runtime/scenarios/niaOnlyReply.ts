import type { ScenarioFactory } from '../swarm/ScenarioModel.js';

export const createNiaOnlyReplyScenario: ScenarioFactory = (context) => ({
  id: 'nia-only-reply',
  metadata: {
    title: 'Nia Only Reply',
    tags: ['nia', 'single-voice'],
    expectedOutcomes: ['No agent delegation', 'Center thread stays sparse'],
    reducedMotionPass: true,
  },
  prompt: 'Respond directly without dispatching specialists.',
  steps: [
    {
      kind: 'emit',
      event: {
        runId: context.runId,
        source: 'nia',
        audience: 'user',
        surfaceHint: 'main',
        eventType: 'swarm.started',
        payload: {
          type: 'swarm.started',
          status: 'RUNNING',
          target: context.target,
        },
      },
    },
    { kind: 'delay', ms: 120 },
    {
      kind: 'emit',
      event: {
        runId: context.runId,
        correlationId: 'msg-nia-only',
        source: 'nia',
        audience: 'user',
        surfaceHint: 'main',
        eventType: 'assistant.message.done',
        payload: {
          type: 'assistant.message.done',
          text: 'I can answer this directly without dispatching specialists. I will keep the center thread single-voice unless the evidence branches.',
        },
      },
    },
    { kind: 'delay', ms: 40 },
    {
      kind: 'emit',
      event: {
        runId: context.runId,
        source: 'nia',
        audience: 'user',
        surfaceHint: 'none',
        eventType: 'swarm.completed',
        payload: {
          type: 'swarm.completed',
          status: 'COMPLETED',
        },
      },
    },
  ],
});
