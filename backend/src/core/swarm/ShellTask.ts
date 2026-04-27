/**
 * ShellTask — Executes shell commands as managed tasks.
 *
 * Provides a task-based wrapper around child_process.spawn with support
 * for timeout, cwd, env, streaming stdout/stderr, backgrounding, and
 * PID tracking for kill capability.
 *
 * Adapted from Claude Code's LocalShellTask for LEA's swarm architecture.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TaskManager } from './TaskManager.js';
import { StallDetector } from './StallDetector.js';
import type { ShellTaskState, ShellTaskResult, BashTaskKind } from './types.js';

// ────────────────────────────────────────────────────────────
// Options
// ────────────────────────────────────────────────────────────

/**
 * Options for shell task execution.
 */
export interface ShellExecuteOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables to merge with process.env */
  env?: Record<string, string>;
  /** Timeout in ms (0 = no timeout) */
  timeout?: number;
  /** Shell kind: 'bash' or 'monitor' */
  kind?: BashTaskKind;
  /** Whether to start in background */
  background?: boolean;
  /** Agent ID that owns this task */
  agentId?: string;
  /** Maximum stdout/stderr buffer size in bytes */
  maxBuffer?: number;
  /** Callback invoked for each stdout chunk */
  onStdoutChunk?: (chunk: string) => void;
  /** Callback invoked for each stderr chunk */
  onStderrChunk?: (chunk: string) => void;
}

// ────────────────────────────────────────────────────────────
// ShellTask
// ────────────────────────────────────────────────────────────

/**
 * Executes shell commands as managed tasks via child_process.spawn.
 *
 * Integrates with TaskManager for lifecycle tracking and StallDetector
 * for activity monitoring. Supports streaming output and graceful cleanup.
 */
export class ShellTask {
  private taskManager: TaskManager;
  private stallDetector: StallDetector;

  constructor(taskManager: TaskManager, stallDetector: StallDetector) {
    this.taskManager = taskManager;
    this.stallDetector = stallDetector;
  }

  /**
   * Execute a shell command as a managed task.
   *
   * @param command - The shell command to execute
   * @param options - Execution options
   * @returns A ShellTaskState with process handle and result promise
   */
  execute(command: string, options: ShellExecuteOptions = {}): ShellTaskState {
    const {
      cwd,
      env,
      timeout = 0,
      kind,
      background,
      agentId,
      maxBuffer = 10 * 1024 * 1024,
      onStdoutChunk,
      onStderrChunk,
    } = options;

    // Register with TaskManager
    const handle = this.taskManager.registerTask({
      description: kind === 'monitor' ? 'Monitor task' : command.length > 80 ? command.slice(0, 77) + '...' : command,
      type: 'shell',
      agentId,
      background,
    });

    let resolveResult: (result: ShellTaskResult) => void;
    let rejectResult: (error: Error) => void;
    const resultPromise = new Promise<ShellTaskResult>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    // Build the full task state
    const taskState: ShellTaskState = {
      ...handle,
      type: 'shell',
      command,
      kind,
      resultPromise,
      cleanup: () => {
        // Will be populated after spawn
      },
    };

    // Build environment
    const spawnEnv = env ? { ...process.env, ...env } : process.env;

    // Spawn the process
    let child: ChildProcess;
    try {
      child = spawn('/bin/bash', ['-c', command], {
        cwd: cwd ?? process.cwd(),
        env: spawnEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
      });
    } catch (err) {
      this.taskManager.failTask(taskState.taskId, `Failed to spawn: ${err instanceof Error ? err.message : String(err)}`);
      resultPromise.catch(() => {}); // Prevent unhandled rejection
      return taskState;
    }

    // Store process reference
    taskState.process = child;

    // Track PID for kill capability
    const pid = child.pid;

    // Stream buffers
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let totalStdoutSize = 0;
    let totalStderrSize = 0;

    // Track for activity monitoring
    let lastActivityTime = Date.now();
    const recordActivity = () => {
      lastActivityTime = Date.now();
      this.stallDetector.recordActivity(taskState.taskId);
    };

    // Collect stdout
    child.stdout?.on('data', (chunk: Buffer) => {
      totalStdoutSize += chunk.length;
      if (totalStdoutSize <= maxBuffer) {
        stdoutChunks.push(chunk);
      }
      onStdoutChunk?.(chunk.toString('utf-8'));
      recordActivity();
    });

    // Collect stderr
    child.stderr?.on('data', (chunk: Buffer) => {
      totalStderrSize += chunk.length;
      if (totalStderrSize <= maxBuffer) {
        stderrChunks.push(chunk);
      }
      onStderrChunk?.(chunk.toString('utf-8'));
      recordActivity();
    });

    // Handle process exit
    child.on('close', (code, signal) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');
      const interrupted = signal === 'SIGTERM' || signal === 'SIGKILL' || signal === 'SIGABRT';

      if (code === 0) {
        this.taskManager.completeTask(taskState.taskId, code ?? 0);
        resolveResult!({ code: code ?? 0, interrupted, stdout, stderr });
      } else {
        this.taskManager.failTask(
          taskState.taskId,
          interrupted ? `Command interrupted (${signal})` : `Command exited with code ${code}`,
          code ?? -1,
        );
        resolveResult!({ code: code ?? -1, interrupted, stdout, stderr });
      }
    });

