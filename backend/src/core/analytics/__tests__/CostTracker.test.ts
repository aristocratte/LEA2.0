import { describe, it, expect, beforeEach } from 'vitest';
import { CostTracker } from '../CostTracker.js';

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  describe('track', () => {
    it('records a usage event', () => {
      tracker.track('session-1', 'claude-sonnet-4-6', 1000, 500);
      const stats = tracker.getSessionStats('session-1');
      expect(stats.callCount).toBe(1);
      expect(stats.totalInputTokens).toBe(1000);
      expect(stats.totalOutputTokens).toBe(500);
      expect(stats.lastModel).toBe('claude-sonnet-4-6');
    });

    it('accumulates across multiple calls', () => {
      tracker.track('session-1', 'claude-sonnet-4-6', 1000, 500);
      tracker.track('session-1', 'claude-sonnet-4-6', 2000, 1000);
      const stats = tracker.getSessionStats('session-1');
      expect(stats.callCount).toBe(2);
      expect(stats.totalInputTokens).toBe(3000);
      expect(stats.totalOutputTokens).toBe(1500);
    });

    it('tracks different models per session', () => {
      tracker.track('session-1', 'claude-sonnet-4-6', 1000, 500);
      tracker.track('session-1', 'glm-4', 2000, 1000);
      const stats = tracker.getSessionStats('session-1');
      expect(stats.models).toContain('claude-sonnet-4-6');
      expect(stats.models).toContain('glm-4');
      expect(stats.byModel['claude-sonnet-4-6'].callCount).toBe(1);
      expect(stats.byModel['glm-4'].callCount).toBe(1);
    });

    it('isolates sessions', () => {
      tracker.track('session-1', 'claude-sonnet-4-6', 1000, 500);
      tracker.track('session-2', 'glm-4', 2000, 1000);
      const stats1 = tracker.getSessionStats('session-1');
      const stats2 = tracker.getSessionStats('session-2');
      expect(stats1.callCount).toBe(1);
      expect(stats2.callCount).toBe(1);
      expect(stats1.models).not.toContain('glm-4');
    });
  });

  describe('getGlobalStats', () => {
    it('returns empty stats when nothing tracked', () => {
      const stats = tracker.getGlobalStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.sessionCount).toBe(0);
      expect(stats.activeModels).toEqual([]);
    });

    it('aggregates across sessions', () => {
      tracker.track('s1', 'claude-sonnet-4-6', 1000, 500);
      tracker.track('s2', 'glm-4', 2000, 1000);
      const stats = tracker.getGlobalStats();
      expect(stats.totalCalls).toBe(2);
      expect(stats.sessionCount).toBe(2);
      expect(stats.totalInputTokens).toBe(3000);
      expect(stats.activeModels).toContain('claude-sonnet-4-6');
      expect(stats.activeModels).toContain('glm-4');
    });
  });

  describe('getCostSummary', () => {
    it('returns message for empty session', () => {
      expect(tracker.getCostSummary('empty')).toBe('No LLM calls recorded yet.');
    });

    it('returns formatted summary', () => {
      tracker.track('session-1', 'claude-sonnet-4-6', 1000, 500);
      const summary = tracker.getCostSummary('session-1');
      expect(summary).toContain('Calls: 1');
      expect(summary).toContain('Tokens:');
      expect(summary).toContain('Cost:');
    });

    it('shows per-model breakdown for multi-model sessions', () => {
      tracker.track('session-1', 'claude-sonnet-4-6', 1000, 500);
      tracker.track('session-1', 'glm-4', 2000, 1000);
      const summary = tracker.getCostSummary('session-1');
      expect(summary).toContain('Per model:');
      expect(summary).toContain('claude-sonnet-4-6');
      expect(summary).toContain('glm-4');
    });
  });

  describe('clearSession / clearAll', () => {
    it('clears a specific session', () => {
      tracker.track('s1', 'claude-sonnet-4-6', 1000, 500);
      tracker.track('s2', 'glm-4', 2000, 1000);
      tracker.clearSession('s1');
      expect(tracker.getSessionStats('s1').callCount).toBe(0);
      expect(tracker.getSessionStats('s2').callCount).toBe(1);
    });

    it('clears all sessions', () => {
      tracker.track('s1', 'claude-sonnet-4-6', 1000, 500);
      tracker.track('s2', 'glm-4', 2000, 1000);
      tracker.clearAll();
      expect(tracker.getGlobalStats().totalCalls).toBe(0);
    });
  });
});
