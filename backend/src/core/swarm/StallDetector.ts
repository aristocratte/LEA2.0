/**
 * StallDetector — Monitors tasks for stalls (no activity for X ms).
 *
 * Watches for tasks that appear blocked (e.g., waiting for interactive
 * input) and notifies via a callback when a stall is detected.
 *
 * Adapted from Claude Code's stall watchdog in LocalShellTask.tsx.
 */

import type { TaskHandle } from './types.js';
import type { StallConfig } from './types.js';

/** Default check interval in ms */
const DEFAULT_CHECK_INTERVAL_MS = 5_000;

/** Default stall threshold in ms */
const DEFAULT_THRESHOLD_MS = 30_000;

/** Default tail bytes to read for prompt detection */
const DEFAULT_TAIL_BYTES = 1024;

/**
 * Result returned when a stall is detected.
 */
export interface StallDetection {
  taskId: string;
  /** How long since last activity (ms) */
  stallDurationMs: number;
  /** Description of why the stall was detected */
  reason: string;
}

export type StallHandler = (detection: StallDetection) => void;

// ────────────────────────────────────────────────────────────
// StallDetector
// ────────────────────────────────────────────────────────────

/**
 * Monitors tasks for stalls based on activity timestamps.
 *
 * A task is considered "stalled" when its `lastActivityTime` hasn't been
 * updated for longer than the configured threshold. This commonly indicates
 * the task is waiting for interactive input or is otherwise blocked.
 */
export class StallDetector {
  private monitors = new Map<string, {
    interval: ReturnType<typeof setInterval>;
    startTime: number;
    lastActivityTime: number;
    thresholdMs: number;
    checkIntervalMs: number;
    taskId: string;
    description: string;
    aborted: boolean;
  }>();
  private onStall: StallHandler;
  private tailBytes: number;

  /**
   * Create a new StallDetector.
   *
   * @param onStall - Callback invoked when a stall is detected
   * @param options - Optional global configuration
   */
  constructor(
    onStall: StallHandler,
    options?: { tailBytes?: number },
  ) {
    this.onStall = onStall;
    this.tailBytes = options?.tailBytes ?? DEFAULT_TAIL_BYTES;
  }

  /**
   * Start monitoring a task for stalls.
   *
   * @param taskId - The task ID to monitor
   * @param taskHandle - The task handle (for metadata)
   * @param options - Monitoring configuration overrides
   */
  startMonitoring(
    taskId: string,
    taskHandle: TaskHandle,
    options?: StallConfig,
  ): void {
    // Don't start duplicate monitoring
    if (this.monitors.has(taskId)) return;

    const checkIntervalMs = options?.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    const thresholdMs = options?.thresholdMs ?? DEFAULT_THRESHOLD_MS;
    const now = Date.now();

    const state = {
      interval: setInterval(
        () => this.checkStall(taskId),
        checkIntervalMs,
      ),
      startTime: now,
      lastActivityTime: now,
      thresholdMs,
      checkIntervalMs,
      taskId,
      description: taskHandle.description,
      aborted: false,
    };

    // Don't hold the process open
    if (typeof state.interval.unref === 'function') {
      state.interval.unref();
    }

    this.monitors.set(taskId, state);
  }

  /**
   * Update the last activity timestamp for a monitored task.
   * Call this whenever the task produces output or makes progress.
   *
   * @param taskId - The task to update
   */
  recordActivity(taskId: string): void {
    const monitor = this.monitors.get(taskId);
    if (monitor) {
      monitor.lastActivityTime = Date.now();
    }
  }

  /**
   * Stop monitoring a task.
   *
   * @param taskId - The task to stop monitoring
   */
  stopMonitoring(taskId: string): void {
    const monitor = this.monitors.get(taskId);
    if (!monitor) return;

    monitor.aborted = true;
    clearInterval(monitor.interval);
    this.monitors.delete(taskId);
  }

  /**
   * Stop monitoring all tasks.
   */
  stopAll(): void {
    for (const taskId of Array.from(this.monitors.keys())) {
      this.stopMonitoring(taskId);
    }
  }

  /**
   * Check if a specific task is currently being monitored.
   */
  isMonitoring(taskId: string): boolean {
    return this.monitors.has(taskId);
  }

  /**
   * Get the number of tasks being monitored.
   */
  get monitoredCount(): number {
    return this.monitors.size;
  }

  // ──────────────────────────────────────────────────────────
  // Private
  // ──────────────────────────────────────────────────────────

  private checkStall(taskId: string): void {
    const monitor = this.monitors.get(taskId);
    if (!monitor || monitor.aborted) return;

    const now = Date.now();
    const stallDuration = now - monitor.lastActivityTime;

    if (stallDuration >= monitor.thresholdMs) {
      // Stop monitoring — we only report once
      this.stopMonitoring(taskId);

      this.onStall({
        taskId,
        stallDurationMs: stallDuration,
        reason: `Task "${monitor.description}" has had no activity for ${Math.round(stallDuration / 1000)}s`,
      });
    }
  }
}
