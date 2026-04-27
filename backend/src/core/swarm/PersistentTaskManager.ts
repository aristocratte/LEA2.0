/**
 * PersistentTaskManager — Manages persistent tasks for LEA.
 *
 * Provides CRUD operations for tasks with ownership, blocking,
 * and status lifecycle. Tasks can be scoped to a pentest or a team.
 * Tasks can be claimed by agents, block other tasks, and track output.
 */

import type { Prisma } from '@prisma/client';
import type {
  Task,
  TaskScope,
  TaskStatus,
  CreateTaskParams,
  UpdateTaskParams,
  ClaimTaskResult,
  AgentTaskStatus,
} from './task-persist-types.js';

// ============================================
// ERROR TYPES
// ============================================

export class PersistentTaskManagerError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'PersistentTaskManagerError';
  }
}

// ============================================
// PERSISTENTTASKMANAGER
// ============================================

export interface PersistentTaskManagerOptions {
  /** Prisma client instance */
  prisma: Prisma.DefaultPrismaClient;
}

export class PersistentTaskManager {
  private prisma: Prisma.DefaultPrismaClient;

  constructor(options: PersistentTaskManagerOptions) {
    this.prisma = options.prisma;
  }

  /**
   * Create a new task.
   *
   * @param params - Task creation parameters
   * @returns The created task
   * @throws {PersistentTaskManagerError} if scope is invalid
   */
  async createTask(params: CreateTaskParams): Promise<Task> {
    this.validateScope(params);

    const task = await this.prisma.task.create({
      data: {
        subject: params.subject,
        description: params.description,
        status: 'PENDING',
        owner: params.owner,
        activeForm: params.activeForm,
        priority: params.priority ?? 0,
        output: params.output,
        metadata: params.metadata as Prisma.InputJsonValue,
        blocks: params.blocks ?? [],
        blockedBy: params.blockedBy ?? [],
        pentestId: params.pentestId,
        teamId: params.teamId,
      },
    });

    return this.toTask(task);
  }

