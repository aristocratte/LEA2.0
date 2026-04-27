/**
 * Swarm Constants for LEA
 *
 * Centralized constants for the swarm architecture, adapted from Claude Code's
 * swarm system for LEA's pentest agent orchestration.
 */

// ============================================
// IDENTITY & NAMING
// ============================================

/** Default name for the swarm leader/coordination agent */
export const TEAM_LEAD_NAME = 'team-lead';

/** Prefix used for teammate agent IDs in the format "name@team" */
export const AGENT_ID_SEPARATOR = '@';

// ============================================
// LIFECYCLE & TIMEOUTS
// ============================================

/** Default idle timeout before considering a teammate idle (ms) */
export const IDLE_THRESHOLD_MS = 30_000;

/** Maximum time to wait for a permission response from leader (ms) */
export const PERMISSION_RESPONSE_TIMEOUT_MS = 60_000;

/** Interval between mailbox polls for new messages (ms) */
export const MAILBOX_POLL_INTERVAL_MS = 500;

/** How often to check for stalled shell tasks (ms) */
export const STALL_CHECK_INTERVAL_MS = 5_000;

/** No-output duration before a shell task is considered stalled (ms) */
export const STALL_THRESHOLD_MS = 45_000;

/** Bytes to read from task output tail for stall prompt detection */
export const STALL_TAIL_BYTES = 1024;

/** Time to keep a stopped task in the terminal before evicting (ms) */
export const STOPPED_DISPLAY_MS = 2_000;

/** Grace period before panel eviction after task completion (ms) */
export const PANEL_GRACE_MS = 10_000;

/** Maximum number of recent activities tracked per agent task */
export const MAX_RECENT_ACTIVITIES = 5;

/** Cap on teammate message history kept in task state (for UI display) */
export const TEAMMATE_MESSAGES_UI_CAP = 50;

// ============================================
// CONCURRENCY & LIMITS
// ============================================

/** Maximum number of concurrent teammate agents per swarm */
export const MAX_CONCURRENT_TEAMMATES = 20;

/** Maximum number of retries for mailbox operations */
export const MAILBOX_MAX_RETRIES = 3;

/** Delay between mailbox retry attempts (ms) */
export const MAILBOX_RETRY_DELAY_MS = 100;

// ============================================
// MAILBOX / IPC
// ============================================

/** Directory name for swarm mailbox storage within tmpdir */
export const MAILBOX_DIR_NAME = 'lea-swarm-mailbox';

/** Maximum age of mailbox files before cleanup (ms) — 24h default */
export const MAILBOX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// ============================================
// EVENT TYPES
// ============================================

/** Swarm event types emitted via SwarmEventEmitter */
export const SWARM_EVENTS = {
  TEAMMATE_SPAWNED: 'teammate.spawned',
  TEAMMATE_IDLE: 'teammate.idle',
  TEAMMATE_RUNNING: 'teammate.running',
  TEAMMATE_COMPLETED: 'teammate.completed',
  TEAMMATE_FAILED: 'teammate.failed',
  TEAMMATE_KILLED: 'teammate.killed',
  TEAMMATE_SHUTDOWN_REQUESTED: 'teammate.shutdown_requested',
  TASK_CREATED: 'task.created',
  TASK_STARTED: 'task.started',
  TASK_COMPLETED: 'task.completed',
  TASK_FAILED: 'task.failed',
  TASK_STOPPED: 'task.stopped',
  TASK_STALLED: 'task.stalled',
  PERMISSION_REQUESTED: 'permission.requested',
  PERMISSION_GRANTED: 'permission.granted',
  PERMISSION_DENIED: 'permission.denied',
} as const;
