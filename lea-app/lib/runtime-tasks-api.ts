/**
 * Runtime Tasks API Client
 *
 * Functions for interacting with the runtime task management endpoints.
 * All calls hit /api/runtime-tasks on the real backend.
 */

import { requestJson } from './api';

// ============================================
// TYPES
// ============================================

export type RuntimeTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed';

export interface RuntimeTaskInfo {
  taskId: string;
  command: string;
  agentId?: string;
  status: RuntimeTaskStatus;
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

type RawRuntimeTaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'KILLED' | RuntimeTaskStatus;

interface RawRuntimeTaskInfo {
  taskId: string;
  command: string;
  agentId?: string;
  status: RawRuntimeTaskStatus;
  exitCode?: number;
  startedAt: number;
  completedAt?: number;
}

interface RawRuntimeTaskOutput {
  taskId: string;
  output: string;
  totalBytes: number;
  isComplete: boolean;
}

function normalizeRuntimeTaskStatus(status: RawRuntimeTaskStatus): RuntimeTaskStatus {
  const upper = String(status).toUpperCase();
  if (upper === 'PENDING') return 'pending';
  if (upper === 'RUNNING') return 'running';
  if (upper === 'COMPLETED') return 'completed';
  if (upper === 'FAILED') return 'failed';
  if (upper === 'KILLED') return 'killed';
  return 'pending';
}

function normalizeRuntimeTask(task: RawRuntimeTaskInfo): RuntimeTaskInfo {
  return {
    taskId: task.taskId,
    command: task.command,
    agentId: task.agentId,
    status: normalizeRuntimeTaskStatus(task.status),
    exitCode: task.exitCode,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
  };
}

function normalizeRuntimeTaskOutput(output: RawRuntimeTaskOutput): RuntimeTaskOutput {
  return {
    taskId: output.taskId,
    output: output.output,
    totalBytes: output.totalBytes,
    isComplete: output.isComplete,
  };
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * List runtime tasks, optionally filtered by agent ID
 * GET /api/runtime-tasks?agentId=...
 */
export async function listRuntimeTasks(agentId?: string): Promise<RuntimeTaskInfo[]> {
  const query = agentId ? { agentId } : undefined;
  const res = await requestJson<{ data: RawRuntimeTaskInfo[] }>('/api/runtime-tasks', {
    query,
  });
  return res.data.map(normalizeRuntimeTask);
}

/**
 * Get single runtime task details
 * GET /api/runtime-tasks/:taskId
 */
export async function getRuntimeTask(taskId: string): Promise<RuntimeTaskInfo> {
  const res = await requestJson<{ data: RawRuntimeTaskInfo }>(
    `/api/runtime-tasks/${encodeURIComponent(taskId)}`
  );
  return normalizeRuntimeTask(res.data);
}

/**
 * Get runtime task output with optional pagination
 * GET /api/runtime-tasks/:taskId/output?offset=...&limit=...
 */
export async function getRuntimeTaskOutput(
  taskId: string,
  offset?: number,
  limit?: number
): Promise<RuntimeTaskOutput> {
  const query: Record<string, string | number> = {};
  if (offset !== undefined) query.offset = offset;
  if (limit !== undefined) query.limit = limit;

  const res = await requestJson<{ data: RawRuntimeTaskOutput }>(
    `/api/runtime-tasks/${encodeURIComponent(taskId)}/output`,
    { query: Object.keys(query).length > 0 ? query : undefined }
  );
  return normalizeRuntimeTaskOutput(res.data);
}

// Export all functions as a grouped API object
export const runtimeTasksApi = {
  listRuntimeTasks,
  getRuntimeTask,
  getRuntimeTaskOutput,
};
