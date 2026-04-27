/**
 * Swarm Types for LEA
 *
 * Core type definitions for the swarm architecture, reimagined from Claude Code's
 * teammate system for LEA's pentest agent orchestration with in-process spawning,
 * AsyncLocalStorage isolation, and filesystem-based IPC.
 */

import type { Agent, Swarm, SwarmRunStatus } from '../../types/swarm.js';
import type { SwarmEventEmitter } from '../../agents/swarm/SwarmEventEmitter.js';

// ============================================
// IDENTITY & CONTEXT
// ============================================

/**
 * Unique identity of a teammate agent within a swarm.
 * Format: "agentName@swarmRunId"
 */
export interface TeammateIdentity {
  /** Full agent ID: "agentName@swarmRunId" */
  agentId: string;
  /** Display name, e.g. "Recon Alpha" */
  agentName: string;
  /** Parent swarm run ID */
  swarmRunId: string;
  /** Parent pentest ID */
  pentestId: string;
  /** Optional UI color for the teammate */
  color?: string;
  /** Role within the swarm, e.g. "Recon", "WebScanner" */
  role: string;
  /** Whether this teammate must enter plan mode before implementation */
  planModeRequired: boolean;
  /** Leader's session/run ID for transcript correlation */
  parentSessionId: string;
  /** Working directory for this agent's tool executions */
  cwd?: string;
}

/**
 * Runtime agent context propagated via AsyncLocalStorage.
 * Provides isolated per-agent identity and configuration that any code
 * running within an agent's execution scope can access.
 */
export interface AgentContext {
  /** Full agent ID: "agentName@swarmRunId" */
  agentId: string;
  /** Display name */
  agentName: string;
  /** Swarm run this agent belongs to */
  swarmRunId: string;
  /** Pentest this swarm is running under */
  pentestId: string;
  /** Agent's role */
  role: string;
  /** UI color */
  color?: string;
  /** Whether plan mode is required before implementation */
  planModeRequired: boolean;
  /** Whether this agent is the team lead */
  isTeamLead: boolean;
  /** Agent type: 'teammate' | 'leader' | 'supervisor' */
  agentType: 'teammate' | 'leader' | 'supervisor';
  /** Reference to this agent's AbortController */
  abortController: AbortController;
  /** Optional: Agent-specific permission overrides */
  permissionOverrides?: Map<string, 'allow' | 'deny' | 'ask'>;
  /** Working directory for this agent's tool executions */
  cwd?: string;
}

// ============================================
// SPAWNING
// # ============================================

/**
 * Configuration for spawning an in-process teammate agent.
 */
export interface SpawnOptions {
  /** Display name for the teammate */
  name: string;
  /** Role within the swarm (determines available tools and behavior) */
  role: string;
  /** Initial prompt/task for the teammate */
  prompt: string;
  /** Swarm run to attach this teammate to */
  swarmRunId: string;
  /** Pentest this swarm is running under */
  pentestId: string;
  /** Optional UI color */
  color?: string;
  /** Whether teammate must plan before implementing */
  planModeRequired?: boolean;
  /** Optional model override */
  model?: string;
  /** Optional system prompt override */
  systemPrompt?: string;
  /** System prompt mode: replace default, append, or use default */
  systemPromptMode?: 'default' | 'replace' | 'append';
  /** Tools this teammate is allowed to use (empty = all) */
  allowedTools?: string[];
  /** Whether this teammate can request permission for unlisted tools */
  allowPermissionPrompts?: boolean;
  /** Short description for the UI */
  description?: string;
  /** Working directory for this agent's tool executions */
  cwd?: string;
}

/**
 * Result of spawning a teammate agent.
 */
export interface SpawnResult {
  /** Whether spawn was successful */
  success: boolean;
  /** Full agent ID */
  agentId: string;
  /** Unique task ID for tracking */
  taskId: string;
  /** AbortController for cancelling this teammate */
  abortController: AbortController;
  /** Error message if spawn failed */
  error?: string;
}

// ============================================
// TASK LIFECYCLE
// # ============================================

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed' | 'idle';

/**
 * A task tracked by the TaskManager.
 * Can be a shell command, agent execution, or any tracked work unit.
 */
