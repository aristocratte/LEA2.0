import { describe, it, expect } from 'vitest';
import {
  getModelPricing,
  calculateCost,
  formatCost,
  formatTokens,
} from '../pricing-table.js';

describe('pricing-table', () => {
  describe('getModelPricing', () => {
    it('returns exact match for known models', () => {
      const pricing = getModelPricing('claude-sonnet-4-6');
      expect(pricing.inputPer1M).toBe(3);
      expect(pricing.outputPer1M).toBe(15);
      expect(pricing.contextWindow).toBe(200_000);
    });

    it('returns prefix match for versioned model IDs', () => {
      const pricing = getModelPricing('claude-sonnet-4-6-20250514');
      expect(pricing.inputPer1M).toBe(3);
    });

    it('returns default pricing for unknown models', () => {
      const pricing = getModelPricing('unknown-future-model-v99');
      expect(pricing.inputPer1M).toBe(3);
      expect(pricing.outputPer1M).toBe(15);
    });

    it('covers claude-3-5-haiku correctly (inputPer1M not inputPerM)', () => {
      const pricing = getModelPricing('claude-3-5-haiku');
      expect(pricing.inputPer1M).toBe(0.80);
      expect(pricing).toHaveProperty('inputPer1M');
      expect(pricing).not.toHaveProperty('inputPerM');
    });
  });

  describe('calculateCost', () => {
    it('calculates cost for a known model', () => {
      // claude-sonnet-4-6: $3/1M input, $15/1M output
      const cost = calculateCost('claude-sonnet-4-6', 1_000_000, 1_000_000);
      expect(cost).toBe(18); // 3 + 15
    });

    it('returns 0 for zero tokens', () => {
      const cost = calculateCost('claude-sonnet-4-6', 0, 0);
      expect(cost).toBe(0);
    });

    it('calculates fractional costs correctly', () => {
      // 100K input + 50K output for sonnet 4.6
      const cost = calculateCost('claude-sonnet-4-6', 100_000, 50_000);
      // 0.1 * 3 + 0.05 * 15 = 0.3 + 0.75 = 1.05
      expect(cost).toBeCloseTo(1.05, 2);
    });
  });

  describe('formatCost', () => {
    it('formats sub-milli costs', () => {
      expect(formatCost(0.0001)).toBe('<$0.001');
    });

    it('formats small costs with 4 decimals', () => {
      expect(formatCost(0.005)).toBe('$0.0050');
    });

    it('formats medium costs with 3 decimals', () => {
      expect(formatCost(0.5)).toBe('$0.500');
    });

    it('formats dollar+ costs with 2 decimals', () => {
      expect(formatCost(12.345)).toBe('$12.35');
    });
  });

  describe('formatTokens', () => {
    it('formats small counts directly', () => {
      expect(formatTokens(500)).toBe('500');
    });

    it('formats thousands', () => {
      expect(formatTokens(45_000)).toBe('45.0K');
    });

    it('formats millions', () => {
      expect(formatTokens(1_500_000)).toBe('1.5M');
    });
  });
});
