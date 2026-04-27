/**
 * Plan Mode API Client
 *
 * Functions for interacting with the plan mode endpoints.
 * All calls hit /api/plan-mode on the backend.
 */

import { requestJson } from './api';

// ============================================
// TYPES
// ============================================

export interface PlanModeState {
  agentId: string;
  mode: 'plan' | 'default';
  enteredAt?: number;
  reason?: string;
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * List all agents and their plan mode state
 * GET /api/plan-mode
 */
export async function listAgents(): Promise<PlanModeState[]> {
  const res = await requestJson<{ data: PlanModeState[] }>('/api/plan-mode');
  return res.data;
}

/**
 * Get plan mode state for a specific agent
 * GET /api/plan-mode/:agentId
 */
export async function getState(agentId: string): Promise<PlanModeState> {
  const res = await requestJson<{ data: PlanModeState }>(
    `/api/plan-mode/${encodeURIComponent(agentId)}`
  );
  return res.data;
}

/**
 * Enter plan mode for a specific agent
 * POST /api/plan-mode/:agentId/enter
 */
export async function enter(agentId: string, reason?: string): Promise<PlanModeState> {
  const res = await requestJson<{ data: PlanModeState }>(
    `/api/plan-mode/${encodeURIComponent(agentId)}/enter`,
    {
      method: 'POST',
      body: { reason },
    }
  );
  return res.data;
}

/**
 * Exit plan mode for a specific agent
 * POST /api/plan-mode/:agentId/exit
 */
export async function exit(agentId: string, reason?: string): Promise<PlanModeState> {
  const res = await requestJson<{ data: PlanModeState }>(
    `/api/plan-mode/${encodeURIComponent(agentId)}/exit`,
    {
      method: 'POST',
      body: { reason },
    }
  );
  return res.data;
}

// Export all functions as a grouped API object
export const planModeApi = {
  listAgents,
  getState,
  enter,
  exit,
};
