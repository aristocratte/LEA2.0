import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { pentestRoutes } from '../pentests.js';

describe('checkpoint routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();

    // Mock checkpointService with the REAL service contract:
    // createCheckpoint(pentestId, trigger, label?)
    // getCheckpoint(pentestId, checkpointId)
    // rewindToCheckpoint(pentestId, checkpointId)
    // listCheckpoints(pentestId, opts?)
    (app as any).checkpointService = {
      createCheckpoint: vi.fn(async (_pentestId: string, _trigger: string, label?: string) => ({
        id: 'cp-1',
        pentest_id: 'pt-1',
        trigger: _trigger,
        label: label ?? 'Manual checkpoint',
        message_sequence: 10,
        pentest_phase: 'RECON_PASSIVE',
        finding_ids: [],
        todos_snapshot: [],
        agents_snapshot: [],
        context_snapshot_id: null,
        created_at: new Date().toISOString(),
      })),
      listCheckpoints: vi.fn(async (_pentestId: string, opts?: { limit?: number; offset?: number }) => ({
        items: [],
        total: 0,
        ...opts,
      })),
      getCheckpoint: vi.fn(async (_pentestId: string, _checkpointId: string) =>
        _checkpointId === 'cp-1' && _pentestId === 'pt-1'
          ? {
              id: 'cp-1',
              pentest_id: 'pt-1',
              trigger: 'MANUAL',
              label: 'Test checkpoint',
              message_sequence: 10,
              pentest_phase: 'RECON_PASSIVE',
              finding_ids: [],
              todos_snapshot: [],
              agents_snapshot: [],
              context_snapshot_id: null,
              created_at: new Date().toISOString(),
            }
          : null
      ),
      rewindToCheckpoint: vi.fn(async (_pentestId: string, _checkpointId: string) => ({
        preRewindCheckpointId: 'cp-pre',
        rewoundAt: new Date().toISOString(),
        messageSequence: 5,
        pentestPhase: 'RECON_PASSIVE',
        checkpoint: {
          id: _checkpointId,
          pentest_id: _pentestId,
          trigger: 'PRE_REWIND',
          label: `Pre-rewind before ${_checkpointId}`,
          message_sequence: 10,
          pentest_phase: 'VULN_SCAN',
          finding_ids: ['f1'],
          todos_snapshot: [],
          agents_snapshot: [],
          context_snapshot_id: null,
          created_at: new Date().toISOString(),
        },
      })),
    };

    // Decorate prisma (required by route)
    app.decorate('prisma', {
      pentest: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === 'pt-1'
            ? { id: 'pt-1' }
            : where.id === 'pt-not-found'
              ? null
              : { id: where.id }
        ),
      },
    } as any);

    await app.register(pentestRoutes);
  });

  describe('GET /api/pentests/:id/checkpoints', () => {
    it('returns 200 with empty list when no checkpoints', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/pentests/pt-1/checkpoints',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toBeDefined();
      expect(body.data.items).toEqual([]);
      expect(body.data.total).toBe(0);
    });

    it('passes limit and offset to service', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/pentests/pt-1/checkpoints?limit=10&offset=5',
      });

      expect(response.statusCode).toBe(200);
      expect((app as any).checkpointService.listCheckpoints).toHaveBeenCalledWith('pt-1', {
        limit: 10,
        offset: 5,
      });
    });

    it('returns 404 when pentest not found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/pentests/pt-not-found/checkpoints',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Pentest not found');
    });
  });

  describe('POST /api/pentests/:id/checkpoints', () => {
    it('creates manual checkpoint with correct signature', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/pentests/pt-1/checkpoints',
        payload: { label: 'Test checkpoint' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toBeDefined();
      expect(body.data.trigger).toBe('MANUAL');
      expect(body.data.label).toBe('Test checkpoint');
      // Verify REAL contract: (pentestId, trigger, label?) — NOT an object
      expect((app as any).checkpointService.createCheckpoint).toHaveBeenCalledWith(
        'pt-1',   // pentestId
        'MANUAL', // trigger
        'Test checkpoint', // label
      );
    });

    it('uses default label when not provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/pentests/pt-1/checkpoints',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.label).toBe('Manual checkpoint');
      // Verify no extra "actor" field was passed
      expect((app as any).checkpointService.createCheckpoint).toHaveBeenCalledWith(
        'pt-1',
        'MANUAL',
        'Manual checkpoint',
      );
    });
  });

  describe('GET /api/pentests/:id/checkpoints/:cpId', () => {
    it('returns checkpoint detail with real contract', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/pentests/pt-1/checkpoints/cp-1',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toBeDefined();
      expect(body.data.id).toBe('cp-1');
      expect(body.data.trigger).toBe('MANUAL');
      // Verify REAL contract: getCheckpoint(pentestId, checkpointId)
      expect((app as any).checkpointService.getCheckpoint).toHaveBeenCalledWith(
        'pt-1',  // pentestId
        'cp-1',  // checkpointId
      );
    });

    it('returns 404 when checkpoint not found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/pentests/pt-1/checkpoints/cp-not-found',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Checkpoint not found');
    });

    it('returns 404 when pentest not found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/pentests/pt-not-found/checkpoints/cp-1',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Pentest not found');
    });
  });

  describe('POST /api/pentests/:id/checkpoints/:cpId/rewind', () => {
    it('performs rewind with real contract and returns preRewindCheckpointId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/pentests/pt-1/checkpoints/cp-1/rewind',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toBeDefined();
      expect(body.data.preRewindCheckpointId).toBe('cp-pre');
      expect(body.data.rewoundAt).toBeDefined();
      // Verify REAL contract: rewindToCheckpoint(pentestId, checkpointId)
      expect((app as any).checkpointService.rewindToCheckpoint).toHaveBeenCalledWith(
        'pt-1',  // pentestId
        'cp-1',  // checkpointId
      );
    });

    it('returns 404 when pentest not found', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/pentests/pt-not-found/checkpoints/cp-1/rewind',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Pentest not found');
    });
  });

  describe('degraded response when checkpointService missing', () => {
    it('GET /checkpoints returns degraded response', async () => {
      delete (app as any).checkpointService;

      const response = await app.inject({
        method: 'GET',
        url: '/api/pentests/pt-1/checkpoints',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toBeNull();
      expect(response.json().error).toBe('Checkpoint service unavailable');
    });

    it('POST /checkpoints returns degraded response', async () => {
      delete (app as any).checkpointService;

      const response = await app.inject({
        method: 'POST',
        url: '/api/pentests/pt-1/checkpoints',
        payload: { label: 'Test' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toBeNull();
      expect(response.json().error).toBe('Checkpoint service unavailable');
    });

    it('GET /checkpoints/:id returns degraded response', async () => {
      delete (app as any).checkpointService;

      const response = await app.inject({
        method: 'GET',
        url: '/api/pentests/pt-1/checkpoints/cp-1',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toBeNull();
      expect(response.json().error).toBe('Checkpoint service unavailable');
    });

    it('POST /checkpoints/:id/rewind returns degraded response', async () => {
      delete (app as any).checkpointService;

      const response = await app.inject({
        method: 'POST',
        url: '/api/pentests/pt-1/checkpoints/cp-1/rewind',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toBeNull();
      expect(response.json().error).toBe('Checkpoint service unavailable');
    });
  });
});
