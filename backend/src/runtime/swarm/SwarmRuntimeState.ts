import type { SwarmEventEnvelope, SwarmEventPayload } from '../../types/events.js';
import type { Agent, Swarm, SwarmSeverity, SysReptorFinding } from '../../types/swarm.js';

function upsertAgent(run: Swarm, next: Agent): void {
  const index = run.agents.findIndex((agent) => agent.id === next.id);
  if (index === -1) {
    run.agents.push(next);
    return;
  }
  run.agents[index] = { ...run.agents[index], ...next };
}

function toSwarmSeverity(value: string | undefined): SwarmSeverity {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'critical' || normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized;
  }
  return 'info';
}

function ensureFinding(run: Swarm, payload: Extract<SwarmEventPayload, { findingId: string }>): void {
  const existing = run.findings.find((finding) => finding.id === payload.findingId);
  if (existing) {
    existing.title = payload.title;
    existing.severity = toSwarmSeverity(payload.severity);
    existing.updatedAt = new Date().toISOString();
    return;
  }

  const now = new Date().toISOString();
  const finding: SysReptorFinding = {
    id: payload.findingId,
    pentestId: run.pentestId,
    swarmRunId: run.id,
    agentId: 'scenario',
    title: payload.title,
    description: payload.title,
    severity: toSwarmSeverity(payload.severity),
    pushed: false,
    createdAt: now,
    updatedAt: now,
  };
  run.findings.push(finding);
}

export function applyEnvelopeToRun(run: Swarm, envelope: SwarmEventEnvelope<SwarmEventPayload>): void {
  switch (envelope.eventType) {
    case 'swarm.started':
      run.status = 'RUNNING';
      break;
    case 'swarm.paused':
      run.status = 'PAUSED';
      break;
    case 'swarm.resumed':
      run.status = 'RUNNING';
      break;
    case 'swarm.completed':
      run.status = 'COMPLETED';
      run.endedAt = new Date().toISOString();
      break;
    case 'swarm.failed':
      run.status = 'FAILED';
      run.endedAt = new Date().toISOString();
      break;
    case 'agent.drafted':
    case 'agent.spawning':
    case 'agent.running':
    case 'agent.completed':
    case 'agent.failed':
    case 'agent.cancelled': {
      const payload = envelope.payload as Extract<
        SwarmEventPayload,
        { type: 'agent.drafted' | 'agent.spawning' | 'agent.running' | 'agent.completed' | 'agent.failed' | 'agent.cancelled' }
      >;
      const status =
        envelope.eventType === 'agent.spawning'
          ? 'SPAWNED'
          : envelope.eventType === 'agent.completed'
            ? 'DONE'
            : envelope.eventType === 'agent.failed' || envelope.eventType === 'agent.cancelled'
              ? 'FAILED'
              : 'THINKING';
      upsertAgent(run, {
        id: payload.agentId,
        swarmRunId: run.id,
        name: payload.name,
        role: payload.role,
        status,
        progress: status === 'DONE' ? 100 : status === 'FAILED' ? 100 : 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      break;
    }
    case 'tool.call.started':
    case 'tool.call.completed': {
      const payload = envelope.payload as Extract<SwarmEventPayload, { toolName: string; agentId: string }>;
      const agent = run.agents.find((entry) => entry.id === payload.agentId);
      if (agent) {
        agent.toolName = payload.toolName;
        agent.status = envelope.eventType === 'tool.call.completed' ? 'DONE' : 'RUNNING_TOOL';
        agent.progress = envelope.eventType === 'tool.call.completed' ? 100 : 70;
        agent.updatedAt = new Date().toISOString();
      }
      break;
    }
    case 'finding.created':
    case 'finding.updated':
      ensureFinding(run, envelope.payload as Extract<SwarmEventPayload, { findingId: string }>);
      break;
    default:
      break;
  }
}
