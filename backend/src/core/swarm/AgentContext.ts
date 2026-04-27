/**
 * AgentContext — AsyncLocalStorage-based context propagation
 *
 * Provides isolated per-agent context using Node.js AsyncLocalStorage.
 * Each spawned teammate gets its own context store, ensuring no shared
 * mutable state between agents running in the same process.
 *
 * Adapted from Claude Code's teammateContext.ts for LEA's swarm architecture.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { AgentContext } from './types.js';

/** Global AsyncLocalStorage instance for agent context propagation */
const agentContextStorage = new AsyncLocalStorage<AgentContext>();

/**
 * Get the current agent context from AsyncLocalStorage.
 * Returns undefined if called outside of an agent execution scope.
 */
export function getAgentContext(): AgentContext | undefined {
  return agentContextStorage.getStore();
}

/**
 * Run a function within a specific agent context.
 * All code called within `fn` (including async operations) will have
 * access to the provided context via `getAgentContext()`.
 */
export function runWithAgentContext<T>(
  context: AgentContext,
  fn: () => T,
): T {
  return agentContextStorage.run(context, fn);
}

/**
 * Get the current agent ID from context, or undefined if not in an agent scope.
 */
export function getCurrentAgentId(): string | undefined {
  return agentContextStorage.getStore()?.agentId;
}

/**
 * Get the current swarm run ID from context, or undefined if not in an agent scope.
 */
export function getCurrentSwarmRunId(): string | undefined {
  return agentContextStorage.getStore()?.swarmRunId;
}

/**
 * Get the current pentest ID from context, or undefined if not in an agent scope.
 */
export function getCurrentPentestId(): string | undefined {
  return agentContextStorage.getStore()?.pentestId;
}

/**
 * Check if the current context belongs to a team lead.
 */
export function isTeamLead(): boolean {
  return agentContextStorage.getStore()?.isTeamLead ?? false;
}

/**
 * Check if the current context is within an agent execution scope.
 */
export function isAgentScope(): boolean {
  return agentContextStorage.getStore() !== undefined;
}

/**
 * Get the current agent's working directory from context.
 * Returns undefined if not in an agent scope or if no cwd was set.
 */
export function getCurrentCwd(): string | undefined {
  return agentContextStorage.getStore()?.cwd;
}

/**
 * Create an AgentContext for a given teammate identity.
 */
export function createAgentContext(identity: {
  agentId: string;
  agentName: string;
  swarmRunId: string;
  pentestId: string;
  role: string;
  color?: string;
  planModeRequired: boolean;
  isTeamLead?: boolean;
  agentType?: 'teammate' | 'leader' | 'supervisor';
  abortController: AbortController;
  cwd?: string;
}): AgentContext {
  return {
    agentId: identity.agentId,
    agentName: identity.agentName,
    swarmRunId: identity.swarmRunId,
    pentestId: identity.pentestId,
    role: identity.role,
    color: identity.color,
    planModeRequired: identity.planModeRequired,
    isTeamLead: identity.isTeamLead ?? false,
    agentType: identity.agentType ?? 'teammate',
    abortController: identity.abortController,
    cwd: identity.cwd,
  };
}
