/**
 * useTeams Hook
 *
 * Polls the teams API every 10 seconds to keep the team list fresh.
 * Handles loading, error, and retry states.
 *
 * This is the SINGLE SOURCE OF TRUTH for team data in the frontend.
 * All components should use this hook instead of calling teamsApi directly.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  teamsApi,
  type Team,
  type CreateTeamParams,
  type AddMemberParams,
} from '@/lib/teams-api';

interface UseTeamsOptions {
  /**
   * Polling interval in milliseconds (default: 10000)
   */
  interval?: number;
  /**
   * Whether to enable polling (default: true)
   */
  enabled?: boolean;
}

export function useTeams(options: UseTeamsOptions = {}) {
  const { interval = 10000, enabled = true } = options;

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);

  // Use ref to track if component is mounted
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const data = await teamsApi.listTeams();
      if (mountedRef.current) {
        setTeams(data);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch teams';
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

  // Create team action
  const createTeam = useCallback(async (params: CreateTeamParams) => {
    const result = await teamsApi.createTeam(params);
    // Refresh after creating
    await refresh();
    return result;
  }, [refresh]);

  // Dissolve team action
  const dissolveTeam = useCallback(async (teamId: string) => {
    await teamsApi.dissolveTeam(teamId);
    // Refresh after dissolving
    await refresh();
  }, [refresh]);

  // Add member action
  const addTeamMember = useCallback(async (teamId: string, params: AddMemberParams) => {
    const result = await teamsApi.addMember(teamId, params);
    // Refresh after adding member
    await refresh();
    return result;
  }, [refresh]);

  // Remove member action
  const removeTeamMember = useCallback(async (teamId: string, agentId: string) => {
    await teamsApi.removeMember(teamId, agentId);
    // Refresh after removing member
    await refresh();
  }, [refresh]);

  // Select team to view details
  const selectTeam = useCallback(async (teamId: string | null) => {
    setSelectedTeamId(teamId);
    if (!teamId) {
      setSelectedTeam(null);
      return;
    }
    setTeamLoading(true);
    try {
      const team = await teamsApi.getTeam(teamId);
      setSelectedTeam(team);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load team details';
      setError(msg);
      setSelectedTeam(null);
    } finally {
      setTeamLoading(false);
    }
  }, []);

  return {
    teams,
    loading,
    error,
    refresh,
    selectedTeam,
    selectTeam,
    teamLoading,
    createTeam,
    dissolveTeam,
    addTeamMember,
    removeTeamMember,
  };
}