export interface TaskHandle {
  /** Unique task ID */
  taskId: string;
  /** Human-readable description */
  description: string;
  /** Current status */
  status: TaskStatus;
  /** When the task was created */
  startTime: number;
  /** When the task reached terminal state */
  endTime?: number;
  /** Type of task */
  type: 'shell' | 'agent' | 'teammate';
  /** Optional agent ID that owns this task */
  agentId?: string;
  /** Whether the task has been backgrounded */
  isBackgrounded: boolean;
  /** Exit code (for shell tasks) */
  exitCode?: number;
  /** Error message if task failed */
  error?: string;
  /** Whether a notification has been sent for this task */
  notified: boolean;
  /** Cleanup function to call on abort/shutdown */
  cleanup?: () => void;
  /** Whether the task is idle (no recent activity) */
  isIdle?: boolean;
  /** Agent status for swarm tracking */
  agentStatus?: string;
  /** Progress tracker - either number (0-100) or AgentProgress object */
  progress?: number | AgentProgress;
}

/**
 * Configuration for creating a new task.
 */
export interface TaskCreateOptions {
  /** Human-readable description */
  description: string;
  /** Type of task */
  type: 'shell' | 'agent' | 'teammate';
  /** Optional owning agent */
  agentId?: string;
  /** Whether to start in background immediately */
  background?: boolean;
  /** Tool use ID for correlation */
  toolUseId?: string;
}

// ============================================
// SHELL TASK
// # ============================================

export type BashTaskKind = 'bash' | 'monitor';

/**
 * State for a running shell task process.
 */
export interface ShellTaskState extends TaskHandle {
  type: 'shell';
  /** Shell command being executed */
  command: string;
  /** Kind of shell task */
  kind?: BashTaskKind;
  /** The child process */
  process?: import('child_process').ChildProcess;
  /** Path to output file */
  outputPath?: string;
  /** Stall detector cancel function */
  cancelStallWatchdog?: () => void;
  /** Result promise */
  resultPromise?: Promise<ShellTaskResult>;
}

export interface ShellTaskResult {
  code: number;
  interrupted: boolean;
  stdout?: string;
  stderr?: string;
}

// ============================================
// AGENT TASK (TEAMMATE)
// # ============================================

/**
 * Progress tracking for an agent task.
 */
export interface AgentProgress {
  toolUseCount: number;
  tokenCount: number;
  lastActivity?: ToolActivity;
  recentActivities?: ToolActivity[];
  summary?: string;
}

export interface ToolActivity {
  toolName: string;
  input: Record<string, unknown>;
  activityDescription?: string;
  isSearch?: boolean;
  isRead?: boolean;
}

/**
 * State for a running in-process teammate agent.
 */
export interface TeammateTaskState {
  /** Unique task ID */
  taskId: string;
  /** Human-readable description */
  description: string;
  /** Current status */
  status: TaskStatus;
  /** When the task was created */
  startTime: number;
  /** When the task reached terminal state */
  endTime?: number;
  /** Type of task */
  type: 'teammate';
  /** Optional agent ID that owns this task */
  agentId?: string;
  /** Whether the task has been backgrounded */
  isBackgrounded: boolean;
  /** Exit code (for shell tasks) */
  exitCode?: number;
  /** Error message if task failed */
  error?: string;
  /** Whether a notification has been sent for this task */
  notified: boolean;
  /** Cleanup function to call on abort/shutdown */
  cleanup?: () => void;
  /** Teammate identity */
  identity: TeammateIdentity;
  /** Initial prompt */
  prompt: string;
  /** Model override */
  model?: string;
  /** Current agent status */
  agentStatus: 'SPAWNED' | 'THINKING' | 'RUNNING_TOOL' | 'IDLE' | 'DONE' | 'FAILED';
  /** Progress tracker */
  progress?: AgentProgress;
  /** Whether awaiting plan mode approval */
  awaitingPlanApproval: boolean;
  /** Current permission mode */
  permissionMode: 'default' | 'plan' | 'bypass';
  /** Whether the teammate is idle (waiting for work) */
  isIdle: boolean;
  /** Whether shutdown has been requested */
  shutdownRequested: boolean;
  /** AbortController for current work turn (not lifecycle) */
  currentWorkAbortController?: AbortController;
  /** Callbacks to invoke when teammate becomes idle */
  onIdleCallbacks?: Array<() => void>;
  /** Last reported tool count for delta computation */
  lastReportedToolCount: number;
  /** Last reported token count for delta computation */
  lastReportedTokenCount: number;
  /** Total time spent paused for permission waits (ms) */
  totalPausedMs?: number;
  /** Queue of user messages to deliver when viewing teammate transcript */
  pendingUserMessages: string[];
}

