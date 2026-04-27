/**
 * @module core/analytics/CostTracker
 * @description Tracks token usage and estimated costs per session/agent.
 *
 * Accumulates usage data from LLM calls and exposes aggregates
 * for the /cost command, /status command, and the stats API.
 *
 * Design:
 * - One global instance, shared across all sessions
 * - Keyed by sessionId (swarmRunId-agentId or custom ID)
 * - Thread-safe by design (single-threaded Node.js)
 * - No persistence — in-memory only (data lives for the process lifetime)
 */

import { calculateCost, formatCost, formatTokens, getModelPricing } from './pricing-table.js';

// ============================================================================
// TYPES
// ============================================================================

/** A single usage record from one LLM call. */
export interface UsageRecord {
  /** Model used for this call. */
  model: string;
  /** Input tokens consumed. */
  inputTokens: number;
  /** Output tokens generated. */
  outputTokens: number;
  /** Estimated cost in USD. */
  costUsd: number;
  /** When this call happened. */
  timestamp: number;
}

/** Accumulated stats for a session. */
export interface SessionUsageStats {
  /** Total input tokens across all calls. */
  totalInputTokens: number;
  /** Total output tokens across all calls. */
  totalOutputTokens: number;
  /** Total cost in USD. */
  totalCostUsd: number;
  /** Number of LLM calls. */
  callCount: number;
  /** Models used (unique). */
  models: string[];
  /** Most recent model used. */
  lastModel: string | null;
  /** Most recent call timestamp. */
  lastCallAt: number | null;
  /** Per-model breakdown. */
  byModel: Record<string, {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    callCount: number;
  }>;
}

/** Global stats across all sessions. */
export interface GlobalUsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalCalls: number;
  sessionCount: number;
  activeModels: string[];
}

// ============================================================================
// COST TRACKER
// ============================================================================

export class CostTracker {
  /** Usage records per session. */
  private sessions = new Map<string, UsageRecord[]>();

  /** Track an LLM usage event. */
  track(sessionId: string, model: string, inputTokens: number, outputTokens: number): void {
    const costUsd = calculateCost(model, inputTokens, outputTokens);

    const record: UsageRecord = {
      model,
      inputTokens,
      outputTokens,
      costUsd,
      timestamp: Date.now(),
    };

    let records = this.sessions.get(sessionId);
    if (!records) {
      records = [];
      this.sessions.set(sessionId, records);
    }
    records.push(record);
  }

  /** Get accumulated stats for a session. */
  getSessionStats(sessionId: string): SessionUsageStats {
    const records = this.sessions.get(sessionId) ?? [];

    const stats: SessionUsageStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      callCount: records.length,
      models: [],
      lastModel: null,
      lastCallAt: null,
      byModel: {},
    };

    for (const r of records) {
      stats.totalInputTokens += r.inputTokens;
      stats.totalOutputTokens += r.outputTokens;
      stats.totalCostUsd += r.costUsd;
      stats.lastModel = r.model;
      stats.lastCallAt = r.timestamp;

      if (!stats.byModel[r.model]) {
        stats.byModel[r.model] = { inputTokens: 0, outputTokens: 0, costUsd: 0, callCount: 0 };
      }
      stats.byModel[r.model].inputTokens += r.inputTokens;
      stats.byModel[r.model].outputTokens += r.outputTokens;
      stats.byModel[r.model].costUsd += r.costUsd;
      stats.byModel[r.model].callCount += 1;
    }

    stats.models = Object.keys(stats.byModel);
    return stats;
  }

  /** Get global stats across all sessions. */
  getGlobalStats(): GlobalUsageStats {
    const stats: GlobalUsageStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      totalCalls: 0,
      sessionCount: this.sessions.size,
      activeModels: [],
    };

    const models = new Set<string>();
    for (const records of this.sessions.values()) {
      for (const r of records) {
        stats.totalInputTokens += r.inputTokens;
        stats.totalOutputTokens += r.outputTokens;
        stats.totalCostUsd += r.costUsd;
        stats.totalCalls += 1;
        models.add(r.model);
      }
    }

    stats.activeModels = Array.from(models);
    return stats;
  }

  /** Get a formatted cost summary string for a session (for /cost command). */
  getCostSummary(sessionId: string): string {
    const stats = this.getSessionStats(sessionId);

    if (stats.callCount === 0) {
      return 'No LLM calls recorded yet.';
    }

    const lines: string[] = [
      `Calls: ${stats.callCount} | Tokens: ${formatTokens(stats.totalInputTokens)} in + ${formatTokens(stats.totalOutputTokens)} out | Cost: ${formatCost(stats.totalCostUsd)}`,
    ];

    if (stats.models.length > 1) {
      lines.push('Per model:');
      for (const model of stats.models) {
        const m = stats.byModel[model];
        if (m) {
          lines.push(`  ${model}: ${m.callCount} calls, ${formatCost(m.costUsd)}`);
        }
      }
    }

    return lines.join('\n');
  }

  /** Clear tracking data for a session. */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Clear all tracking data. */
  clearAll(): void {
    this.sessions.clear();
  }
}
