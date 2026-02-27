import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  StartSwarmAuditRequest,
  StartSwarmResponse,
  SwarmAgent,
  SwarmFinding,
  SwarmRun,
  SwarmStreamEventMap,
  SwarmStreamMessage,
} from '../lea-app/types/index';

describe('frontend swarm type contracts', () => {
  it('exports start request/response contract from shared index', () => {
    const request: StartSwarmAuditRequest = {
      task: 'Execute dynamic pentest swarm',
      scope: ['example.com'],
      maxAgents: 10,
      maxConcurrentAgents: 5,
      autoPushToSysReptor: true,
    };

    const response: StartSwarmResponse = {
      swarmRunId: 'run-1',
      status: 'QUEUED',
      maxAgents: request.maxAgents || 10,
      maxConcurrentAgents: request.maxConcurrentAgents || 5,
    };

    expect(response.status).toBe('QUEUED');
    expectTypeOf(request.scope).toEqualTypeOf<string[] | undefined>();
  });

  it('supports swarm agent/finding/run composition for UI state', () => {
    const agent: SwarmAgent = {
      id: 'a-1',
      swarmRunId: 'run-1',
      name: 'Web Scanner',
      role: 'WebScanner',
      status: 'RUNNING_TOOL',
      progress: 60,
      toolName: 'http_request',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const finding: SwarmFinding = {
      id: 'f-1',
      pentestId: 'pt-1',
      swarmRunId: 'run-1',
      agentId: agent.id,
      title: 'Missing HSTS',
      description: 'HTTP Strict-Transport-Security header is absent.',
      severity: 'medium',
      pushed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const run: SwarmRun = {
      id: 'run-1',
      pentestId: 'pt-1',
      target: 'example.com',
      status: 'RUNNING',
      maxAgents: 10,
      maxConcurrentAgents: 5,
      forceMerged: false,
      sysReptorProjectId: undefined,
      agents: [agent],
      findings: [finding],
      startedAt: new Date().toISOString(),
    };

    expect(run.agents[0].status).toBe('RUNNING_TOOL');
    expect(run.findings[0].severity).toBe('medium');
  });

  it('types swarm stream events for EventSource parsing', () => {
    const message: SwarmStreamMessage = {
      type: 'swarm_completed',
      data: {
        swarmRunId: 'run-1',
        status: 'COMPLETED',
        findingsCount: 3,
        agentsCount: 10,
        sysReptorProjectId: 'sysreptor-1',
        timestamp: Date.now(),
      },
      eventId: 42,
    };

    expect(message.type).toBe('swarm_completed');
    expectTypeOf<SwarmStreamEventMap['swarm_completed']>().toMatchTypeOf(message.data);
  });
});
