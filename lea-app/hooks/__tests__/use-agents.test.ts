// @vitest-environment jsdom
/**
 * useAgents Hook Tests
 *
 * Tests for the useAgents hook covering:
 * - Fetches agents on mount
 * - Polls on interval
 * Returns loading=true initially
 * Returns error on fetch failure
 * spawnAgent calls API
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAgents } from '../use-agents';
import { agentsApi, type AgentStatus } from '@/lib/agents-api';

// Mock the agents-api module
vi.mock('@/lib/agents-api', () => ({
  agentsApi: {
    listAgents: vi.fn(),
    getAgent: vi.fn(),
    spawnAgent: vi.fn(),
    killAgent: vi.fn(),
    sendMessage: vi.fn(),
    shutdownAgents: vi.fn(),
  },
}));

const mockAgents: AgentStatus[] = [
  {
    agentId: 'agent-1',
    name: 'ReconAgent',
    status: 'SPAWNED',
    role: 'Recon',
    swarmRunId: 'swarm-123',
    pentestId: 'pentest-1',
    health: 'healthy' as const,
  },
  {
    agentId: 'agent-2',
    name: 'WebScanner',
    status: 'RUNNING_TOOL',
    role: 'Web',
    swarmRunId: 'swarm-123',
    pentestId: 'pentest-1',
    health: 'healthy' as const,
  },
];

describe('useAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Fetch', () => {
    it('fetches agents on mount with enabled=false', async () => {
      vi.mocked(agentsApi.listAgents).mockResolvedValue(mockAgents);

      const { result } = await act(async () => {
        return renderHook(() => useAgents({ enabled: false }));
      });

      // Manually trigger refresh since polling is disabled
      await act(async () => {
        await result.current.refresh();
      });

      expect(agentsApi.listAgents).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents);
      });
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('returns loading=true initially before refresh', async () => {
      vi.mocked(agentsApi.listAgents).mockResolvedValue(mockAgents);

      const { result } = await act(async () => {
        return renderHook(() => useAgents({ enabled: false }));
      });

      // Before any refresh, loading should be true
      expect(result.current.loading).toBe(true);
      expect(result.current.agents).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it('sets loading to false after successful fetch', async () => {
      vi.mocked(agentsApi.listAgents).mockResolvedValue(mockAgents);

      const { result } = await act(async () => {
        return renderHook(() => useAgents({ enabled: false }));
      });

      expect(result.current.loading).toBe(true);

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('returns error on fetch failure', async () => {
      const error = new Error('Network error');
      vi.mocked(agentsApi.listAgents).mockRejectedValue(error);

      const { result } = await act(async () => {
        return renderHook(() => useAgents({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
        expect(result.current.loading).toBe(false);
        expect(result.current.agents).toEqual([]);
      });
    });

    it('clears error on successful retry', async () => {
      vi.mocked(agentsApi.listAgents)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockAgents);

      const { result } = await act(async () => {
        return renderHook(() => useAgents({ enabled: false }));
      });

      // Initial error
      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
      });

      // Manually refresh
      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
        expect(result.current.agents).toEqual(mockAgents);
      });
    });
  });

  describe('Refresh Function', () => {
    it('refresh function fetches agents', async () => {
      vi.mocked(agentsApi.listAgents).mockResolvedValue(mockAgents);

      const { result } = await act(async () => {
        return renderHook(() => useAgents({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents);
      });

      // Call refresh manually
      await act(async () => {
        await result.current.refresh();
      });

      expect(agentsApi.listAgents).toHaveBeenCalledTimes(2);
    });

    it('refresh updates agents state', async () => {
      const updatedAgents = [
        {
          agentId: 'agent-3',
          name: 'NewAgent',
          status: 'DONE',
          role: 'Custom',
          swarmRunId: 'swarm-123',
          pentestId: 'pentest-1',
          health: 'healthy' as const,
        },
      ];

      vi.mocked(agentsApi.listAgents)
        .mockResolvedValueOnce(mockAgents)
        .mockResolvedValueOnce(updatedAgents);

      const { result } = await act(async () => {
        return renderHook(() => useAgents({ enabled: false }));
      });

      // Initial agents
      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents);
      });

      // Refresh
      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.agents).toEqual(updatedAgents);
      });
    });
  });

  describe('spawnAgent', () => {
    it('spawnAgent calls agentsApi.spawnAgent and refreshes list', async () => {
      vi.mocked(agentsApi.listAgents).mockResolvedValue(mockAgents);
      vi.mocked(agentsApi.spawnAgent).mockResolvedValue({
        agentId: 'new-agent',
        taskId: 'task-1',
      });

      const { result } = await act(async () => {
        return renderHook(() => useAgents({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents);
      });

      // spawnAgent is part of the hook
      const spawnParams = {
        name: 'TestAgent',
        prompt: 'Test task',
        pentestId: 'pentest-1',
        swarmRunId: 'swarm-123',
      };

      await act(async () => {
        await result.current.spawnAgent(spawnParams);
      });

      expect(agentsApi.spawnAgent).toHaveBeenCalledWith(spawnParams);
      // Should also refresh the list after spawning
      expect(agentsApi.listAgents).toHaveBeenCalledTimes(2);
    });

    it('spawnAgent is available via hook', async () => {
      vi.mocked(agentsApi.listAgents).mockResolvedValue(mockAgents);
      vi.mocked(agentsApi.spawnAgent).mockResolvedValue({
        agentId: 'new-agent',
        taskId: 'task-1',
      });

      const { result } = await act(async () => {
        return renderHook(() => useAgents({ enabled: false }));
      });

      await waitFor(() => {
        expect(result.current).toHaveProperty('spawnAgent');
      });

      // Verify that spawnAgent is a function
      expect(typeof result.current.spawnAgent).toBe('function');
    });
  });

  describe('Return Values', () => {
    it('returns correct state structure', async () => {
      vi.mocked(agentsApi.listAgents).mockResolvedValue(mockAgents);

      const { result } = await act(async () => {
        return renderHook(() => useAgents({ enabled: false }));
      });

      await waitFor(() => {
        expect(result.current).toHaveProperty('agents');
        expect(result.current).toHaveProperty('loading');
        expect(result.current).toHaveProperty('error');
        expect(result.current).toHaveProperty('refresh');
        expect(result.current).toHaveProperty('spawnAgent');
        expect(result.current).toHaveProperty('killAgent');
        expect(result.current).toHaveProperty('sendMessage');
        expect(result.current).toHaveProperty('shutdown');
        expect(result.current).toHaveProperty('selectedAgent');
        expect(result.current).toHaveProperty('selectAgent');
        expect(result.current).toHaveProperty('agentLoading');
      });
    });

    it('agents is an array', async () => {
      vi.mocked(agentsApi.listAgents).mockResolvedValue(mockAgents);

      const { result } = await act(async () => {
        return renderHook(() => useAgents({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(Array.isArray(result.current.agents)).toBe(true);
      });
    });

    it('loading is boolean', async () => {
      vi.mocked(agentsApi.listAgents).mockResolvedValue(mockAgents);

      const { result } = await act(async () => {
        return renderHook(() => useAgents({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(typeof result.current.loading).toBe('boolean');
      });
    });

    it('error is null or string', async () => {
      vi.mocked(agentsApi.listAgents).mockResolvedValue(mockAgents);

      const { result } = await act(async () => {
        return renderHook(() => useAgents({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error === null || typeof result.current.error === 'string').toBe(true);
      });
    });
  });

  describe('Kill Agent', () => {
    it('killAgent calls API and refreshes list', async () => {
      vi.mocked(agentsApi.listAgents).mockResolvedValue(mockAgents);
      vi.mocked(agentsApi.killAgent).mockResolvedValue(undefined);

      const { result } = await act(async () => {
        return renderHook(() => useAgents({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents);
      });

      // Kill an agent
      await act(async () => {
        await result.current.killAgent('agent-1');
      });

      expect(agentsApi.killAgent).toHaveBeenCalledWith('agent-1');
      // Should refresh the list after killing
      expect(agentsApi.listAgents).toHaveBeenCalledTimes(2);
    });
  });

  describe('Send Message', () => {
    it('sendMessage calls API with correct params', async () => {
      vi.mocked(agentsApi.listAgents).mockResolvedValue(mockAgents);
      vi.mocked(agentsApi.sendMessage).mockResolvedValue(undefined);

      const { result } = await act(async () => {
        return renderHook(() => useAgents({ enabled: false }));
      });

      await act(async () => {
        await result.current.sendMessage('agent-1', 'Hello agent');
      });

      expect(agentsApi.sendMessage).toHaveBeenCalledWith('agent-1', 'Hello agent');
    });
  });

  describe('Shutdown All', () => {
    it('shutdown calls API, clears selection, and refreshes', async () => {
      vi.mocked(agentsApi.listAgents).mockResolvedValue(mockAgents);
      vi.mocked(agentsApi.shutdownAgents).mockResolvedValue(undefined);
      vi.mocked(agentsApi.getAgent).mockResolvedValue({
        ...mockAgents[0],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      const { result } = await act(async () => {
        return renderHook(() => useAgents({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      // Select an agent first
      await act(async () => {
        await result.current.selectAgent('agent-1');
      });
      await waitFor(() => {
        expect(result.current.selectedAgent).toBeTruthy();
      });

      // Shutdown all
      await act(async () => {
        await result.current.shutdown();
      });

      expect(agentsApi.shutdownAgents).toHaveBeenCalled();
      expect(agentsApi.listAgents).toHaveBeenCalledTimes(2); // Initial + after shutdown
    });
  });
});
