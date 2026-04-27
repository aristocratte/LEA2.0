/**
 * Permission Routes Tests
 */

import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermissionRequestStore } from '../../core/permissions/PermissionRequestStore.js';
import { AgentPermissionContextStore } from '../../core/permissions/AgentPermissionContextStore.js';
import { createDefaultContext } from '../../core/permissions/PermissionContext.js';
import type { PermissionSyncManager } from '../../core/swarm/PermissionSync.js';
import { permissionRoutes } from '../permissions.js';

async function buildApp() {
  const fastify = Fastify({ logger: false });
  const permissionRequestStore = new PermissionRequestStore();

  (fastify as any).permissionRequestStore = permissionRequestStore;
  await fastify.register(permissionRoutes);
  await fastify.ready();

  return { fastify, permissionRequestStore };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('permissionRoutes', () => {
  describe('GET /api/permissions/pending', () => {
    it('returns 200 with empty list when no pending requests', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/permissions/pending');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ data: [] });
      } finally {
        await fastify.close();
      }
    });

    it('returns 200 with pending items', async () => {
      const { fastify, permissionRequestStore } = await buildApp();

      const item = permissionRequestStore.create({
        agentId: 'agent-1',
        agentName: 'Recon Alpha',
        toolName: 'bash',
        toolUseId: 'call_1',
        input: { command: 'whoami' },
        description: 'Execute bash',
        reason: 'Needs approval',
      });

      try {
        const response = await request(fastify.server)
          .get('/api/permissions/pending');

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].requestId).toBe(item.requestId);
        expect(response.body.data[0].toolName).toBe('bash');
        expect(response.body.data[0].status).toBe('pending');
      } finally {
        await fastify.close();
      }
    });
  });

  describe('GET /api/permissions/pending/:requestId', () => {
    it('returns 200 with item data', async () => {
      const { fastify, permissionRequestStore } = await buildApp();

      const item = permissionRequestStore.create({
        agentId: 'agent-1',
        agentName: 'Recon Alpha',
        toolName: 'bash',
        toolUseId: 'call_1',
        input: { command: 'whoami' },
        description: 'Execute bash',
        reason: 'Needs approval',
      });

      try {
        const response = await request(fastify.server)
          .get(`/api/permissions/pending/${item.requestId}`);

        expect(response.status).toBe(200);
        expect(response.body.data.requestId).toBe(item.requestId);
        expect(response.body.data.toolName).toBe('bash');
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 for unknown requestId', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/permissions/pending/nonexistent-id');

        expect(response.status).toBe(404);
        expect(response.body.error).toContain('not found');
      } finally {
        await fastify.close();
      }
    });
  });

  describe('POST /api/permissions/:requestId/approve', () => {
    it('approves a pending request and returns 200', async () => {
      const { fastify, permissionRequestStore } = await buildApp();

      const item = permissionRequestStore.create({
        agentId: 'agent-1',
        agentName: 'Recon Alpha',
        toolName: 'bash',
        toolUseId: 'call_1',
        input: { command: 'whoami' },
        description: 'Execute bash',
        reason: 'Needs approval',
      });

      try {
        const response = await request(fastify.server)
          .post(`/api/permissions/${item.requestId}/approve`)
          .send({});

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('approved');
        expect(response.body.data.result.decision).toBe('allow');
      } finally {
        await fastify.close();
      }
    });

    it('approves with updatedInput', async () => {
      const { fastify, permissionRequestStore } = await buildApp();

      const item = permissionRequestStore.create({
        agentId: 'agent-1',
        agentName: 'Recon Alpha',
        toolName: 'bash',
        toolUseId: 'call_1',
        input: { command: 'rm -rf /' },
        description: 'Execute bash',
        reason: 'Needs approval',
      });

      try {
        const response = await request(fastify.server)
          .post(`/api/permissions/${item.requestId}/approve`)
          .send({ updatedInput: { command: 'ls -la' } });

        expect(response.status).toBe(200);
        expect(response.body.data.result.decision).toBe('allow');
        expect(response.body.data.result.updatedInput).toEqual({ command: 'ls -la' });
      } finally {
        await fastify.close();
      }
    });

    it('approves with alwaysAllow=true and returns permissionUpdates', async () => {
      const { fastify, permissionRequestStore } = await buildApp();
      const agentContextStore = new AgentPermissionContextStore(createDefaultContext({ mode: 'default' }));
      const permissionSync = { applyUpdate: vi.fn() } as unknown as PermissionSyncManager;
      (fastify as any).agentContextStore = agentContextStore;
      (fastify as any).permissionSync = permissionSync;
      agentContextStore.createContext('agent-1');

      const item = permissionRequestStore.create({
        agentId: 'agent-1',
        agentName: 'Recon Alpha',
        toolName: 'nmap_scan',
        toolUseId: 'call_1',
        input: { target: '10.0.0.1' },
        description: 'Run nmap scan',
        reason: 'Needs approval',
      });

      try {
        const response = await request(fastify.server)
          .post(`/api/permissions/${item.requestId}/approve`)
          .send({ alwaysAllow: true });

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('approved');
        expect(response.body.data.result.decision).toBe('allow');
        expect(response.body.data.permissionUpdates).toBeDefined();
        expect(response.body.data.permissionUpdates).toHaveLength(1);
        expect(response.body.data.permissionUpdates[0]).toEqual({
          type: 'addRules',
          rules: [{ toolName: 'nmap_scan' }],
          behavior: 'allow',
          destination: 'session',
        });
        expect(agentContextStore.getContext('agent-1').alwaysAllowRules.session).toContain('nmap_scan');
        expect((permissionSync.applyUpdate as any)).toHaveBeenCalledWith({
          type: 'addRules',
          rules: [{ toolName: 'nmap_scan', ruleContent: '*' }],
          behavior: 'allow',
          destination: 'session',
        });
      } finally {
        await fastify.close();
      }
    });

    it('approves without alwaysAllow and returns no permissionUpdates', async () => {
      const { fastify, permissionRequestStore } = await buildApp();

      const item = permissionRequestStore.create({
        agentId: 'agent-1',
        agentName: 'Recon Alpha',
        toolName: 'bash',
        toolUseId: 'call_1',
        input: { command: 'whoami' },
        description: 'Execute bash',
        reason: 'Needs approval',
      });

      try {
        const response = await request(fastify.server)
          .post(`/api/permissions/${item.requestId}/approve`)
          .send({});

        expect(response.status).toBe(200);
        expect(response.body.data.permissionUpdates).toBeUndefined();
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 for unknown requestId', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/permissions/nonexistent-id/approve')
          .send({});

        expect(response.status).toBe(404);
        expect(response.body.error).toContain('not found');
      } finally {
        await fastify.close();
      }
    });

    it('returns 409 for already-resolved request', async () => {
      const { fastify, permissionRequestStore } = await buildApp();

      const item = permissionRequestStore.create({
        agentId: 'agent-1',
        agentName: 'Recon Alpha',
        toolName: 'bash',
        toolUseId: 'call_1',
        input: {},
        description: 'desc',
        reason: 'reason',
      });

      // Approve it first
      permissionRequestStore.approve(item.requestId);

      try {
        const response = await request(fastify.server)
          .post(`/api/permissions/${item.requestId}/approve`)
          .send({});

        expect(response.status).toBe(409);
        expect(response.body.error).toContain('already approved');
      } finally {
        await fastify.close();
      }
    });
  });

  describe('POST /api/permissions/:requestId/deny', () => {
    it('denies a pending request and returns 200', async () => {
      const { fastify, permissionRequestStore } = await buildApp();

      const item = permissionRequestStore.create({
        agentId: 'agent-1',
        agentName: 'Recon Alpha',
        toolName: 'bash',
        toolUseId: 'call_1',
        input: { command: 'whoami' },
        description: 'Execute bash',
        reason: 'Needs approval',
      });

      try {
        const response = await request(fastify.server)
          .post(`/api/permissions/${item.requestId}/deny`)
          .send({ feedback: 'Too dangerous' });

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('denied');
        expect(response.body.data.result.decision).toBe('deny');
        expect(response.body.data.result.feedback).toBe('Too dangerous');
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 for unknown requestId', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/permissions/nonexistent-id/deny')
          .send({});

        expect(response.status).toBe(404);
        expect(response.body.error).toContain('not found');
      } finally {
        await fastify.close();
      }
    });

    it('returns 409 for already-denied request', async () => {
      const { fastify, permissionRequestStore } = await buildApp();

      const item = permissionRequestStore.create({
        agentId: 'agent-1',
        agentName: 'Recon Alpha',
        toolName: 'bash',
        toolUseId: 'call_1',
        input: {},
        description: 'desc',
        reason: 'reason',
      });

      // Deny it first
      permissionRequestStore.deny(item.requestId);

      try {
        const response = await request(fastify.server)
          .post(`/api/permissions/${item.requestId}/deny`)
          .send({});

        expect(response.status).toBe(409);
        expect(response.body.error).toContain('already denied');
      } finally {
        await fastify.close();
      }
    });
  });

  describe('Agent Context Endpoints', () => {
    async function buildAppWithContextStore() {
      const fastify = Fastify({ logger: false });
      const permissionRequestStore = new PermissionRequestStore();
      const agentContextStore = new AgentPermissionContextStore(
        createDefaultContext({ mode: 'default' }),
      );

      (fastify as any).permissionRequestStore = permissionRequestStore;
      (fastify as any).agentContextStore = agentContextStore;
      await fastify.register(permissionRoutes);
      await fastify.ready();

      return { fastify, permissionRequestStore, agentContextStore };
    }

    describe('GET /api/permissions/contexts', () => {
      it('returns 200 with empty list when no contexts', async () => {
        const { fastify } = await buildAppWithContextStore();

        try {
          const response = await request(fastify.server)
            .get('/api/permissions/contexts');

          expect(response.status).toBe(200);
          expect(response.body).toEqual({ data: [] });
        } finally {
          await fastify.close();
        }
      });

      it('returns 200 with contexts after creating one', async () => {
        const { fastify, agentContextStore } = await buildAppWithContextStore();

        agentContextStore.createContext('agent-1', { mode: 'default' });

        try {
          const response = await request(fastify.server)
            .get('/api/permissions/contexts');

          expect(response.status).toBe(200);
          expect(response.body.data).toHaveLength(1);
          expect(response.body.data[0].agentId).toBe('agent-1');
          expect(response.body.data[0].mode).toBe('default');
        } finally {
          await fastify.close();
        }
      });
    });

    describe('GET /api/permissions/context/:agentId', () => {
      it('returns 404 for unknown agent', async () => {
        const { fastify } = await buildAppWithContextStore();

        try {
          const response = await request(fastify.server)
            .get('/api/permissions/context/unknown-agent');

          expect(response.status).toBe(404);
          expect(response.body.error).toContain('No context for agent');
        } finally {
          await fastify.close();
        }
      });

      it('returns 200 with context info for known agent', async () => {
        const { fastify, agentContextStore } = await buildAppWithContextStore();

        agentContextStore.createContext('agent-42', {
          mode: 'default',
          allowRules: { session: ['bash'] },
          denyRules: { projectSettings: ['write_file'] },
          askRules: { session: ['delete_file'] },
        });

        try {
          const response = await request(fastify.server)
            .get('/api/permissions/context/agent-42');

          expect(response.status).toBe(200);
          expect(response.body.data.agentId).toBe('agent-42');
          expect(response.body.data.mode).toBe('default');
          expect(response.body.data.allowRules.session).toEqual(['bash']);
          expect(response.body.data.denyRules.projectSettings).toEqual(['write_file']);
          expect(response.body.data.askRules.session).toEqual(['delete_file']);
          expect(response.body.data.allowRuleCount).toBe(1);
          expect(response.body.data.additionalWorkingDirectories).toBeInstanceOf(Array);
        } finally {
          await fastify.close();
        }
      });

      it('returns 503 when agentContextStore is not initialized', async () => {
        const fastify = Fastify({ logger: false });
        const permissionRequestStore = new PermissionRequestStore();

        (fastify as any).permissionRequestStore = permissionRequestStore;
        // No agentContextStore set
        await fastify.register(permissionRoutes);
        await fastify.ready();

        try {
          const response = await request(fastify.server)
            .get('/api/permissions/contexts');

          expect(response.status).toBe(503);
          expect(response.body.error).toContain('not initialized');
        } finally {
          await fastify.close();
        }
      });
    });
  });
});
