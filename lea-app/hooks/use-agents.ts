/**
 * useAgents Hook
 *
 * Polls the agents API every 5 seconds to keep the agent list fresh.
 * Handles loading, error, and retry states.
 *
 * This is the SINGLE SOURCE OF TRUTH for agent data in the frontend.
 * All components should use this hook instead of calling agentsApi directly.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  agentsApi,
  type AgentStatus,
  type AgentDetail,
  type SpawnAgentParams,
} from '@/lib/agents-api';

interface UseAgentsOptions {
  /**
   * Polling interval in milliseconds (default: 5000)
   */
  interval?: number;
  /**
   * Whether to enable polling (default: true)
   */
  enabled?: boolean;
}

export function useAgents(options: UseAgentsOptions = {}) {
  const { interval = 5000, enabled = true } = options;

  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentDetail | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);

  // Use ref to track if component is mounted
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const data = await agentsApi.listAgents();
      if (mountedRef.current) {
        setAgents(data);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch agents';
        setError(msg);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    refresh();

    // Set up polling
    const intervalId = setInterval(refresh, interval);

    // Cleanup
    return () => {
      mountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [enabled, interval, refresh]);

  // Spawn agent action
  const spawnAgent = useCallback(async (params: SpawnAgentParams) => {
    const result = await agentsApi.spawnAgent(params);
    // Refresh after spawning
    await refresh();
    return result;
  }, [refresh]);

  // Kill agent action
  const killAgent = useCallback(async (agentId: string) => {
    await agentsApi.killAgent(agentId);
    // Refresh after killing
    await refresh();
  }, [refresh]);

  // Send message action
  const sendMessage = useCallback(async (agentId: string, text: string) => {
    await agentsApi.sendMessage(agentId, text);
    // No refresh needed - message is delivered asynchronously
  }, []);

  // Shutdown all action
  const shutdown = useCallback(async () => {
    await agentsApi.shutdownAgents();
    // Refresh after shutdown
    await refresh();
  }, [refresh]);

  // Select agent to view details
  const selectAgent = useCallback(async (agentId: string | null) => {
    setSelectedAgentId(agentId);
    if (!agentId) {
      setSelectedAgent(null);
      return;
    }
    setAgentLoading(true);
    try {
      const detail = await agentsApi.getAgent(agentId);
      setSelectedAgent(detail);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load agent details';
      setError(msg);
      setSelectedAgent(null);
    } finally {
      setAgentLoading(false);
    }
  }, []);

  return {
    agents,
    loading,
    error,
    refresh,
    selectedAgent,
    selectAgent,
    agentLoading,
    spawnAgent,
    killAgent,
    sendMessage,
    shutdown,
  };
}

/**
 * Hook for managing selected agent details.
 * Separated from useAgents for better performance when details aren't needed.
 */
export function useSelectedAgent(agentId: string | null) {
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const loadAgent = useCallback(async () => {
    if (!agentId || !mountedRef.current) {
      if (mountedRef.current) {
        setAgent(null);
        setError(null);
      }
      return;
    }

    setLoading(true);
    try {
      const detail = await agentsApi.getAgent(agentId);
      if (mountedRef.current) {
        setAgent(detail);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : 'Failed to load agent details';
        setError(msg);
        setAgent(null);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [agentId]);

  // Load agent when ID changes
  useEffect(() => {
    loadAgent();
    return () => {
      mountedRef.current = false;
    };
  }, [loadAgent]);

  return {
    agent,
    loading,
    error,
    refresh: loadAgent,
  };
}
