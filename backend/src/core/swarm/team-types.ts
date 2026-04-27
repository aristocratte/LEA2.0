/**
 * Team Types for LEA
 *
 * Type definitions for persistent agent teams.
 * Teams allow groups of agents to be organized with a lead agent
 * and worker members, persisting across swarm runs.
 */

import type { Prisma } from '@prisma/client';

// ============================================
// TEAM
// ============================================

/**
 * Team status - active or dissolved.
 */
export type TeamStatus = 'ACTIVE' | 'DISSOLVED';

/**
 * Member role within a team.
 */
export type TeamRole = 'LEAD' | 'WORKER';

/**
 * A team of agents with a lead and workers.
 */
export interface Team {
  /** Unique team ID */
  id: string;
  /** Team name */
  name: string;
  /** Optional description */
  description?: string | null;
  /** ID of the lead agent */
  leadAgentId: string;
  /** Team status */
  status: TeamStatus;
  /** Team members */
  members: TeamMember[];
  /** When the team was created */
  createdAt: Date;
  /** When the team was last updated */
  updatedAt: Date;
}

/**
 * A member of a team.
 */
export interface TeamMember {
  /** Unique member ID */
  id: string;
  /** Team ID */
  teamId: string;
  /** Agent ID */
  agentId: string;
  /** Member role */
  role: TeamRole;
  /** When the member joined */
  joinedAt: Date;
}

// ============================================
// INPUTS / PARAMS
// ============================================

/**
 * Parameters for creating a new team.
 */
export interface CreateTeamParams {
  /** Team name */
  name: string;
  /** Optional description */
  description?: string;
  /** ID of the agent that will be the lead */
  leadAgentId: string;
}

/**
 * Parameters for adding a member to a team.
 */
export interface AddMemberParams {
  /** Team ID */
  teamId: string;
  /** Agent ID to add */
  agentId: string;
  /** Member role (defaults to WORKER) */
  role?: TeamRole;
}

// ============================================
// PRISMA TYPES
// ============================================

/**
 * Team with members included (from Prisma include).
 */
export type TeamWithMembers = Prisma.TeamGetPayload<{
  include: { members: true };
}>;

/**
 * Team member for creating via Prisma.
 */
export type TeamMemberCreate = Prisma.TeamMemberUncheckedCreateInput;
