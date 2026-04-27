/**
 * Agent API Client
 *
 * Functions for interacting with the Lot 2 agent system endpoints.
 * All calls hit /api/agents on the real backend.
 */

import { requestJson } from './api';

// ============================================
// TYPES
// ============================================

export type AgentHealth = 'healthy' | 'stalled' | 'dead';

export interface AgentStatus {
  agentId: string;
  name: string;
  status: string;
  role: string;
  swarmRunId: string;
  pentestId: string;
  health: AgentHealth;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentTaskInfo {
  taskId: string;
  description?: string;
  status: string;
  startTime?: number;
  endTime?: number;
  error?: string;
}

export interface AgentDetail extends AgentStatus {
  task?: AgentTaskInfo;
  recentTranscript?: TranscriptEntry[];
}

export interface TranscriptEntry {
  timestamp: string;
  role: string;
  content: string;
  turn: number;
}

export interface SpawnAgentParams {
  name: string;
  prompt: string;
  role?: string;
  model?: string;
  systemPrompt?: string;
  allowedTools?: string[];
  swarmRunId?: string;
  pentestId?: string;
}

export interface SpawnAgentResult {
  agentId: string;
  taskId: string;
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Spawn a new agent
 * POST /api/agents/spawn
 */
export async function spawnAgent(
  params: SpawnAgentParams
): Promise<SpawnAgentResult> {
  const res = await requestJson<{ data: SpawnAgentResult }>('/api/agents/spawn', {
    method: 'POST',
    body: params,
  });
  return res.data;
}

/**
 * List all agents
 * GET /api/agents
 */
export async function listAgents(): Promise<AgentStatus[]> {
  const res = await requestJson<{ data: AgentStatus[] }>('/api/agents');
  return res.data;
}

/**
 * Get single agent details
 * GET /api/agents/:agentId
 */
export async function getAgent(agentId: string): Promise<AgentDetail> {
  const res = await requestJson<{ data: AgentDetail }>(
    `/api/agents/${encodeURIComponent(agentId)}`
  );
  return res.data;
}

/**
 * Send a message to an agent
 * POST /api/agents/:agentId/message
 */
export async function sendMessage(agentId: string, text: string): Promise<void> {
  await requestJson(`/api/agents/${encodeURIComponent(agentId)}/message`, {
    method: 'POST',
    body: { text },
  });
}

/**
 * Kill an agent
 * DELETE /api/agents/:agentId
 */
export async function killAgent(agentId: string): Promise<void> {
  await requestJson(`/api/agents/${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
  });
}

/**
 * Shutdown all agents
 * POST /api/agents/shutdown
 */
export async function shutdownAgents(): Promise<void> {
  await requestJson('/api/agents/shutdown', {
    method: 'POST',
  });
}

/**
 * Get agent transcript (if supported by backend)
 * GET /api/agents/:agentId/transcript
 */
export async function getAgentTranscript(
  agentId: string,
  limit = 50
): Promise<{
  agentId: string;
  swarmRunId: string;
  limit: number;
  count: number;
  transcript: TranscriptEntry[];
}> {
  const res = await requestJson<{
    data: {
      agentId: string;
      swarmRunId: string;
      limit: number;
      count: number;
      transcript: TranscriptEntry[];
    };
  }>(
    `/api/agents/${encodeURIComponent(agentId)}/transcript?limit=${limit}`
  );
  return res.data;
}

// Export all functions as a grouped API object
export const agentsApi = {
  spawnAgent,
  listAgents,
  getAgent,
  sendMessage,
  killAgent,
  shutdownAgents,
  getAgentTranscript,
};
