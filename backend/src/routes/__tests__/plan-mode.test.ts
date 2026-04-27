/**
 * Plan Mode Routes Tests
 */

import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanModeManager } from '../../core/runtime/PlanModeManager.js';
import { AgentPermissionContextStore } from '../../core/permissions/AgentPermissionContextStore.js';
import { createDefaultContext } from '../../core/permissions/PermissionContext.js';
import { planModeRoutes } from '../plan-mode.js';

async function buildApp() {
  const fastify = Fastify({ logger: false });
  const agentContextStore = new AgentPermissionContextStore(
    createDefaultContext({ mode: 'default' }),
  );
  const planModeManager = new PlanModeManager(agentContextStore);

  (fastify as any).planModeManager = planModeManager;
  (fastify as any).agentContextStore = agentContextStore;
  await fastify.register(planModeRoutes);
  await fastify.ready();

  return { fastify, planModeManager, agentContextStore };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('planModeRoutes', () => {
  describe('GET /api/plan-mode', () => {
    it('returns 200 with empty list when no agents in plan mode', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/plan-mode');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ data: [] });
      } finally {
        await fastify.close();
      }
    });

    it('returns 200 with agents in plan mode', async () => {
      const { fastify, planModeManager } = await buildApp();

      planModeManager.enterPlanMode('agent-1', 'Testing');
      planModeManager.enterPlanMode('agent-2', 'Another test');

      try {
        const response = await request(fastify.server)
          .get('/api/plan-mode');

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(2);
        expect(response.body.data.map((a: any) => a.agentId).sort()).toEqual(['agent-1', 'agent-2']);
      } finally {
        await fastify.close();
      }
    });
  });

  describe('GET /api/plan-mode/:agentId', () => {
    it('returns 200 with state for agent in plan mode', async () => {
      const { fastify, planModeManager } = await buildApp();

      planModeManager.enterPlanMode('agent-1', 'Testing');

      try {
        const response = await request(fastify.server)
          .get('/api/plan-mode/agent-1');

        expect(response.status).toBe(200);
        expect(response.body.data.agentId).toBe('agent-1');
        expect(response.body.data.mode).toBe('plan');
        expect(response.body.data.reason).toBe('Testing');
      } finally {
        await fastify.close();
      }
    });

    it('returns 200 with default state for initialized agent', async () => {
      const { fastify, planModeManager } = await buildApp();

      planModeManager.initializeAgent('agent-1', false);

      try {
        const response = await request(fastify.server)
          .get('/api/plan-mode/agent-1');

        expect(response.status).toBe(200);
        expect(response.body.data.agentId).toBe('agent-1');
        expect(response.body.data.mode).toBe('default');
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 for unknown agent', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/plan-mode/unknown-agent');

        expect(response.status).toBe(404);
        expect(response.body.error).toContain('No plan mode state');
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for empty agentId', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .get('/api/plan-mode/');

        // Empty agentId fails Zod validation (.min(1)) → 400
        expect(response.status).toBe(400);
      } finally {
        await fastify.close();
      }
    });
  });

  describe('POST /api/plan-mode/:agentId/enter', () => {
    it('enters plan mode for an agent', async () => {
      const { fastify, agentContextStore } = await buildApp();
      agentContextStore.createContext('agent-1', { mode: 'default' });

      try {
        const response = await request(fastify.server)
          .post('/api/plan-mode/agent-1/enter')
          .send({ reason: 'Need to plan' });

        expect(response.status).toBe(200);
        expect(response.body.data.agentId).toBe('agent-1');
        expect(response.body.data.mode).toBe('plan');
        expect(response.body.data.reason).toBe('Need to plan');
      } finally {
        await fastify.close();
      }
    });

    it('enters plan mode without reason', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/plan-mode/agent-1/enter')
          .send({});

        expect(response.status).toBe(200);
        expect(response.body.data.mode).toBe('plan');
        expect(response.body.data.reason).toBeUndefined();
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for invalid body', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/plan-mode/agent-1/enter')
          .send({ reason: 123 }); // reason must be string

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid payload');
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for invalid agentId', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/plan-mode//enter')
          .send({});

        // Empty agentId fails Zod validation (.min(1)) → 400
        expect(response.status).toBe(400);
      } finally {
        await fastify.close();
      }
    });
  });

  describe('POST /api/plan-mode/:agentId/exit', () => {
    it('exits plan mode for an agent', async () => {
      const { fastify, planModeManager, agentContextStore } = await buildApp();
      agentContextStore.createContext('agent-1', { mode: 'default' });
      planModeManager.enterPlanMode('agent-1');

      try {
        const response = await request(fastify.server)
          .post('/api/plan-mode/agent-1/exit')
          .send({ reason: 'Done planning' });

        expect(response.status).toBe(200);
        expect(response.body.data.agentId).toBe('agent-1');
        expect(response.body.data.mode).toBe('default');
        expect(response.body.data.reason).toBe('Done planning');
      } finally {
        await fastify.close();
      }
    });

    it('exits plan mode without reason', async () => {
      const { fastify, planModeManager } = await buildApp();
      planModeManager.enterPlanMode('agent-1');

      try {
        const response = await request(fastify.server)
          .post('/api/plan-mode/agent-1/exit')
          .send({});

        expect(response.status).toBe(200);
        expect(response.body.data.mode).toBe('default');
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 for agent with no plan mode state', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/plan-mode/unknown-agent/exit')
          .send({});

        expect(response.status).toBe(404);
        expect(response.body.error).toContain('No plan mode state');
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for invalid body', async () => {
      const { fastify, planModeManager } = await buildApp();
      planModeManager.enterPlanMode('agent-1');

      try {
        const response = await request(fastify.server)
          .post('/api/plan-mode/agent-1/exit')
          .send({ reason: 123 }); // reason must be string

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid payload');
      } finally {
        await fastify.close();
      }
    });
  });

  describe('503 when PlanModeManager not initialized', () => {
    it('returns 503 for GET /api/plan-mode', async () => {
      const fastify = Fastify({ logger: false });
      // No planModeManager set
      await fastify.register(planModeRoutes);
      await fastify.ready();

      try {
        const response = await request(fastify.server)
          .get('/api/plan-mode');

        // onRequest hook intercepts before the route handler
        expect(response.status).toBe(503);
        expect(response.body.error).toContain('not initialized');
      } finally {
        await fastify.close();
      }
    });

    it('returns 503 for POST enter route', async () => {
      const fastify = Fastify({ logger: false });
      await fastify.register(planModeRoutes);
      await fastify.ready();

      try {
        const response = await request(fastify.server)
          .post('/api/plan-mode/agent-1/enter')
          .send({});

        expect(response.status).toBe(503);
        expect(response.body.error).toContain('not initialized');
      } finally {
        await fastify.close();
      }
    });
  });
});
