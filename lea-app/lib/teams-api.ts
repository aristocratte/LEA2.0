/**
 * Team API Client
 *
 * Functions for interacting with the team management endpoints.
 * All calls hit /api/teams on the real backend.
 */

import { requestJson } from './api';

// ============================================
// TYPES
// ============================================

export type TeamStatus = 'active' | 'dissolved';

export type TeamMemberRole = 'lead' | 'worker';

export interface TeamMember {
  agentId: string;
  role: TeamMemberRole;
  joinedAt: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  leadAgentId: string;
  status: TeamStatus;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeamParams {
  name: string;
  description?: string;
  leadAgentId: string;
}

export interface AddMemberParams {
  agentId: string;
  role?: string;
}

type RawTeamStatus = 'ACTIVE' | 'DISSOLVED' | TeamStatus;
type RawTeamMemberRole = 'LEAD' | 'WORKER' | TeamMemberRole;

interface RawTeamMember {
  agentId: string;
  role: RawTeamMemberRole;
  joinedAt: string;
}

interface RawTeam {
  id: string;
  name: string;
  description?: string;
  leadAgentId: string;
  status: RawTeamStatus;
  members: RawTeamMember[];
  createdAt: string;
  updatedAt: string;
}

function normalizeTeamStatus(status: RawTeamStatus): TeamStatus {
  return String(status).toLowerCase() === 'dissolved' ? 'dissolved' : 'active';
}

function normalizeTeamMemberRole(role: RawTeamMemberRole): TeamMemberRole {
  return String(role).toLowerCase() === 'lead' ? 'lead' : 'worker';
}

function normalizeTeamMember(member: RawTeamMember): TeamMember {
  return {
    agentId: member.agentId,
    role: normalizeTeamMemberRole(member.role),
    joinedAt: member.joinedAt,
  };
}

function normalizeTeam(team: RawTeam): Team {
  return {
    id: team.id,
    name: team.name,
    description: team.description,
    leadAgentId: team.leadAgentId,
    status: normalizeTeamStatus(team.status),
    members: team.members.map(normalizeTeamMember),
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  };
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Create a new team
 * POST /api/teams
 */
export async function createTeam(params: CreateTeamParams): Promise<Team> {
  const res = await requestJson<{ data: RawTeam }>('/api/teams', {
    method: 'POST',
    body: params,
  });
  return normalizeTeam(res.data);
}

/**
 * List all teams
 * GET /api/teams
 */
export async function listTeams(): Promise<Team[]> {
  const res = await requestJson<{ data: RawTeam[] }>('/api/teams');
  return res.data.map(normalizeTeam);
}

/**
 * Get single team details
 * GET /api/teams/:teamId
 */
export async function getTeam(teamId: string): Promise<Team> {
  const res = await requestJson<{ data: RawTeam }>(
    `/api/teams/${encodeURIComponent(teamId)}`
  );
  return normalizeTeam(res.data);
}

/**
 * Dissolve a team
 * DELETE /api/teams/:teamId
 */
export async function dissolveTeam(teamId: string): Promise<{ message: string }> {
  const res = await requestJson<{ data: { message: string } }>(
    `/api/teams/${encodeURIComponent(teamId)}`,
    {
      method: 'DELETE',
    }
  );
  return res.data;
}

/**
 * Add a member to a team
 * POST /api/teams/:teamId/members
 */
export async function addMember(
  teamId: string,
  params: AddMemberParams
): Promise<TeamMember> {
  const res = await requestJson<{ data: RawTeamMember }>(
    `/api/teams/${encodeURIComponent(teamId)}/members`,
    {
      method: 'POST',
      body: params,
    }
  );
  return normalizeTeamMember(res.data);
}

/**
 * Remove a member from a team
 * DELETE /api/teams/:teamId/members/:agentId
 */
export async function removeMember(teamId: string, agentId: string): Promise<void> {
  await requestJson(
    `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(agentId)}`,
    {
      method: 'DELETE',
    }
  );
}

// Export all functions as a grouped API object
export const teamsApi = {
  createTeam,
  listTeams,
  getTeam,
  dissolveTeam,
  addMember,
  removeMember,
};
