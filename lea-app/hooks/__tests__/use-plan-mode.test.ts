// @vitest-environment jsdom
/**
 * usePlanMode Hook Tests
 *
 * Tests for the usePlanMode hook covering:
 * - Fetches agent states on mount (when enabled)
 * - Does not fetch when disabled
 * - Returns loading=true initially
 * - Returns isInPlanMode correctly
 * - enterPlanMode calls API and refreshes
 * - exitPlanMode calls API and refreshes
 * - Returns error on fetch failure
 * - Clears error on successful retry
 * - Returns correct state structure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePlanMode } from '../use-plan-mode';
import { planModeApi, type PlanModeState } from '@/lib/plan-mode-api';

// Mock the plan-mode-api module
vi.mock('@/lib/plan-mode-api', () => ({
  planModeApi: {
    listAgents: vi.fn(),
    getState: vi.fn(),
    enter: vi.fn(),
    exit: vi.fn(),
  },
}));

const mockPlanModeStates: PlanModeState[] = [
  {
    agentId: 'agent-1',
    mode: 'plan',
    enteredAt: Date.now(),
    reason: 'Manual planning phase',
  },
  {
    agentId: 'agent-2',
    mode: 'default',
  },
];

describe('usePlanMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Fetch', () => {
    it('fetches agent states on mount when enabled', async () => {
      vi.mocked(planModeApi.listAgents).mockResolvedValue(mockPlanModeStates);

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ enabled: true }));
      });

      await waitFor(() => {
        expect(planModeApi.listAgents).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(result.current.agentsInPlanMode).toEqual(mockPlanModeStates);
        expect(result.current.loading).toBe(false);
      });
    });

    it('does not fetch when enabled=false', async () => {
      vi.mocked(planModeApi.listAgents).mockResolvedValue(mockPlanModeStates);

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ enabled: false }));
      });

      expect(planModeApi.listAgents).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(true);
      expect(result.current.agentsInPlanMode).toEqual([]);
    });

    it('returns loading=true initially', async () => {
      vi.mocked(planModeApi.listAgents).mockResolvedValue(mockPlanModeStates);

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ enabled: false }));
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  describe('isInPlanMode', () => {
    it('returns isInPlanMode=true when agent is in plan mode', async () => {
      vi.mocked(planModeApi.listAgents).mockResolvedValue(mockPlanModeStates);
      vi.mocked(planModeApi.getState).mockResolvedValue(mockPlanModeStates[0]);

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ agentId: 'agent-1', enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.isInPlanMode).toBe(true);
        expect(result.current.currentAgentState?.mode).toBe('plan');
      });
    });

    it('returns isInPlanMode=false when agent is in default mode', async () => {
      vi.mocked(planModeApi.listAgents).mockResolvedValue(mockPlanModeStates);
      vi.mocked(planModeApi.getState).mockResolvedValue(mockPlanModeStates[1]);

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ agentId: 'agent-2', enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.isInPlanMode).toBe(false);
        expect(result.current.currentAgentState?.mode).toBe('default');
      });
    });
  });

  describe('planModeAgentsCount', () => {
    it('returns correct count of agents', async () => {
      vi.mocked(planModeApi.listAgents).mockResolvedValue(mockPlanModeStates);

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.planModeAgentsCount).toBe(2);
      });
    });

    it('returns 0 when no agents', async () => {
      vi.mocked(planModeApi.listAgents).mockResolvedValue([]);

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.planModeAgentsCount).toBe(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('returns error on fetch failure', async () => {
      vi.mocked(planModeApi.listAgents).mockRejectedValue(new Error('Network error'));

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
        expect(result.current.loading).toBe(false);
        expect(result.current.agentsInPlanMode).toEqual([]);
      });
    });

    it('clears error on successful retry', async () => {
      vi.mocked(planModeApi.listAgents)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockPlanModeStates);

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ enabled: false }));
      });

      // First call -> error
      await act(async () => {
        await result.current.refresh();
      });
      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
      });

      // Retry -> success
      await act(async () => {
        await result.current.refresh();
      });
      await waitFor(() => {
        expect(result.current.error).toBeNull();
        expect(result.current.agentsInPlanMode).toEqual(mockPlanModeStates);
      });
    });
  });

  describe('enterPlanMode', () => {
    it('calls planModeApi.enter and refreshes', async () => {
      const enteredState: PlanModeState = {
        agentId: 'agent-1',
        mode: 'plan',
        enteredAt: Date.now(),
      };

      vi.mocked(planModeApi.listAgents).mockResolvedValue(mockPlanModeStates);
      vi.mocked(planModeApi.getState).mockResolvedValue(enteredState);
      vi.mocked(planModeApi.enter).mockResolvedValue(enteredState);

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ agentId: 'agent-1', enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });
      await waitFor(() => {
        expect(result.current.agentsInPlanMode).toEqual(mockPlanModeStates);
      });

      await act(async () => {
        await result.current.enterPlanMode();
      });

      expect(planModeApi.enter).toHaveBeenCalledWith('agent-1', undefined);
      // listAgents called once for initial refresh, once after enter
      expect(planModeApi.listAgents).toHaveBeenCalledTimes(2);
    });

    it('calls enter with reason', async () => {
      vi.mocked(planModeApi.listAgents).mockResolvedValue(mockPlanModeStates);
      vi.mocked(planModeApi.getState).mockResolvedValue(mockPlanModeStates[0]);
      vi.mocked(planModeApi.enter).mockResolvedValue(mockPlanModeStates[0]);

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ agentId: 'agent-1', enabled: false }));
      });

      await act(async () => {
        await result.current.enterPlanMode(undefined, 'Planning phase');
      });

      expect(planModeApi.enter).toHaveBeenCalledWith('agent-1', 'Planning phase');
    });

    it('does nothing when no agentId is provided or configured', async () => {
      vi.mocked(planModeApi.listAgents).mockResolvedValue(mockPlanModeStates);

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ enabled: false }));
      });

      await act(async () => {
        await result.current.enterPlanMode();
      });

      expect(planModeApi.enter).not.toHaveBeenCalled();
    });

    it('sets error on enter failure', async () => {
      vi.mocked(planModeApi.listAgents).mockResolvedValue(mockPlanModeStates);
      vi.mocked(planModeApi.getState).mockResolvedValue(mockPlanModeStates[0]);
      vi.mocked(planModeApi.enter).mockRejectedValue(new Error('Enter failed'));

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ agentId: 'agent-1', enabled: false }));
      });

      await act(async () => {
        await result.current.enterPlanMode();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Enter failed');
      });
    });
  });

  describe('exitPlanMode', () => {
    it('calls planModeApi.exit and refreshes', async () => {
      const exitedState: PlanModeState = {
        agentId: 'agent-1',
        mode: 'default',
      };

      vi.mocked(planModeApi.listAgents).mockResolvedValue(mockPlanModeStates);
      vi.mocked(planModeApi.getState).mockResolvedValue(exitedState);
      vi.mocked(planModeApi.exit).mockResolvedValue(exitedState);

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ agentId: 'agent-1', enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.exitPlanMode();
      });

      expect(planModeApi.exit).toHaveBeenCalledWith('agent-1', undefined);
      // listAgents called once for initial refresh, once after exit
      expect(planModeApi.listAgents).toHaveBeenCalledTimes(2);
    });

    it('calls exit with reason', async () => {
      vi.mocked(planModeApi.listAgents).mockResolvedValue(mockPlanModeStates);
      vi.mocked(planModeApi.getState).mockResolvedValue(mockPlanModeStates[0]);
      vi.mocked(planModeApi.exit).mockResolvedValue(mockPlanModeStates[0]);

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ agentId: 'agent-1', enabled: false }));
      });

      await act(async () => {
        await result.current.exitPlanMode(undefined, 'Done planning');
      });

      expect(planModeApi.exit).toHaveBeenCalledWith('agent-1', 'Done planning');
    });

    it('does nothing when no agentId is provided or configured', async () => {
      vi.mocked(planModeApi.listAgents).mockResolvedValue(mockPlanModeStates);

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ enabled: false }));
      });

      await act(async () => {
        await result.current.exitPlanMode();
      });

      expect(planModeApi.exit).not.toHaveBeenCalled();
    });

    it('sets error on exit failure', async () => {
      vi.mocked(planModeApi.listAgents).mockResolvedValue(mockPlanModeStates);
      vi.mocked(planModeApi.getState).mockResolvedValue(mockPlanModeStates[0]);
      vi.mocked(planModeApi.exit).mockRejectedValue(new Error('Exit failed'));

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ agentId: 'agent-1', enabled: false }));
      });

      await act(async () => {
        await result.current.exitPlanMode();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Exit failed');
      });
    });
  });

  describe('Return Values', () => {
    it('returns correct state structure', async () => {
      vi.mocked(planModeApi.listAgents).mockResolvedValue(mockPlanModeStates);

      const { result } = await act(async () => {
        return renderHook(() => usePlanMode({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current).toHaveProperty('agentsInPlanMode');
        expect(result.current).toHaveProperty('currentAgentState');
        expect(result.current).toHaveProperty('isInPlanMode');
        expect(result.current).toHaveProperty('planModeAgentsCount');
        expect(result.current).toHaveProperty('loading');
        expect(result.current).toHaveProperty('error');
        expect(result.current).toHaveProperty('refresh');
        expect(result.current).toHaveProperty('enterPlanMode');
        expect(result.current).toHaveProperty('exitPlanMode');
      });
    });
  });
});
