import type { CheckpointTrigger } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { toPrismaJson } from '../../types/schemas.js';

/**
 * Checkpoint Service — State capture and rewind for pentests
 *
 * Captures the complete state vector of a pentest at a point in time,
 * enabling safe rewind operations.
 */
export class CheckpointService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Create a checkpoint capturing current pentest state
   *
   * Captures:
   * - Current message sequence (MAX(message.sequence))
   * - Current pentest phase
   * - All finding IDs
   * - All todos (id, content, status, priority)
   * - Latest ContextSnapshot ID
   * - Current agents (from latest SwarmRun)
   *
   * @param pentestId - The pentest ID
   * @param trigger - What triggered this checkpoint
   * @param label - Optional label (auto-generated if omitted)
   * @returns The created checkpoint record
   */
  async createCheckpoint(
    pentestId: string,
    trigger: CheckpointTrigger,
    label?: string,
  ): Promise<Record<string, unknown>> {
    try {
      // 1. Get MAX(message.sequence) for this pentest
      const lastMessage = await this.prisma.message.findFirst({
        where: { pentest_id: pentestId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      const messageSequence = lastMessage?.sequence ?? 0;

      // 2. Read current pentest.phase
      const pentest = await this.prisma.pentest.findUnique({
        where: { id: pentestId },
        select: { phase: true },
      });
      if (!pentest) {
        throw new Error(`Pentest not found: ${pentestId}`);
      }
      const pentestPhase = String(pentest.phase);

      // 3. Get all finding IDs
      const findings = await this.prisma.finding.findMany({
        where: { pentest_id: pentestId },
        select: { id: true },
      });
      const findingIds = findings.map((f) => f.id);

      // 4. Get all todos (id, content, status, priority)
      const todos = await this.prisma.todo.findMany({
        where: { pentest_id: pentestId },
        select: {
          id: true,
          content: true,
          status: true,
          priority: true,
        },
        orderBy: [{ status: 'asc' }, { priority: 'desc' }],
      });

      // 5. Get latest ContextSnapshot ID for this pentest
      const latestSnapshot = await this.prisma.contextSnapshot.findFirst({
        where: { pentest_id: pentestId },
        orderBy: { created_at: 'desc' },
        select: { id: true },
      });
      const contextSnapshotId = latestSnapshot?.id ?? null;

      // 6. Get agents snapshot from latest SwarmRun
      let agentsSnapshot: Record<string, unknown>[] = [];
      const latestSwarmRun = await this.prisma.swarmRun.findFirst({
        where: { pentestId: pentestId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          agents: {
            select: {
              id: true,
              role: true,
              status: true,
            },
          },
        },
      });
      if (latestSwarmRun) {
        agentsSnapshot = latestSwarmRun.agents.map((agent) => ({
          id: agent.id,
          role: agent.role,
          status: agent.status,
        }));
      }

      // 7. Auto-generate label if not provided
      const checkpointLabel = label || `${trigger} @ ${new Date().toISOString()}`;

      // 8. Write Checkpoint record
      const created = await this.prisma.checkpoint.create({
        data: {
          pentest_id: pentestId,
          trigger,
          label: checkpointLabel,
          message_sequence: messageSequence,
          pentest_phase: pentestPhase,
          finding_ids: toPrismaJson(findingIds),
          todos_snapshot: toPrismaJson(todos),
          agents_snapshot: toPrismaJson(agentsSnapshot),
          context_snapshot_id: contextSnapshotId,
        },
      });

      return {
        id: created.id,
        pentest_id: created.pentest_id,
        trigger: created.trigger,
        label: created.label,
        message_sequence: created.message_sequence,
        pentest_phase: created.pentest_phase,
        finding_ids: created.finding_ids,
        todos_snapshot: created.todos_snapshot,
        agents_snapshot: created.agents_snapshot,
        context_snapshot_id: created.context_snapshot_id,
        created_at: created.created_at.toISOString(),
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Pentest not found')) {
        throw error;
      }
      throw new Error(`Failed to create checkpoint for pentest ${pentestId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List checkpoints for a pentest
   *
   * @param pentestId - The pentest ID
   * @param opts - Pagination options (limit, offset)
   * @returns Paginated list of checkpoints with total count
   */
  async listCheckpoints(
    pentestId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<{ items: Record<string, unknown>[]; total: number }> {
    try {
      const limit = opts?.limit ?? 50;
      const offset = opts?.offset ?? 0;

      const [items, total] = await Promise.all([
        this.prisma.checkpoint.findMany({
          where: { pentest_id: pentestId },
          orderBy: { created_at: 'desc' },
          take: Math.max(1, Math.min(limit, 500)),
          skip: Math.max(0, offset),
        }),
        this.prisma.checkpoint.count({
          where: { pentest_id: pentestId },
        }),
      ]);

      return {
        items: items.map((checkpoint) => ({
          id: checkpoint.id,
          pentest_id: checkpoint.pentest_id,
          trigger: checkpoint.trigger,
          label: checkpoint.label,
          message_sequence: checkpoint.message_sequence,
          pentest_phase: checkpoint.pentest_phase,
          finding_ids: checkpoint.finding_ids,
          todos_snapshot: checkpoint.todos_snapshot,
          agents_snapshot: checkpoint.agents_snapshot,
          context_snapshot_id: checkpoint.context_snapshot_id,
          created_at: checkpoint.created_at.toISOString(),
        })),
        total,
      };
    } catch (error) {
      throw new Error(`Failed to list checkpoints for pentest ${pentestId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a single checkpoint by ID
   *
   * @param pentestId - The pentest ID (for validation)
   * @param checkpointId - The checkpoint ID
   * @returns The checkpoint or null if not found
   */
  async getCheckpoint(
    pentestId: string,
    checkpointId: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const checkpoint = await this.prisma.checkpoint.findUnique({
        where: { id: checkpointId },
      });

      if (!checkpoint) {
        return null;
      }

      // Verify checkpoint belongs to the specified pentest
      if (checkpoint.pentest_id !== pentestId) {
        return null;
      }

      return {
        id: checkpoint.id,
        pentest_id: checkpoint.pentest_id,
        trigger: checkpoint.trigger,
        label: checkpoint.label,
        message_sequence: checkpoint.message_sequence,
        pentest_phase: checkpoint.pentest_phase,
        finding_ids: checkpoint.finding_ids,
        todos_snapshot: checkpoint.todos_snapshot,
        agents_snapshot: checkpoint.agents_snapshot,
        context_snapshot_id: checkpoint.context_snapshot_id,
        created_at: checkpoint.created_at.toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to get checkpoint ${checkpointId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Rewind pentest to a checkpoint state
   *
   * Process:
   * 1. Validates target checkpoint exists and belongs to pentest
   * 2. Creates a PRE_REWIND checkpoint first (captures current state)
   * 3. Creates a new ContextSnapshot with archived_until_message_seq set to target's message_sequence
   * 4. Writes a PentestEvent with event_type='rewind'
   *
   * @param pentestId - The pentest ID
   * @param checkpointId - The target checkpoint ID to rewind to
   * @returns Object containing preRewindCheckpointId and the target checkpoint
   * @throws Error if checkpoint not found or doesn't belong to pentest
   */
  async rewindToCheckpoint(
    pentestId: string,
    checkpointId: string,
  ): Promise<{ preRewindCheckpointId: string; checkpoint: Record<string, unknown> }> {
    try {
      // 1. Load target checkpoint (validate ownership)
      const targetCheckpoint = await this.prisma.checkpoint.findUnique({
        where: { id: checkpointId },
      });

      if (!targetCheckpoint) {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }

      if (targetCheckpoint.pentest_id !== pentestId) {
        throw new Error(`Checkpoint ${checkpointId} does not belong to pentest ${pentestId}`);
      }

      // 2. Create PRE_REWIND checkpoint first (captures CURRENT state before rewind)
      // IMPORTANT: Must capture current state, not target checkpoint state
      const lastMessage = await this.prisma.message.findFirst({
        where: { pentest_id: pentestId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      const currentMessageSequence = lastMessage?.sequence ?? 0;

      const pentest = await this.prisma.pentest.findUnique({
        where: { id: pentestId },
        select: { phase: true },
      });
      if (!pentest) {
        throw new Error(`Pentest not found: ${pentestId}`);
      }
      const currentPentestPhase = String(pentest.phase);

      const findings = await this.prisma.finding.findMany({
        where: { pentest_id: pentestId },
        select: { id: true },
      });
      const findingIds = findings.map((f) => f.id);

      const todos = await this.prisma.todo.findMany({
        where: { pentest_id: pentestId },
        select: {
          id: true,
          content: true,
          status: true,
          priority: true,
        },
        orderBy: [{ status: 'asc' }, { priority: 'desc' }],
      });

      const latestSnapshot = await this.prisma.contextSnapshot.findFirst({
        where: { pentest_id: pentestId },
        orderBy: { created_at: 'desc' },
        select: { id: true },
      });
      const contextSnapshotId = latestSnapshot?.id ?? null;

      let agentsSnapshot: Record<string, unknown>[] = [];
      const latestSwarmRun = await this.prisma.swarmRun.findFirst({
        where: { pentestId: pentestId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          agents: {
            select: {
              id: true,
              role: true,
              status: true,
            },
          },
        },
      });
      if (latestSwarmRun) {
        agentsSnapshot = latestSwarmRun.agents.map((agent) => ({
          id: agent.id,
          role: agent.role,
          status: agent.status,
        }));
      }

      const preRewindCheckpoint = await this.prisma.checkpoint.create({
        data: {
          pentest_id: pentestId,
          trigger: 'PRE_REWIND',
          label: `Pre-rewind checkpoint before rewinding to ${checkpointId.substring(0, 8)}`,
          message_sequence: currentMessageSequence,
          pentest_phase: currentPentestPhase,
          finding_ids: toPrismaJson(findingIds),
          todos_snapshot: toPrismaJson(todos),
          agents_snapshot: toPrismaJson(agentsSnapshot),
          context_snapshot_id: contextSnapshotId,
        },
      });

      // 3. Create ContextSnapshot with archived_until_message_seq
      await this.prisma.contextSnapshot.create({
        data: {
          pentest_id: pentestId,
          trigger: 'MANUAL',
          phase_from: null,
          phase_to: null,
          summary_markdown: `Rewind to checkpoint ${checkpointId}`,
          summary_json: toPrismaJson({
            rewindFrom: preRewindCheckpoint.id,
            rewindTo: checkpointId,
          }),
          workspace_file: null,
          archived_until_message_seq: targetCheckpoint.message_sequence,
          archived_until_tool_ts: null,
        },
      });

      // 4. Write PentestEvent with event_type='rewind'
      const maxEventSequence = await this.prisma.pentestEvent.findFirst({
        where: { pentest_id: pentestId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });

      await this.prisma.pentestEvent.create({
        data: {
          pentest_id: pentestId,
          event_type: 'rewind',
          event_data: toPrismaJson({
            preRewindCheckpointId: preRewindCheckpoint.id,
            targetCheckpointId: checkpointId,
            messageSequence: targetCheckpoint.message_sequence,
          }),
          sequence: (maxEventSequence?.sequence ?? -1) + 1,
        },
      });

      return {
        preRewindCheckpointId: preRewindCheckpoint.id,
        checkpoint: {
          id: targetCheckpoint.id,
          pentest_id: targetCheckpoint.pentest_id,
          trigger: targetCheckpoint.trigger,
          label: targetCheckpoint.label,
          message_sequence: targetCheckpoint.message_sequence,
          pentest_phase: targetCheckpoint.pentest_phase,
          finding_ids: targetCheckpoint.finding_ids,
          todos_snapshot: targetCheckpoint.todos_snapshot,
          agents_snapshot: targetCheckpoint.agents_snapshot,
          context_snapshot_id: targetCheckpoint.context_snapshot_id,
          created_at: targetCheckpoint.created_at.toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof Error && (error.message.includes('Checkpoint not found') || error.message.includes('does not belong'))) {
        throw error;
      }
      throw new Error(`Failed to rewind to checkpoint ${checkpointId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
