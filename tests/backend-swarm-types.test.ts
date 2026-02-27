import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  Agent,
  StartSwarmAuditRequest,
  StartSwarmParams,
  Swarm,
  SwarmStreamEventMap,
  SwarmStreamMessage,
  SysReptorFinding,
  SysReptorFindingPayload,
} from '../backend/src/types/swarm';

describe('backend swarm type contracts', () => {
  it('models start request/params and run state', () => {
    const request: StartSwarmAuditRequest = {
      task: 'Execute dynamic pentest swarm',
      scope: ['api.example.com'],
      maxAgents: 8,
      maxConcurrentAgents: 4,
      autoPushToSysReptor: true,
    };

    const params: StartSwarmParams = {
      ...request,
      pentestId: 'pt-1',
      target: 'example.com',
    };

    const run: Swarm = {
      id: 'run-1',
      pentestId: params.pentestId,
      target: params.target,
      task: params.task,
      status: 'RUNNING',
      maxAgents: params.maxAgents || 8,
      maxConcurrentAgents: params.maxConcurrentAgents || 4,
      forceMerged: false,
      agents: [],
      findings: [],
      startedAt: new Date().toISOString(),
    };

    expect(run.maxAgents).toBe(8);
    expectTypeOf(params.scope).toEqualTypeOf<string[] | undefined>();
  });

  it('types streaming messages with event-specific payloads', () => {
    const agent: Agent = {
      id: 'agent-1',
      swarmRunId: 'run-1',
      name: 'Recon Alpha',
      role: 'Recon',
      status: 'THINKING',
      progress: 25,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const message: SwarmStreamMessage = {
      type: 'agent_status',
      data: {
        swarmRunId: 'run-1',
        agent,
        timestamp: Date.now(),
      },
      eventId: 15,
    };

    expect(message.type).toBe('agent_status');
    expectTypeOf<SwarmStreamEventMap['agent_status']>().toMatchTypeOf(message.data);
  });

  it('keeps SysReptor finding payload compatible with finding domain model', () => {
    const finding: SysReptorFinding = {
      id: 'f-1',
      pentestId: 'pt-1',
      swarmRunId: 'run-1',
      agentId: 'agent-1',
      title: 'Open admin endpoint',
      description: 'Admin endpoint exposed without authentication.',
      severity: 'high',
      cvss: 8.2,
      proof: 'GET /admin returned 200',
      remediation: 'Protect endpoint with authentication and authorization.',
      affected_components: ['example.com/admin'],
      pushed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const payload: SysReptorFindingPayload = {
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      cvss: finding.cvss,
      proof: finding.proof,
      remediation: finding.remediation,
      affected_components: finding.affected_components || [],
      references: [{ key: 'leaFindingId', value: finding.id }],
    };

    expect(payload.references[0].value).toBe('f-1');
  });
});
