/**
 * Team Routes Tests
 */

import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Create mock objects that will be used throughout
const {
  createTeamMock,
  getTeamMock,
  listTeamsMock,
  dissolveTeamMock,
  addMemberMock,
  removeMemberMock,
  TeamManagerMock,
  teamManagerConstructorMock,
} = vi.hoisted(() => {
  const createTeamMock = vi.fn();
  const getTeamMock = vi.fn();
  const listTeamsMock = vi.fn();
  const dissolveTeamMock = vi.fn();
  const addMemberMock = vi.fn();
  const removeMemberMock = vi.fn();
  const teamManagerConstructorMock = vi.fn();

  class TeamManagerMock {
    createTeam = createTeamMock;
    getTeam = getTeamMock;
    listTeams = listTeamsMock;
    dissolveTeam = dissolveTeamMock;
    addMember = addMemberMock;
    removeMember = removeMemberMock;

    constructor() {
      teamManagerConstructorMock();
    }
  }

  return {
    createTeamMock,
    getTeamMock,
    listTeamsMock,
    dissolveTeamMock,
    addMemberMock,
    removeMemberMock,
    TeamManagerMock,
    teamManagerConstructorMock,
  };
});

vi.mock('../core/swarm/TeamManager.js', () => ({
  TeamManager: TeamManagerMock,
}));

import { teamRoutes } from '../teams.js';

