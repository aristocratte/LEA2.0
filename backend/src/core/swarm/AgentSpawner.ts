/**
 * AgentSpawner — In-process agent spawning with context isolation
 *
 * Creates and manages in-process teammate agents. Each spawned agent gets:
 * - A unique agent ID (format: "name@swarmRunId")
 * - An isolated AbortController for cancellation
 * - An AsyncLocalStorage context for identity propagation
 * - A task registration for lifecycle tracking
 *
 * Adapted from Claude Code's spawnInProcess.ts for LEA's swarm architecture.
 */

import { randomUUID } from 'node:crypto';
import { createAgentContext } from './AgentContext.js';
import { TaskManager } from './TaskManager.js';
import type {
  AgentContext,
  SpawnOptions,
  SpawnResult,
  TeammateIdentity,
  TeammateTaskState,
} from './types.js';
import { TEAM_LEAD_NAME, AGENT_ID_SEPARATOR } from './constants.js';
import { getAgentContext } from './AgentContext.js';

/**
 * Format an agent ID from name and swarm run ID.
 */
export function formatAgentId(name: string, swarmRunId: string): string {
  return `${name}${AGENT_ID_SEPARATOR}${swarmRunId}`;
}

/**
 * Parse an agent ID into its components.
 */
export function parseAgentId(agentId: string): { name: string; swarmRunId: string } | null {
  const idx = agentId.indexOf(AGENT_ID_SEPARATOR);
  if (idx === -1) return null;
  return {
    name: agentId.substring(0, idx),
    swarmRunId: agentId.substring(idx + 1),
  };
}

/**
 * Sanitize an agent name for use in deterministic agent IDs.
 * Replaces @ and other special characters.
 */
export function sanitizeAgentName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-');
}

/**
 * Create a TeammateIdentity from spawn options.
 */
function createIdentity(options: SpawnOptions, agentId: string, parentSessionId: string): TeammateIdentity {
  return {
    agentId,
    agentName: options.name,
    swarmRunId: options.swarmRunId,
    pentestId: options.pentestId,
    color: options.color,
    role: options.role,
    planModeRequired: options.planModeRequired ?? false,
    parentSessionId,
  };
}

/**
 * AgentSpawner handles spawning and managing in-process teammate agents.
 *
 * Usage:
 * ```ts
 * const spawner = new AgentSpawner(taskManager);
 * const result = await spawner.spawn({
 *   name: 'Recon Alpha',
 *   role: 'Recon',
 *   prompt: 'Scan the target for open ports',
 *   swarmRunId: 'run-123',
 *   pentestId: 'pt-456',
 * });
 * ```
 */
export class AgentSpawner {
  private readonly agents: Map<string, AgentContext> = new Map();
  private readonly taskManager: TaskManager;
  private readonly cleanupHandlers: Map<string, () => void> = new Map();

  constructor(taskManager: TaskManager) {
    this.taskManager = taskManager;
  }

