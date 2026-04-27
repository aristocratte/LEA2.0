/**
 * Worktree API Client
 *
 * Functions for interacting with the git worktree endpoints.
 * All calls hit /api/worktrees on the backend.
 */

import { requestJson } from './api';

// ============================================
// TYPES
// ============================================

export interface WorktreeInfo {
  slug: string;
  worktreePath: string;
  branch: string;
  agentId?: string;
  createdAt: string;
  hasChanges: boolean;
}

export interface WorktreeSession {
  slug: string;
  worktreePath: string;
  branch: string;
  agentId?: string;
  originalCwd: string;
  createdAt: string;
}

export interface ActiveWorktree {
  slug: string;
  worktreePath: string;
  branch: string;
  agentId?: string;
  hasChanges: boolean;
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * List all active worktrees
 * GET /api/worktrees
 */
export async function list(): Promise<WorktreeInfo[]> {
  const res = await requestJson<{ data: WorktreeInfo[] }>('/api/worktrees');
  return res.data ?? [];
}

/**
 * Create a new worktree session
 * POST /api/worktrees
 * Set activate: true to also activate it at session level (for UI use).
 */
export async function create(opts?: {
  slug?: string;
  branch?: string;
  baseBranch?: string;
  agentId?: string;
  activate?: boolean;
}): Promise<WorktreeSession> {
  const res = await requestJson<{ data: WorktreeSession }>('/api/worktrees', {
    method: 'POST',
    body: opts ?? {},
  });
  return res.data;
}

/**
 * Remove a worktree
 * DELETE /api/worktrees/:slug
 */
export async function remove(
  slug: string,
  opts?: { force?: boolean; removeBranch?: boolean },
): Promise<{ message: string }> {
  const res = await requestJson<{ data: { message: string } }>(
    `/api/worktrees/${encodeURIComponent(slug)}`,
    {
      method: 'DELETE',
      body: opts ?? {},
    },
  );
  return res.data;
}

/**
 * Get the active worktree for a given agent
 * GET /api/worktrees/active/:agentId
 */
export async function getActive(agentId: string): Promise<ActiveWorktree | null> {
  try {
    const res = await requestJson<{ data: { activeWorktree: ActiveWorktree | null } }>(
      `/api/worktrees/active/${encodeURIComponent(agentId)}`,
    );
    return res.data?.activeWorktree ?? null;
  } catch {
    return null;
  }
}

/**
 * Get the session-level active worktree (UI-driven, not agent-scoped)
 * GET /api/worktrees/session/active
 */
export async function getSessionActive(): Promise<ActiveWorktree | null> {
  try {
    const res = await requestJson<{ data: { activeWorktree: ActiveWorktree | null } }>(
      '/api/worktrees/session/active',
    );
    return res.data?.activeWorktree ?? null;
  } catch {
    return null;
  }
}

/**
 * Deactivate the session-level worktree
 * POST /api/worktrees/session/deactivate
 */
export async function deactivateSession(): Promise<{ deactivated: boolean; originalCwd: string | null }> {
  const res = await requestJson<{ data: { deactivated: boolean; originalCwd: string | null } }>(
    '/api/worktrees/session/deactivate',
    { method: 'POST' },
  );
  return res.data;
}

// Export all functions as a grouped API object
export const worktreesApi = {
  list,
  create,
  remove,
  getActive,
  getSessionActive,
  deactivateSession,
};
