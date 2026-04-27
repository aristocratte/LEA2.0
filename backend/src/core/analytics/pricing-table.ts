/**
 * @module core/analytics/pricing-table
 * @description Model pricing data for cost estimation.
 *
 * Prices are USD per 1M tokens. Source: provider pricing pages, April 2026.
 * For models in the DB (ModelConfig), DB prices take precedence.
 * This table is the fallback for models not yet seeded in DB.
 */

export interface ModelPricing {
  /** USD per 1M input tokens */
  inputPer1M: number;
  /** USD per 1M output tokens */
  outputPer1M: number;
  /** Model context window in tokens (for display) */
  contextWindow: number;
}

/** Pricing data keyed by model ID (or prefix match). */
const PRICING_TABLE: Record<string, ModelPricing> = {
  // Anthropic
  'claude-opus-4-6': { inputPer1M: 15, outputPer1M: 75, contextWindow: 200_000 },
  'claude-opus-4': { inputPer1M: 15, outputPer1M: 75, contextWindow: 200_000 },
  'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15, contextWindow: 200_000 },
  'claude-sonnet-4': { inputPer1M: 3, outputPer1M: 15, contextWindow: 200_000 },
  'claude-sonnet-4-5': { inputPer1M: 3, outputPer1M: 15, contextWindow: 200_000 },
  'claude-haiku-4-5': { inputPer1M: 0.80, outputPer1M: 4, contextWindow: 200_000 },
  'claude-3-5-sonnet': { inputPer1M: 3, outputPer1M: 15, contextWindow: 200_000 },
  'claude-3-5-haiku': { inputPer1M: 0.80, outputPer1M: 4, contextWindow: 200_000 },
  'claude-3-opus': { inputPer1M: 15, outputPer1M: 75, contextWindow: 200_000 },

  // OpenAI
  'gpt-5.4': { inputPer1M: 10, outputPer1M: 30, contextWindow: 128_000 },
  'gpt-5': { inputPer1M: 10, outputPer1M: 30, contextWindow: 128_000 },
  'gpt-4.1': { inputPer1M: 2, outputPer1M: 8, contextWindow: 1_047_576 },
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10, contextWindow: 128_000 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6, contextWindow: 128_000 },
  'o3': { inputPer1M: 10, outputPer1M: 40, contextWindow: 200_000 },
  'o4-mini': { inputPer1M: 1.5, outputPer1M: 6, contextWindow: 200_000 },

  // Google
  'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10, contextWindow: 1_048_576 },
  'gemini-2.5-flash': { inputPer1M: 0.15, outputPer1M: 0.6, contextWindow: 1_048_576 },
  'gemini-2.0-flash': { inputPer1M: 0.10, outputPer1M: 0.40, contextWindow: 1_048_576 },

  // Z.ai / Zhipu
  'glm-5.1': { inputPer1M: 1.4, outputPer1M: 4.4, contextWindow: 200_000 },
  'glm-5-turbo': { inputPer1M: 1.2, outputPer1M: 4, contextWindow: 200_000 },
  'glm-5v-turbo': { inputPer1M: 1.2, outputPer1M: 4, contextWindow: 200_000 },
  'glm-5': { inputPer1M: 1, outputPer1M: 3.2, contextWindow: 200_000 },
  'glm-4.7-flashx': { inputPer1M: 0.07, outputPer1M: 0.4, contextWindow: 200_000 },
  'glm-4.7-flash': { inputPer1M: 0, outputPer1M: 0, contextWindow: 200_000 },
  'glm-4.7': { inputPer1M: 0.6, outputPer1M: 2.2, contextWindow: 200_000 },
  'glm-4.6': { inputPer1M: 0.6, outputPer1M: 2.2, contextWindow: 200_000 },
  'glm-4.5-airx': { inputPer1M: 1.1, outputPer1M: 4.5, contextWindow: 128_000 },
  'glm-4.5-air': { inputPer1M: 0.2, outputPer1M: 1.1, contextWindow: 128_000 },
  'glm-4.5-x': { inputPer1M: 2.2, outputPer1M: 8.9, contextWindow: 128_000 },
  'glm-4.5-flash': { inputPer1M: 0, outputPer1M: 0, contextWindow: 128_000 },
  'glm-4.5': { inputPer1M: 0.6, outputPer1M: 2.2, contextWindow: 128_000 },
  'glm-4-32b-0414-128k': { inputPer1M: 0.1, outputPer1M: 0.3, contextWindow: 128_000 },
  'glm-4-plus': { inputPer1M: 0.7, outputPer1M: 0.7, contextWindow: 128_000 },
  'glm-4': { inputPer1M: 0.14, outputPer1M: 0.14, contextWindow: 128_000 },
  'glm-4-flash': { inputPer1M: 0.01, outputPer1M: 0.01, contextWindow: 128_000 },
};

/** Default pricing for unknown models. Conservative estimate. */
const DEFAULT_PRICING: ModelPricing = {
  inputPer1M: 3,
  outputPer1M: 15,
  contextWindow: 128_000,
};

/**
 * Look up pricing for a model by exact ID or prefix match.
 *
 * @param modelId - The model identifier (e.g. 'claude-sonnet-4-6')
 * @returns Pricing data
 */
export function getModelPricing(modelId: string): ModelPricing {
  // Exact match
  if (PRICING_TABLE[modelId]) {
    return PRICING_TABLE[modelId];
  }

  // Prefix match (e.g. 'claude-sonnet-4-6-20250514' matches 'claude-sonnet-4-6')
  for (const [key, pricing] of Object.entries(PRICING_TABLE)) {
    if (modelId.startsWith(key)) {
      return pricing;
    }
  }

  return DEFAULT_PRICING;
}

/**
 * Calculate cost for a given usage.
 *
 * @param modelId - Model identifier
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost in USD
 */
export function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const pricing = getModelPricing(modelId);
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  return inputCost + outputCost;
}

/**
 * Format a cost value for display.
 *
 * @param costUsd - Cost in USD
 * @returns Formatted string (e.g. '$0.042', '$1.23')
 */
export function formatCost(costUsd: number): string {
  if (costUsd < 0.001) return '<$0.001';
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  if (costUsd < 1) return `$${costUsd.toFixed(3)}`;
  return `$${costUsd.toFixed(2)}`;
}

/**
 * Format token count for display.
 *
 * @param tokens - Token count
 * @returns Formatted string (e.g. '1.2K', '45.6K', '1.5M')
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1_000) return `${tokens}`;
  if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}
