import type { ScenarioFactory } from '../swarm/ScenarioModel.js';

export const createParallelFailureScenario: ScenarioFactory = (context) => ({
  id: 'parallel-failure',
  metadata: {
    title: 'Parallel Failure and Partial Completion',
    tags: ['failure', 'timeout', 'partial'],
    expectedOutcomes: ['One branch times out', 'Run ends in failed or partial state'],
    reducedMotionPass: true,
  },
  prompt: 'Exercise timeout and partial failure paths under parallel activity.',
  steps: [
    {
      kind: 'emit',
      event: {
        runId: context.runId,
        source: 'nia',
        audience: 'user',
        surfaceHint: 'none',
        eventType: 'swarm.started',
        payload: {
          type: 'swarm.started',
          status: 'RUNNING',
          target: context.target,
        },
      },
    },
    {
      kind: 'parallel',
      branches: [
        {
          id: 'success-branch',
          label: 'Successful validation',
          steps: [
            {
              kind: 'emit',
              event: {
                runId: context.runId,
                correlationId: 'corr-success-agent',
                source: 'agent:validation',
                audience: 'internal',
                surfaceHint: 'activity',
                eventType: 'agent.running',
                payload: {
                  type: 'agent.running',
                  agentId: 'agent-validation',
                  role: 'Validation',
                  name: 'Template analyst',
                },
              },
            },
            { kind: 'delay', ms: 100 },
            {
              kind: 'emit',
              event: {
                runId: context.runId,
                correlationId: 'corr-success-agent',
                source: 'agent:validation',
                audience: 'internal',
                surfaceHint: 'activity',
                eventType: 'agent.completed',
                payload: {
                  type: 'agent.completed',
                  agentId: 'agent-validation',
                  role: 'Validation',
                  name: 'Template analyst',
                },
              },
            },
          ],
        },
        {
          id: 'failure-branch',
          label: 'Timeout branch',
          steps: [
            {
              kind: 'emit',
              event: {
                runId: context.runId,
                correlationId: 'corr-failure-agent',
                source: 'agent:ops',
                audience: 'internal',
                surfaceHint: 'activity',
                eventType: 'agent.running',
                payload: {
                  type: 'agent.running',
                  agentId: 'agent-ops',
                  role: 'Ops',
                  name: 'Timeout branch',
                },
              },
            },
            { kind: 'delay', ms: 110 },
            {
              kind: 'failure',
              code: 'timeout',
              message: 'Parallel terminal branch timed out while waiting for output',
            },
          ],
        },
      ],
    },
    {
      kind: 'emit',
      event: {
        runId: context.runId,
        source: 'nia',
        audience: 'user',
        surfaceHint: 'none',
        eventType: 'swarm.failed',
        payload: {
          type: 'swarm.failed',
          status: 'FAILED',
          error: 'Parallel terminal branch timed out while waiting for output',
        },
      },
    },
  ],
});
