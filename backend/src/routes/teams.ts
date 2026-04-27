/**
 * Team Routes - REST API endpoints for team management
 *
 * Exposes TeamManager functionality via HTTP:
 * - Create new teams
 * - List and query teams
 * - Get single team with members
 * - Dissolve teams
 * - Add/remove members
 */

import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { TeamManager } from '../core/swarm/TeamManager.js';
import { TeamManagerError } from '../core/swarm/TeamManager.js';

// ============================================
// TYPES
// ============================================

export interface FastifyTeamInstance extends FastifyInstance {
  teamManager: TeamManager;
}

interface TeamRequestParams {
  teamId: string;
}

interface TeamMemberRequestParams {
  teamId: string;
  agentId: string;
}

// ============================================
// SCHEMAS
// ============================================

const CreateTeamRequestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  leadAgentId: z.string().min(1),
});

const AddMemberRequestSchema = z.object({
  agentId: z.string().min(1),
  role: z.enum(['LEAD', 'WORKER']).optional(),
});

// ============================================
// ROUTES
// ============================================

export async function teamRoutes(fastify: FastifyInstance): Promise<void> {
  const teamManager = (fastify as any).teamManager as TeamManager | undefined;

  if (!teamManager) {
    // This should not happen since teamManager is wired at boot time
    fastify.log.warn('TeamManager not initialized, team routes will return 503');
    // Graceful: register routes but return 503 until teamManager is ready
    fastify.addHook('onRequest', async (_, reply) => {
      reply.code(503).send({ error: 'TeamManager not initialized' });
    });
    return;
  }

  const sendTeamError = (reply: FastifyReply, error: any, fallbackMessage: string, statusCode = 400) => {
    const message = error?.message || fallbackMessage;
    return reply.code(statusCode).send({ error: message });
  };

  const getTeamErrorStatusCode = (error: unknown): number => {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';

    switch (code) {
      case 'TEAM_NOT_FOUND':
      case 'NOT_MEMBER':
        return 404;
      default:
        return 400;
    }
  };

  // POST /api/teams - Create a new team
  fastify.post('/api/teams', async (request, reply) => {
    const parse = CreateTeamRequestSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid team payload',
        details: parse.error.issues,
      });
    }

    try {
      const team = await teamManager.createTeam(parse.data);
      return reply.code(201).send({ data: team });
    } catch (error: any) {
      return sendTeamError(reply, error, 'Unable to create team', getTeamErrorStatusCode(error));
    }
  });

  // GET /api/teams - List all teams
  fastify.get('/api/teams', async (request, reply) => {
    try {
      const query = request.query as { status?: string };
      const status = query.status as 'ACTIVE' | 'DISSOLVED' | undefined;

      const teams = await teamManager.listTeams(status);
      return { data: teams };
    } catch (error: any) {
      return sendTeamError(reply, error, 'Unable to list teams');
    }
  });

  // GET /api/teams/:teamId - Get single team with members
  fastify.get('/api/teams/:teamId', async (request, reply) => {
    const { teamId } = request.params as TeamRequestParams;

    try {
      const team = await teamManager.getTeam(teamId);
      if (!team) {
        return reply.code(404).send({ error: 'Team not found' });
      }

      return { data: team };
    } catch (error: any) {
      return sendTeamError(reply, error, 'Unable to get team');
    }
  });

  // DELETE /api/teams/:teamId - Dissolve a team
  fastify.delete('/api/teams/:teamId', async (request, reply) => {
    const { teamId } = request.params as TeamRequestParams;

    try {
      const team = await teamManager.dissolveTeam(teamId);
      return reply.code(202).send({
        data: { message: 'Team dissolved' },
      });
    } catch (error: any) {
      return sendTeamError(reply, error, 'Unable to dissolve team', getTeamErrorStatusCode(error));
    }
  });

  // POST /api/teams/:teamId/members - Add a member to a team
  fastify.post('/api/teams/:teamId/members', async (request, reply) => {
    const { teamId } = request.params as TeamRequestParams;

    const parse = AddMemberRequestSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid member payload',
        details: parse.error.issues,
      });
    }

    try {
      const team = await teamManager.addMember({
        teamId,
        agentId: parse.data.agentId,
        role: parse.data.role,
      });

      // The newly added member is the last one in the members array
      const newMember = team.members[team.members.length - 1];

      return reply.code(201).send({ data: newMember });
    } catch (error: any) {
      return sendTeamError(reply, error, 'Unable to add member', getTeamErrorStatusCode(error));
    }
  });

  // DELETE /api/teams/:teamId/members/:agentId - Remove a member from a team
  fastify.delete('/api/teams/:teamId/members/:agentId', async (request, reply) => {
    const { teamId, agentId } = request.params as TeamMemberRequestParams;

    try {
      const team = await teamManager.removeMember(teamId, agentId);
      return reply.code(202).send({
        data: { message: 'Member removed' },
      });
    } catch (error: any) {
      return sendTeamError(reply, error, 'Unable to remove member', getTeamErrorStatusCode(error));
    }
  });
}
