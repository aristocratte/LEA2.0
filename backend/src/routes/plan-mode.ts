/**
 * Plan Mode Routes - REST API endpoints for managing agent plan mode state.
 *
 * Exposes PlanModeManager functionality via HTTP:
 * - List all agents in plan mode
 * - Get an agent's plan mode state
 * - Enter plan mode for an agent
 * - Exit plan mode for an agent
 */

import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { PlanModeManager } from '../core/runtime/PlanModeManager.js';

// ============================================
// SCHEMAS
// ============================================

const AgentIdParamsSchema = z.object({
  agentId: z.string().min(1),
});

const EnterPlanModeSchema = z.object({
  reason: z.string().optional(),
});

const ExitPlanModeSchema = z.object({
  reason: z.string().optional(),
});

// ============================================
// ROUTES
// ============================================

export async function planModeRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/plan-mode — List all agents in plan mode
  fastify.get('/api/plan-mode', async (_request, reply: FastifyReply) => {
    const planModeManager = (fastify as any).planModeManager as PlanModeManager | undefined;
    if (!planModeManager) {
      return reply.code(503).send({ error: 'PlanModeManager not initialized' });
    }
    const agents = planModeManager.getPlanModeAgents();
    return { data: agents };
  });

  // GET /api/plan-mode/:agentId — Get agent's plan mode state
  fastify.get('/api/plan-mode/:agentId', async (request, reply: FastifyReply) => {
    const planModeManager = (fastify as any).planModeManager as PlanModeManager | undefined;
    if (!planModeManager) {
      return reply.code(503).send({ error: 'PlanModeManager not initialized' });
    }

    const parse = AgentIdParamsSchema.safeParse(request.params);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Invalid agentId parameter', details: parse.error.issues });
    }

    const { agentId } = parse.data;
    const state = planModeManager.getState(agentId);

    if (!state) {
      return reply.code(404).send({ error: `No plan mode state for agent '${agentId}'` });
    }

    return { data: state };
  });

  // POST /api/plan-mode/:agentId/enter — Enter plan mode
  fastify.post('/api/plan-mode/:agentId/enter', async (request, reply: FastifyReply) => {
    const planModeManager = (fastify as any).planModeManager as PlanModeManager | undefined;
    if (!planModeManager) {
      return reply.code(503).send({ error: 'PlanModeManager not initialized' });
    }

    const paramsParse = AgentIdParamsSchema.safeParse(request.params);
    if (!paramsParse.success) {
      return reply.code(400).send({ error: 'Invalid agentId parameter', details: paramsParse.error.issues });
    }

    const bodyParse = EnterPlanModeSchema.safeParse(request.body || {});
    if (!bodyParse.success) {
      return reply.code(400).send({ error: 'Invalid payload', details: bodyParse.error.issues });
    }

    const { agentId } = paramsParse.data;
    const { reason } = bodyParse.data;

    const state = planModeManager.enterPlanMode(agentId, reason);
    return { data: state };
  });

  // POST /api/plan-mode/:agentId/exit — Exit plan mode
  fastify.post('/api/plan-mode/:agentId/exit', async (request, reply: FastifyReply) => {
    const planModeManager = (fastify as any).planModeManager as PlanModeManager | undefined;
    if (!planModeManager) {
      return reply.code(503).send({ error: 'PlanModeManager not initialized' });
    }

    const paramsParse = AgentIdParamsSchema.safeParse(request.params);
    if (!paramsParse.success) {
      return reply.code(400).send({ error: 'Invalid agentId parameter', details: paramsParse.error.issues });
    }

    const bodyParse = ExitPlanModeSchema.safeParse(request.body || {});
    if (!bodyParse.success) {
      return reply.code(400).send({ error: 'Invalid payload', details: bodyParse.error.issues });
    }

    const { agentId } = paramsParse.data;
    const { reason } = bodyParse.data;

    const state = planModeManager.exitPlanMode(agentId, reason);
    if (!state) {
      return reply.code(404).send({ error: `No plan mode state for agent '${agentId}'` });
    }

    return { data: state };
  });
}
