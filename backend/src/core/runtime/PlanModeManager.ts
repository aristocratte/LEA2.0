/**
 * @module core/runtime/PlanModeManager
 * @description Centralized manager for per-agent plan mode state.
 *
 * Each agent can independently be in plan or default mode. When plan mode
 * is activated, the agent's PermissionContext is updated to mode='plan',
 * which causes the permission engine to require approval for non-read-only
 * operations.
 *
 * Plan mode is inherited by spawned agents: if a parent is in plan mode,
 * child agents start in plan mode too.
 */

import type { AgentPermissionContextStore } from '../permissions/AgentPermissionContextStore.js';
import type { PermissionUpdate } from '../permissions/types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Plan mode state for a single agent.
 */
export interface PlanModeState {
  /** Agent identifier */
  agentId: string;
  /** Current mode: 'plan' or 'default' */
  mode: 'plan' | 'default';
  /** Timestamp when plan mode was entered */
  enteredAt?: number;
  /** Optional reason for entering/exiting plan mode */
  reason?: string;
}

// ============================================================================
// PLAN MODE MANAGER
// ============================================================================

/**
 * Manages plan mode state for all agents in the system.
 *
 * PlanModeManager is the single source of truth for which agents are in
 * plan mode. It coordinates with AgentPermissionContextStore to ensure
 * the PermissionEngine sees the correct mode for each agent.
 */
export class PlanModeManager {
  private readonly states = new Map<string, PlanModeState>();
  private readonly contextStore?: AgentPermissionContextStore;

  constructor(contextStore?: AgentPermissionContextStore) {
    this.contextStore = contextStore;
  }

  /**
   * Enter plan mode for an agent.
   *
   * Updates the agent's PermissionContext to mode='plan' so that the
   * PermissionEngine enforces read-only operations unless approved.
   *
   * @param agentId - The agent to put into plan mode.
   * @param reason - Optional reason for entering plan mode.
   * @returns The updated PlanModeState.
   */
  enterPlanMode(agentId: string, reason?: string): PlanModeState {
    const state: PlanModeState = {
      agentId,
      mode: 'plan',
      enteredAt: Date.now(),
      reason,
    };
    this.states.set(agentId, state);

    // Update the agent's permission context
    if (this.contextStore?.hasContext(agentId)) {
      this.contextStore.updateContext(agentId, [
        {
          type: 'setMode',
          mode: 'plan',
          destination: 'session',
        },
      ]);
    }

    return state;
  }

  /**
   * Exit plan mode for an agent.
   *
   * Updates the agent's PermissionContext back to mode='default'.
   *
   * @param agentId - The agent to take out of plan mode.
   * @param reason - Optional reason for exiting plan mode.
   * @returns The updated PlanModeState, or null if the agent had no state.
   */
  exitPlanMode(agentId: string, reason?: string): PlanModeState | null {
    const current = this.states.get(agentId);
    if (!current) return null;

    const state: PlanModeState = {
      agentId,
      mode: 'default',
      reason,
    };
    this.states.set(agentId, state);

    // Update the agent's permission context
    if (this.contextStore?.hasContext(agentId)) {
      this.contextStore.updateContext(agentId, [
        {
          type: 'setMode',
          mode: 'default',
          destination: 'session',
        },
      ]);
    }

    return state;
  }

  /**
   * Get the plan mode state for an agent.
   *
   * @param agentId - The agent to query.
   * @returns The PlanModeState, or undefined if the agent has no state.
   */
  getState(agentId: string): PlanModeState | undefined {
    return this.states.get(agentId);
  }

  /**
   * Check if an agent is currently in plan mode.
   *
   * @param agentId - The agent to check.
   * @returns true if the agent is in plan mode, false otherwise.
   */
  isPlanMode(agentId: string): boolean {
    return this.states.get(agentId)?.mode === 'plan';
  }

  /**
   * Get all agents currently in plan mode.
   *
   * @returns Array of PlanModeState for agents in plan mode.
   */
  getPlanModeAgents(): PlanModeState[] {
    return Array.from(this.states.values()).filter((s) => s.mode === 'plan');
  }

  /**
   * Initialize plan mode for a newly spawned agent.
   *
   * If planModeRequired is true, the agent starts in plan mode.
   * Otherwise, it starts in default mode.
   *
   * @param agentId - The newly spawned agent.
   * @param planModeRequired - Whether the agent should start in plan mode.
   */
  initializeAgent(agentId: string, planModeRequired: boolean): void {
    if (planModeRequired) {
      this.enterPlanMode(agentId, 'Required by spawn configuration');
    } else {
      this.states.set(agentId, { agentId, mode: 'default' });
    }
  }

  /**
   * Inherit plan mode from a parent agent.
   *
   * If the parent is in plan mode, the child agent starts in plan mode too.
   *
   * @param childAgentId - The newly spawned child agent.
   * @param parentAgentId - The parent agent to inherit from.
   */
  inheritFromParent(childAgentId: string, parentAgentId: string): void {
    if (this.isPlanMode(parentAgentId)) {
      this.enterPlanMode(childAgentId, `Inherited from parent ${parentAgentId}`);
    } else {
      this.states.set(childAgentId, { agentId: childAgentId, mode: 'default' });
    }
  }

  /**
   * Remove an agent's plan mode state.
   *
   * Called when an agent is killed or shuts down to clean up state.
   *
   * @param agentId - The agent to remove.
   */
  removeAgent(agentId: string): void {
    this.states.delete(agentId);
  }

  /**
   * Get all tracked agent states.
   *
   * @returns Array of all PlanModeState entries.
   */
  getAllStates(): PlanModeState[] {
    return Array.from(this.states.values());
  }
}
