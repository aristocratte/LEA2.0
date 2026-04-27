/**
 * Tests for AgentHealthMonitor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentHealthMonitor, type HealthStatus } from '../AgentHealthMonitor.js';

describe('AgentHealthMonitor', () => {
  let monitor: AgentHealthMonitor;

  beforeEach(() => {
    monitor = new AgentHealthMonitor({ stallThresholdMs: 1000 });
  });

  describe('fresh monitor', () => {
    it('returns "dead" for unknown agent', () => {
      expect(monitor.getHealth('unknown-agent')).toBe('dead');
    });

    it('returns empty map from getAllHealth', () => {
      expect(monitor.getAllHealth().size).toBe(0);
    });

    it('returns empty array from getAllAgentHealth', () => {
      expect(monitor.getAllAgentHealth()).toEqual([]);
    });

    it('trackedCount is 0', () => {
      expect(monitor.trackedCount).toBe(0);
    });
  });

  describe('recordActivity', () => {
    it('returns "healthy" after recording activity', () => {
      monitor.recordActivity('agent-1', 'Test Agent');
      expect(monitor.getHealth('agent-1')).toBe('healthy');
    });

    it('stores agent name', () => {
      monitor.recordActivity('agent-1', 'Test Agent');
      const health = monitor.getAgentHealth('agent-1');
      expect(health?.agentName).toBe('Test Agent');
    });

    it('removes agent from dead set when recording activity', () => {
      monitor.markDead('agent-1');
      expect(monitor.getHealth('agent-1')).toBe('dead');

      monitor.recordActivity('agent-1', 'Test Agent');
      expect(monitor.getHealth('agent-1')).toBe('healthy');
    });

    it('increments trackedCount', () => {
      expect(monitor.trackedCount).toBe(0);
      monitor.recordActivity('agent-1', 'Agent 1');
      expect(monitor.trackedCount).toBe(1);
      monitor.recordActivity('agent-2', 'Agent 2');
      expect(monitor.trackedCount).toBe(2);
    });
  });

  describe('stall threshold', () => {
    it('returns "stalled" after threshold expires', async () => {
      const shortMonitor = new AgentHealthMonitor({ stallThresholdMs: 100 });

      shortMonitor.recordActivity('agent-1', 'Test Agent');
      expect(shortMonitor.getHealth('agent-1')).toBe('healthy');

      // Wait for threshold to pass
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(shortMonitor.getHealth('agent-1')).toBe('stalled');
    });

    it('returns "healthy" when activity occurs within threshold', async () => {
      const shortMonitor = new AgentHealthMonitor({ stallThresholdMs: 200 });

      shortMonitor.recordActivity('agent-1', 'Test Agent');

      // Wait half the threshold
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(shortMonitor.getHealth('agent-1')).toBe('healthy');
    });

    it('resets stall timer on new activity', async () => {
      const shortMonitor = new AgentHealthMonitor({ stallThresholdMs: 150 });

      shortMonitor.recordActivity('agent-1', 'Test Agent');

      // Wait almost to threshold
      await new Promise(resolve => setTimeout(resolve, 100));

      // Record new activity
      shortMonitor.recordActivity('agent-1', 'Test Agent');

      // Wait for original threshold to pass
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should still be healthy because timer was reset
      expect(shortMonitor.getHealth('agent-1')).toBe('healthy');
    });
  });

  describe('markDead', () => {
    it('returns "dead" after marking dead', () => {
      monitor.recordActivity('agent-1', 'Test Agent');
      expect(monitor.getHealth('agent-1')).toBe('healthy');

      monitor.markDead('agent-1');
      expect(monitor.getHealth('agent-1')).toBe('dead');
    });

    it('keeps agent in tracked set after marking dead', () => {
      monitor.recordActivity('agent-1', 'Test Agent');
      expect(monitor.trackedCount).toBe(1);

      monitor.markDead('agent-1');
      expect(monitor.trackedCount).toBe(1);
    });
  });

  describe('remove', () => {
    it('cleans up agent completely', () => {
      monitor.recordActivity('agent-1', 'Test Agent');
      monitor.markDead('agent-1');

      expect(monitor.trackedCount).toBe(1);

      monitor.remove('agent-1');

      expect(monitor.getHealth('agent-1')).toBe('dead');
      expect(monitor.trackedCount).toBe(0);
    });

    it('is safe to call on unknown agent', () => {
      expect(() => monitor.remove('unknown')).not.toThrow();
    });
  });

  describe('getAllHealth', () => {
    it('returns health status for all tracked agents', () => {
      monitor.recordActivity('agent-1', 'Agent 1');
      monitor.recordActivity('agent-2', 'Agent 2');
      monitor.recordActivity('agent-3', 'Agent 3');

      const healthMap = monitor.getAllHealth();

      expect(healthMap.size).toBe(3);
      expect(healthMap.get('agent-1')).toBe('healthy');
      expect(healthMap.get('agent-2')).toBe('healthy');
      expect(healthMap.get('agent-3')).toBe('healthy');
    });

    it('includes dead agents', () => {
      monitor.recordActivity('agent-1', 'Agent 1');
      monitor.markDead('agent-1');

      const healthMap = monitor.getAllHealth();

      expect(healthMap.size).toBe(1);
      expect(healthMap.get('agent-1')).toBe('dead');
    });
  });

  describe('getAllAgentHealth', () => {
    it('returns full health objects for all agents', () => {
      const now = new Date();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      monitor.recordActivity('agent-1', 'Agent 1');
      monitor.recordActivity('agent-2', 'Agent 2');

      const healthArray = monitor.getAllAgentHealth();

      expect(healthArray).toHaveLength(2);
      expect(healthArray[0]).toEqual({
        agentId: 'agent-1',
        agentName: 'Agent 1',
        status: 'healthy',
        lastActivity: now,
      });
      expect(healthArray[1]).toEqual({
        agentId: 'agent-2',
        agentName: 'Agent 2',
        status: 'healthy',
        lastActivity: now,
      });

      vi.useRealTimers();
    });
  });

  describe('clear', () => {
    it('removes all tracked agents', () => {
      monitor.recordActivity('agent-1', 'Agent 1');
      monitor.recordActivity('agent-2', 'Agent 2');
      monitor.recordActivity('agent-3', 'Agent 3');
      monitor.markDead('agent-3');

      expect(monitor.trackedCount).toBe(3);

      monitor.clear();

      expect(monitor.trackedCount).toBe(0);
      expect(monitor.getAllHealth().size).toBe(0);
    });
  });

  describe('getAgentHealth', () => {
    it('returns undefined for unknown agent', () => {
      expect(monitor.getAgentHealth('unknown')).toBeUndefined();
    });

    it('returns full AgentHealth object for known agent', () => {
      monitor.recordActivity('agent-1', 'Test Agent');

      const health = monitor.getAgentHealth('agent-1');

      expect(health).toBeDefined();
      expect(health?.agentId).toBe('agent-1');
      expect(health?.agentName).toBe('Test Agent');
      expect(health?.status).toBe('healthy');
      expect(health?.lastActivity).toBeInstanceOf(Date);
    });
  });
});