  /**
   * Spawn a new in-process teammate agent.
   *
   * Creates the agent's identity, context, AbortController, and registers
   * a task in the TaskManager. The actual execution is driven by AgentRunner.
   */
  async spawn(options: SpawnOptions): Promise<SpawnResult> {
    const agentId = formatAgentId(options.name, options.swarmRunId);
    const taskId = randomUUID();

    // Check if an agent with this ID already exists
    if (this.agents.has(agentId)) {
      return {
        success: false,
        agentId,
        taskId,
        abortController: new AbortController(),
        error: `Agent ${agentId} already exists`,
      };
    }

    try {
      // Create independent AbortController for this teammate
      const abortController = new AbortController();

      // Use the swarm run ID as parent session ID for transcript correlation
      const parentSessionId = options.swarmRunId;

      // Create teammate identity
      const identity = createIdentity(options, agentId, parentSessionId);

      // Create agent context for AsyncLocalStorage
      const agentContext = createAgentContext({
        agentId,
        agentName: options.name,
        swarmRunId: options.swarmRunId,
        pentestId: options.pentestId,
        role: options.role,
        color: options.color,
        planModeRequired: options.planModeRequired ?? false,
        isTeamLead: false,
        agentType: 'teammate',
        abortController,
      });

      // Store context reference
      this.agents.set(agentId, agentContext);

      // Create task state
      const description = options.description ||
        `${options.name}: ${options.prompt.substring(0, 50)}${options.prompt.length > 50 ? '...' : ''}`;

      const taskState: TeammateTaskState = {
        taskId,
        description,
        status: 'running',
        type: 'teammate',
        identity,
        prompt: options.prompt,
        model: options.model,
        agentStatus: 'SPAWNED',
        startTime: Date.now(),
        isBackgrounded: true,
        notified: false,
        exitCode: undefined,
        error: undefined,
        agentId,
        awaitingPlanApproval: false,
        permissionMode: options.planModeRequired ? 'plan' : 'default',
        isIdle: false,
        shutdownRequested: false,
        lastReportedToolCount: 0,
        lastReportedTokenCount: 0,
        pendingUserMessages: [],
      };

      // Register cleanup handler for graceful shutdown
      taskState.cleanup = () => {
        abortController.abort();
        this.removeAgent(agentId);
      };

      // Register task in TaskManager with our taskId, preserving full state
      this.taskManager.registerTaskWithState(taskState, taskId);

      return {
        success: true,
        agentId,
        taskId,
        abortController,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during spawn';
      return {
        success: false,
        agentId,
        taskId,
        abortController: new AbortController(),
        error: errorMessage,
      };
    }
  }

  /**
   * Kill a teammate agent by aborting its controller.
   *
   * @param taskId - Task ID of the teammate to kill
   * @returns true if killed successfully
   */
  killTeammate(taskId: string): boolean {
    const task = this.taskManager.getTask(taskId);
    if (!task || task.type !== 'teammate') {
      return false;
    }

    const teammateTask = task as unknown as TeammateTaskState;
    if (teammateTask.status !== 'running' && teammateTask.status !== 'idle') {
      return false;
    }

    const agentId = teammateTask.identity.agentId;

    // Abort the controller to stop execution
    const context = this.agents.get(agentId);
    context?.abortController.abort();

    // Call cleanup handler
    const cleanup = this.cleanupHandlers.get(agentId);
    cleanup?.();

    // Update task state
    this.taskManager.updateTask(taskId, {
      status: 'killed',
      endTime: Date.now(),
      notified: true,
      agentStatus: 'FAILED',
    });

    // Fire idle callbacks to unblock waiters
    teammateTask.onIdleCallbacks?.forEach(cb => cb());

    // Remove from tracking
    this.removeAgent(agentId);

    return true;
  }

  /**
   * Kill a teammate by agent ID.
   */
  killTeammateByAgentId(agentId: string): boolean {
    const task = this.taskManager.findTaskByAgentId(agentId);
    if (!task) return false;
    return this.killTeammate(task.taskId);
  }

  /**
   * Get the agent context for a given agent ID.
   */
  getAgentContext(agentId: string): AgentContext | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all registered agent IDs.
   */
  getAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Get the number of active (non-terminal) agents.
   */
  getActiveCount(): number {
    let count = 0;
    for (const [agentId] of Array.from(this.agents)) {
      const task = this.taskManager.findTaskByAgentId(agentId);
      if (task && (task.status === 'running' || task.status === 'idle')) {
        count++;
      }
    }
    return count;
  }

  /**
   * Remove an agent from tracking.
   */
  private removeAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.cleanupHandlers.delete(agentId);
  }

  /**
   * Get the identity of a spawned agent.
   *
   * @param agentId - The agent ID to look up
   * @returns The agent's identity or undefined
   */
  getIdentity(agentId: string): TeammateIdentity | undefined {
    const context = this.agents.get(agentId);
    if (!context) return undefined;

    // Look up the task to get the identity
    const task = this.taskManager.findTaskByAgentId(agentId);
    if (!task || task.type !== 'teammate') return undefined;

    const teammateTask = task as unknown as TeammateTaskState;
    return teammateTask.identity;
  }

  /**
   * Gracefully shut down all agents.
   */
  async shutdown(): Promise<void> {
    const agentIds = Array.from(this.agents.keys());
    await Promise.allSettled(
      agentIds.map(agentId => this.killTeammateByAgentId(agentId)),
    );
  }
}
