/**
 * AgentHealthMonitor — Tracks health status of swarm agents.
 *
 * Monitors agent activity and determines health status (healthy, stalled, dead)
 * based on last activity timestamps and explicit dead markers.
 *
 * Health states:
 * - 'healthy': Agent has recent activity (within stall threshold)
 * - 'stalled': Agent hasn't had activity for stallThresholdMs
 * - 'dead': Agent explicitly marked dead or never seen
 */

export type HealthStatus = 'healthy' | 'stalled' | 'dead';

export interface AgentHealth {
  agentId: string;
  agentName: string;
  status: HealthStatus;
  lastActivity: Date;
}

export class AgentHealthMonitor {
  private readonly lastActivity: Map<string, { timestamp: Date; name: string }> = new Map();
  private readonly deadAgents: Set<string> = new Set();
  private readonly stallThresholdMs: number;

  constructor(options?: { stallThresholdMs?: number }) {
    this.stallThresholdMs = options?.stallThresholdMs ?? 60_000;
  }

  recordActivity(agentId: string, agentName?: string): void {
    this.lastActivity.set(agentId, {
      timestamp: new Date(),
      name: agentName ?? this.lastActivity.get(agentId)?.name ?? agentId,
    });
    this.deadAgents.delete(agentId);
  }

  markDead(agentId: string): void {
    this.deadAgents.add(agentId);
  }

  getHealth(agentId: string): HealthStatus {
    if (this.deadAgents.has(agentId)) return 'dead';
    const last = this.lastActivity.get(agentId);
    if (!last) return 'dead';
    const elapsed = Date.now() - last.timestamp.getTime();
    return elapsed > this.stallThresholdMs ? 'stalled' : 'healthy';
  }

  getAgentHealth(agentId: string): AgentHealth | undefined {
    const last = this.lastActivity.get(agentId);
    if (!last) return undefined;
    return {
      agentId,
      agentName: last.name,
      status: this.getHealth(agentId),
      lastActivity: last.timestamp,
    };
  }

  getAllHealth(): Map<string, HealthStatus> {
    const result = new Map<string, HealthStatus>();
    for (const agentId of this.lastActivity.keys()) {
      result.set(agentId, this.getHealth(agentId));
    }
    return result;
  }

  getAllAgentHealth(): AgentHealth[] {
    const result: AgentHealth[] = [];
    for (const [agentId, data] of this.lastActivity) {
      result.push({
        agentId,
        agentName: data.name,
        status: this.getHealth(agentId),
        lastActivity: data.timestamp,
      });
    }
    return result;
  }

  remove(agentId: string): void {
    this.lastActivity.delete(agentId);
    this.deadAgents.delete(agentId);
  }

  clear(): void {
    this.lastActivity.clear();
    this.deadAgents.clear();
  }

  get trackedCount(): number {
    return this.lastActivity.size;
  }
}
