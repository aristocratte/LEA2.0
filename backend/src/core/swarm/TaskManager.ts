/**
 * TaskManager — Central task lifecycle management for LEA's swarm.
 *
 * Tracks all running tasks (shell commands, agent executions, teammates)
 * through their lifecycle: CREATED → RUNNING → COMPLETED/FAILED/STOPPED.
 *
 * Adapted from Claude Code's task registration framework for LEA's
 * in-process swarm architecture.
 */

import { randomUUID } from 'node:crypto';
import type {
  TaskHandle,
  TaskStatus,
  TaskCreateOptions,
} from './types.js';

// ────────────────────────────────────────────────────────────
// Event Types
// ────────────────────────────────────────────────────────────

export type TaskEventType =
  | 'created'
  | 'started'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'backgrounded'
  | 'foregrounded';

export interface TaskEvent {
  type: TaskEventType;
  task: TaskHandle;
  timestamp: number;
}

export type TaskEventHandler = (event: TaskEvent) => void;

// ────────────────────────────────────────────────────────────
// TaskManager
// ────────────────────────────────────────────────────────────

/**
 * Central manager for task lifecycle tracking.
 *
 * All tasks (shell commands, agent executions, teammates) are registered
 * here so they can be listed, inspected, and cancelled centrally.
 */
export class TaskManager {
  private tasks = new Map<string, TaskHandle>();
  private abortControllers = new Map<string, AbortController>();
  private eventHandlers: TaskEventHandler[] = [];

  /**
   * Register a new task and return a handle for interacting with it.
   *
   * @param options - Task creation options
   * @param taskId - Optional predefined taskId (if not provided, one will be generated)
   * @returns A TaskHandle with cancel/getId/getStatus methods
   */
  registerTask(options: TaskCreateOptions, taskId?: string): TaskHandle {
    const id = taskId ?? randomUUID();
    const now = Date.now();

    const task: TaskHandle = {
      taskId: id,
      description: options.description,
      status: 'pending',
      startTime: now,
      type: options.type,
      agentId: options.agentId,
      isBackgrounded: options.background ?? false,
      notified: false,
    };

    this.tasks.set(id, task);
    this.abortControllers.set(id, new AbortController());

    this.emit({ type: 'created', task, timestamp: now });
    return task;
  }

  /**
   * Register an already-formed task state (e.g., TeammateTaskState).
   * This preserves all fields including status, agentStatus, etc.
   *
   * @param task - The full task state to register
   * @param taskId - Optional predefined taskId (uses task.taskId if not provided)
   * @returns The registered task
   */
  registerTaskWithState(task: TaskHandle, taskId?: string): TaskHandle {
    const id = taskId ?? task.taskId;

    this.tasks.set(id, task);
    this.abortControllers.set(id, new AbortController());

    this.emit({ type: 'created', task, timestamp: Date.now() });
    return task;
  }

