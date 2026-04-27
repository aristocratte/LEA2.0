/**
 * TeammateLifecycle — Manages full teammate lifecycle for LEA's swarm.
 *
 * Handles teammate initialization, running, idle detection, and graceful
 * shutdown. Integrates with AgentContext (AsyncLocalStorage) and TaskManager
 * for proper context propagation and task tracking.
 *
 * Adapted from Claude Code's teammateInit.ts and teammateModel.ts.
 */

import { randomUUID } from 'node:crypto';
import {
  createAgentContext,
  runWithAgentContext,
  getAgentContext,
  getCurrentAgentId,
} from './AgentContext.js';
import { TaskManager } from './TaskManager.js';
import { StallDetector } from './StallDetector.js';
import { NotificationQueue } from './NotificationQueue.js';
import type {
  AgentContext,
  TeammateIdentity,
  TeammateTaskState,
  SpawnOptions,
  SpawnResult,
} from './types.js';

/** Default idle threshold in ms (no activity = idle) */
const DEFAULT_IDLE_THRESHOLD_MS = 60_000;

/**
 * Options for teammate initialization.
 */
export interface TeammateInitOptions extends SpawnOptions {
  /** Parent session ID for transcript correlation */
  parentSessionId: string;
  /** Callback when teammate becomes idle */
  onIdle?: (agentId: string, summary?: string) => void;
  /** Callback when teammate completes */
  onComplete?: (agentId: string, exitCode?: number) => void;
  /** Callback when teammate fails */
  onFail?: (agentId: string, error: string) => void;
}

// ────────────────────────────────────────────────────────────
// TeammateLifecycle
// ────────────────────────────────────────────────────────────

/**
 * Manages the full lifecycle of teammate agents within a swarm.
 *
 * Each teammate goes through: init → running → idle → shutdown
 * The lifecycle manager coordinates between AgentContext, TaskManager,
 * StallDetector, and NotificationQueue to provide proper isolation and
 * tracking.
 */
export class TeammateLifecycle {
  private taskManager: TaskManager;
  private stallDetector: StallDetector;
  private notificationQueue: NotificationQueue;
  private teammates = new Map<string, TeammateTaskState>();
  private idleThresholdMs: number;

  constructor(
    taskManager: TaskManager,
    stallDetector: StallDetector,
    notificationQueue: NotificationQueue,
    options?: { idleThresholdMs?: number },
  ) {
    this.taskManager = taskManager;
    this.stallDetector = stallDetector;
    this.notificationQueue = notificationQueue;
    this.idleThresholdMs = options?.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS;
  }

  /**
   * Initialize a new teammate: create context, register task, prepare state.
   *
   * @param options - Teammate initialization options
   * @returns Spawn result with agent ID and abort controller
   */
  initTeammate(options: TeammateInitOptions): SpawnResult {
    const agentId = `${options.name}@${options.swarmRunId}`;
    const taskId = randomUUID();
    const abortController = new AbortController();

    // Build identity
    const identity: TeammateIdentity = {
      agentId,
      agentName: options.name,
      swarmRunId: options.swarmRunId,
      pentestId: options.pentestId,
      color: options.color,
      role: options.role,
      planModeRequired: options.planModeRequired ?? false,
      parentSessionId: options.parentSessionId,
    };

    // Create agent context
    const agentContext = createAgentContext({
      agentId,
      agentName: options.name,
      swarmRunId: options.swarmRunId,
      pentestId: options.pentestId,
      role: options.role,
      color: options.color,
      planModeRequired: options.planModeRequired ?? false,
      abortController,
    });

    // Register task with TaskManager
    const handle = this.taskManager.registerTask({
      description: `Teammate: ${options.name} (${options.role})`,
      type: 'teammate',
      agentId,
    });

    // Build full teammate task state
    const taskState: TeammateTaskState = {
      taskId: handle.taskId,
      description: handle.description,
      status: handle.status,
      startTime: handle.startTime,
      type: 'teammate',
      identity,
      prompt: options.prompt,
      model: options.model,
      agentStatus: 'SPAWNED',
      awaitingPlanApproval: false,
      permissionMode: 'default',
      isIdle: false,
      shutdownRequested: false,
      onIdleCallbacks: options.onIdle ? [options.onIdle.bind(null, agentId)] : [],
      lastReportedToolCount: 0,
      lastReportedTokenCount: 0,
      isBackgrounded: handle.isBackgrounded,
      notified: handle.notified,
      agentId,
      pendingUserMessages: [],
    };

    this.teammates.set(agentId, taskState);
    this.taskManager.startTask(taskId);

    return {
      success: true,
      agentId,
      taskId,
      abortController,
    };
  }

