/**
 * @module core/memory/compaction-strategy
 * @description Configurable compaction strategy for session memory.
 *
 * Defines when and how to compact agent conversation history.
 * The strategy is consumed by AgentRunner before each LLM call
 * to decide if compaction is needed.
 *
 * This module formalizes the thresholds that were previously
 * hardcoded in ConversationCompactor and AgentRunner.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for compaction behavior.
 *
 * All thresholds are expressed as ratios or counts for portability
 * across different model context windows.
 */
export interface CompactionStrategyConfig {
  /** Percentage of model context window that triggers compaction.
   *  Default: 0.8 (80%) — compact when token usage reaches this fraction. */
  readonly thresholdRatio: number;

  /** Number of recent messages to preserve verbatim (never compacted).
   *  Default: 6 — keeps the last 6 exchanges intact for continuity. */
  readonly keepRecentCount: number;

  /** Maximum tokens to allocate for the summary message.
   *  Default: 2000 — caps summary size to avoid replacing one problem
   *  with another. */
  readonly maxSummaryTokens: number;

  /** Minimum messages required before compaction is considered.
   *  Default: 10 — avoids compacting very short conversations. */
  readonly minMessagesBeforeCompaction: number;

  /** Target ratio after compaction (fraction of context window to aim for).
   *  Default: 0.5 — after compaction, usage should be ~50% of window. */
  readonly targetRatioAfterCompaction: number;

  /** Maximum consecutive compaction failures before circuit breaker trips.
   *  Default: 3 — prevents infinite retry loops on unrecoverable contexts. */
  readonly maxConsecutiveFailures: number;
}

/**
 * Result of evaluating whether compaction is needed.
 */
export interface CompactionDecision {
  /** Whether compaction should be triggered. */
  readonly shouldCompact: boolean;
  /** Estimated current token count. */
  readonly estimatedTokens: number;
  /** The compaction threshold in tokens. */
  readonly thresholdTokens: number;
  /** Number of messages to keep verbatim. */
  readonly keepRecentCount: number;
  /** Reason for the decision (for logging/debugging). */
  readonly reason: string;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

/**
 * Default compaction strategy configuration.
 *
 * Matches the behavior of ConversationCompactor's defaults
 * plus sensible additions for AgentRunner integration.
 */
export const DEFAULT_COMPACTION_CONFIG: CompactionStrategyConfig = {
  thresholdRatio: 0.8,
  keepRecentCount: 6,
  maxSummaryTokens: 2000,
  minMessagesBeforeCompaction: 10,
  targetRatioAfterCompaction: 0.5,
  maxConsecutiveFailures: 3,
};

// ============================================================================
// STRATEGY CLASS
// ============================================================================

/**
 * Compaction strategy evaluator.
 *
 * Stateless — holds config and provides pure decision functions.
 * Used by AgentRunner to decide if/when to compact.
 */
export class CompactionStrategy {
  private readonly config: CompactionStrategyConfig;

  constructor(config: Partial<CompactionStrategyConfig> = {}) {
    this.config = { ...DEFAULT_COMPACTION_CONFIG, ...config };
  }

  /**
   * Get the effective configuration (for inspection/debugging).
   */
  getConfig(): Readonly<CompactionStrategyConfig> {
    return this.config;
  }

  /**
   * Calculate the compaction threshold for a given model context window.
   *
   * @param modelContextWindow - The model's context window size in tokens
   * @returns Token count that should trigger compaction
   */
  getThreshold(modelContextWindow: number): number {
    return Math.floor(modelContextWindow * this.config.thresholdRatio);
  }

  /**
   * Calculate the target token count after compaction.
   *
   * @param modelContextWindow - The model's context window size in tokens
   * @returns Token count to aim for after compaction
   */
  getTargetAfterCompaction(modelContextWindow: number): number {
    return Math.floor(modelContextWindow * this.config.targetRatioAfterCompaction);
  }

  /**
   * Evaluate whether compaction is needed.
   *
   * @param estimatedTokens - Current estimated token usage
   * @param messageCount - Total number of messages in history
   * @param modelContextWindow - Model's context window size
   * @returns Compaction decision with reasoning
   */
  evaluate(
    estimatedTokens: number,
    messageCount: number,
    modelContextWindow: number,
  ): CompactionDecision {
    const thresholdTokens = this.getThreshold(modelContextWindow);

    // Not enough messages to bother compacting
    if (messageCount < this.config.minMessagesBeforeCompaction) {
      return {
        shouldCompact: false,
        estimatedTokens,
        thresholdTokens,
        keepRecentCount: this.config.keepRecentCount,
        reason: `Only ${messageCount} messages (min: ${this.config.minMessagesBeforeCompaction})`,
      };
    }

    // Not enough messages to split (keepRecentCount guard)
    if (messageCount <= this.config.keepRecentCount) {
      return {
        shouldCompact: false,
        estimatedTokens,
        thresholdTokens,
        keepRecentCount: this.config.keepRecentCount,
        reason: `Only ${messageCount} messages, can't split (keep: ${this.config.keepRecentCount})`,
      };
    }

    // Under threshold
    if (estimatedTokens <= thresholdTokens) {
      return {
        shouldCompact: false,
        estimatedTokens,
        thresholdTokens,
        keepRecentCount: this.config.keepRecentCount,
        reason: `Under threshold (${estimatedTokens} <= ${thresholdTokens})`,
      };
    }

    // Compaction needed
    return {
      shouldCompact: true,
      estimatedTokens,
      thresholdTokens,
      keepRecentCount: this.config.keepRecentCount,
      reason: `Over threshold (${estimatedTokens} > ${thresholdTokens}), ${messageCount} messages`,
    };
  }

  /**
   * Check if a circuit breaker should prevent compaction.
   *
   * @param consecutiveFailures - Number of consecutive compaction failures
   * @returns Whether compaction should be skipped
   */
  shouldTripBreaker(consecutiveFailures: number): boolean {
    return consecutiveFailures >= this.config.maxConsecutiveFailures;
  }
}
