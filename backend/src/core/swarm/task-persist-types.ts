/**
 * Persistent Task System — Domain Types
 *
 * These types define the persistent task system that tracks work items
 * with ownership, blocking, and status lifecycle.
 * Separate from the in-memory TaskManager that tracks agent runtime lifecycle.
 */

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELETED';

export type TaskScope =
  | { pentestId: string }
  | { teamId: string };

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
  output?: string;
  metadata?: Record<string, unknown>;
  blocks?: string[];
  blockedBy?: string[];
  pentestId?: string;
  teamId?: string;
}

export interface UpdateTaskParams {
  subject?: string;
  description?: string;
  status?: TaskStatus;
  owner?: string | null;
  activeForm?: string;
  priority?: number;
  output?: string;
  metadata?: Record<string, unknown>;
}

export type ClaimTaskStatus =
  | 'claimed'
  | 'task_not_found'
  | 'already_claimed'
  | 'already_resolved'
  | 'blocked'
  | 'deleted';

export interface ClaimTaskResult {
  success: boolean;
  status: ClaimTaskStatus;
  task?: Task;
  message: string;
}

export interface AgentTaskStatus {
  idle: boolean;
  taskCount: number;
}