    child.on('error', (err) => {
      this.taskManager.failTask(taskState.taskId, err.message);
      rejectResult!(err);
    });

    // Start the task
    this.taskManager.startTask(taskState.taskId);

    // Start stall monitoring
    this.stallDetector.startMonitoring(taskState.taskId, taskState, {
      thresholdMs: 45_000,
      checkIntervalMs: 5_000,
    });

    // Set up cleanup
    taskState.cleanup = () => {
      try {
        if (child.pid && !child.killed) {
          child.kill('SIGTERM');
          // Force kill after 5s if still alive
          setTimeout(() => {
            try {
              if (child.pid && !child.killed) {
                child.kill('SIGKILL');
              }
            } catch {
              // Process already exited
            }
          }, 5_000).unref();
        }
      } catch {
        // Already dead
      }
    };

    // Handle timeout
    if (timeout > 0) {
      const timer = setTimeout(() => {
        this.taskManager.stopTask(taskState.taskId);
      }, timeout);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    }

    // Handle abort signal from TaskManager
    const controller = this.taskManager.getAbortController(taskState.taskId);
    if (controller) {
      controller.signal.addEventListener('abort', () => {
        if (!child.killed) {
          child.kill('SIGTERM');
        }
      }, { once: true });
    }

    return taskState;
  }

  /**
   * Kill a shell task by task ID.
   *
   * @param taskId - The task to kill
   * @returns true if the task was killed
   */
  kill(taskId: string): boolean {
    const task = this.taskManager.getTask(taskId) as ShellTaskState | undefined;
    if (!task || task.type !== 'shell') return false;

    if (task.process && !task.process.killed) {
      task.process.kill('SIGTERM');
    }

    this.taskManager.stopTask(taskId);
    this.stallDetector.stopMonitoring(taskId);
    return true;
  }

  /**
   * Send stdin data to a running shell task.
   *
   * @param taskId - The task to send data to
   * @param data - The data to write
   */
  writeStdin(taskId: string, data: string): void {
    const task = this.taskManager.getTask(taskId) as ShellTaskState | undefined;
    if (!task?.process?.stdin) return;

    task.process.stdin.write(data);
  }

  /**
   * Close stdin for a running shell task.
   *
   * @param taskId - The task to close stdin on
   */
  closeStdin(taskId: string): void {
    const task = this.taskManager.getTask(taskId) as ShellTaskState | undefined;
    if (!task?.process?.stdin) return;

    task.process.stdin.end();
  }
}
