/**
 * PlanModeManager Tests
 */

import { describe, expect, it, vi } from 'vitest';
import { PlanModeManager } from '../PlanModeManager.js';
import { AgentPermissionContextStore } from '../../permissions/AgentPermissionContextStore.js';
import { createDefaultContext } from '../../permissions/PermissionContext.js';

describe('PlanModeManager', () => {
  function createContextStore(): AgentPermissionContextStore {
    return new AgentPermissionContextStore(
      createDefaultContext({ mode: 'default' }),
    );
  }

  describe('enterPlanMode', () => {
    it('sets state to plan mode', () => {
      const manager = new PlanModeManager();
      const state = manager.enterPlanMode('agent-1', 'Need to plan');

      expect(state.mode).toBe('plan');
      expect(state.agentId).toBe('agent-1');
      expect(state.reason).toBe('Need to plan');
      expect(state.enteredAt).toBeDefined();
    });

    it('updates the agent permission context', () => {
      const store = createContextStore();
      store.createContext('agent-1', { mode: 'default' });
      const manager = new PlanModeManager(store);

      manager.enterPlanMode('agent-1', 'Testing');

      const ctx = store.getContext('agent-1');
      expect(ctx.mode).toBe('plan');
    });

    it('works without a context store', () => {
      const manager = new PlanModeManager();
      const state = manager.enterPlanMode('agent-1');
      expect(state.mode).toBe('plan');
    });
  });

  describe('exitPlanMode', () => {
    it('sets state back to default', () => {
      const manager = new PlanModeManager();
      manager.enterPlanMode('agent-1');
      const state = manager.exitPlanMode('agent-1', 'Plan done');

      expect(state).not.toBeNull();
      expect(state!.mode).toBe('default');
      expect(state!.reason).toBe('Plan done');
    });

    it('updates the agent permission context back to default', () => {
      const store = createContextStore();
      store.createContext('agent-1', { mode: 'default' });
      const manager = new PlanModeManager(store);

      manager.enterPlanMode('agent-1');
      expect(store.getContext('agent-1').mode).toBe('plan');

      manager.exitPlanMode('agent-1');
      expect(store.getContext('agent-1').mode).toBe('default');
    });

    it('returns null for unknown agent', () => {
      const manager = new PlanModeManager();
      const result = manager.exitPlanMode('unknown');
      expect(result).toBeNull();
    });
  });

  describe('isPlanMode', () => {
    it('returns true when agent is in plan mode', () => {
      const manager = new PlanModeManager();
      manager.enterPlanMode('agent-1');
      expect(manager.isPlanMode('agent-1')).toBe(true);
    });

    it('returns false when agent is in default mode', () => {
      const manager = new PlanModeManager();
      manager.initializeAgent('agent-1', false);
      expect(manager.isPlanMode('agent-1')).toBe(false);
    });

    it('returns false for unknown agent', () => {
      const manager = new PlanModeManager();
      expect(manager.isPlanMode('unknown')).toBe(false);
    });
  });

  describe('getState', () => {
    it('returns state for known agent', () => {
      const manager = new PlanModeManager();
      manager.enterPlanMode('agent-1', 'reason');
      const state = manager.getState('agent-1');
      expect(state).toBeDefined();
      expect(state!.mode).toBe('plan');
      expect(state!.reason).toBe('reason');
    });

    it('returns undefined for unknown agent', () => {
      const manager = new PlanModeManager();
      expect(manager.getState('unknown')).toBeUndefined();
    });
  });

  describe('getPlanModeAgents', () => {
    it('returns only agents in plan mode', () => {
      const manager = new PlanModeManager();
      manager.initializeAgent('agent-1', false);
      manager.enterPlanMode('agent-2');
      manager.enterPlanMode('agent-3');

      const planAgents = manager.getPlanModeAgents();
      expect(planAgents).toHaveLength(2);
      expect(planAgents.map((a) => a.agentId).sort()).toEqual(['agent-2', 'agent-3']);
    });

    it('returns empty array when no agents are in plan mode', () => {
      const manager = new PlanModeManager();
      manager.initializeAgent('agent-1', false);
      expect(manager.getPlanModeAgents()).toEqual([]);
    });
  });

  describe('initializeAgent', () => {
    it('starts in plan mode when planModeRequired is true', () => {
      const store = createContextStore();
      store.createContext('agent-1', { mode: 'default' });
      const manager = new PlanModeManager(store);

      manager.initializeAgent('agent-1', true);

      expect(manager.isPlanMode('agent-1')).toBe(true);
      expect(store.getContext('agent-1').mode).toBe('plan');
    });

    it('starts in default mode when planModeRequired is false', () => {
      const manager = new PlanModeManager();
      manager.initializeAgent('agent-1', false);
      expect(manager.isPlanMode('agent-1')).toBe(false);
    });

    it('sets reason for plan mode required agents', () => {
      const manager = new PlanModeManager();
      manager.initializeAgent('agent-1', true);
      const state = manager.getState('agent-1');
      expect(state!.reason).toBe('Required by spawn configuration');
    });
  });

  describe('inheritFromParent', () => {
    it('inherits plan mode from parent', () => {
      const store = createContextStore();
      store.createContext('parent-1', { mode: 'default' });
      store.createContext('child-1', { mode: 'default' });
      const manager = new PlanModeManager(store);

      manager.enterPlanMode('parent-1');
      manager.inheritFromParent('child-1', 'parent-1');

      expect(manager.isPlanMode('child-1')).toBe(true);
      expect(store.getContext('child-1').mode).toBe('plan');
    });

    it('inherits default mode from parent', () => {
      const manager = new PlanModeManager();
      manager.initializeAgent('parent-1', false);
      manager.inheritFromParent('child-1', 'parent-1');

      expect(manager.isPlanMode('child-1')).toBe(false);
    });

    it('sets reason mentioning parent', () => {
      const manager = new PlanModeManager();
      manager.enterPlanMode('parent-1');
      manager.inheritFromParent('child-1', 'parent-1');

      const state = manager.getState('child-1');
      expect(state!.reason).toContain('parent-1');
    });
  });

  describe('removeAgent', () => {
    it('removes agent state', () => {
      const manager = new PlanModeManager();
      manager.enterPlanMode('agent-1');
      expect(manager.isPlanMode('agent-1')).toBe(true);

      manager.removeAgent('agent-1');
      expect(manager.getState('agent-1')).toBeUndefined();
      expect(manager.isPlanMode('agent-1')).toBe(false);
    });

    it('is safe to call for unknown agent', () => {
      const manager = new PlanModeManager();
      expect(() => manager.removeAgent('unknown')).not.toThrow();
    });
  });

  describe('getAllStates', () => {
    it('returns all agent states', () => {
      const manager = new PlanModeManager();
      manager.initializeAgent('agent-1', false);
      manager.enterPlanMode('agent-2');
      manager.initializeAgent('agent-3', false);

      const all = manager.getAllStates();
      expect(all).toHaveLength(3);
    });
  });
});
