/**
 * Worktree Routes - REST API endpoints for managing git worktrees.
 *
 * Exposes WorktreeManager functionality via HTTP:
 * - List all worktrees
 * - Create a worktree
 * - Get worktree info by slug
 * - Remove a worktree
 */

import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { WorktreeManager } from '../core/worktree/WorktreeManager.js';

// ============================================
// SCHEMAS
// ============================================

const SlugParamsSchema = z.object({
  slug: z.string().min(1),
});

const CreateWorktreeSchema = z.object({
  slug: z.string().optional(),
  branch: z.string().optional(),
  baseBranch: z.string().optional(),
  agentId: z.string().optional(),
  /** Whether to activate this worktree at session level (for UI use). */
  activate: z.boolean().optional(),
});

const RemoveWorktreeSchema = z.object({
  force: z.boolean().optional(),
  removeBranch: z.boolean().optional(),
});

// ============================================
// ROUTES
// ============================================

export async function worktreeRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/worktrees — List all worktrees
  fastify.get('/api/worktrees', async (_request, reply: FastifyReply) => {
    const worktreeManager = (fastify as any).worktreeManager as WorktreeManager | undefined;
    if (!worktreeManager) {
      return reply.code(503).send({ error: 'WorktreeManager not initialized' });
    }
    if (!worktreeManager.isAvailable()) {
      return reply.code(503).send({ error: 'Worktrees not available (not inside a git repository)' });
    }

    const worktrees = worktreeManager.list();
    return { data: worktrees };
  });

  // POST /api/worktrees — Create a worktree
  fastify.post('/api/worktrees', async (request, reply: FastifyReply) => {
    const worktreeManager = (fastify as any).worktreeManager as WorktreeManager | undefined;
    if (!worktreeManager) {
      return reply.code(503).send({ error: 'WorktreeManager not initialized' });
    }
    if (!worktreeManager.isAvailable()) {
      return reply.code(503).send({ error: 'Worktrees not available (not inside a git repository)' });
    }

    const bodyParse = CreateWorktreeSchema.safeParse(request.body || {});
    if (!bodyParse.success) {
      return reply.code(400).send({ error: 'Invalid payload', details: bodyParse.error.issues });
    }

    const { slug, branch, baseBranch, agentId, activate } = bodyParse.data;

    // Auto-generate slug if not provided
    const resolvedSlug = slug ?? `wt-${Date.now().toString(36)}`;

    try {
      const session = worktreeManager.create({
        slug: resolvedSlug,
        branch,
        baseBranch,
        agentId,
      });

      // Activate at session level if requested (UI "Enter worktree" button)
      if (activate) {
        worktreeManager.activateSession(resolvedSlug);
      }

      return { data: session };
    } catch (err: any) {
      return reply.code(500).send({ error: `Failed to create worktree: ${err.message}` });
    }
  });

  // GET /api/worktrees/active/:agentId — Get active worktree for an agent
  fastify.get('/api/worktrees/active/:agentId', async (request, reply: FastifyReply) => {
    const worktreeManager = (fastify as any).worktreeManager as WorktreeManager | undefined;
    if (!worktreeManager) {
      return reply.code(503).send({ error: 'WorktreeManager not initialized' });
    }
    if (!worktreeManager.isAvailable()) {
      return reply.code(503).send({ error: 'Worktrees not available' });
    }

    const { agentId } = request.params as { agentId: string };
    const slug = worktreeManager.getActiveSlug(agentId);

    if (!slug) {
      return { data: { activeWorktree: null } };
    }

    const session = worktreeManager.get(slug);
    if (!session) {
      return { data: { activeWorktree: null } };
    }

    return {
      data: {
        activeWorktree: {
          slug: session.slug,
          worktreePath: session.worktreePath,
          branch: session.branch,
          agentId: session.agentId,
          hasChanges: worktreeManager.list().find(w => w.slug === slug)?.hasChanges ?? false,
        },
      },
    };
  });

  // GET /api/worktrees/session/active — Get session-level active worktree
  fastify.get('/api/worktrees/session/active', async (_request, reply: FastifyReply) => {
    const worktreeManager = (fastify as any).worktreeManager as WorktreeManager | undefined;
    if (!worktreeManager) {
      return reply.code(503).send({ error: 'WorktreeManager not initialized' });
    }
    if (!worktreeManager.isAvailable()) {
      return reply.code(503).send({ error: 'Worktrees not available' });
    }

    const info = worktreeManager.getActiveSession();
    return { data: { activeWorktree: info ?? null } };
  });

  // POST /api/worktrees/session/deactivate — Deactivate session-level worktree
  fastify.post('/api/worktrees/session/deactivate', async (_request, reply: FastifyReply) => {
    const worktreeManager = (fastify as any).worktreeManager as WorktreeManager | undefined;
    if (!worktreeManager) {
      return reply.code(503).send({ error: 'WorktreeManager not initialized' });
    }
    if (!worktreeManager.isAvailable()) {
      return reply.code(503).send({ error: 'Worktrees not available' });
    }

    const originalCwd = worktreeManager.deactivateSession();
    return { data: { deactivated: originalCwd !== undefined, originalCwd: originalCwd ?? null } };
  });

  // GET /api/worktrees/:slug — Get worktree info
  fastify.get('/api/worktrees/:slug', async (request, reply: FastifyReply) => {
    const worktreeManager = (fastify as any).worktreeManager as WorktreeManager | undefined;
    if (!worktreeManager) {
      return reply.code(503).send({ error: 'WorktreeManager not initialized' });
    }
    if (!worktreeManager.isAvailable()) {
      return reply.code(503).send({ error: 'Worktrees not available (not inside a git repository)' });
    }

    const paramsParse = SlugParamsSchema.safeParse(request.params);
    if (!paramsParse.success) {
      return reply.code(400).send({ error: 'Invalid slug parameter', details: paramsParse.error.issues });
    }

    const { slug } = paramsParse.data;
    const session = worktreeManager.get(slug);

    if (!session) {
      return reply.code(404).send({ error: `Worktree '${slug}' not found` });
    }

    // Return WorktreeInfo (with hasChanges)
    const info = worktreeManager.list().find(w => w.slug === slug);
    if (!info) {
      return reply.code(404).send({ error: `Worktree '${slug}' not found in listing` });
    }

    return { data: info };
  });

  // DELETE /api/worktrees/:slug — Remove a worktree
  fastify.delete('/api/worktrees/:slug', async (request, reply: FastifyReply) => {
    const worktreeManager = (fastify as any).worktreeManager as WorktreeManager | undefined;
    if (!worktreeManager) {
      return reply.code(503).send({ error: 'WorktreeManager not initialized' });
    }
    if (!worktreeManager.isAvailable()) {
      return reply.code(503).send({ error: 'Worktrees not available (not inside a git repository)' });
    }

    const paramsParse = SlugParamsSchema.safeParse(request.params);
    if (!paramsParse.success) {
      return reply.code(400).send({ error: 'Invalid slug parameter', details: paramsParse.error.issues });
    }

    const bodyParse = RemoveWorktreeSchema.safeParse(request.body || {});
    if (!bodyParse.success) {
      return reply.code(400).send({ error: 'Invalid payload', details: bodyParse.error.issues });
    }

    const { slug } = paramsParse.data;
    const { force, removeBranch } = bodyParse.data;

    // Check worktree exists
    const session = worktreeManager.get(slug);
    if (!session) {
      return reply.code(404).send({ error: `Worktree '${slug}' not found` });
    }

    try {
      // Deactivate session-level if this was the active session worktree
      const activeSessionSlug = worktreeManager.getActiveSessionSlug();
      if (activeSessionSlug === slug) {
        worktreeManager.deactivateSession();
      }

      worktreeManager.remove(slug, {
        force: force ?? false,
        removeBranch: removeBranch ?? true,
      });

      return { data: { message: `Worktree '${slug}' removed successfully` } };
    } catch (err: any) {
      const msg = err.message ?? '';
      if (msg.toLowerCase().includes('uncommitted') || msg.toLowerCase().includes('changes')) {
        return reply.code(409).send({
          error: `Worktree '${slug}' has uncommitted changes. Set force=true to remove anyway.`,
        });
      }
      return reply.code(500).send({ error: `Failed to remove worktree: ${msg}` });
    }
  });
}