  /**
   * Start a task (transition from pending → running).
   */
  startTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'pending') return;

    task.status = 'running';
    this.emit({ type: 'started', task, timestamp: Date.now() });
  }

  /**
   * Complete a task successfully.
   */
  completeTask(taskId: string, exitCode?: number): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'running') return;

    task.status = 'completed';
    task.endTime = Date.now();
    task.exitCode = exitCode;
    this.emit({ type: 'completed', task, timestamp: Date.now() });
  }

  /**
   * Mark a task as failed.
   */
  failTask(taskId: string, error: string, exitCode?: number): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'running') return;

    task.status = 'failed';
    task.endTime = Date.now();
    task.error = error;
    task.exitCode = exitCode;
    this.emit({ type: 'failed', task, timestamp: Date.now() });
  }

  /**
   * Stop a task by aborting its AbortController and transitioning to 'killed'.
   *
   * @param taskId - The task to stop
   * @returns true if the task was actually stopped
   */
  stopTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || (task.status !== 'running' && task.status !== 'pending')) {
      return false;
    }

    // Abort the associated AbortController
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
    }

    // Run cleanup if registered
    if (task.cleanup) {
      try {
        task.cleanup();
      } catch {
        // Cleanup errors are non-fatal
      }
    }

    task.status = 'killed';
    task.endTime = Date.now();
    this.emit({ type: 'stopped', task, timestamp: Date.now() });
    return true;
  }

  /**
   * Send a task to background.
   */
  backgroundTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.isBackgrounded) return;

    task.isBackgrounded = true;
    this.emit({ type: 'backgrounded', task, timestamp: Date.now() });
  }

  /**
   * Bring a background task to foreground.
   */
  foregroundTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || !task.isBackgrounded) return;

    task.isBackgrounded = false;
    this.emit({ type: 'foregrounded', task, timestamp: Date.now() });
  }

  /**
   * Get a task handle by ID.
   */
  getTask(taskId: string): TaskHandle | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get the AbortController for a task.
   */
  getAbortController(taskId: string): AbortController | undefined {
    return this.abortControllers.get(taskId);
  }

  /**
   * List all tasks, optionally filtered by status or agentId.
   */
  listTasks(filter?: { status?: TaskStatus; agentId?: string }): TaskHandle[] {
    let result = Array.from(this.tasks.values());

    if (filter?.status) {
      result = result.filter(t => t.status === filter.status);
    }
    if (filter?.agentId) {
      result = result.filter(t => t.agentId === filter.agentId);
    }

    return result;
  }

  /**
   * Get all tasks that are currently running.
   */
  getRunningTasks(): TaskHandle[] {
    return this.listTasks({ status: 'running' });
  }

  /**
   * Get all background tasks (running + backgrounded).
   */
  getBackgroundTasks(): TaskHandle[] {
    return Array.from(this.tasks.values()).filter(
      t => (t.status === 'running' || t.status === 'pending') && t.isBackgrounded,
    );
  }

  /**
   * Get all tasks belonging to a specific agent.
   */
  getTasksByAgent(agentId: string): TaskHandle[] {
    return this.listTasks({ agentId });
  }

  /**
   * Find a task by its agent ID (convenience alias).
   */
  findTaskByAgentId(agentId: string): TaskHandle | undefined {
    return this.listTasks({ agentId }).find(t => t.status === 'running' || t.status === 'pending');
  }

  /**
   * Update a task's properties (partial update).
   */
  updateTask(taskId: string, updates: Partial<TaskHandle>): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    Object.assign(task, updates);
    return true;
  }

  /**
   * Register a cleanup callback for a task.
   */
  registerCleanup(taskId: string, cleanup: () => void): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.cleanup = cleanup;
  }

  /**
   * Stop all tasks belonging to a specific agent.
   * Used when an agent exits to clean up orphaned tasks.
   */
  stopTasksByAgent(agentId: string): number {
    const agentTasks = this.getTasksByAgent(agentId);
    let stopped = 0;
    for (const task of Array.from(agentTasks)) {
      if (this.stopTask(task.taskId)) {
        stopped++;
      }
    }
    return stopped;
  }

  /**
   * Remove a task from tracking (after it reaches terminal state).
   */
  removeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // Only allow removal of terminal tasks
    if (task.status !== 'completed' && task.status !== 'failed' && task.status !== 'killed') {
      return false;
    }

    this.tasks.delete(taskId);
    this.abortControllers.delete(taskId);
    return true;
  }

  /**
   * Register an event handler for task lifecycle events.
   */
  onEvent(handler: TaskEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      this.eventHandlers = this.eventHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Get the total number of tracked tasks.
   */
  get size(): number {
    return this.tasks.size;
  }

  /**
   * Shut down all running tasks.
   */
  shutdown(): void {
    for (const taskId of Array.from(this.tasks.keys())) {
      this.stopTask(taskId);
    }
    this.tasks.clear();
    this.abortControllers.clear();
  }

  // ──────────────────────────────────────────────────────────
  // Private
  // ──────────────────────────────────────────────────────────

  private emit(event: TaskEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Handler errors are non-fatal
      }
    }
  }
}
