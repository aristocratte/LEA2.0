/**
 * Task API Client
 *
 * Functions for interacting with the persistent task management endpoints.
 * All calls hit /api/tasks on the real backend.
 */

import { requestJson } from './api';

// ============================================
// TYPES
// ============================================

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELETED';

export type TaskScope = { pentestId: string } | { teamId: string };

export interface Task {
  id: string;
  subject: string;
  description: string | null;
  status: TaskStatus;
  owner: string | null;
  activeForm: string | null;
  priority: number;
  output: string | null;
  metadata: Record<string, unknown> | null;
  blocks: string[];
  blockedBy: string[];
  pentestId: string | null;
  teamId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskParams {
  subject: string;
  description?: string;
  owner?: string;
  activeForm?: string;
  priority?: number;
  pentestId?: string;
  teamId?: string;
}

export interface UpdateTaskParams {
  subject?: string;
  description?: string;
  status?: TaskStatus;
  owner?: string;
  activeForm?: string;
  priority?: number;
  output?: string;
}

export interface ClaimTaskResult {
  success: boolean;
  status: string;
  task?: Task;
  message: string;
}

type RawTaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELETED' | TaskStatus;

interface RawTask {
  id: string;
  subject: string;
  description: string | null;
  status: RawTaskStatus;
  owner: string | null;
  activeForm: string | null;
  priority: number;
  output: string | null;
  metadata: Record<string, unknown> | null;
  blocks: string[];
  blockedBy: string[];
  pentestId: string | null;
  teamId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawClaimTaskResult {
  success: boolean;
  status: string;
  task?: RawTask;
  message: string;
}

function normalizeTaskStatus(status: RawTaskStatus): TaskStatus {
  const upper = String(status).toUpperCase();
  if (upper === 'PENDING') return 'PENDING';
  if (upper === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (upper === 'COMPLETED') return 'COMPLETED';
  if (upper === 'DELETED') return 'DELETED';
  return 'PENDING';
}

function normalizeTask(task: RawTask): Task {
  return {
    id: task.id,
    subject: task.subject,
    description: task.description,
    status: normalizeTaskStatus(task.status),
    owner: task.owner,
    activeForm: task.activeForm,
    priority: task.priority,
    output: task.output,
    metadata: task.metadata,
    blocks: task.blocks,
    blockedBy: task.blockedBy,
    pentestId: task.pentestId,
    teamId: task.teamId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function buildScopeQuery(scope: TaskScope): Record<string, string> {
  if ('pentestId' in scope) return { pentestId: scope.pentestId };
  if ('teamId' in scope) return { teamId: scope.teamId };
  throw new Error('Invalid scope: must provide pentestId or teamId');
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Create a new task
 * POST /api/tasks
 */
export async function createTask(params: CreateTaskParams): Promise<Task> {
  const res = await requestJson<{ data: RawTask }>('/api/tasks', {
    method: 'POST',
    body: params,
  });
  return normalizeTask(res.data);
}

/**
 * List tasks by scope
 * GET /api/tasks?pentestId=... or ?teamId=...
 */
export async function listTasks(scope: TaskScope): Promise<Task[]> {
  const res = await requestJson<{ data: RawTask[] }>('/api/tasks', {
    query: buildScopeQuery(scope),
  });
  return res.data.map(normalizeTask);
}

/**
 * Get single task details
 * GET /api/tasks/:taskId?pentestId=... or ?teamId=...
 */
export async function getTask(scope: TaskScope, taskId: string): Promise<Task> {
  const res = await requestJson<{ data: RawTask }>(
    `/api/tasks/${encodeURIComponent(taskId)}`,
    { query: buildScopeQuery(scope) }
  );
  return normalizeTask(res.data);
}

/**
 * Update a task
 * PATCH /api/tasks/:taskId?pentestId=... or ?teamId=...
 */
export async function updateTask(
  scope: TaskScope,
  taskId: string,
  params: UpdateTaskParams
): Promise<Task> {
  const res = await requestJson<{ data: RawTask }>(
    `/api/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      query: buildScopeQuery(scope),
      body: params,
    }
  );
  return normalizeTask(res.data);
}

/**
 * Delete a task (soft delete)
 * DELETE /api/tasks/:taskId?pentestId=... or ?teamId=...
 */
export async function deleteTask(scope: TaskScope, taskId: string): Promise<{ message: string }> {
  const res = await requestJson<{ data: { message: string } }>(
    `/api/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'DELETE',
      query: buildScopeQuery(scope),
    }
  );
  return res.data;
}

/**
 * Block another task (add dependency)
 * POST /api/tasks/:taskId/block?pentestId=... or ?teamId=...
 */
export async function blockTask(
  scope: TaskScope,
  taskId: string,
  targetTaskId: string
): Promise<{ message: string }> {
  const res = await requestJson<{ data: { message: string } }>(
    `/api/tasks/${encodeURIComponent(taskId)}/block`,
    {
      method: 'POST',
      query: buildScopeQuery(scope),
      body: { targetTaskId },
    }
  );
  return res.data;
}

/**
 * Claim a task for an agent
 * POST /api/tasks/:taskId/claim?pentestId=... or ?teamId=...
 */
export async function claimTask(
  scope: TaskScope,
  taskId: string,
  agentId: string
): Promise<ClaimTaskResult> {
  const res = await requestJson<{ data: RawClaimTaskResult }>(
    `/api/tasks/${encodeURIComponent(taskId)}/claim`,
    {
      method: 'POST',
      query: buildScopeQuery(scope),
      body: { agentId },
    }
  );
  return {
    success: res.data.success,
    status: res.data.status,
    task: res.data.task ? normalizeTask(res.data.task) : undefined,
    message: res.data.message,
  };
}

// Export all functions as a grouped API object
export const tasksApi = {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  blockTask,
  claimTask,
};
