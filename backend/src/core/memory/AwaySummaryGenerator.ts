/**
 * @module core/memory/AwaySummaryGenerator
 * @description Generates "while you were away" summaries for pentest sessions.
 *
 * Pure heuristic aggregation — no LLM required.
 * Combines B2 extracted memories + swarm history + current swarm state
 * to produce a structured summary of what happened since a given timestamp.
 */

import type { PrismaClient } from '@prisma/client';
import type { Swarm } from '../../types/swarm.js';

// ============================================================================
// TYPES
// ============================================================================

/** A single highlight bullet in the away summary. */
export interface AwayHighlight {
  /** Icon/category for visual distinction */
  kind: 'finding' | 'memory' | 'agent' | 'task' | 'error';
  /** Short human-readable text */
  text: string;
  /** Optional detail / payload reference */
  detail?: string;
}

/** The complete away summary response. */
export interface AwaySummary {
  /** Whether there's anything to report */
  hasActivity: boolean;
  /** Auto-generated headline (1 line) */
  headline: string;
  /** Ordered highlight bullets */
  highlights: AwayHighlight[];
  /** Simple counts for quick scan */
  stats: {
    agentsActive: number;
    agentsCompleted: number;
    findingsNew: number;
    memoriesExtracted: number;
    tasksCompleted: number;
    errorsCount: number;
  };
  /** Timestamp range covered */
  period: {
    since: string;
    until: string;
  };
}

/** Dependencies injected into the generator. */
export interface AwaySummaryDeps {
  prisma: PrismaClient;
  /** List swarm history runs for a pentest */
  getSwarmHistory: (pentestId: string) => Promise<Swarm[]>;
  /** Get current active swarm run for a pentest */
  getSwarmRun: (pentestId: string) => Promise<Swarm | null>;
  /** List extracted memories (from B2) */
  listMemories: (
    projectKey: string,
    options?: { types?: string[]; limit?: number; since?: Date },
  ) => Promise<Record<string, unknown>[]>;
}

// ============================================================================
// GENERATOR
// ============================================================================

export class AwaySummaryGenerator {
  private readonly deps: AwaySummaryDeps;

  constructor(deps: AwaySummaryDeps) {
    this.deps = deps;
  }