  /**
   * Get a task by ID within a scope.
   *
   * @param scope - Task scope (pentest or team)
   * @param taskId - Task ID
   * @returns The task or null if not found
   */
  async getTask(scope: TaskScope, taskId: string): Promise<Task | null> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        ...this.getScopeFilter(scope),
      },
    });

    return task ? this.toTask(task) : null;
  }

  /**
   * List all tasks within a scope.
   *
   * @param scope - Task scope (pentest or team)
   * @param includeDeleted - Whether to include deleted tasks
   * @returns Array of tasks ordered by priority DESC, createdAt ASC
   */
  async listTasks(scope: TaskScope, includeDeleted = false): Promise<Task[]> {
    const where: Prisma.TaskWhereInput = {
      ...this.getScopeFilter(scope),
    };

    if (!includeDeleted) {
      where.status = { not: 'DELETED' };
    }

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return tasks.map((t) => this.toTask(t));
  }

  /**
   * Update a task.
   *
   * @param scope - Task scope (pentest or team)
   * @param taskId - Task ID
   * @param updates - Fields to update
   * @returns The updated task
   * @throws {PersistentTaskManagerError} if task not found
   */
  async updateTask(
    scope: TaskScope,
    taskId: string,
    updates: UpdateTaskParams
  ): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        ...this.getScopeFilter(scope),
      },
    });

    if (!task) {
      throw new PersistentTaskManagerError(
        'TASK_NOT_FOUND',
        `Task not found: ${taskId}`
      );
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...(updates.subject !== undefined && { subject: updates.subject }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.status !== undefined && { status: updates.status }),
        ...(updates.owner !== undefined && { owner: updates.owner }),
        ...(updates.activeForm !== undefined && { activeForm: updates.activeForm }),
        ...(updates.priority !== undefined && { priority: updates.priority }),
        ...(updates.output !== undefined && { output: updates.output }),
        ...(updates.metadata !== undefined && { metadata: updates.metadata as Prisma.InputJsonValue }),
      },
    });

    return this.toTask(updated);
  }

  /**
   * Delete a task (soft delete by setting status to DELETED).
   * Also cleans up blocking references from other tasks.
   *
   * @param scope - Task scope (pentest or team)
   * @param taskId - Task ID
   * @returns The deleted task
   * @throws {PersistentTaskManagerError} if task not found
   */
  async deleteTask(scope: TaskScope, taskId: string): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        ...this.getScopeFilter(scope),
      },
    });

    if (!task) {
      throw new PersistentTaskManagerError(
        'TASK_NOT_FOUND',
        `Task not found: ${taskId}`
      );
    }

    // Set status to DELETED
    const deleted = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: 'DELETED' },
    });

    // Clean up: remove this task from blocks arrays of tasks that have it in blockedBy
    await this.prisma.task.updateMany({
      where: {
        ...this.getScopeFilter(scope),
        blockedBy: { has: taskId },
      },
      data: {
        blocks: {
          set: [], // Will be recalculated below
        },
      },
    });

    // Clean up: remove this task from blockedBy arrays of tasks that have it in blocks
    await this.prisma.task.updateMany({
      where: {
        ...this.getScopeFilter(scope),
        blocks: { has: taskId },
      },
      data: {
        blockedBy: {
          set: [], // Will be recalculated below
        },
      },
    });

    // Now recalculate the arrays properly
    const allTasks = await this.prisma.task.findMany({
      where: {
        ...this.getScopeFilter(scope),
        id: { not: taskId }, // Exclude the deleted task
      },
    });

    for (const t of allTasks) {
      const newBlocks = t.blocks.filter((id) => id !== taskId);
      const newBlockedBy = t.blockedBy.filter((id) => id !== taskId);

      if (newBlocks.length !== t.blocks.length || newBlockedBy.length !== t.blockedBy.length) {
        await this.prisma.task.update({
          where: { id: t.id },
          data: {
            blocks: newBlocks,
            blockedBy: newBlockedBy,
          },
        });
      }
    }

    return this.toTask(deleted);
  }

  /**
   * Create a blocking relationship between two tasks.
   *
   * @param scope - Task scope (pentest or team)
   * @param fromId - ID of the task that is blocking (the dependent)
   * @param toId - ID of the task that is being blocked (the dependency)
   * @throws {PersistentTaskManagerError} if either task not found
   */
  async blockTask(scope: TaskScope, fromId: string, toId: string): Promise<void> {
    // Verify both tasks exist in scope
    const [fromTask, toTask] = await Promise.all([
      this.prisma.task.findFirst({
        where: { id: fromId, ...this.getScopeFilter(scope) },
      }),
      this.prisma.task.findFirst({
        where: { id: toId, ...this.getScopeFilter(scope) },
      }),
    ]);

    if (!fromTask) {
      throw new PersistentTaskManagerError(
        'TASK_NOT_FOUND',
        `Task not found: ${fromId}`
      );
    }

    if (!toTask) {
      throw new PersistentTaskManagerError(
        'TASK_NOT_FOUND',
        `Task not found: ${toId}`
      );
    }

    // Add toId to from's blocks array (if not already present)
    if (!fromTask.blocks.includes(toId)) {
      await this.prisma.task.update({
        where: { id: fromId },
        data: { blocks: { push: toId } },
      });
    }

    // Add fromId to to's blockedBy array (if not already present)
    if (!toTask.blockedBy.includes(fromId)) {
      await this.prisma.task.update({
        where: { id: toId },
        data: { blockedBy: { push: fromId } },
      });
    }
  }

  /**
   * Claim a task for an agent.
   *
   * @param scope - Task scope (pentest or team)
   * @param taskId - Task ID
   * @param agentId - Agent ID claiming the task
   * @returns Claim result with status and optional task
   */
  async claimTask(
    scope: TaskScope,
    taskId: string,
    agentId: string
  ): Promise<ClaimTaskResult> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        ...this.getScopeFilter(scope),
      },
    });

    if (!task) {
      return {
        success: false,
        status: 'task_not_found',
        message: `Task not found: ${taskId}`,
      };
    }

    if (task.status === 'DELETED') {
      return {
        success: false,
        status: 'deleted',
        message: `Task ${taskId} is deleted`,
      };
    }

    if (task.status === 'COMPLETED') {
      return {
        success: false,
        status: 'already_resolved',
        message: `Task ${taskId} is already completed`,
      };
    }

    if (task.owner && task.owner !== agentId) {
      return {
        success: false,
        status: 'already_claimed',
        message: `Task ${taskId} is already claimed by ${task.owner}`,
      };
    }

    // Check all blockedBy tasks - if any are not COMPLETED, task is blocked
    if (task.blockedBy.length > 0) {
      const blockingTasks = await this.prisma.task.findMany({
        where: {
          id: { in: task.blockedBy },
          ...this.getScopeFilter(scope),
        },
        select: { id: true, status: true },
      });

      const incomplete = blockingTasks.filter((t) => t.status !== 'COMPLETED');
      if (incomplete.length > 0) {
        return {
          success: false,
          status: 'blocked',
          message: `Task ${taskId} is blocked by ${incomplete.length} incomplete task(s)`,
        };
      }
    }

    // Claim the task
    const claimed = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        owner: agentId,
        status: 'IN_PROGRESS',
      },
    });

    return {
      success: true,
      status: 'claimed',
      task: this.toTask(claimed),
      message: `Task ${taskId} claimed by ${agentId}`,
    };
  }

  /**
   * Get task statuses grouped by owner (agent).
   *
   * @param scope - Task scope (pentest or team)
   * @returns Record mapping agentId to their task status
   */
  async getAgentStatuses(scope: TaskScope): Promise<Record<string, AgentTaskStatus>> {
    const tasks = await this.prisma.task.findMany({
      where: {
        ...this.getScopeFilter(scope),
        status: { not: 'DELETED' },
      },
      select: { owner: true },
    });

    const statuses: Record<string, AgentTaskStatus> = {};

    for (const task of tasks) {
      const agentId = task.owner || 'unassigned';
      if (!statuses[agentId]) {
        statuses[agentId] = { idle: true, taskCount: 0 };
      }
      statuses[agentId].taskCount++;
      // Agent is not idle if they have any assigned tasks
      if (task.owner) {
        statuses[task.owner].idle = false;
      }
    }

    return statuses;
  }

  /**
   * Unassign all tasks for an agent within a scope.
   *
   * @param scope - Task scope (pentest or team)
   * @param agentId - Agent ID to unassign
   * @returns Number of tasks unassigned
   */
  async unassignAgentTasks(scope: TaskScope, agentId: string): Promise<number> {
    const result = await this.prisma.task.updateMany({
      where: {
        ...this.getScopeFilter(scope),
        owner: agentId,
        status: { notIn: ['COMPLETED', 'DELETED'] },
      },
      data: { owner: null },
    });

    return result.count;
  }

  // ──────────────────────────────────────────────────────────
  // Private
  // ──────────────────────────────────────────────────────────

  /**
   * Validate that a scope has exactly one of pentestId or teamId.
   */
  private validateScope(scope: Partial<TaskScope>): void {
    const hasPentest = 'pentestId' in scope && scope.pentestId !== undefined;
    const hasTeam = 'teamId' in scope && scope.teamId !== undefined;

    if (hasPentest && hasTeam) {
      throw new PersistentTaskManagerError(
        'INVALID_SCOPE',
        'Scope must have exactly one of pentestId or teamId, not both'
      );
    }

    if (!hasPentest && !hasTeam) {
      throw new PersistentTaskManagerError(
        'INVALID_SCOPE',
        'Scope must have exactly one of pentestId or teamId'
      );
    }
  }

  /**
   * Get Prisma filter for a scope.
   */
  private getScopeFilter(scope: TaskScope): Prisma.TaskWhereInput {
    if ('pentestId' in scope) {
      return { pentestId: scope.pentestId };
    }
    return { teamId: scope.teamId };
  }

  /**
   * Map Prisma result to domain Task.
   */
  private toTask(prismaTask: {
    id: string;
    subject: string;
    description: string | null;
    status: string;
    owner: string | null;
    activeForm: string | null;
    priority: number;
    output: string | null;
    metadata: Prisma.JsonValue | null;
    blocks: string[];
    blockedBy: string[];
    pentestId: string | null;
    teamId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Task {
    return {
      id: prismaTask.id,
      subject: prismaTask.subject,
      description: prismaTask.description,
      status: prismaTask.status as TaskStatus,
      owner: prismaTask.owner,
      activeForm: prismaTask.activeForm,
      priority: prismaTask.priority,
      output: prismaTask.output,
      metadata: (prismaTask.metadata as Record<string, unknown> | null),
      blocks: prismaTask.blocks,
      blockedBy: prismaTask.blockedBy,
      pentestId: prismaTask.pentestId,
      teamId: prismaTask.teamId,
      createdAt: prismaTask.createdAt.toISOString(),
      updatedAt: prismaTask.updatedAt.toISOString(),
    };
  }
}
