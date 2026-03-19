import type { ScenarioFactory } from '../swarm/ScenarioModel.js';

export const createMultiAgentApprovalScenario: ScenarioFactory = (context) => ({
  id: 'multi-agent-approval',
  metadata: {
    title: 'Multi-Agent Approval',
    tags: ['delegation', 'approval', 'artifact'],
    expectedOutcomes: [
      'Center thread remains calm under multi-agent load',
      'Approval is requested and resolved',
      'Artifact links to review pane',
    ],
    reducedMotionPass: true,
  },
  prompt: 'Split work into specialists, hold one risky action for approval, and produce an artifact.',
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
      kind: 'emit',
      event: {
        runId: context.runId,
        correlationId: 'msg-delegation-intro',
        source: 'nia',
        audience: 'user',
        surfaceHint: 'main',
        eventType: 'assistant.message.done',
        payload: {
          type: 'assistant.message.done',
          text: 'I am splitting the work into specialists, but I will keep this thread composed as a single operator voice.',
        },
      },
    },
    {
      kind: 'emit',
      event: {
        runId: context.runId,
        correlationId: 'corr-thinking',
        source: 'nia',
        audience: 'user',
        surfaceHint: 'main',
        eventType: 'thinking.summary.done',
        payload: {
          type: 'thinking.summary.done',
          text: 'The surface is branching into recon, auth validation, and evidence shaping. I am parallelizing the noisy work and reserving the center thread for synthesis.',
        },
      },
    },
    {
      kind: 'parallel',
      branches: [
        {
          id: 'branch-recon',
          label: 'Recon branch',
          steps: [
            {
              kind: 'emit',
              event: {
                runId: context.runId,
                correlationId: 'corr-agent-recon',
                source: 'agent:recon',
                audience: 'internal',
                surfaceHint: 'activity',
                eventType: 'agent.spawning',
                payload: {
                  type: 'agent.spawning',
                  agentId: 'agent-recon',
                  role: 'Recon',
                  name: 'Surface mapper',
                },
              },
            },
            {
              kind: 'emit',
              event: {
                runId: context.runId,
                correlationId: 'corr-tool-httpx',
                source: 'agent:recon',
                audience: 'internal',
                surfaceHint: 'activity',
                eventType: 'tool.call.started',
                payload: {
                  type: 'tool.call.started',
                  toolName: 'httpx',
                  agentId: 'agent-recon',
                },
              },
            },
            { kind: 'delay', ms: 150 },
            {
              kind: 'artifact',
              artifactId: 'artifact-httpx-summary',
              reviewId: 'review-httpx-summary',
              event: {
                runId: context.runId,
                correlationId: 'corr-tool-httpx',
                source: 'agent:recon',
                audience: 'internal',
                surfaceHint: 'review',
                eventType: 'artifact.created',
                payload: {
                  type: 'artifact.created',
                  artifactId: 'artifact-httpx-summary',
                  title: 'httpx triage sweep',
                  reviewId: 'review-httpx-summary',
                },
              },
            },
            {
              kind: 'emit',
              event: {
                runId: context.runId,
                correlationId: 'corr-tool-httpx',
                source: 'agent:recon',
                audience: 'internal',
                surfaceHint: 'activity',
                eventType: 'tool.call.completed',
                payload: {
                  type: 'tool.call.completed',
                  toolName: 'httpx',
                  agentId: 'agent-recon',
                },
              },
            },
            {
              kind: 'emit',
              event: {
                runId: context.runId,
                correlationId: 'corr-agent-recon',
                source: 'agent:recon',
                audience: 'internal',
                surfaceHint: 'activity',
                eventType: 'agent.completed',
                payload: {
                  type: 'agent.completed',
                  agentId: 'agent-recon',
                  role: 'Recon',
                  name: 'Surface mapper',
                },
              },
            },
          ],
        },
        {
          id: 'branch-terminal',
          label: 'Terminal branch',
          steps: [
            {
              kind: 'emit',
              event: {
                runId: context.runId,
                correlationId: 'corr-terminal-curl',
                source: 'agent:ops',
                audience: 'internal',
                surfaceHint: 'activity',
                eventType: 'terminal.stream.started',
                payload: {
                  type: 'terminal.stream.started',
                  streamId: 'stream-curl-1',
                  streamType: 'stdout',
                  chunk: '',
                },
              },
            },
            { kind: 'delay', ms: 80 },
            {
              kind: 'emit',
              event: {
                runId: context.runId,
                correlationId: 'corr-terminal-curl',
                source: 'agent:ops',
                audience: 'internal',
                surfaceHint: 'review',
                eventType: 'terminal.stream.delta',
                payload: {
                  type: 'terminal.stream.delta',
                  streamId: 'stream-curl-1',
                  streamType: 'stdout',
                  chunk: 'HTTP/2 302\\nlocation: /auth',
                },
              },
            },
            { kind: 'delay', ms: 70 },
            {
              kind: 'emit',
              event: {
                runId: context.runId,
                correlationId: 'corr-terminal-curl',
                source: 'agent:ops',
                audience: 'internal',
                surfaceHint: 'activity',
                eventType: 'terminal.stream.done',
                payload: {
                  type: 'terminal.stream.done',
                  streamId: 'stream-curl-1',
                  streamType: 'stdout',
                  chunk: '',
                },
              },
            },
          ],
        },
      ],
    },
    {
      kind: 'approval',
      approvalId: 'approval-sensitive-sqlmap',
      request: {
        runId: context.runId,
        correlationId: 'approval-sensitive-sqlmap',
        source: 'nia',
        audience: 'user',
        surfaceHint: 'main',
        eventType: 'approval.requested',
        payload: {
          type: 'approval.requested',
          tool: 'sqlmap',
          scope: [context.target],
          riskClass: 'active_scan',
          requiresEscalation: true,
          affectedTargets: [context.target],
        },
      },
      onApprove: [
        {
          kind: 'emit',
          event: {
            runId: context.runId,
            correlationId: 'approval-sensitive-sqlmap',
            source: 'nia',
            audience: 'user',
            surfaceHint: 'main',
            eventType: 'approval.resolved',
            payload: {
              type: 'approval.resolved',
              tool: 'sqlmap',
              decision: 'approved',
              scope: [context.target],
              riskClass: 'active_scan',
              requiresEscalation: true,
              affectedTargets: [context.target],
            },
          },
        },
        {
          kind: 'emit',
          event: {
            runId: context.runId,
            correlationId: 'msg-approval-approved',
            source: 'nia',
            audience: 'user',
            surfaceHint: 'main',
            eventType: 'assistant.message.done',
            payload: {
              type: 'assistant.message.done',
              text: 'Approval received. I will execute the sensitive probe and return only the evidence that changes the case.',
            },
          },
        },
      ],
      onDeny: [
        {
          kind: 'emit',
          event: {
            runId: context.runId,
            correlationId: 'approval-sensitive-sqlmap',
            source: 'nia',
            audience: 'user',
            surfaceHint: 'main',
            eventType: 'approval.resolved',
            payload: {
              type: 'approval.resolved',
              tool: 'sqlmap',
              decision: 'denied',
              scope: [context.target],
              riskClass: 'active_scan',
              requiresEscalation: true,
              affectedTargets: [context.target],
            },
          },
        },
        {
          kind: 'emit',
          event: {
            runId: context.runId,
            correlationId: 'msg-approval-denied',
            source: 'nia',
            audience: 'user',
            surfaceHint: 'main',
            eventType: 'assistant.message.done',
            payload: {
              type: 'assistant.message.done',
              text: 'Approval denied. I am rerouting through lower-risk validation and keeping the run within the safer envelope.',
            },
          },
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
        eventType: 'swarm.completed',
        payload: {
          type: 'swarm.completed',
          status: 'COMPLETED',
        },
      },
    },
  ],
});