  /**
   * Generate an away summary for a pentest session.
   *
   * @param pentestId - The pentest to summarize
   * @param sinceIso - ISO timestamp of when the user last visited (optional)
   * @returns Structured away summary
   */
  async generate(pentestId: string, sinceIso?: string): Promise<AwaySummary> {
    const since = sinceIso ? new Date(sinceIso) : this.defaultSince();
    const until = new Date();

    // Fetch all data sources in parallel — each is individually fault-tolerant
    const history = await this.safeGet(
      () => this.deps.getSwarmHistory(pentestId),
      [] as any[],
    );
    const currentRun = await this.safeGet(
      () => this.deps.getSwarmRun(pentestId),
      null,
    );
    const memories = await this.safeGet(
      () => this.deps.listMemories(pentestId, { since }),
      [] as any[],
    );

    // --- Aggregate from history (runs that started or ended since `since`) ---
    const recentRuns = history.filter(
      (r) => new Date(r.startedAt) >= since || (r.endedAt && new Date(r.endedAt) >= since),
    );

    const agentsCompleted = recentRuns.reduce((acc, r) =>
      acc + r.agents.filter((a: any) => a.status === 'DONE').length, 0,
    );

    const findingsFromHistory = recentRuns.flatMap((r) => r.findings ?? []);
    const errorsFromHistory = recentRuns.reduce((acc, r) =>
      acc + r.agents.filter((a: any) => a.status === 'FAILED').length, 0,
    );

    // --- Aggregate from current run (if still active) ---
    let agentsActive = 0;
    let findingsFromCurrent: any[] = [];
    let tasksCompleted = 0;

    if (currentRun && ['RUNNING', 'PAUSED'].includes(currentRun.status)) {
      const run: Swarm = currentRun;
      agentsActive = run.agents.filter(
        (a) => a.status === 'RUNNING_TOOL' || a.status === 'IDLE' || a.status === 'SPAWNED' || a.status === 'THINKING',
      ).length;
      findingsFromCurrent = (run as any).findings ?? [];
      tasksCompleted = (run.tasks ?? []).filter((t: any) => t.status === 'completed').length;
    }

    // --- Aggregate from B2 memories ---
    const findingsMemories = memories.filter((m) => m.type === 'FINDING');
    const targetFactMemories = memories.filter((m) => m.type === 'TARGET_FACT');
    const decisionMemories = memories.filter((m) => m.type === 'DECISION');

    // --- Build highlights ---
    const highlights: AwayHighlight[] = [];

    // Findings (most important first)
    const allFindings = [...findingsFromHistory, ...findingsFromCurrent];
    const uniqueFindings = this.deduplicateBy(allFindings, (f) => f.title ?? f.id);
    for (const f of uniqueFindings.slice(0, 5)) {
      highlights.push({
        kind: 'finding',
        text: (f as Record<string, unknown>).title ? String((f as Record<string, unknown>).title) : `Finding: ${f.id}`,
        detail: (f as Record<string, unknown>).severity ? `severity: ${(f as Record<string, unknown>).severity}` : undefined,
      });
    }

    // Key target facts
    for (const m of targetFactMemories.slice(0, 3)) {
      highlights.push({
        kind: 'memory',
        text: String(m.title),
      });
    }

    // Decisions made
    for (const m of decisionMemories.slice(0, 2)) {
      highlights.push({
        kind: 'memory',
        text: `Decision: ${m.title}`,
      });
    }

    // Agent activity
    if (agentsActive > 0) {
      highlights.push({
        kind: 'agent',
        text: `${agentsActive} agent${agentsActive > 1 ? 's' : ''} still running`,
      });
    }
    if (agentsCompleted > 0) {
      highlights.push({
        kind: 'agent',
        text: `${agentsCompleted} agent${agentsCompleted > 1 ? 's' : ''} completed`,
      });
    }

    // Errors
    if (errorsFromHistory > 0) {
      highlights.push({
        kind: 'error',
        text: `${errorsFromHistory} agent${errorsFromHistory > 1 ? 's' : ''} failed`,
      });
    }

    // Tasks
    if (tasksCompleted > 0) {
      highlights.push({
        kind: 'task',
        text: `${tasksCompleted} task${tasksCompleted > 1 ? 's' : ''} completed`,
      });
    }

    // --- Build headline ---
    const totalFindings = uniqueFindings.length;
    const totalMemories = memories.length;
    const hasActivity = highlights.length > 0;

    const headline = this.buildHeadline({
      totalFindings,
      totalMemories,
      agentsActive,
      agentsCompleted,
      errorsCount: errorsFromHistory,
      hasActivity,
    });

    return {
      hasActivity,
      headline,
      highlights,
      stats: {
        agentsActive,
        agentsCompleted,
        findingsNew: totalFindings,
        memoriesExtracted: totalMemories,
        tasksCompleted,
        errorsCount: errorsFromHistory,
      },
      period: {
        since: since.toISOString(),
        until: until.toISOString(),
      },
    };
  }

  // ==========================================================================
  // INTERNAL
  // ==========================================================================

  /** Call a dependency and return fallback on any error. */
  private async safeGet<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }

  /** Default `since` = 1 hour ago if not provided. */
  private defaultSince(): Date {
    return new Date(Date.now() - 60 * 60 * 1000);
  }

  /** Deduplicate an array by a key extractor. */
  private deduplicateBy<T>(arr: T[], keyFn: (item: T) => string): T[] {
    const seen = new Set<string>();
    return arr.filter((item) => {
      const k = keyFn(item);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /** Build a one-line headline from aggregated stats. */
  private buildHeadline(ctx: {
    totalFindings: number;
    totalMemories: number;
    agentsActive: number;
    agentsCompleted: number;
    errorsCount: number;
    hasActivity: boolean;
  }): string {
    if (!ctx.hasActivity) return 'No new activity since your last visit';

    const parts: string[] = [];

    if (ctx.totalFindings > 0) {
      parts.push(`${ctx.totalFindings} finding${ctx.totalFindings > 1 ? 's' : ''}`);
    }
    if (ctx.agentsActive > 0) {
      parts.push(`${ctx.agentsActive} agent${ctx.agentsActive > 1 ? 's' : ''} active`);
    } else if (ctx.agentsCompleted > 0) {
      parts.push(`${ctx.agentsCompleted} agent${ctx.agentsCompleted > 1 ? 's' : ''} finished`);
    }
    if (ctx.totalMemories > 0 && ctx.totalFindings === 0) {
      parts.push(`${ctx.totalMemories} fact${ctx.totalMemories > 1 ? 's' : ''} recorded`);
    }
    if (ctx.errorsCount > 0 && parts.length === 0) {
      parts.push(`${ctx.errorsCount} error${ctx.errorsCount > 1 ? 's' : ''}`);
    }

    return parts.length > 0 ? parts.join(', ') : 'Session activity recorded';
  }
}
