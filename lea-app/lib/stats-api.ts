/**
 * Stats API client — cost tracking and session statistics.
 */

import { requestJson } from './api';

export interface GlobalStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalCalls: number;
  sessionCount: number;
  activeModels: string[];
}

export interface SessionStats {
  sessionId: string;
  timestamp: string;
  llm: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    callCount: number;
    models: string[];
    lastModel: string | null;
  };
  swarm: {
    activeAgents: number;
    idleAgents: number;
    totalAgents: number;
    findingsCount: number;
  };
  tasks: {
    pending: number;
    inProgress: number;
    completed: number;
    total: number;
  };
  permissions: {
    pending: number;
  };
}

export const statsApi = {
  /** Get global usage stats */
  async getGlobal(): Promise<GlobalStats> {
    const res = await requestJson<{ data: GlobalStats }>('/api/stats/global');
    return res.data;
  },

  /** Get per-session stats */
  async getSession(sessionId: string): Promise<SessionStats> {
    const res = await requestJson<{ data: SessionStats }>(`/api/stats/session/${encodeURIComponent(sessionId)}`);
    return res.data;
  },
};
