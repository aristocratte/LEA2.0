/**
 * Permission Request API Client
 *
 * Functions for interacting with the permission request resolution endpoints.
 * All calls hit /api/permissions on the backend.
 */

import { requestJson } from './api';

// ============================================
// TYPES
// ============================================

export interface PermissionRequestItem {
  requestId: string;
  agentId: string;
  agentName: string;
  toolName: string;
  toolUseId: string;
  input: Record<string, unknown>;
  description: string;
  reason: string;
  timestamp: number;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  result?: {
    decision: 'allow' | 'deny';
    updatedInput?: Record<string, unknown>;
    feedback?: string;
  };
}

export interface AgentContextInfo {
  agentId: string;
  mode: string;
  allowRuleCount: number;
  denyRuleCount: number;
  askRuleCount: number;
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * List all pending permission requests
 * GET /api/permissions/pending
 */
export async function listPending(): Promise<PermissionRequestItem[]> {
  const res = await requestJson<{ data: PermissionRequestItem[] }>('/api/permissions/pending');
  return res.data;
}

/**
 * Get a single permission request by ID
 * GET /api/permissions/pending/:requestId
 */
export async function getRequest(requestId: string): Promise<PermissionRequestItem> {
  const res = await requestJson<{ data: PermissionRequestItem }>(
    `/api/permissions/pending/${encodeURIComponent(requestId)}`
  );
  return res.data;
}

/**
 * Approve a permission request
 * POST /api/permissions/:requestId/approve
 */
export async function approve(
  requestId: string,
  options?: { updatedInput?: Record<string, unknown>; alwaysAllow?: boolean }
): Promise<PermissionRequestItem> {
  const res = await requestJson<{ data: PermissionRequestItem }>(
    `/api/permissions/${encodeURIComponent(requestId)}/approve`,
    {
      method: 'POST',
      body: options ?? {},
    }
  );
  return res.data;
}

/**
 * Deny a permission request
 * POST /api/permissions/:requestId/deny
 */
export async function deny(
  requestId: string,
  feedback?: string
): Promise<PermissionRequestItem> {
  const res = await requestJson<{ data: PermissionRequestItem }>(
    `/api/permissions/${encodeURIComponent(requestId)}/deny`,
    {
      method: 'POST',
      body: { feedback },
    }
  );
  return res.data;
}

/**
 * Get permission context for a specific agent
 * GET /api/permissions/context/:agentId
 */
export async function getContext(agentId: string): Promise<AgentContextInfo> {
  const res = await requestJson<{ data: AgentContextInfo }>(
    `/api/permissions/context/${encodeURIComponent(agentId)}`
  );
  return res.data;
}

/**
 * List all agent permission contexts
 * GET /api/permissions/contexts
 */
export async function listContexts(): Promise<AgentContextInfo[]> {
  const res = await requestJson<{ data: AgentContextInfo[] }>('/api/permissions/contexts');
  return res.data;
}

// Export all functions as a grouped API object
export const permissionsApi = {
  listPending,
  getRequest,
  approve,
  deny,
  getContext,
  listContexts,
};
