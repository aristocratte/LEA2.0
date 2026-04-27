/**
 * RuntimeTaskManager — Manages runtime task output and lifecycle.
 *
 * Tracks shell tasks executed by agents, storing their output for
 * retrieval via REST API or tool calls. Supports output streaming,
 * offset/limit pagination, and per-agent task cleanup.
 */

import { randomUUID } from 'node:crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface RuntimeTaskInfo {
  taskId: string;
  command: string;
  agentId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'killed';
  exitCode?: number;
  startedAt: number;
  completedAt?: number;
}

export interface RuntimeTaskOutput {
  taskId: string;
  output: string;
  totalBytes: number;
  isComplete: boolean;
}

// ============================================================================
// RUNTIME TASK MANAGER
// ============================================================================

export class RuntimeTaskManager {
  private tasks = new Map<string, RuntimeTaskInfo>();
  private outputs = new Map<string, string>();
  private readonly maxOutputSize: number;

  constructor(maxOutputSize: number = 10 * 1024 * 1024) {
    this.maxOutputSize = maxOutputSize;
  }

  registerTask(taskId: string, info: Omit<RuntimeTaskInfo, 'startedAt'>): void {
    this.tasks.set(taskId, {
      ...info,
      startedAt: Date.now(),
    });
    this.outputs.set(taskId, '');
  }

  updateStatus(taskId: string, status: RuntimeTaskInfo['status'], exitCode?: number): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Once terminal, do not regress status.
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'killed') {
      return;
    }

    task.status = status;
    if (exitCode !== undefined) {
      task.exitCode = exitCode;
    }
    if (status === 'completed' || status === 'failed' || status === 'killed') {
      task.completedAt = task.completedAt ?? Date.now();
    }
  }

  appendOutput(taskId: string, chunk: string): void {
    const existing = this.outputs.get(taskId) ?? '';
    const newSize = existing.length + chunk.length;

    if (newSize > this.maxOutputSize) {
      // Truncate to max size, preserving most recent output
      const truncated = chunk.slice(0, this.maxOutputSize);
      this.outputs.set(taskId, truncated);
      return;
    }

    this.outputs.set(taskId, existing + chunk);
  }

  completeTask(taskId: string, exitCode: number): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    if (task.status === 'killed') return;
    this.updateStatus(taskId, 'completed', exitCode);
  }

  failTask(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    if (task.status === 'killed') return;
    this.updateStatus(taskId, 'failed');
    // Append error to output
    this.appendOutput(taskId, `\n[ERROR] ${error}`);
  }

  killTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    this.updateStatus(taskId, 'killed');
    this.appendOutput(taskId, '\n[KILLED] Task was terminated');
  }

  getTask(taskId: string): RuntimeTaskInfo | undefined {
    return this.tasks.get(taskId);
  }

  getTaskOutput(taskId: string, offset = 0, limit?: number): RuntimeTaskOutput | undefined {
    const output = this.outputs.get(taskId);
    const task = this.tasks.get(taskId);

    if (output === undefined || task === undefined) {
      return undefined;
    }

    const isComplete = task.status === 'completed' || task.status === 'failed' || task.status === 'killed';

    let slicedOutput = output;
    if (offset > 0) {
      slicedOutput = slicedOutput.slice(offset);
    }
    if (limit !== undefined && limit > 0) {
      slicedOutput = slicedOutput.slice(0, limit);
    }

    return {
      taskId,
      output: slicedOutput,
      totalBytes: output.length,
      isComplete,
    };
  }

  listTasks(agentId?: string): RuntimeTaskInfo[] {
    let tasks = Array.from(this.tasks.values());

    if (agentId) {
      tasks = tasks.filter(t => t.agentId === agentId);
    }

    // Sort by startedAt descending (newest first)
    return tasks.sort((a, b) => b.startedAt - a.startedAt);
  }

  removeTask(taskId: string): void {
    this.tasks.delete(taskId);
    this.outputs.delete(taskId);
  }

  cleanupTasks(agentId: string): number {
    let removed = 0;
    for (const [taskId, task] of Array.from(this.tasks.entries())) {
      if (task.agentId === agentId) {
        this.removeTask(taskId);
        removed++;
      }
    }
    return removed;
  }

  clear(): void {
    this.tasks.clear();
    this.outputs.clear();
  }

  get size(): number {
    return this.tasks.size;
  }
}
