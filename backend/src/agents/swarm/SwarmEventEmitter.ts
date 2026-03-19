import type { PrismaClient } from '@prisma/client';
import type { Agent, Swarm } from '../../types/swarm.js';
import type {
  LegacySseEventPayload,
  LegacySseEventType,
  SwarmEventEnvelope,
  SwarmEventPayload,
} from '../../types/events.js';
import type { SwarmEmitter, SwarmState } from './types.js';

export class SwarmEventEmitter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emitter: SwarmEmitter,
    private readonly state: SwarmState
  ) {}

  async approveSensitiveTool(pentestId: string, approvalId: string): Promise<void> {
    const pending = this.state.pendingApprovals.get(approvalId);
    if (!pending) {
      console.log(`[Swarm] approveSensitiveTool: no pending approval for ${approvalId} (already resolved or unknown)`);
      return;
    }
    clearTimeout(pending.timeout);
    this.state.pendingApprovals.delete(approvalId);
    console.log(`[Swarm] Approved tool execution ${approvalId} for pentest ${pentestId}`);
    pending.resolve();
  }

  async denySensitiveTool(pentestId: string, approvalId: string, reason?: string): Promise<void> {
    const pending = this.state.pendingApprovals.get(approvalId);
    if (!pending) {
      console.log(`[Swarm] denySensitiveTool: no pending approval for ${approvalId} (already resolved or unknown)`);
      return;
    }
    clearTimeout(pending.timeout);
    this.state.pendingApprovals.delete(approvalId);
    console.log(`[Swarm] Denied tool execution ${approvalId} for pentest ${pentestId}. Reason: ${reason}`);
    pending.reject(reason || 'Tool execution denied by operator');
  }

  emit<T extends SwarmEventPayload>(
    pentestId: string,
    envelope: Omit<SwarmEventEnvelope<T>, 'sequence' | 'timestamp' | 'id'>
  ): void;
  emit(pentestId: string, type: LegacySseEventType, data: Record<string, unknown>): void;
  emit<T extends SwarmEventPayload>(
    pentestId: string,
    typeOrEnvelope: LegacySseEventType | Omit<SwarmEventEnvelope<T>, 'sequence' | 'timestamp' | 'id'>,
    data?: Record<string, unknown>
  ): void {
    if (typeof typeOrEnvelope === 'string') {
      const legacyEnvelope: Omit<SwarmEventEnvelope<LegacySseEventPayload<typeof typeOrEnvelope>>, 'sequence' | 'timestamp' | 'id'> = {
        runId: pentestId,
        source: 'system',
        audience: 'debug',
        surfaceHint: 'none',
        eventType: typeOrEnvelope,
        payload: { type: typeOrEnvelope, ...(data || {}) },
      };
      this.emitter.broadcast(pentestId, legacyEnvelope);
      return;
    }

    this.emitter.broadcast(pentestId, typeOrEnvelope);
  }

  emitAgentSpawned(pentestId: string, swarmRunId: string, agent: Agent, index: number): void {
    const payload = {
      swarmRunId,
      agent,
      index,
      timestamp: Date.now(),
    };

    this.emit(pentestId, {
      runId: swarmRunId,
      correlationId: `agent-${agent.id}`,
      source: `agent:${agent.role}`,
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'agent.spawning',
      payload: {
        type: 'agent.spawning',
        agentId: agent.id,
        role: agent.role,
        name: agent.name,
      },
    });
    this.emit(pentestId, 'agentSpawned', payload);
    this.emit(pentestId, 'agent_spawned', payload);
  }

  updateAgent(pentestId: string, agent: Agent, patch: Partial<Agent>): void {
    Object.assign(agent, patch, { updatedAt: new Date().toISOString() });

    const lifecycleType =
      agent.status === 'SPAWNED'
        ? 'agent.spawning'
        : agent.status === 'DONE'
          ? 'agent.completed'
          : agent.status === 'FAILED'
            ? 'agent.failed'
            : 'agent.running';

    this.emit(pentestId, {
      runId: agent.swarmRunId,
      correlationId: `agent-${agent.id}`,
      source: `agent:${agent.role}`,
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: lifecycleType,
      payload: {
        type: lifecycleType,
        agentId: agent.id,
        role: agent.role,
        name: agent.name,
      },
    });
    this.emit(pentestId, 'agent_status', {
      swarmRunId: agent.swarmRunId,
      agent,
      timestamp: Date.now(),
    });

    if (agent.lastMessage) {
      this.emitMessage(pentestId, {
        swarmRunId: agent.swarmRunId,
        source: agent.role,
        agentId: agent.id,
        content: agent.lastMessage,
        progress: agent.progress,
        timestamp: Date.now(),
      });
    }

    const isTerminal = agent.status === 'DONE' || agent.status === 'FAILED';
    void this.prisma.swarmAgent.update({
      where: { id: agent.id },
      data: {
        status: agent.status,
        progress: agent.progress ?? 0,
        lastMessage: agent.lastMessage ?? null,
        completedAt: isTerminal ? new Date() : undefined,
      },
    }).catch(() => undefined);
  }

  emitMessage(pentestId: string, data: Record<string, unknown>): void {
    const runtime = this.state.runtimeByPentestId.get(pentestId);
    const source = String(data.source || 'system');
    const content = String(data.content || '').trim();
    if (runtime && content && (source === 'supervisor' || source === 'system')) {
      this.emit(pentestId, {
        runId: runtime.run.id,
        source: 'nia',
        audience: 'user',
        surfaceHint: 'main',
        eventType: 'assistant.message.done',
        payload: {
          type: 'assistant.message.done',
          text: content,
        },
      });
    }

    this.emit(pentestId, 'message', data);
  }

  emitComplete(run: Swarm): void {
    const payload = {
      swarmRunId: run.id,
      status: run.status,
      findingsCount: run.findings.length,
      agentsCount: run.agents.length,
      sysReptorProjectId: run.sysReptorProjectId,
      timestamp: Date.now(),
    };

    if (run.status !== 'FAILED') {
      this.emit(run.pentestId, {
        runId: run.id,
        source: 'system',
        audience: 'user',
        surfaceHint: 'none',
        eventType: 'swarm.completed',
        payload: {
          type: 'swarm.completed',
          status: run.status,
          findingsCount: run.findings.length,
          sysReptorProjectId: run.sysReptorProjectId,
        },
      });
    }

    this.emit(run.pentestId, 'complete', payload);
    this.emit(run.pentestId, 'swarm_completed', payload);
  }
}
