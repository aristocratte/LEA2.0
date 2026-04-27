/**
 * @module core/analytics/SessionStats
 * @description Aggregates session statistics from multiple runtime sources.
 *
 * Combines data from CostTracker, SwarmOrchestrator, TaskManager,
 * and PermissionRequestStore into a single structured view for the
 * stats API and status command.
 */

import type { CostTracker, SessionUsageStats, GlobalUsageStats } from './CostTracker.js';
import { formatCost, formatTokens } from './pricing-table.js';

// ============================================================================
// TYPES
// ============================================================================

/** Full stats snapshot for a session/pentest. */
export interface StatsSnapshot {
  /** Session/pentest identifier. */
  sessionId: string;
  /** When stats were gathered. */
  timestamp: string;

  // LLM usage
  llm: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    callCount: number;
    models: string[];
    lastModel: string | null;
  };

  // Swarm state
  swarm: {
    activeAgents: number;
    idleAgents: number;
    totalAgents: number;
    findingsCount: number;
  };

  // Tasks
  tasks: {
    pending: number;
    inProgress: number;
    completed: number;
    total: number;
  };

  // Permissions
  permissions: {
    pending: number;
  };

  // Timing
  duration?: string;
}

/** Global stats across all sessions. */
export interface GlobalStatsSnapshot {
  timestamp: string;
  sessions: GlobalUsageStats;
}

// ============================================================================
// SESSION STATS
// ============================================================================

export class SessionStats {
  private costTracker: CostTracker;

  constructor(costTracker: CostTracker) {
    this.costTracker = costTracker;
  }

  /**
   * Build a full stats snapshot for a session.
   *
   * Accepts optional runtime objects — gracefully handles missing ones.
   */
  buildSnapshot(sessionId: string, sources?: {
    swarmOrchestrator?: {
      listAgents(): Promise<Array<{ status: string }>>;
    };
    taskManager?: {
      listTasks(): Array<{ status: string }>;
    };
    permissionRequestStore?: {
      listPending(): Array<unknown>;
    };
    findingsCount?: number;
  }): StatsSnapshot {
    const usage = this.costTracker.getSessionStats(sessionId);

    // Swarm stats (async if orchestrator provided)
    let activeAgents = 0;
    let idleAgents = 0;
    let totalAgents = 0;
    // Note: synchronous access only; for async see buildSnapshotAsync

    // Task stats
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    let total = 0;

    if (sources?.taskManager) {
      try {
        const tasks = sources.taskManager.listTasks();
        total = tasks.length;
        for (const t of tasks) {
          if (t.status === 'pending') pending++;
          else if (t.status === 'in_progress' || t.status === 'running') inProgress++;
          else if (t.status === 'completed') completed++;
        }
      } catch { /* gracefully degrade */ }
    }

    // Permission stats
    let pendingPerms = 0;
    if (sources?.permissionRequestStore) {
      try {
        pendingPerms = sources.permissionRequestStore.listPending().length;
      } catch { /* gracefully degrade */ }
    }

    return {
      sessionId,
      timestamp: new Date().toISOString(),
      llm: {
        inputTokens: usage.totalInputTokens,
        outputTokens: usage.totalOutputTokens,
        totalTokens: usage.totalInputTokens + usage.totalOutputTokens,
        costUsd: usage.totalCostUsd,
        callCount: usage.callCount,
        models: usage.models,
        lastModel: usage.lastModel,
      },
      swarm: {
        activeAgents,
        idleAgents,
        totalAgents,
        findingsCount: sources?.findingsCount ?? 0,
      },
      tasks: { pending, inProgress, completed, total },
      permissions: { pending: pendingPerms },
    };
  }

  /**
   * Async version that can query SwarmOrchestrator.
   */
  async buildSnapshotAsync(sessionId: string, sources?: {
    swarmOrchestrator?: {
      listAgents(): Promise<Array<{ status: string }>>;
    };
    taskManager?: {
      listTasks(): Array<{ status: string }>;
    };
    permissionRequestStore?: {
      listPending(): Array<unknown>;
    };
    findingsCount?: number;
  }): Promise<StatsSnapshot> {
    const snapshot = this.buildSnapshot(sessionId, {
      taskManager: sources?.taskManager,
      permissionRequestStore: sources?.permissionRequestStore,
      findingsCount: sources?.findingsCount,
    });

    // Swarm stats (async)
    if (sources?.swarmOrchestrator) {
      try {
        const agents = await sources.swarmOrchestrator.listAgents();
        snapshot.swarm.totalAgents = agents.length;
        for (const a of agents) {
          if (a.status === 'active' || a.status === 'running') snapshot.swarm.activeAgents++;
          else snapshot.swarm.idleAgents++;
        }
      } catch { /* gracefully degrade */ }
    }

    return snapshot;
  }

  /** Get global stats. */
  getGlobalStats(): GlobalStatsSnapshot {
    return {
      timestamp: new Date().toISOString(),
      sessions: this.costTracker.getGlobalStats(),
    };
  }

  /** Format a short status string (for /status command). */
  formatStatus(sessionId: string): string {
    const usage = this.costTracker.getSessionStats(sessionId);
    const costStr = usage.callCount > 0
      ? ` | Tokens: ${formatTokens(usage.totalInputTokens + usage.totalOutputTokens)} | Cost: ${formatCost(usage.totalCostUsd)}`
      : '';

    return `LLM calls: ${usage.callCount}${costStr}`;
  }
}
