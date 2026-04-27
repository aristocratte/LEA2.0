// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckpointService } from '../CheckpointService.js';
import { CheckpointTrigger } from '@prisma/client';

describe('CheckpointService', () => {
  let mockPrisma: any;
  let service: CheckpointService;

  beforeEach(() => {
    mockPrisma = {
      pentest: { findUnique: vi.fn() },
      message: { findFirst: vi.fn() },
      finding: { findMany: vi.fn() },
      todo: { findMany: vi.fn() },
      swarmRun: { findFirst: vi.fn() },
      checkpoint: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
      contextSnapshot: { findFirst: vi.fn(), create: vi.fn() },
      pentestEvent: { findFirst: vi.fn(), create: vi.fn() },
    };
    service = new CheckpointService(mockPrisma);
  });

  describe('createCheckpoint', () => {
    beforeEach(() => {
      // Default mocks for contextSnapshot.findFirst
      mockPrisma.contextSnapshot.findFirst.mockResolvedValue(null);
    });

    it('captures state vector including findings, todos, and agents snapshot', async () => {
      mockPrisma.pentest.findUnique.mockResolvedValue({
        id: 'pentest-1',
        phase: 'RECON',
      });

      mockPrisma.message.findFirst.mockResolvedValue({ sequence: 42 });

      mockPrisma.finding.findMany.mockResolvedValue([
        { id: 'finding-1' },
        { id: 'finding-2' },
      ]);

      mockPrisma.todo.findMany.mockResolvedValue([
        { id: 'todo-1', content: 'Test todo', status: 'pending', priority: 1 },
      ]);

      mockPrisma.swarmRun.findFirst.mockResolvedValue({
        id: 'swarm-1',
        agents: [
          { id: 'agent-1', role: 'RECONNAISSANCE', status: 'active' },
        ],
      });

      mockPrisma.checkpoint.create.mockResolvedValue({
        id: 'checkpoint-1',
        pentest_id: 'pentest-1',
        trigger: 'MANUAL',
        label: 'Manual checkpoint',
        message_sequence: 42,
        pentest_phase: 'RECON',
        finding_ids: ['finding-1', 'finding-2'],
        todos_snapshot: [{ id: 'todo-1', content: 'Test todo', status: 'pending', priority: 1 }],
        agents_snapshot: [{ id: 'agent-1', role: 'RECONNAISSANCE', status: 'active' }],
        context_snapshot_id: null,
        created_at: new Date('2026-04-15T10:00:00Z'),
      });

      const result = await service.createCheckpoint('pentest-1', 'MANUAL', 'Manual checkpoint');

      expect(mockPrisma.checkpoint.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pentest_id: 'pentest-1',
            trigger: 'MANUAL',
            label: 'Manual checkpoint',
            message_sequence: 42,
            pentest_phase: 'RECON',
          }),
        })
      );
      expect(result.label).toBe('Manual checkpoint');
    });

    it('auto-generates label when not provided', async () => {
      mockPrisma.pentest.findUnique.mockResolvedValue({
        id: 'pentest-1',
        phase: 'RECON',
      });

      mockPrisma.message.findFirst.mockResolvedValue({ sequence: 10 });
      mockPrisma.finding.findMany.mockResolvedValue([]);
      mockPrisma.todo.findMany.mockResolvedValue([]);
      mockPrisma.swarmRun.findFirst.mockResolvedValue(null);

      mockPrisma.checkpoint.create.mockImplementation((args: any) => ({
        ...args.data,
        id: 'checkpoint-1',
        context_snapshot_id: null,
        created_at: new Date(),
      }));

      await service.createCheckpoint('pentest-1', 'PHASE_CHANGE');

      const createCall = mockPrisma.checkpoint.create.mock.calls[0][0];
      expect(createCall.data.label).toContain('PHASE_CHANGE');
      expect(createCall.data.label).toContain('@');
    });

    it('uses 0 for message_sequence when no messages exist', async () => {
      mockPrisma.pentest.findUnique.mockResolvedValue({
        id: 'pentest-1',
        phase: 'RECON',
      });

      mockPrisma.message.findFirst.mockResolvedValue(null);
      mockPrisma.finding.findMany.mockResolvedValue([]);
      mockPrisma.todo.findMany.mockResolvedValue([]);
      mockPrisma.swarmRun.findFirst.mockResolvedValue(null);

      mockPrisma.checkpoint.create.mockImplementation((args: any) => ({
        ...args.data,
        id: 'checkpoint-1',
        context_snapshot_id: null,
        created_at: new Date(),
      }));

      await service.createCheckpoint('pentest-1', 'MANUAL', 'First checkpoint');

      expect(mockPrisma.checkpoint.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            message_sequence: 0,
          }),
        })
      );
    });

    it('handles missing pentest gracefully', async () => {
      mockPrisma.pentest.findUnique.mockResolvedValue(null);

      await expect(
        service.createCheckpoint('missing-pentest', 'MANUAL', 'Test')
      ).rejects.toThrow('Pentest not found: missing-pentest');
    });

    it('captures agents snapshot when no active swarm run exists', async () => {
      mockPrisma.pentest.findUnique.mockResolvedValue({
        id: 'pentest-1',
        phase: 'RECON',
      });

      mockPrisma.message.findFirst.mockResolvedValue({ sequence: 5 });
      mockPrisma.finding.findMany.mockResolvedValue([]);
      mockPrisma.todo.findMany.mockResolvedValue([]);
      mockPrisma.swarmRun.findFirst.mockResolvedValue(null);

      mockPrisma.checkpoint.create.mockImplementation((args: any) => ({
        ...args.data,
        id: 'checkpoint-1',
        context_snapshot_id: null,
        created_at: new Date(),
      }));

      await service.createCheckpoint('pentest-1', 'MANUAL', 'No agents');

      expect(mockPrisma.checkpoint.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agents_snapshot: [],
          }),
        })
      );
    });
  });

  describe('listCheckpoints', () => {
    it('returns paginated results with count', async () => {
      const mockCheckpoints = [
        {
          id: 'cp-1',
          pentest_id: 'pentest-1',
          trigger: 'MANUAL' as CheckpointTrigger,
          label: 'Test',
          message_sequence: 1,
          pentest_phase: 'RECON',
          finding_ids: [],
          todos_snapshot: [],
          agents_snapshot: [],
          context_snapshot_id: null,
          created_at: new Date('2026-04-15T12:00:00Z'),
        },
        {
          id: 'cp-2',
          pentest_id: 'pentest-1',
          trigger: 'MANUAL' as CheckpointTrigger,
          label: 'Test',
          message_sequence: 2,
          pentest_phase: 'RECON',
          finding_ids: [],
          todos_snapshot: [],
          agents_snapshot: [],
          context_snapshot_id: null,
          created_at: new Date('2026-04-15T11:00:00Z'),
        },
      ];

      mockPrisma.checkpoint.findMany.mockResolvedValue(mockCheckpoints);
      mockPrisma.checkpoint.count.mockResolvedValue(2);

      const result = await service.listCheckpoints('pentest-1', { limit: 10, offset: 0 });

      expect(mockPrisma.checkpoint.findMany).toHaveBeenCalledWith({
        where: { pentest_id: 'pentest-1' },
        orderBy: { created_at: 'desc' },
        take: 10,
        skip: 0,
      });
      expect(mockPrisma.checkpoint.count).toHaveBeenCalledWith({
        where: { pentest_id: 'pentest-1' },
      });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('applies default pagination when options not provided', async () => {
      mockPrisma.checkpoint.findMany.mockResolvedValue([]);
      mockPrisma.checkpoint.count.mockResolvedValue(0);

      await service.listCheckpoints('pentest-1');

      expect(mockPrisma.checkpoint.findMany).toHaveBeenCalledWith({
        where: { pentest_id: 'pentest-1' },
        orderBy: { created_at: 'desc' },
        take: 50,
        skip: 0,
      });
    });

    it('enforces max limit of 500', async () => {
      mockPrisma.checkpoint.findMany.mockResolvedValue([]);
      mockPrisma.checkpoint.count.mockResolvedValue(0);

      await service.listCheckpoints('pentest-1', { limit: 1000 });

      expect(mockPrisma.checkpoint.findMany).toHaveBeenCalledWith({
        where: { pentest_id: 'pentest-1' },
        orderBy: { created_at: 'desc' },
        take: 500,
        skip: 0,
      });
    });

    it('handles database errors gracefully', async () => {
      mockPrisma.checkpoint.findMany.mockRejectedValue(new Error('DB connection failed'));

      await expect(service.listCheckpoints('pentest-1')).rejects.toThrow('Failed to list checkpoints');
    });
  });

  describe('getCheckpoint', () => {
    it('returns checkpoint when found', async () => {
      const mockCheckpoint = {
        id: 'cp-1',
        pentest_id: 'pentest-1',
        trigger: 'MANUAL' as CheckpointTrigger,
        label: 'Test checkpoint',
        message_sequence: 10,
        pentest_phase: 'RECON',
        finding_ids: [],
        todos_snapshot: [],
        agents_snapshot: [],
        context_snapshot_id: null,
        created_at: new Date('2026-04-15T10:00:00Z'),
      };

      mockPrisma.checkpoint.findUnique.mockResolvedValue(mockCheckpoint);

      const result = await service.getCheckpoint('pentest-1', 'cp-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('cp-1');
      expect(result?.label).toBe('Test checkpoint');
      expect(result?.created_at).toBe('2026-04-15T10:00:00.000Z'); // Service returns ISO string
    });

    it('returns null when checkpoint not found', async () => {
      mockPrisma.checkpoint.findUnique.mockResolvedValue(null);

      const result = await service.getCheckpoint('pentest-1', 'nonexistent');

      expect(result).toBeNull();
    });

    it('returns null when checkpoint belongs to different pentest', async () => {
      const otherPentestCheckpoint = {
        id: 'cp-1',
        pentest_id: 'pentest-2',
        trigger: 'MANUAL' as CheckpointTrigger,
        label: 'Test checkpoint',
        message_sequence: 10,
        pentest_phase: 'RECON',
        finding_ids: [],
        todos_snapshot: [],
        agents_snapshot: [],
        context_snapshot_id: null,
        created_at: new Date(),
      };

      mockPrisma.checkpoint.findUnique.mockResolvedValue(otherPentestCheckpoint);

      const result = await service.getCheckpoint('pentest-1', 'cp-1');

      expect(result).toBeNull();
    });
  });

  describe('rewindToCheckpoint', () => {
    const mockCheckpoint = {
      id: 'cp-1',
      pentest_id: 'pentest-1',
      trigger: 'MANUAL' as CheckpointTrigger,
      label: 'Target checkpoint',
      message_sequence: 20,
      pentest_phase: 'SCANNING',
      finding_ids: [],
      todos_snapshot: [],
      agents_snapshot: [],
      context_snapshot_id: null,
      created_at: new Date('2026-04-15T10:00:00Z'),
    };

    beforeEach(() => {
      // Current state (before rewind) - these are used by rewindToCheckpoint when creating PRE_REWIND checkpoint
      mockPrisma.message.findFirst.mockResolvedValue({ sequence: 42 });
      mockPrisma.finding.findMany.mockResolvedValue([{ id: 'finding-1' }]);
      mockPrisma.todo.findMany.mockResolvedValue([{ id: 'todo-1', content: 'Test', status: 'pending', priority: 1 }]);
      mockPrisma.swarmRun.findFirst.mockResolvedValue(null);
      mockPrisma.contextSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.pentest.findUnique.mockResolvedValue({ phase: 'EXPLOITATION' });
    });

    it('creates pre-rewind checkpoint with CURRENT state before performing rewind', async () => {
      mockPrisma.checkpoint.findUnique.mockResolvedValue(mockCheckpoint);
      let checkpointCreateCount = 0;
      mockPrisma.checkpoint.create.mockImplementation((args: any) => {
        checkpointCreateCount++;
        if (args.data.trigger === 'PRE_REWIND') {
          // Verify it captures current state, not target state
          expect(args.data.message_sequence).toBe(42); // Current sequence, not target (20)
          expect(args.data.pentest_phase).toBe('EXPLOITATION'); // Current phase, not target ('SCANNING')
          return {
            id: 'pre-rewind-1',
            ...args.data,
            created_at: new Date(),
          };
        }
        return { id: 'cp-1', ...args.data, created_at: new Date() };
      });

      mockPrisma.pentestEvent.findFirst.mockResolvedValue(null);
      mockPrisma.contextSnapshot.create.mockResolvedValue({
        id: 'snapshot-1',
      });
      mockPrisma.pentestEvent.create.mockResolvedValue({
        id: 'event-1',
      });

      await service.rewindToCheckpoint('pentest-1', 'cp-1');

      expect(mockPrisma.checkpoint.create).toHaveBeenCalled();
      const createCalls = mockPrisma.checkpoint.create.mock.calls;
      const preRewindCall = createCalls.find((call: any) => call[0].data.trigger === 'PRE_REWIND');
      expect(preRewindCall).toBeDefined();
      expect(preRewindCall[0].data.label).toContain('before rewind');
      expect(preRewindCall[0].data.label).toContain('cp-1');
    });

    it('creates ContextSnapshot with correct archived_until_message_seq', async () => {
      mockPrisma.checkpoint.findUnique.mockResolvedValue(mockCheckpoint);
      mockPrisma.checkpoint.create.mockImplementation((args: any) => ({
        id: 'pre-rewind-1',
        ...args.data,
        created_at: new Date(),
      }));

      mockPrisma.pentestEvent.findFirst.mockResolvedValue(null);
      mockPrisma.contextSnapshot.create.mockResolvedValue({
        id: 'snapshot-1',
      });
      mockPrisma.pentestEvent.create.mockResolvedValue({
        id: 'event-1',
      });

      await service.rewindToCheckpoint('pentest-1', 'cp-1');

      expect(mockPrisma.contextSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pentest_id: 'pentest-1',
            trigger: 'MANUAL',
            archived_until_message_seq: 20, // Target checkpoint's sequence
            summary_markdown: `Rewind to checkpoint ${mockCheckpoint.id}`,
            summary_json: expect.any(Object),
          }),
        })
      );
    });

    it('writes PentestEvent with event_type rewind', async () => {
      mockPrisma.checkpoint.findUnique.mockResolvedValue(mockCheckpoint);
      mockPrisma.checkpoint.create.mockResolvedValue({
        id: 'pre-rewind-1',
        created_at: new Date(),
      });

      mockPrisma.pentestEvent.findFirst.mockResolvedValue(null);
      mockPrisma.contextSnapshot.create.mockResolvedValue({
        id: 'snapshot-1',
      });
      mockPrisma.pentestEvent.create.mockResolvedValue({
        id: 'event-1',
      });

      await service.rewindToCheckpoint('pentest-1', 'cp-1');

      expect(mockPrisma.pentestEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pentest_id: 'pentest-1',
          event_type: 'rewind',
          sequence: 0,
          event_data: expect.objectContaining({
            preRewindCheckpointId: 'pre-rewind-1',
            targetCheckpointId: 'cp-1',
            messageSequence: 20,
          }),
        }),
      });
    });

    it('throws if checkpoint not found', async () => {
      mockPrisma.checkpoint.findUnique.mockResolvedValue(null);

      await expect(
        service.rewindToCheckpoint('pentest-1', 'nonexistent-cp')
      ).rejects.toThrow('Checkpoint not found: nonexistent-cp');
    });

    it('throws if checkpoint belongs to different pentest', async () => {
      const otherPentestCheckpoint = { ...mockCheckpoint, pentest_id: 'pentest-2' };
      mockPrisma.checkpoint.findUnique.mockResolvedValue(otherPentestCheckpoint);

      await expect(
        service.rewindToCheckpoint('pentest-1', 'cp-1')
      ).rejects.toThrow('does not belong to pentest');
    });

    it('does NOT call message.deleteMany (non-destructive rewind)', async () => {
      mockPrisma.checkpoint.findUnique.mockResolvedValue(mockCheckpoint);
      mockPrisma.checkpoint.create.mockResolvedValue({
        id: 'pre-rewind-1',
        created_at: new Date(),
      });

      mockPrisma.pentestEvent.findFirst.mockResolvedValue(null);
      mockPrisma.contextSnapshot.create.mockResolvedValue({
        id: 'snapshot-1',
      });
      mockPrisma.pentestEvent.create.mockResolvedValue({
        id: 'event-1',
      });

      await service.rewindToCheckpoint('pentest-1', 'cp-1');

      // Verify message.deleteMany was never called (it doesn't exist on our mock)
      expect(mockPrisma.message.deleteMany).toBeUndefined();
    });

    it('increments PentestEvent sequence based on existing events', async () => {
      mockPrisma.checkpoint.findUnique.mockResolvedValue(mockCheckpoint);
      mockPrisma.checkpoint.create.mockResolvedValue({
        id: 'pre-rewind-1',
        created_at: new Date(),
      });

      mockPrisma.pentestEvent.findFirst.mockResolvedValue({ sequence: 5 });
      mockPrisma.contextSnapshot.create.mockResolvedValue({
        id: 'snapshot-1',
      });
      mockPrisma.pentestEvent.create.mockResolvedValue({
        id: 'event-1',
      });

      await service.rewindToCheckpoint('pentest-1', 'cp-1');

      expect(mockPrisma.pentestEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sequence: 6,
          }),
        })
      );
    });

    it('returns complete result with preRewindCheckpointId and checkpoint', async () => {
      mockPrisma.checkpoint.findUnique.mockResolvedValue(mockCheckpoint);
      mockPrisma.checkpoint.create.mockResolvedValue({
        id: 'pre-rewind-1',
        created_at: new Date(),
      });

      mockPrisma.pentestEvent.findFirst.mockResolvedValue(null);
      mockPrisma.contextSnapshot.create.mockResolvedValue({
        id: 'snapshot-1',
      });
      mockPrisma.pentestEvent.create.mockResolvedValue({
        id: 'event-1',
      });

      const result = await service.rewindToCheckpoint('pentest-1', 'cp-1');

      expect(result).toEqual({
        preRewindCheckpointId: 'pre-rewind-1',
        checkpoint: expect.objectContaining({
          id: 'cp-1',
          label: 'Target checkpoint',
          message_sequence: 20,
          pentest_phase: 'SCANNING',
        }),
      });
    });
  });

  describe('constructor', () => {
    it('stores PrismaClient parameter', () => {
      const testPrisma = { test: 'prisma' };
      const testService = new CheckpointService(testPrisma as any);
      expect(testService).toBeDefined();
    });
  });
});
