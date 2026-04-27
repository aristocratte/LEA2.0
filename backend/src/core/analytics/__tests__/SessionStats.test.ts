import { describe, it, expect, beforeEach } from 'vitest';
import { SessionStats } from '../SessionStats.js';
import { CostTracker } from '../CostTracker.js';

describe('SessionStats', () => {
  let costTracker: CostTracker;
  let sessionStats: SessionStats;

  beforeEach(() => {
    costTracker = new CostTracker();
    sessionStats = new SessionStats(costTracker);
  });

  describe('buildSnapshot', () => {
    it('returns snapshot with zero stats for empty session', () => {
      const snapshot = sessionStats.buildSnapshot('empty');
      expect(snapshot.sessionId).toBe('empty');
      expect(snapshot.llm.callCount).toBe(0);
      expect(snapshot.llm.totalTokens).toBe(0);
      expect(snapshot.swarm.totalAgents).toBe(0);
      expect(snapshot.tasks.total).toBe(0);
      expect(snapshot.permissions.pending).toBe(0);
    });

    it('includes LLM usage from CostTracker', () => {
      costTracker.track('session-1', 'claude-sonnet-4-6', 5000, 2000);
      const snapshot = sessionStats.buildSnapshot('session-1');
      expect(snapshot.llm.callCount).toBe(1);
      expect(snapshot.llm.inputTokens).toBe(5000);
      expect(snapshot.llm.outputTokens).toBe(2000);
      expect(snapshot.llm.totalTokens).toBe(7000);
      expect(snapshot.llm.costUsd).toBeGreaterThan(0);
      expect(snapshot.llm.models).toContain('claude-sonnet-4-6');
    });

    it('counts tasks by status', () => {
      const snapshot = sessionStats.buildSnapshot('session-1', {
        taskManager: {
          listTasks: () => [
            { status: 'pending' },
            { status: 'in_progress' },
            { status: 'completed' },
            { status: 'completed' },
          ],
        },
      });
      expect(snapshot.tasks.total).toBe(4);
      expect(snapshot.tasks.pending).toBe(1);
      expect(snapshot.tasks.inProgress).toBe(1);
      expect(snapshot.tasks.completed).toBe(2);
    });

    it('counts pending permissions', () => {
      const snapshot = sessionStats.buildSnapshot('session-1', {
        permissionRequestStore: {
          listPending: () => [1, 2, 3],
        },
      });
      expect(snapshot.permissions.pending).toBe(3);
    });

    it('gracefully handles missing sources', () => {
      const snapshot = sessionStats.buildSnapshot('session-1');
      expect(snapshot.tasks.total).toBe(0);
      expect(snapshot.permissions.pending).toBe(0);
    });

    it('gracefully handles sources that throw', () => {
      const snapshot = sessionStats.buildSnapshot('session-1', {
        taskManager: {
          listTasks: () => { throw new Error('boom'); },
        },
        permissionRequestStore: {
          listPending: () => { throw new Error('boom'); },
        },
      });
      expect(snapshot.tasks.total).toBe(0);
      expect(snapshot.permissions.pending).toBe(0);
    });
  });

  describe('buildSnapshotAsync', () => {
    it('queries swarmOrchestrator for agent counts', async () => {
      const snapshot = await sessionStats.buildSnapshotAsync('session-1', {
        swarmOrchestrator: {
          listAgents: async () => [
            { status: 'active' },
            { status: 'running' },
            { status: 'idle' },
          ],
        },
      });
      expect(snapshot.swarm.totalAgents).toBe(3);
      expect(snapshot.swarm.activeAgents).toBe(2);
      expect(snapshot.swarm.idleAgents).toBe(1);
    });

    it('gracefully handles failing swarmOrchestrator', async () => {
      const snapshot = await sessionStats.buildSnapshotAsync('session-1', {
        swarmOrchestrator: {
          listAgents: async () => { throw new Error('boom'); },
        },
      });
      expect(snapshot.swarm.totalAgents).toBe(0);
    });
  });

  describe('getGlobalStats', () => {
    it('returns global stats from CostTracker', () => {
      costTracker.track('s1', 'claude-sonnet-4-6', 1000, 500);
      const global = sessionStats.getGlobalStats();
      expect(global.sessions.totalCalls).toBe(1);
      expect(global.sessions.sessionCount).toBe(1);
      expect(global.timestamp).toBeDefined();
    });
  });

  describe('formatStatus', () => {
    it('returns formatted status string', () => {
      costTracker.track('s1', 'claude-sonnet-4-6', 5000, 2000);
      const status = sessionStats.formatStatus('s1');
      expect(status).toContain('LLM calls: 1');
      expect(status).toContain('Tokens:');
      expect(status).toContain('Cost:');
    });

    it('omits cost when no calls', () => {
      const status = sessionStats.formatStatus('empty');
      expect(status).toBe('LLM calls: 0');
    });
  });
});
