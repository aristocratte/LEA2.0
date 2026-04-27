/**
 * Permission Routes - REST API endpoints for permission request management
 *
 * Exposes PermissionRequestStore functionality via HTTP:
 * - List pending permission requests
 * - Get a specific permission request
 * - Approve a permission request (optionally with modified input)
 * - Deny a permission request (optionally with feedback)
 */

import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { PermissionRequestStore } from '../core/permissions/PermissionRequestStore.js';
import type { PermissionUpdate } from '../core/permissions/types.js';
import type { AgentPermissionContextStore } from '../core/permissions/AgentPermissionContextStore.js';
import type { PermissionSyncManager, PermissionUpdate as SyncPermissionUpdate } from '../core/swarm/PermissionSync.js';

// ============================================
// SCHEMAS
// ============================================

const ApproveRequestSchema = z.object({
  updatedInput: z.record(z.unknown()).optional(),
  alwaysAllow: z.boolean().optional(),
});

const DenyRequestSchema = z.object({
  feedback: z.string().optional(),
});

const RequestIdParamsSchema = z.object({
  requestId: z.string().min(1),
});

function toPermissionUpdates(
  updates: NonNullable<ReturnType<PermissionRequestStore['getPermissionUpdates']>>,
): PermissionUpdate[] {
  const mapped: PermissionUpdate[] = [];

  for (const update of updates) {
    if (
      update.type !== 'addRules' &&
      update.type !== 'replaceRules' &&
      update.type !== 'removeRules'
    ) {
      continue;
    }

    mapped.push({
      type: update.type,
      rules: update.rules.map((rule) => ({
        toolName: rule.toolName,
        ...(rule.ruleContent ? { ruleContent: rule.ruleContent } : {}),
      })),
      behavior: update.behavior as 'allow' | 'deny' | 'ask',
      destination: 'session',
    });
  }

  return mapped;
}

function toSyncPermissionUpdates(permissionUpdates: PermissionUpdate[]): SyncPermissionUpdate[] {
  const mapped: SyncPermissionUpdate[] = [];

  for (const update of permissionUpdates) {
    switch (update.type) {
      case 'addRules':
      case 'removeRules':
        if (update.behavior !== 'allow' && update.behavior !== 'deny') {
          break;
        }
        mapped.push({
          type: update.type,
          rules: update.rules.map((rule) => ({
            toolName: rule.toolName,
            ruleContent: rule.ruleContent ?? '*',
          })),
          behavior: update.behavior,
          destination: 'session',
        });
        break;
      case 'setMode':
        if (update.mode === 'acceptEdits' || update.mode === 'dontAsk') {
          break;
        }
        mapped.push({
          type: 'setMode',
          mode: update.mode === 'bypassPermissions' ? 'bypass' : update.mode,
          behavior: 'allow',
          destination: 'session',
        });
        break;
      case 'addDirectories':
        break;
    }
  }

  return mapped;
}

// ============================================
// ROUTES
// ============================================

export async function permissionRoutes(fastify: FastifyInstance): Promise<void> {
  const permissionRequestStore = fastify.permissionRequestStore as PermissionRequestStore | undefined;

  if (!permissionRequestStore) {
    fastify.log.warn('PermissionRequestStore not initialized, permission routes will return 503');
    fastify.addHook('onRequest', async (_, reply) => {
      reply.code(503).send({ error: 'PermissionRequestStore not initialized' });
    });
    return;
  }

  // GET /api/permissions/pending - List all pending permission requests
  fastify.get('/api/permissions/pending', async (_request, _reply) => {
    const pending = permissionRequestStore.listPending();
    return { data: pending };
  });

  // GET /api/permissions/pending/:requestId - Get a specific permission request
  fastify.get('/api/permissions/pending/:requestId', async (request, reply) => {
    const { requestId } = request.params as z.infer<typeof RequestIdParamsSchema>;

    const item = permissionRequestStore.get(requestId);
    if (!item) {
      return reply.code(404).send({ error: `Permission request '${requestId}' not found` });
    }

    return { data: item };
  });

  // POST /api/permissions/:requestId/approve - Approve a permission request
  fastify.post('/api/permissions/:requestId/approve', async (request, reply) => {
    const { requestId } = request.params as z.infer<typeof RequestIdParamsSchema>;

    const parse = ApproveRequestSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid approve payload',
        details: parse.error.issues,
      });
    }

    const item = permissionRequestStore.get(requestId);
    if (!item) {
      return reply.code(404).send({ error: `Permission request '${requestId}' not found` });
    }

    if (item.status !== 'pending') {
      return reply.code(409).send({ error: `Permission request '${requestId}' is already ${item.status}` });
    }

    const approved = permissionRequestStore.approve(requestId, {
      updatedInput: parse.data.updatedInput,
      alwaysAllow: parse.data.alwaysAllow,
    });

    const permissionUpdates = approved?.permissionUpdates
      ? toPermissionUpdates(approved.permissionUpdates)
      : [];

    if (approved && permissionUpdates.length > 0) {
      const agentContextStore = request.server.agentContextStore as AgentPermissionContextStore | undefined;
      if (agentContextStore) {
        if (!agentContextStore.hasContext(item.agentId)) {
          agentContextStore.createContext(item.agentId);
        }
        agentContextStore.updateContext(item.agentId, permissionUpdates);
      }

      const permissionSync = request.server.permissionSync as PermissionSyncManager | undefined;
      if (permissionSync) {
        for (const update of toSyncPermissionUpdates(permissionUpdates)) {
          permissionSync.applyUpdate(update);
        }
      }
    }

    return { data: approved };
  });

  // POST /api/permissions/:requestId/deny - Deny a permission request
  fastify.post('/api/permissions/:requestId/deny', async (request, reply) => {
    const { requestId } = request.params as z.infer<typeof RequestIdParamsSchema>;

    const parse = DenyRequestSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid deny payload',
        details: parse.error.issues,
      });
    }

    const item = permissionRequestStore.get(requestId);
    if (!item) {
      return reply.code(404).send({ error: `Permission request '${requestId}' not found` });
    }

    if (item.status !== 'pending') {
      return reply.code(409).send({ error: `Permission request '${requestId}' is already ${item.status}` });
    }

    const denied = permissionRequestStore.deny(requestId, parse.data.feedback);
    return { data: denied };
  });

  // ============================================
  // AGENT CONTEXT ENDPOINTS
  // ============================================

  // GET /api/permissions/contexts - List all agent permission contexts
  fastify.get('/api/permissions/contexts', async (request, reply) => {
    const store = (request.server as any).agentContextStore as AgentPermissionContextStore | undefined;
    if (!store) {
      return reply.code(503).send({ error: 'Agent context store not initialized' });
    }
    return { data: store.listContexts() };
  });

  // GET /api/permissions/context/:agentId - Get a specific agent's permission context info
  fastify.get('/api/permissions/context/:agentId', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const store = (request.server as any).agentContextStore as AgentPermissionContextStore | undefined;
    if (!store) {
      return reply.code(503).send({ error: 'Agent context store not initialized' });
    }
    if (!store.hasContext(agentId)) {
      return reply.code(404).send({ error: `No context for agent ${agentId}` });
    }
    return { data: store.inspectContext(agentId) };
  });
}
