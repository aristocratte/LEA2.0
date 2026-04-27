/**
 * PermissionSync — Synchronize permission state across swarm agents
 *
 * Manages the distribution and synchronization of permission rules between
 * the leader and teammate agents. When the leader's permission context changes,
 * the updates are propagated to all active teammates.
 *
 * Adapted from Claude Code's permissionSync.ts for LEA's swarm architecture.
 */

import { writeToMailbox } from './Mailbox.js';
import type { AgentContext } from './types.js';
import { getAgentContext } from './AgentContext.js';
import { MAILBOX_POLL_INTERVAL_MS, SWARM_EVENTS } from './constants.js';

// ============================================
// PERMISSION RULE TYPES
// # ============================================

/**
 * A permission rule that can be applied to tool usage.
 */
export interface PermissionRule {
  /** Tool name this rule applies to */
  toolName: string;
  /** Rule pattern (e.g., "**", "/src/**") */
  ruleContent: string;
}

/**
 * A permission update batch to apply.
 */
export interface PermissionUpdate {
  /** Update type */
  type: 'addRules' | 'removeRules' | 'setMode';
  /** Rules to add/remove */
  rules?: PermissionRule[];
  /** New permission mode */
  mode?: 'default' | 'plan' | 'bypass';
  /** Behavior for the update */
  behavior: 'allow' | 'deny';
  /** Destination scope */
  destination: 'session' | 'agent';
}

/**
 * Synchronized permission state shared across agents.
 */
export interface SynchronizedPermissionState {
  /** Current permission mode */
  mode: 'default' | 'plan' | 'bypass';
  /** Active permission rules */
  rules: PermissionRule[];
  /** Team-wide allowed paths */
  teamAllowedPaths: PermissionRule[];
  /** Last sync timestamp */
  lastSyncAt: number;
}

// ============================================
// PERMISSION SYNC MANAGER
// # ============================================

/**
 * Manages permission synchronization across the swarm.
 *
 * The leader maintains the authoritative permission state. Changes are
 * broadcast to teammates via mailbox messages.
 */
export class PermissionSyncManager {
  private readonly state: SynchronizedPermissionState;
  private readonly agentStates: Map<string, SynchronizedPermissionState> = new Map();
  private syncTimer?: ReturnType<typeof setInterval>;
  private isRunning = false;
  private readonly pendingUpdates: PermissionUpdate[] = [];
  private onUpdateCallback?: (agentId: string, updates: PermissionUpdate[]) => void;

  constructor(initialState?: Partial<SynchronizedPermissionState>) {
    this.state = {
      mode: initialState?.mode ?? 'default',
      rules: initialState?.rules ?? [],
      teamAllowedPaths: initialState?.teamAllowedPaths ?? [],
      lastSyncAt: Date.now(),
    };
  }

