// @vitest-environment jsdom
/**
 * useTeams Hook Tests
 *
 * Tests for the useTeams hook covering:
 * - Fetches teams on mount (when enabled)
 * - Does not fetch when disabled
 * - Returns loading=true initially
 * - Returns error on fetch failure
 * - Clears error on successful retry
 * - createTeam calls API and refreshes
 * - dissolveTeam calls API and refreshes
 * - addTeamMember calls API and refreshes
 * - removeTeamMember calls API and refreshes
 * - selectTeam loads team detail
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTeams } from '../use-teams';
import { teamsApi, type Team } from '@/lib/teams-api';

// Mock the teams-api module
vi.mock('@/lib/teams-api', () => ({
  teamsApi: {
    listTeams: vi.fn(),
    getTeam: vi.fn(),
    createTeam: vi.fn(),
    dissolveTeam: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
  },
}));

const mockTeams: Team[] = [
  {
    id: 'team-1',
    name: 'Red Team Alpha',
    description: 'Offensive operations',
    leadAgentId: 'agent-1',
    status: 'active',
    members: [
      { agentId: 'agent-1', role: 'lead', joinedAt: '2025-01-01T00:00:00Z' },
      { agentId: 'agent-2', role: 'worker', joinedAt: '2025-01-01T00:01:00Z' },
    ],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'team-2',
    name: 'Recon Squad',
    leadAgentId: 'agent-3',
    status: 'active',
    members: [
      { agentId: 'agent-3', role: 'lead', joinedAt: '2025-01-02T00:00:00Z' },
    ],
    createdAt: '2025-01-02T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
  },
];

describe('useTeams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Fetch', () => {
    it('fetches teams on mount when enabled', async () => {
      vi.mocked(teamsApi.listTeams).mockResolvedValue(mockTeams);

      const { result } = await act(async () => {
        return renderHook(() => useTeams({ enabled: true }));
      });

      await waitFor(() => {
        expect(teamsApi.listTeams).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(result.current.teams).toEqual(mockTeams);
        expect(result.current.loading).toBe(false);
      });
    });

    it('does not fetch when enabled=false', async () => {
      vi.mocked(teamsApi.listTeams).mockResolvedValue(mockTeams);

      const { result } = await act(async () => {
        return renderHook(() => useTeams({ enabled: false }));
      });

      expect(teamsApi.listTeams).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(true);
      expect(result.current.teams).toEqual([]);
    });

    it('returns loading=true initially', async () => {
      vi.mocked(teamsApi.listTeams).mockResolvedValue(mockTeams);

      const { result } = await act(async () => {
        return renderHook(() => useTeams({ enabled: false }));
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('returns error on fetch failure', async () => {
      vi.mocked(teamsApi.listTeams).mockRejectedValue(new Error('Network error'));

      const { result } = await act(async () => {
        return renderHook(() => useTeams({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
        expect(result.current.loading).toBe(false);
        expect(result.current.teams).toEqual([]);
      });
    });

    it('clears error on successful retry', async () => {
      vi.mocked(teamsApi.listTeams)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockTeams);

      const { result } = await act(async () => {
        return renderHook(() => useTeams({ enabled: false }));
      });

      // First call → error
      await act(async () => {
        await result.current.refresh();
      });
      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
      });

      // Retry → success
      await act(async () => {
        await result.current.refresh();
      });
      await waitFor(() => {
        expect(result.current.error).toBeNull();
        expect(result.current.teams).toEqual(mockTeams);
      });
    });
  });

  describe('Refresh', () => {
    it('refresh fetches teams and updates state', async () => {
      const updatedTeams: Team[] = [
        {
          id: 'team-3',
          name: 'New Team',
          leadAgentId: 'agent-5',
          status: 'active',
          members: [],
          createdAt: '2025-01-03T00:00:00Z',
          updatedAt: '2025-01-03T00:00:00Z',
        },
      ];

      vi.mocked(teamsApi.listTeams)
        .mockResolvedValueOnce(mockTeams)
        .mockResolvedValueOnce(updatedTeams);

      const { result } = await act(async () => {
        return renderHook(() => useTeams({ enabled: false }));
      });

      // Initial refresh
      await act(async () => {
        await result.current.refresh();
      });
      await waitFor(() => {
        expect(result.current.teams).toEqual(mockTeams);
      });

      // Second refresh
      await act(async () => {
        await result.current.refresh();
      });
      await waitFor(() => {
        expect(result.current.teams).toEqual(updatedTeams);
      });

      expect(teamsApi.listTeams).toHaveBeenCalledTimes(2);
    });
  });

  describe('createTeam', () => {
    it('calls teamsApi.createTeam and refreshes', async () => {
      const newTeam: Team = {
        id: 'team-new',
        name: 'New Team',
        leadAgentId: 'agent-1',
        status: 'active',
        members: [{ agentId: 'agent-1', role: 'lead', joinedAt: '2025-01-01T00:00:00Z' }],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };

      vi.mocked(teamsApi.listTeams).mockResolvedValue(mockTeams);
      vi.mocked(teamsApi.createTeam).mockResolvedValue(newTeam);

      const { result } = await act(async () => {
        return renderHook(() => useTeams({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });
      await waitFor(() => {
        expect(result.current.teams).toEqual(mockTeams);
      });

      const params = { name: 'New Team', leadAgentId: 'agent-1' };
      await act(async () => {
        await result.current.createTeam(params);
      });

      expect(teamsApi.createTeam).toHaveBeenCalledWith(params);
      // listTeams called once for initial refresh, once after create
      expect(teamsApi.listTeams).toHaveBeenCalledTimes(2);
    });
  });

  describe('dissolveTeam', () => {
    it('calls teamsApi.dissolveTeam and refreshes', async () => {
      vi.mocked(teamsApi.listTeams).mockResolvedValue(mockTeams);
      vi.mocked(teamsApi.dissolveTeam).mockResolvedValue({ message: 'Team dissolved' });

      const { result } = await act(async () => {
        return renderHook(() => useTeams({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.dissolveTeam('team-1');
      });

      expect(teamsApi.dissolveTeam).toHaveBeenCalledWith('team-1');
      expect(teamsApi.listTeams).toHaveBeenCalledTimes(2);
    });
  });

  describe('addTeamMember', () => {
    it('calls teamsApi.addMember and refreshes', async () => {
      vi.mocked(teamsApi.listTeams).mockResolvedValue(mockTeams);
      vi.mocked(teamsApi.addMember).mockResolvedValue({
        agentId: 'agent-3',
        role: 'worker',
        joinedAt: '2025-01-01T00:00:00Z',
      });

      const { result } = await act(async () => {
        return renderHook(() => useTeams({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.addTeamMember('team-1', { agentId: 'agent-3', role: 'worker' });
      });

      expect(teamsApi.addMember).toHaveBeenCalledWith('team-1', { agentId: 'agent-3', role: 'worker' });
      expect(teamsApi.listTeams).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeTeamMember', () => {
    it('calls teamsApi.removeMember and refreshes', async () => {
      vi.mocked(teamsApi.listTeams).mockResolvedValue(mockTeams);
      vi.mocked(teamsApi.removeMember).mockResolvedValue(undefined);

      const { result } = await act(async () => {
        return renderHook(() => useTeams({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.removeTeamMember('team-1', 'agent-2');
      });

      expect(teamsApi.removeMember).toHaveBeenCalledWith('team-1', 'agent-2');
      expect(teamsApi.listTeams).toHaveBeenCalledTimes(2);
    });
  });

  describe('selectTeam', () => {
    it('loads team detail via getTeam', async () => {
      const detailTeam: Team = {
        ...mockTeams[0],
        description: 'Detailed description',
      };

      vi.mocked(teamsApi.listTeams).mockResolvedValue(mockTeams);
      vi.mocked(teamsApi.getTeam).mockResolvedValue(detailTeam);

      const { result } = await act(async () => {
        return renderHook(() => useTeams({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.selectTeam('team-1');
      });

      expect(teamsApi.getTeam).toHaveBeenCalledWith('team-1');
      await waitFor(() => {
        expect(result.current.selectedTeam).toEqual(detailTeam);
        expect(result.current.teamLoading).toBe(false);
      });
    });

    it('sets selectedTeam to null when called with null', async () => {
      vi.mocked(teamsApi.listTeams).mockResolvedValue(mockTeams);

      const { result } = await act(async () => {
        return renderHook(() => useTeams({ enabled: false }));
      });

      await act(async () => {
        await result.current.selectTeam(null);
      });

      await waitFor(() => {
        expect(result.current.selectedTeam).toBeNull();
      });
    });

    it('sets error when getTeam fails', async () => {
      vi.mocked(teamsApi.listTeams).mockResolvedValue(mockTeams);
      vi.mocked(teamsApi.getTeam).mockRejectedValue(new Error('Not found'));

      const { result } = await act(async () => {
        return renderHook(() => useTeams({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.selectTeam('team-999');
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Not found');
        expect(result.current.selectedTeam).toBeNull();
        expect(result.current.teamLoading).toBe(false);
      });
    });
  });

  describe('Return Values', () => {
    it('returns correct state structure', async () => {
      vi.mocked(teamsApi.listTeams).mockResolvedValue(mockTeams);

      const { result } = await act(async () => {
        return renderHook(() => useTeams({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current).toHaveProperty('teams');
        expect(result.current).toHaveProperty('loading');
        expect(result.current).toHaveProperty('error');
        expect(result.current).toHaveProperty('refresh');
        expect(result.current).toHaveProperty('selectedTeam');
        expect(result.current).toHaveProperty('selectTeam');
        expect(result.current).toHaveProperty('teamLoading');
        expect(result.current).toHaveProperty('createTeam');
        expect(result.current).toHaveProperty('dissolveTeam');
        expect(result.current).toHaveProperty('addTeamMember');
        expect(result.current).toHaveProperty('removeTeamMember');
      });
    });
  });
});