  /**
   * Run a function within a teammate's agent context.
   *
   * @param agentId - The teammate's agent ID
   * @param fn - Function to run within the agent's context
   */
  runWithContext<T>(agentId: string, fn: () => T): T | undefined {
    const taskState = this.teammates.get(agentId);
    if (!taskState) return undefined;

    const context = this.buildAgentContext(taskState);
    return runWithAgentContext(context, fn);
  }

  /**
   * Gracefully shut down a teammate.
   *
   * @param agentId - The teammate's agent ID
   * @returns true if shutdown was initiated
   */
  shutdownTeammate(agentId: string): boolean {
    const taskState = this.teammates.get(agentId);
    if (!taskState) return false;

    // Mark as shutdown requested
    taskState.shutdownRequested = true;

    // Abort the task via TaskManager
    this.taskManager.stopTask(taskState.taskId);

    // Stop stall monitoring
    this.stallDetector.stopMonitoring(taskState.taskId);

    // Clean up
    this.teammates.delete(agentId);

    return true;
  }

  /**
   * Detect if a teammate is idle (no recent activity).
   *
   * @param agentId - The teammate's agent ID
   * @param threshold - Idle threshold in ms (overrides default)
   * @returns true if the teammate is idle
   */
  detectIdle(agentId: string, threshold?: number): boolean {
    const taskState = this.teammates.get(agentId);
    if (!taskState) return false;

    // Already idle or shutdown
    if (taskState.isIdle || taskState.shutdownRequested) return true;

    // Terminal status
    if (taskState.status === 'completed' || taskState.status === 'failed' || taskState.status === 'killed') {
      return true;
    }

    const idleMs = threshold ?? this.idleThresholdMs;
    const now = Date.now();
    const lastActivity = taskState.endTime ?? taskState.startTime;

    // Check if we have progress data for more accurate idle detection
    if (taskState.progress) {
      const lastToolActivity = taskState.progress.lastActivity;
      if (lastToolActivity) {
        // If no tool use for threshold, consider idle
        // (This is a simplified heuristic; a real implementation would track timestamps)
        return (now - lastActivity) > idleMs;
      }
    }

    return (now - lastActivity) > idleMs;
  }

  /**
   * Get the teammate task state by agent ID.
   */
  getTeammateState(agentId: string): TeammateTaskState | undefined {
    return this.teammates.get(agentId);
  }

  /**
   * Get all active teammate states.
   */
  getAllTeammates(): TeammateTaskState[] {
    return Array.from(this.teammates.values());
  }

  /**
   * Update a teammate's agent status.
   */
  updateStatus(agentId: string, status: TeammateTaskState['agentStatus']): void {
    const taskState = this.teammates.get(agentId);
    if (!taskState) return;

    taskState.agentStatus = status;

    if (status === 'IDLE') {
      taskState.isIdle = true;
      // Invoke idle callbacks
      for (const cb of taskState.onIdleCallbacks ?? []) {
        try {
          cb();
        } catch {
          // Callback errors are non-fatal
        }
      }
    } else if (status === 'RUNNING_TOOL' || status === 'THINKING') {
      taskState.isIdle = false;
    }
  }

  /**
   * Record activity for a teammate (e.g., tool use, text output).
   */
  recordActivity(agentId: string): void {
    const taskState = this.teammates.get(agentId);
    if (!taskState) return;

    taskState.isIdle = false;
    taskState.agentStatus = 'RUNNING_TOOL';
    this.stallDetector.recordActivity(taskState.taskId);
  }

  /**
   * Update progress tracking for a teammate.
   */
  updateProgress(
    agentId: string,
    progress: Partial<TeammateTaskState['progress']>,
  ): void {
    const taskState = this.teammates.get(agentId);
    if (!taskState) return;

    taskState.progress = {
      toolUseCount: 0,
      tokenCount: 0,
      ...taskState.progress,
      ...progress,
    } as TeammateTaskState['progress'];
  }

  /**
   * Shut down all active teammates.
   */
  shutdownAll(): void {
    for (const agentId of Array.from(this.teammates.keys())) {
      this.shutdownTeammate(agentId);
    }
  }

  /**
   * Get the number of active teammates.
   */
  get activeCount(): number {
    return this.teammates.size;
  }

  // ──────────────────────────────────────────────────────────
  // Private
  // ──────────────────────────────────────────────────────────

  private buildAgentContext(taskState: TeammateTaskState): AgentContext {
    return {
      agentId: taskState.identity.agentId,
      agentName: taskState.identity.agentName,
      swarmRunId: taskState.identity.swarmRunId,
      pentestId: taskState.identity.pentestId,
      role: taskState.identity.role,
      color: taskState.identity.color,
      planModeRequired: taskState.identity.planModeRequired,
      isTeamLead: false,
      agentType: 'teammate',
      abortController: new AbortController(),
    };
  }
}
