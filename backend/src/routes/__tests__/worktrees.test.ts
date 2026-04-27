/**
 * Worktree Routes Tests
 */

import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { worktreeRoutes } from '../worktrees.js';
import type { WorktreeManager } from '../../core/worktree/WorktreeManager.js';
import type { WorktreeInfo } from '../../core/worktree/types.js';

describe('worktreeRoutes', () => {
  let mockWorktreeManager: WorktreeManager;
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    // Create a mock WorktreeManager
    mockWorktreeManager = {
      isAvailable: vi.fn(() => true),
      create: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
      list: vi.fn(),
      getActiveSlug: vi.fn(),
      activate: vi.fn(),
      deactivate: vi.fn(),
      getActiveWorktreePath: vi.fn(),
      activateSession: vi.fn(),
      deactivateSession: vi.fn(),
      getActiveSessionSlug: vi.fn(),
      getActiveSessionPath: vi.fn(),
      getActiveSession: vi.fn(),
      cleanup: vi.fn(),
      getRepoRoot: vi.fn(() => '/mock/repo'),
    } as unknown as WorktreeManager;

    fastify = Fastify({ logger: false });
    (fastify as any).worktreeManager = mockWorktreeManager;
    await fastify.register(worktreeRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fastify.close();
  });

  describe('GET /api/worktrees', () => {
    it('should return list of worktrees', async () => {
      // Arrange
      const mockWorktrees: WorktreeInfo[] = [
        {
          slug: 'test-slug-1',
          worktreePath: '/mock/repo/.lea/worktrees/test-slug-1',
          branch: 'wt/test-slug-1',
          agentId: 'agent-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          hasChanges: false,
        },
        {
          slug: 'test-slug-2',
          worktreePath: '/mock/repo/.lea/worktrees/test-slug-2',
          branch: 'wt/test-slug-2',
          agentId: 'agent-2',
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          hasChanges: true,
        },
      ];
      vi.mocked(mockWorktreeManager.list).mockReturnValue(mockWorktrees);

      // Act
      const response = await request(fastify.server).get('/api/worktrees');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toMatchObject({
        slug: 'test-slug-1',
        worktreePath: '/mock/repo/.lea/worktrees/test-slug-1',
        branch: 'wt/test-slug-1',
        agentId: 'agent-1',
        hasChanges: false,
      });
      expect(mockWorktreeManager.list).toHaveBeenCalled();
    });

    it('should return 503 when WorktreeManager not initialized', async () => {
      // Arrange
      (fastify as any).worktreeManager = undefined;

      // Act
      const response = await request(fastify.server).get('/api/worktrees');

      // Assert
      expect(response.status).toBe(503);
      expect(response.body.error).toBe('WorktreeManager not initialized');
    });

    it('should return 503 when worktrees not available', async () => {
      // Arrange
      vi.mocked(mockWorktreeManager.isAvailable).mockReturnValue(false);

      // Act
      const response = await request(fastify.server).get('/api/worktrees');

      // Assert
      expect(response.status).toBe(503);
      expect(response.body.error).toContain('not available');
    });
  });

  describe('GET /api/worktrees/active/:agentId', () => {
    it('should return null when no active worktree', async () => {
      // Arrange
      vi.mocked(mockWorktreeManager.getActiveSlug).mockReturnValue(undefined);

      // Act
      const response = await request(fastify.server).get('/api/worktrees/active/agent-1');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: { activeWorktree: null } });
      expect(mockWorktreeManager.getActiveSlug).toHaveBeenCalledWith('agent-1');
    });

    it('should return active worktree info after activation', async () => {
      // Arrange
      const agentId = 'agent-1';
      const slug = 'test-slug';

      const mockSession = {
        slug,
        worktreePath: '/mock/repo/.lea/worktrees/test-slug',
        branch: 'wt/test-slug',
        agentId,
        originalCwd: '/mock/repo',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };

      const mockWorktrees: WorktreeInfo[] = [
        {
          slug,
          worktreePath: mockSession.worktreePath,
          branch: mockSession.branch,
          agentId,
          createdAt: mockSession.createdAt,
          hasChanges: false,
        },
      ];

      vi.mocked(mockWorktreeManager.getActiveSlug).mockReturnValue(slug);
      vi.mocked(mockWorktreeManager.get).mockReturnValue(mockSession);
      vi.mocked(mockWorktreeManager.list).mockReturnValue(mockWorktrees);

      // Act
      const response = await request(fastify.server).get(`/api/worktrees/active/${agentId}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: {
          activeWorktree: {
            slug,
            worktreePath: mockSession.worktreePath,
            branch: mockSession.branch,
            agentId,
            hasChanges: false,
          },
        },
      });
    });

    it('should return 503 when WorktreeManager not initialized', async () => {
      // Arrange
      (fastify as any).worktreeManager = undefined;

      // Act
      const response = await request(fastify.server).get('/api/worktrees/active/agent-1');

      // Assert
      expect(response.status).toBe(503);
      expect(response.body.error).toBe('WorktreeManager not initialized');
    });
  });

  describe('POST /api/worktrees', () => {
    it('should create a worktree', async () => {
      // Arrange
      const createInput = {
        slug: 'new-slug',
        branch: 'wt/new-slug',
        agentId: 'agent-1',
      };

      const mockSession = {
        slug: 'new-slug',
        worktreePath: '/mock/repo/.lea/worktrees/new-slug',
        branch: 'wt/new-slug',
        agentId: 'agent-1',
        originalCwd: '/mock/repo',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };

      vi.mocked(mockWorktreeManager.create).mockReturnValue(mockSession);

      // Act
      const response = await request(fastify.server)
        .post('/api/worktrees')
        .send(createInput);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        slug: 'new-slug',
        worktreePath: mockSession.worktreePath,
        branch: 'wt/new-slug',
        agentId: 'agent-1',
      });
      expect(mockWorktreeManager.create).toHaveBeenCalledWith({
        slug: 'new-slug',
        branch: 'wt/new-slug',
        agentId: 'agent-1',
        baseBranch: undefined,
      });
      // Should NOT activate at session level without activate flag
      expect(mockWorktreeManager.activateSession).not.toHaveBeenCalled();
    });

    it('should create and activate at session level when activate=true', async () => {
      // Arrange
      const mockSession = {
        slug: 'ui-worktree',
        worktreePath: '/mock/repo/.lea/worktrees/ui-worktree',
        branch: 'wt/ui-worktree',
        agentId: undefined,
        originalCwd: '/mock/repo',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };

      vi.mocked(mockWorktreeManager.create).mockReturnValue(mockSession);

      // Act
      const response = await request(fastify.server)
        .post('/api/worktrees')
        .send({ slug: 'ui-worktree', activate: true });

      // Assert
      expect(response.status).toBe(200);
      expect(mockWorktreeManager.create).toHaveBeenCalledWith({
        slug: 'ui-worktree',
        branch: undefined,
        agentId: undefined,
        baseBranch: undefined,
      });
      expect(mockWorktreeManager.activateSession).toHaveBeenCalledWith('ui-worktree');
    });

    it('should auto-generate slug when not provided', async () => {
      // Arrange
      const mockSession = {
        slug: 'wt-auto-generated',
        worktreePath: '/mock/repo/.lea/worktrees/wt-auto-generated',
        branch: 'main',
        agentId: undefined,
        originalCwd: '/mock/repo',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };

      vi.mocked(mockWorktreeManager.create).mockReturnValue(mockSession);

      // Act
      const response = await request(fastify.server)
        .post('/api/worktrees')
        .send({});

      // Assert
      expect(response.status).toBe(200);
      expect(mockWorktreeManager.create).toHaveBeenCalled();
      // The slug should be auto-generated (contains timestamp)
      const callArgs = vi.mocked(mockWorktreeManager.create).mock.calls[0][0];
      expect(callArgs.slug).toBeTruthy();
    });

    it('should return 503 when WorktreeManager not initialized', async () => {
      // Arrange
      (fastify as any).worktreeManager = undefined;

      // Act
      const response = await request(fastify.server)
        .post('/api/worktrees')
        .send({ slug: 'test' });

      // Assert
      expect(response.status).toBe(503);
      expect(response.body.error).toBe('WorktreeManager not initialized');
    });

    it('should return 400 for invalid payload', async () => {
      // Act
      const response = await request(fastify.server)
        .post('/api/worktrees')
        .send({ slug: 123 }); // invalid type

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid payload');
    });
  });

  describe('DELETE /api/worktrees/:slug', () => {
    it('should remove a worktree', async () => {
      // Arrange
      const slug = 'test-slug';
      const mockSession = {
        slug,
        worktreePath: '/mock/repo/.lea/worktrees/test-slug',
        branch: 'wt/test-slug',
        agentId: 'agent-1',
        originalCwd: '/mock/repo',
        createdAt: new Date(),
      };

      vi.mocked(mockWorktreeManager.get).mockReturnValue(mockSession);
      vi.mocked(mockWorktreeManager.getActiveSessionSlug).mockReturnValue(undefined);

      // Act
      const response = await request(fastify.server)
        .delete(`/api/worktrees/${slug}`)
        .send({ force: false, removeBranch: true });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: { message: `Worktree '${slug}' removed successfully` },
      });
      expect(mockWorktreeManager.remove).toHaveBeenCalledWith(slug, {
        force: false,
        removeBranch: true,
      });
    });

    it('should deactivate session when removing the session-level active worktree', async () => {
      const slug = 'session-active-wt';
      const mockSession = {
        slug,
        worktreePath: '/mock/repo/.lea/worktrees/session-active-wt',
        branch: 'wt/session-active-wt',
        agentId: undefined,
        originalCwd: '/mock/repo',
        createdAt: new Date(),
      };

      vi.mocked(mockWorktreeManager.get).mockReturnValue(mockSession);
      vi.mocked(mockWorktreeManager.getActiveSessionSlug).mockReturnValue(slug);

      const response = await request(fastify.server)
        .delete(`/api/worktrees/${slug}`)
        .send({ force: false });

      expect(response.status).toBe(200);
      expect(mockWorktreeManager.deactivateSession).toHaveBeenCalled();
      expect(mockWorktreeManager.remove).toHaveBeenCalledWith(slug, { force: false, removeBranch: true });
    });

    it('should return 404 for non-existent worktree', async () => {
      // Arrange
      vi.mocked(mockWorktreeManager.get).mockReturnValue(undefined);

      // Act
      const response = await request(fastify.server)
        .delete('/api/worktrees/non-existent')
        .send({});

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return 409 when worktree has uncommitted changes', async () => {
      // Arrange
      const slug = 'test-slug';
      const mockSession = {
        slug,
        worktreePath: '/mock/repo/.lea/worktrees/test-slug',
        branch: 'wt/test-slug',
        agentId: 'agent-1',
        originalCwd: '/mock/repo',
        createdAt: new Date(),
      };

      vi.mocked(mockWorktreeManager.get).mockReturnValue(mockSession);
      vi.mocked(mockWorktreeManager.remove).mockImplementation(() => {
        throw new Error('Worktree has uncommitted changes');
      });

      // Act
      const response = await request(fastify.server)
        .delete(`/api/worktrees/${slug}`)
        .send({});

      // Assert
      expect(response.status).toBe(409);
      expect(response.body.error).toContain('uncommitted changes');
    });

    it('should return 503 when WorktreeManager not initialized', async () => {
      // Arrange
      (fastify as any).worktreeManager = undefined;

      // Act
      const response = await request(fastify.server)
        .delete('/api/worktrees/test-slug')
        .send({});

      // Assert
      expect(response.status).toBe(503);
      expect(response.body.error).toBe('WorktreeManager not initialized');
    });

    it('should return 400 for invalid slug parameter', async () => {
      // Act - use an invalid slug format (empty)
      const response = await request(fastify.server)
        .delete('/api/worktrees/') // empty slug - Fastify validation fails
        .send({});

      // Assert - Fastify returns 400 for missing/invalid route parameter
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/worktrees/session/active', () => {
    it('should return null when no session-level worktree is active', async () => {
      vi.mocked(mockWorktreeManager.getActiveSession).mockReturnValue(undefined);

      const response = await request(fastify.server).get('/api/worktrees/session/active');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: { activeWorktree: null } });
    });

    it('should return session-level active worktree when set', async () => {
      const mockInfo: WorktreeInfo = {
        slug: 'session-wt',
        worktreePath: '/mock/repo/.lea/worktrees/session-wt',
        branch: 'wt/session-wt',
        agentId: undefined,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        hasChanges: false,
      };

      vi.mocked(mockWorktreeManager.getActiveSession).mockReturnValue(mockInfo);

      const response = await request(fastify.server).get('/api/worktrees/session/active');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: {
          activeWorktree: {
            slug: 'session-wt',
            worktreePath: '/mock/repo/.lea/worktrees/session-wt',
            branch: 'wt/session-wt',
            agentId: undefined,
            createdAt: '2026-01-01T00:00:00.000Z',
            hasChanges: false,
          },
        },
      });
    });
  });

  describe('POST /api/worktrees/session/deactivate', () => {
    it('should deactivate session-level worktree', async () => {
      vi.mocked(mockWorktreeManager.deactivateSession).mockReturnValue('/mock/repo');

      const response = await request(fastify.server).post('/api/worktrees/session/deactivate');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: { deactivated: true, originalCwd: '/mock/repo' },
      });
      expect(mockWorktreeManager.deactivateSession).toHaveBeenCalled();
    });

    it('should return deactivated: false when nothing was active', async () => {
      vi.mocked(mockWorktreeManager.deactivateSession).mockReturnValue(undefined);

      const response = await request(fastify.server).post('/api/worktrees/session/deactivate');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: { deactivated: false, originalCwd: null },
      });
    });
  });

  describe('GET /api/worktrees/:slug', () => {
    it('should return worktree info', async () => {
      // Arrange
      const slug = 'test-slug';
      const mockSession = {
        slug,
        worktreePath: '/mock/repo/.lea/worktrees/test-slug',
        branch: 'wt/test-slug',
        agentId: 'agent-1',
        originalCwd: '/mock/repo',
        createdAt: new Date(),
      };

      const mockInfo: WorktreeInfo = {
        slug,
        worktreePath: mockSession.worktreePath,
        branch: mockSession.branch,
        agentId: mockSession.agentId,
        createdAt: mockSession.createdAt,
        hasChanges: false,
      };

      vi.mocked(mockWorktreeManager.get).mockReturnValue(mockSession);
      vi.mocked(mockWorktreeManager.list).mockReturnValue([mockInfo]);

      // Act
      const response = await request(fastify.server).get(`/api/worktrees/${slug}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        slug,
        worktreePath: mockInfo.worktreePath,
        branch: mockInfo.branch,
        agentId: mockInfo.agentId,
        hasChanges: mockInfo.hasChanges,
      });
      // createdAt is serialized as ISO string
      expect(typeof response.body.data.createdAt).toBe('string');
    });

    it('should return 404 for non-existent worktree', async () => {
      // Arrange
      vi.mocked(mockWorktreeManager.get).mockReturnValue(undefined);

      // Act
      const response = await request(fastify.server).get('/api/worktrees/non-existent');

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return 503 when WorktreeManager not initialized', async () => {
      // Arrange
      (fastify as any).worktreeManager = undefined;

      // Act
      const response = await request(fastify.server).get('/api/worktrees/test-slug');

      // Assert
      expect(response.status).toBe(503);
      expect(response.body.error).toBe('WorktreeManager not initialized');
    });
  });
});
