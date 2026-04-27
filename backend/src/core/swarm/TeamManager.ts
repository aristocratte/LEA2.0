/**
 * TeamManager — Manages persistent agent teams for LEA.
 *
 * Provides CRUD operations for teams and their members.
 * Teams have a lead agent and optional worker agents.
 * Teams can be dissolved (status changed to DISSOLVED) but not deleted.
 */

import type { Prisma } from '@prisma/client';
import type {
  Team,
  TeamMember,
  TeamStatus,
  TeamRole,
  CreateTeamParams,
  AddMemberParams,
  TeamWithMembers,
} from './team-types.js';

// ============================================
// ERROR TYPES
// ============================================

export class TeamManagerError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'TeamManagerError';
  }
}

// ============================================
// TEAMMANAGER
// ============================================

export interface TeamManagerOptions {
  /** Prisma client instance */
  prisma: Prisma.DefaultPrismaClient;
}

export class TeamManager {
  private prisma: Prisma.DefaultPrismaClient;

  constructor(options: TeamManagerOptions) {
    this.prisma = options.prisma;
  }

  /**
   * Create a new team with the specified lead agent.
   * The lead agent is automatically added as a member with role LEAD.
   *
   * @param params - Team creation parameters
   * @returns The created team with members
   * @throws {TeamManagerError} if leadAgentId is empty
   */
  async createTeam(params: CreateTeamParams): Promise<Team> {
    const { name, description, leadAgentId } = params;

    if (!leadAgentId || leadAgentId.trim() === '') {
      throw new TeamManagerError('leadAgentId is required', 'MISSING_LEAD');
    }

    const team = await this.prisma.team.create({
      data: {
        name: name.trim(),
        description,
        leadAgentId,
        status: 'ACTIVE',
        members: {
          create: {
            agentId: leadAgentId,
            role: 'LEAD',
          },
        },
      },
      include: {
        members: true,
      },
    });

    return this.toTeam(team);
  }

  /**
   * Get a team by ID.
   *
   * @param teamId - Team ID
   * @returns The team or undefined if not found
   */
  async getTeam(teamId: string): Promise<Team | undefined> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { members: true },
    });

    return team ? this.toTeam(team) : undefined;
  }

  /**
   * List all teams.
   *
   * @param status - Optional status filter
   * @returns All teams (optionally filtered by status)
   */
  async listTeams(status?: TeamStatus): Promise<Team[]> {
    const where = status ? { status } : undefined;

    const teams = await this.prisma.team.findMany({
      where,
      include: { members: true },
      orderBy: { createdAt: 'desc' },
    });

    return teams.map((t) => this.toTeam(t));
  }

  /**
   * Add a member to a team.
   *
   * @param params - Add member parameters
   * @returns The updated team with members
   * @throws {TeamManagerError} if team not found, dissolved, or agent already a member
   */
  async addMember(params: AddMemberParams): Promise<Team> {
    const { teamId, agentId, role = 'WORKER' } = params;

    // Check if team exists and is active
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { members: true },
    });

    if (!team) {
      throw new TeamManagerError(`Team not found: ${teamId}`, 'TEAM_NOT_FOUND');
    }

    if (team.status === 'DISSOLVED') {
      throw new TeamManagerError(`Cannot add member to dissolved team: ${teamId}`, 'TEAM_DISSOLVED');
    }

    // Check if agent is already a member
    const existingMember = team.members.find((m) => m.agentId === agentId);
    if (existingMember) {
      throw new TeamManagerError(`Agent ${agentId} is already a member of team ${teamId}`, 'ALREADY_MEMBER');
    }

    // Add the member
    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data: {
        members: {
          create: {
            agentId,
            role,
          },
        },
      },
      include: { members: true },
    });

    return this.toTeam(updated);
  }

  /**
   * Remove a member from a team.
   *
   * @param teamId - Team ID
   * @param agentId - Agent ID to remove
   * @returns The updated team with members
   * @throws {TeamManagerError} if team not found, attempting to remove lead, or agent not a member
   */
  async removeMember(teamId: string, agentId: string): Promise<Team> {
    // Check if team exists
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { members: true },
    });

    if (!team) {
      throw new TeamManagerError(`Team not found: ${teamId}`, 'TEAM_NOT_FOUND');
    }

    // Cannot remove the lead agent
    if (team.leadAgentId === agentId) {
      throw new TeamManagerError(`Cannot remove lead agent ${agentId} from team ${teamId}`, 'CANNOT_REMOVE_LEAD');
    }

    // Check if agent is a member
    const member = team.members.find((m) => m.agentId === agentId);
    if (!member) {
      throw new TeamManagerError(`Agent ${agentId} is not a member of team ${teamId}`, 'NOT_MEMBER');
    }

    // Remove the member
    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data: {
        members: {
          delete: {
            id: member.id,
          },
        },
      },
      include: { members: true },
    });

    return this.toTeam(updated);
  }

  /**
   * Dissolve a team (mark as dissolved).
   * The team is not deleted, just marked as dissolved.
   *
   * @param teamId - Team ID
   * @returns The dissolved team
   * @throws {TeamManagerError} if team not found or already dissolved
   */
  async dissolveTeam(teamId: string): Promise<Team> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new TeamManagerError(`Team not found: ${teamId}`, 'TEAM_NOT_FOUND');
    }

    if (team.status === 'DISSOLVED') {
      throw new TeamManagerError(`Team ${teamId} is already dissolved`, 'ALREADY_DISSOLVED');
    }

    const dissolved = await this.prisma.team.update({
      where: { id: teamId },
      data: { status: 'DISSOLVED' },
      include: { members: true },
    });

    return this.toTeam(dissolved);
  }

  /**
   * Check if an agent is the lead of a team.
   *
   * @param teamId - Team ID
   * @param agentId - Agent ID
   * @returns true if the agent is the lead
   */
  async isTeamLead(teamId: string, agentId: string): Promise<boolean> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { leadAgentId: true },
    });

    return team?.leadAgentId === agentId;
  }

  /**
   * Get all members of a team.
   *
   * @param teamId - Team ID
   * @returns Array of team members
   * @throws {TeamManagerError} if team not found
   */
  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { members: true },
    });

    if (!team) {
      throw new TeamManagerError(`Team not found: ${teamId}`, 'TEAM_NOT_FOUND');
    }

    return team.members.map((m) => ({
      id: m.id,
      teamId: m.teamId,
      agentId: m.agentId,
      role: m.role as TeamRole,
      joinedAt: m.joinedAt,
    }));
  }

  /**
   * Get all teams an agent is a member of.
   *
   * @param agentId - Agent ID
   * @returns Array of teams the agent belongs to
   */
  async getTeamsForAgent(agentId: string): Promise<Team[]> {
    const teams = await this.prisma.team.findMany({
      where: {
        members: {
          some: {
            agentId,
          },
        },
        status: 'ACTIVE',
      },
      include: { members: true },
      orderBy: { createdAt: 'desc' },
    });

    return teams.map((t) => this.toTeam(t));
  }

  // ──────────────────────────────────────────────────────────
  // Private
  // ──────────────────────────────────────────────────────────

  private toTeam(team: TeamWithMembers): Team {
    return {
      id: team.id,
      name: team.name,
      description: team.description,
      leadAgentId: team.leadAgentId,
      status: team.status as TeamStatus,
      members: team.members.map((m) => ({
        id: m.id,
        teamId: m.teamId,
        agentId: m.agentId,
        role: m.role as TeamRole,
        joinedAt: m.joinedAt,
      })),
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    };
  }
}