  /**
   * Start the sync manager, beginning periodic broadcasts.
   */
  start(swarmRunId: string): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.syncTimer = setInterval(() => {
      void this.broadcastPendingUpdates(swarmRunId);
    }, MAILBOX_POLL_INTERVAL_MS * 10); // Sync every 5 seconds
    this.syncTimer.unref();
  }

  /**
   * Stop the sync manager.
   */
  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    this.isRunning = false;
  }

  /**
   * Get the current leader permission state.
   */
  getLeaderState(): SynchronizedPermissionState {
    return { ...this.state };
  }

  /**
   * Get the permission state for a specific agent.
   */
  getAgentState(agentId: string): SynchronizedPermissionState {
    return this.agentStates.get(agentId) ?? { ...this.state };
  }

  /**
   * Apply a permission update to the leader's state.
   * The update will be broadcast to all agents on the next sync cycle.
   */
  applyUpdate(update: PermissionUpdate): void {
    this.applyUpdateToState(this.state, update);
    this.state.lastSyncAt = Date.now();
    this.pendingUpdates.push(update);
  }

  /**
   * Apply team-wide allowed paths from the team configuration.
   * These are distributed to all teammates when they join.
   */
  applyTeamAllowedPaths(paths: PermissionRule[]): void {
    this.state.teamAllowedPaths = [...paths];
  }

  /**
   * Register a callback for when an agent receives permission updates.
   */
  onUpdate(callback: (agentId: string, updates: PermissionUpdate[]) => void): void {
    this.onUpdateCallback = callback;
  }

  /**
   * Register an agent and send it the current permission state.
   */
  async registerAgent(agentId: string, agentName: string, swarmRunId: string): Promise<void> {
    // Initialize agent state with current leader state
    const agentState: SynchronizedPermissionState = {
      mode: this.state.mode,
      rules: [...this.state.rules],
      teamAllowedPaths: [...this.state.teamAllowedPaths],
      lastSyncAt: Date.now(),
    };
    this.agentStates.set(agentId, agentState);

    // Send initial state to the agent via mailbox
    const syncMessage = {
      type: 'permission_sync',
      mode: this.state.mode,
      rules: this.state.rules,
      teamAllowedPaths: this.state.teamAllowedPaths,
      timestamp: new Date().toISOString(),
    };

    await writeToMailbox(agentName, {
      from: 'team-lead',
      text: JSON.stringify(syncMessage),
      timestamp: new Date().toISOString(),
    }, { swarmRunId });
  }

  /**
   * Remove an agent from the sync manager.
   */
  removeAgent(agentId: string): void {
    this.agentStates.delete(agentId);
  }

  /**
   * Broadcast pending permission updates to all registered agents.
   */
  private async broadcastPendingUpdates(swarmRunId: string): Promise<void> {
    if (this.pendingUpdates.length === 0) return;

    const updates = [...this.pendingUpdates];
    this.pendingUpdates.length = 0;

    const syncMessage = {
      type: 'permission_update',
      updates,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to all registered agents
    for (const [agentId, agentState] of Array.from(this.agentStates)) {
      // Apply updates to agent's local state
      for (const update of Array.from(updates)) {
        this.applyUpdateToState(agentState, update);
      }
      agentState.lastSyncAt = Date.now();

      // Send via mailbox (agent name would need to be resolved)
      // For in-process agents, we can call the callback directly
      this.onUpdateCallback?.(agentId, updates);
    }
  }

  /**
   * Apply a permission update to a state object.
   */
  private applyUpdateToState(
    state: SynchronizedPermissionState,
    update: PermissionUpdate,
  ): void {
    switch (update.type) {
      case 'addRules':
        if (update.rules) {
          for (const rule of update.rules) {
            // Avoid duplicates
            const exists = state.rules.some(
              r => r.toolName === rule.toolName && r.ruleContent === rule.ruleContent,
            );
            if (!exists) {
              state.rules.push(rule);
            }
          }
        }
        break;
      case 'removeRules':
        if (update.rules) {
          state.rules = state.rules.filter(r =>
            !update.rules!.some(
              ur => ur.toolName === r.toolName && ur.ruleContent === r.ruleContent,
            ),
          );
        }
        break;
      case 'setMode':
        if (update.mode) {
          state.mode = update.mode;
        }
        break;
    }
  }
}

/**
 * Check if a tool is allowed based on synchronized permission state.
 */
export function isToolAllowed(
  toolName: string,
  input: Record<string, unknown>,
  state: SynchronizedPermissionState,
): 'allow' | 'deny' | 'ask' {
  // In bypass mode, all tools are allowed
  if (state.mode === 'bypass') {
    return 'allow';
  }

  // Check rules
  const matchingRules = state.rules.filter(r => r.toolName === toolName || r.toolName === '*');

  if (matchingRules.length === 0) {
    // No rules — in plan mode, ask; otherwise allow
    return state.mode === 'plan' ? 'ask' : 'allow';
  }

  // Check if any matching rule allows
  for (const rule of Array.from(matchingRules)) {
    if (rule.ruleContent === '**' || rule.ruleContent === '*') {
      return 'allow';
    }
  }

  return 'ask';
}