// ============================================
// MAILBOX / IPC
// # ============================================

/**
 * A message in the filesystem-based mailbox.
 */
export interface MailboxMessage {
  /** Sender agent name */
  from: string;
  /** Message content (plain text or JSON) */
  text: string;
  /** ISO timestamp */
  timestamp: string;
  /** Optional sender color for UI */
  color?: string;
  /** Optional summary for preview */
  summary?: string;
  /** Whether this message has been read */
  read?: boolean;
}

/**
 * Permission request sent from worker to leader via mailbox.
 */
export interface PermissionRequest {
  /** Unique request ID */
  id: string;
  /** Tool use ID this permission is for */
  toolUseId: string;
  /** Tool name being requested */
  toolName: string;
  /** Tool input parameters */
  input: Record<string, unknown>;
  /** Human-readable description of what the tool does */
  description: string;
  /** Worker agent ID */
  workerId: string;
  /** Worker display name */
  workerName: string;
  /** Worker color */
  workerColor?: string;
  /** Swarm name */
  swarmRunId: string;
  /** Pentest ID */
  pentestId: string;
}

/**
 * Permission response from leader to worker.
 */
export interface PermissionResponse {
  /** Matches the request ID */
  request_id: string;
  /** 'success' for approved, 'rejected' for denied */
  subtype: 'success' | 'rejected';
  /** Updated input (if leader modified the parameters) */
  response?: {
    updated_input?: Record<string, unknown>;
    permission_updates?: Array<{
      type: string;
      rules: Array<{ toolName: string; ruleContent: string }>;
      behavior: string;
    }>;
  };
  /** Error/reason message if rejected */
  error?: string;
}

/**
 * Idle notification sent from teammate to leader.
 */
export interface IdleNotification {
  type: 'idle_notification';
  agentName: string;
  idleReason: 'available' | 'interrupted' | 'failed';
  summary?: string;
  completedTaskId?: string;
  completedStatus?: 'resolved' | 'blocked' | 'failed';
  failureReason?: string;
  timestamp: string;
}

/**
 * Shutdown request sent from leader to teammate.
 */
export interface ShutdownRequest {
  type: 'shutdown_request';
  from: string;
  reason?: string;
  timestamp: string;
}

// ============================================
// STALL DETECTION
// # ============================================

export interface StallConfig {
  /** Check interval in ms */
  checkIntervalMs?: number;
  /** Threshold for no-output detection in ms */
  thresholdMs?: number;
  /** Bytes to read from tail for prompt detection */
  tailBytes?: number;
}

// ============================================
// NOTIFICATIONS
// # ============================================

export type NotificationPriority = 'next' | 'later';

export interface QueuedNotification {
  value: string;
  mode: 'task-notification' | 'agent-notification';
  priority: NotificationPriority;
  agentId?: string;
}

// ============================================
// RECONNECTION
// # ============================================

export interface ReconnectionContext {
  swarmRunId: string;
  pentestId: string;
  agentId: string;
  agentName: string;
  isLeader: boolean;
}

// ============================================
// SWARM MODULE INTERFACE
// # ============================================

/**
 * Interface for the swarm module used by LEA's existing SwarmEventEmitter integration.
 */
export interface SwarmModule {
  spawnTeammate(options: SpawnOptions): Promise<SpawnResult>;
  killTeammate(taskId: string): boolean;
  getTeammateTask(taskId: string): TeammateTaskState | undefined;
  getAllTeammateTasks(): TeammateTaskState[];
  shutdown(): Promise<void>;
}