async function buildApp() {
  const fastify = Fastify({ logger: false });
  const teamManager = new TeamManagerMock();

  (fastify as any).teamManager = teamManager;
  await fastify.register(teamRoutes);
  await fastify.ready();

  return { fastify, teamManager };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('teamRoutes', () => {
  const mockTeam = {
    id: 'team-1',
    name: 'Red Team Alpha',
    description: 'Primary red team',
    leadAgentId: 'agent-1',
    status: 'ACTIVE',
    members: [
      {
        id: 'member-1',
        teamId: 'team-1',
        agentId: 'agent-1',
        role: 'LEAD',
        joinedAt: new Date('2025-01-01T00:00:00Z'),
      },
    ],
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  };

  describe('POST /api/teams', () => {
    it('creates a new team and returns 201', async () => {
      createTeamMock.mockResolvedValue(mockTeam);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/teams')
          .send({
            name: 'Red Team Alpha',
            description: 'Primary red team',
            leadAgentId: 'agent-1',
          });

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
          data: {
            id: 'team-1',
            name: 'Red Team Alpha',
            description: 'Primary red team',
            leadAgentId: 'agent-1',
            status: 'ACTIVE',
            members: [
              {
                id: 'member-1',
                teamId: 'team-1',
                agentId: 'agent-1',
                role: 'LEAD',
                joinedAt: '2025-01-01T00:00:00.000Z',
              },
            ],
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        });

        expect(createTeamMock).toHaveBeenCalledWith({
          name: 'Red Team Alpha',
          description: 'Primary red team',
          leadAgentId: 'agent-1',
        });
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for invalid payload (empty name)', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/teams')
          .send({ name: '', leadAgentId: 'agent-1' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid team payload');
        expect(createTeamMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for invalid payload (missing leadAgentId)', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/teams')
          .send({ name: 'Test Team' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid team payload');
        expect(createTeamMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when TeamManager throws an error', async () => {
      createTeamMock.mockRejectedValue(new Error('Lead agent not found'));

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/teams')
          .send({
            name: 'Test Team',
            leadAgentId: 'invalid-agent',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Lead agent not found');
      } finally {
        await fastify.close();
      }
    });
  });

  describe('GET /api/teams', () => {
    it('returns list of all teams', async () => {
      const mockTeams = [
        mockTeam,
        {
          ...mockTeam,
          id: 'team-2',
          name: 'Blue Team',
          leadAgentId: 'agent-2',
        },
      ];

      listTeamsMock.mockResolvedValue(mockTeams);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).get('/api/teams');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          data: [
            {
              id: 'team-1',
              name: 'Red Team Alpha',
              description: 'Primary red team',
              leadAgentId: 'agent-1',
              status: 'ACTIVE',
              members: [
                {
                  id: 'member-1',
                  teamId: 'team-1',
                  agentId: 'agent-1',
                  role: 'LEAD',
                  joinedAt: '2025-01-01T00:00:00.000Z',
                },
              ],
              createdAt: '2025-01-01T00:00:00.000Z',
              updatedAt: '2025-01-01T00:00:00.000Z',
            },
            {
              id: 'team-2',
              name: 'Blue Team',
              description: 'Primary red team',
              leadAgentId: 'agent-2',
              status: 'ACTIVE',
              members: [
                {
                  id: 'member-1',
                  teamId: 'team-1',
                  agentId: 'agent-1',
                  role: 'LEAD',
                  joinedAt: '2025-01-01T00:00:00.000Z',
                },
              ],
              createdAt: '2025-01-01T00:00:00.000Z',
              updatedAt: '2025-01-01T00:00:00.000Z',
            },
          ],
        });
      } finally {
        await fastify.close();
      }
    });

    it('returns empty array when no teams exist', async () => {
      listTeamsMock.mockResolvedValue([]);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).get('/api/teams');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ data: [] });
      } finally {
        await fastify.close();
      }
    });

    it('filters by status parameter', async () => {
      listTeamsMock.mockResolvedValue([mockTeam]);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).get('/api/teams?status=ACTIVE');

        expect(response.status).toBe(200);
        expect(listTeamsMock).toHaveBeenCalledWith('ACTIVE');
      } finally {
        await fastify.close();
      }
    });
  });

  describe('GET /api/teams/:teamId', () => {
    it('returns single team details', async () => {
      getTeamMock.mockResolvedValue(mockTeam);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).get('/api/teams/team-1');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          data: {
            id: 'team-1',
            name: 'Red Team Alpha',
            description: 'Primary red team',
            leadAgentId: 'agent-1',
            status: 'ACTIVE',
            members: [
              {
                id: 'member-1',
                teamId: 'team-1',
                agentId: 'agent-1',
                role: 'LEAD',
                joinedAt: '2025-01-01T00:00:00.000Z',
              },
            ],
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        });
        expect(getTeamMock).toHaveBeenCalledWith('team-1');
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 for unknown team', async () => {
      getTeamMock.mockResolvedValue(undefined);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).get('/api/teams/unknown-team');

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Team not found');
      } finally {
        await fastify.close();
      }
    });
  });

  describe('DELETE /api/teams/:teamId', () => {
    it('dissolves team and returns 202', async () => {
      const dissolvedTeam = { ...mockTeam, status: 'DISSOLVED' };
      dissolveTeamMock.mockResolvedValue(dissolvedTeam);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).delete('/api/teams/team-1');

        expect(response.status).toBe(202);
        expect(response.body).toEqual({
          data: {
            message: 'Team dissolved',
          },
        });
        expect(dissolveTeamMock).toHaveBeenCalledWith('team-1');
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 when dissolving unknown team', async () => {
      const error: any = new Error('Team not found: unknown-team');
      error.code = 'TEAM_NOT_FOUND';
      dissolveTeamMock.mockRejectedValue(error);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).delete('/api/teams/unknown-team');

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Team not found: unknown-team');
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when team is already dissolved', async () => {
      const error: any = new Error('Team unknown-team is already dissolved');
      error.code = 'ALREADY_DISSOLVED';
      dissolveTeamMock.mockRejectedValue(error);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).delete('/api/teams/unknown-team');

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Team unknown-team is already dissolved');
      } finally {
        await fastify.close();
      }
    });
  });

  describe('POST /api/teams/:teamId/members', () => {
    it('adds member to team and returns 201', async () => {
      const updatedTeam = {
        ...mockTeam,
        members: [
          ...mockTeam.members,
          {
            id: 'member-2',
            teamId: 'team-1',
            agentId: 'agent-2',
            role: 'WORKER',
            joinedAt: new Date('2025-01-02T00:00:00Z'),
          },
        ],
      };

      addMemberMock.mockResolvedValue(updatedTeam);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/teams/team-1/members')
          .send({
            agentId: 'agent-2',
            role: 'WORKER',
          });

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
          data: {
            id: 'member-2',
            teamId: 'team-1',
            agentId: 'agent-2',
            role: 'WORKER',
            joinedAt: '2025-01-02T00:00:00.000Z',
          },
        });
        expect(addMemberMock).toHaveBeenCalledWith({
          teamId: 'team-1',
          agentId: 'agent-2',
          role: 'WORKER',
        });
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 for invalid payload (missing agentId)', async () => {
      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/teams/team-1/members')
          .send({ role: 'WORKER' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid member payload');
        expect(addMemberMock).not.toHaveBeenCalled();
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 when team not found', async () => {
      const error: any = new Error('Team not found: unknown-team');
      error.code = 'TEAM_NOT_FOUND';
      addMemberMock.mockRejectedValue(error);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/teams/unknown-team/members')
          .send({ agentId: 'agent-2' });

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Team not found: unknown-team');
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when team is dissolved', async () => {
      const error: any = new Error('Cannot add member to dissolved team');
      error.code = 'TEAM_DISSOLVED';
      addMemberMock.mockRejectedValue(error);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/teams/team-1/members')
          .send({ agentId: 'agent-2' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Cannot add member to dissolved team');
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when agent is already a member', async () => {
      const error: any = new Error('Agent agent-1 is already a member');
      error.code = 'ALREADY_MEMBER';
      addMemberMock.mockRejectedValue(error);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server)
          .post('/api/teams/team-1/members')
          .send({ agentId: 'agent-1' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Agent agent-1 is already a member');
      } finally {
        await fastify.close();
      }
    });
  });

  describe('DELETE /api/teams/:teamId/members/:agentId', () => {
    it('removes member from team and returns 202', async () => {
      const updatedTeam = {
        ...mockTeam,
        members: [
          {
            id: 'member-1',
            teamId: 'team-1',
            agentId: 'agent-1',
            role: 'LEAD',
            joinedAt: new Date('2025-01-01T00:00:00Z'),
          },
        ],
      };

      removeMemberMock.mockResolvedValue(updatedTeam);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).delete(
          '/api/teams/team-1/members/agent-2'
        );

        expect(response.status).toBe(202);
        expect(response.body).toEqual({
          data: {
            message: 'Member removed',
          },
        });
        expect(removeMemberMock).toHaveBeenCalledWith('team-1', 'agent-2');
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 when team not found', async () => {
      const error: any = new Error('Team not found: unknown-team');
      error.code = 'TEAM_NOT_FOUND';
      removeMemberMock.mockRejectedValue(error);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).delete(
          '/api/teams/unknown-team/members/agent-2'
        );

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Team not found: unknown-team');
      } finally {
        await fastify.close();
      }
    });

    it('returns 400 when attempting to remove lead agent', async () => {
      const error: any = new Error('Cannot remove lead agent');
      error.code = 'CANNOT_REMOVE_LEAD';
      removeMemberMock.mockRejectedValue(error);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).delete(
          '/api/teams/team-1/members/agent-1'
        );

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Cannot remove lead agent');
      } finally {
        await fastify.close();
      }
    });

    it('returns 404 when agent is not a member', async () => {
      const error: any = new Error('Agent not a member');
      error.code = 'NOT_MEMBER';
      removeMemberMock.mockRejectedValue(error);

      const { fastify } = await buildApp();

      try {
        const response = await request(fastify.server).delete(
          '/api/teams/team-1/members/non-member'
        );

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Agent not a member');
      } finally {
        await fastify.close();
      }
    });
  });
});
