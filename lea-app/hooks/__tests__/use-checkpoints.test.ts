// @vitest-environment jsdom
/**
 * useCheckpoints Hook Tests
 *
 * Tests for the checkpoints hook covering:
 * - Fetches checkpoints on mount when pentestId provided
 * - Does not fetch when pentestId is null
 * - create() calls API and triggers refresh
 * - rewind() calls API and returns preRewindCheckpointId
 * - Handles API errors gracefully (empty array, null returns)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCheckpoints } from '../use-checkpoints';

// Mock api module
vi.mock('@/lib/api', () => ({
  pentestsApi: {
    getCheckpoints: vi.fn(),
    createCheckpoint: vi.fn(),
    rewindToCheckpoint: vi.fn(),
  },
}));

import { pentestsApi } from '@/lib/api';

const mockedGetCheckpoints = vi.mocked(pentestsApi.getCheckpoints);
const mockedCreateCheckpoint = vi.mocked(pentestsApi.createCheckpoint);
const mockedRewindToCheckpoint = vi.mocked(pentestsApi.rewindToCheckpoint);

// ============================================================================
// FIXTURES
// ============================================================================

const mockCheckpoints = [
  {
    id: 'cp-1',
    pentest_id: 'pt-1',
    trigger: 'MANUAL' as const,
    label: 'Before exploitation',
    message_sequence: 42,
    pentest_phase: 'VULN_SCAN',
    finding_ids: ['f-1', 'f-2'],
    todos_snapshot: [{ id: 't-1', content: 'Run nmap', status: 'COMPLETED', priority: 1 }],
    agents_snapshot: [{ agentId: 'a-1', role: 'recon', status: 'DONE' }],
    context_snapshot_id: 'cs-1',
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'cp-2',
    pentest_id: 'pt-1',
    trigger: 'PHASE_CHANGE' as const,
    label: 'Phase transition',
    message_sequence: 28,
    pentest_phase: 'RECON_ACTIVE',
    finding_ids: [],
    todos_snapshot: [],
    agents_snapshot: [],
    context_snapshot_id: null,
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
];

// ============================================================================
// TESTS
// ============================================================================

describe('useCheckpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetching behavior', () => {
    it('fetches checkpoints on mount when pentestId is provided', async () => {
      mockedGetCheckpoints.mockResolvedValueOnce({ data: { items: mockCheckpoints, total: 2 } });

      const { result } = renderHook(() => useCheckpoints('pt-1'));

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.checkpoints).toEqual(mockCheckpoints);
      expect(mockedGetCheckpoints).toHaveBeenCalledTimes(1);
      expect(mockedGetCheckpoints).toHaveBeenCalledWith('pt-1');
    });

    it('does not fetch when pentestId is null', () => {
      const { result } = renderHook(() => useCheckpoints(null));

      expect(result.current.checkpoints).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(mockedGetCheckpoints).not.toHaveBeenCalled();
    });

    it('only fetches once on mount (no polling)', async () => {
      mockedGetCheckpoints.mockResolvedValue({ data: { items: mockCheckpoints, total: 2 } });

      const { result } = renderHook(() => useCheckpoints('pt-1'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Wait a bit — should NOT call again
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      expect(mockedGetCheckpoints).toHaveBeenCalledTimes(1);
    });
  });

  describe('create()', () => {
    it('calls API then refreshes checkpoints', async () => {
      mockedGetCheckpoints
        .mockResolvedValueOnce({ data: { items: [mockCheckpoints[0]], total: 1 } })
        .mockResolvedValueOnce({ data: { items: mockCheckpoints, total: 2 } });

      mockedCreateCheckpoint.mockResolvedValueOnce({
        data: {
          id: 'cp-new',
          pentest_id: 'pt-1',
          trigger: 'MANUAL' as const,
          label: 'New checkpoint',
          message_sequence: 50,
          pentest_phase: 'EXPLOITATION',
          finding_ids: [],
          todos_snapshot: [],
          agents_snapshot: [],
          context_snapshot_id: null,
          created_at: new Date().toISOString(),
        },
      });

      const { result } = renderHook(() => useCheckpoints('pt-2'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.checkpoints).toHaveLength(1);

      // Create a new checkpoint with label
      await act(async () => {
        await result.current.create('Manual save');
      });

      // Should have called create API
      expect(mockedCreateCheckpoint).toHaveBeenCalledWith('pt-2', { label: 'Manual save' });

      // Should have refreshed (second getCheckpoints call)
      await waitFor(() => {
        expect(result.current.checkpoints).toHaveLength(2);
      });
      expect(mockedGetCheckpoints).toHaveBeenCalledTimes(2);
    });

    it('calls API without label when none provided', async () => {
      mockedGetCheckpoints.mockResolvedValueOnce({ data: { items: [], total: 0 } });
      mockedCreateCheckpoint.mockResolvedValueOnce({
        data: {
          id: 'cp-new',
          pentest_id: 'pt-3',
          trigger: 'MANUAL' as const,
          label: '',
          message_sequence: 10,
          pentest_phase: 'RECON_PASSIVE',
          finding_ids: [],
          todos_snapshot: [],
          agents_snapshot: [],
          context_snapshot_id: null,
          created_at: new Date().toISOString(),
        },
      });

      const { result } = renderHook(() => useCheckpoints('pt-3'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.create();
      });

      expect(mockedCreateCheckpoint).toHaveBeenCalledWith('pt-3', undefined);
    });
  });

  describe('rewind()', () => {
    it('calls API, returns preRewindCheckpointId, and refreshes', async () => {
      mockedGetCheckpoints
        .mockResolvedValueOnce({ data: { items: mockCheckpoints, total: 2 } })
        .mockResolvedValueOnce({ data: { items: [mockCheckpoints[0]], total: 1 } });

      mockedRewindToCheckpoint.mockResolvedValueOnce({
        data: {
          preRewindCheckpointId: 'cp-pre-rewind-1',
          rewoundAt: new Date().toISOString(),
        },
      });

      const { result } = renderHook(() => useCheckpoints('pt-4'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let rewindResult: string | null = 'NOT_SET';
      await act(async () => {
        rewindResult = await result.current.rewind('cp-1');
      });

      expect(mockedRewindToCheckpoint).toHaveBeenCalledWith('pt-4', 'cp-1');
      expect(rewindResult).toBe('cp-pre-rewind-1');

      // Should have refreshed
      await waitFor(() => {
        expect(result.current.checkpoints).toHaveLength(1);
      });
      expect(mockedGetCheckpoints).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('returns empty array when API throws on initial fetch', async () => {
      mockedGetCheckpoints.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useCheckpoints('pt-5'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.checkpoints).toEqual([]);
    });

    it('returns empty array when backend returns no data', async () => {
      mockedGetCheckpoints.mockResolvedValueOnce({ data: null } as never);

      const { result } = renderHook(() => useCheckpoints('pt-6'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.checkpoints).toEqual([]);
    });

    it('rewind returns null on API error without crashing', async () => {
      mockedGetCheckpoints.mockResolvedValueOnce({ data: { items: mockCheckpoints, total: 2 } });
      mockedRewindToCheckpoint.mockRejectedValueOnce(new Error('Server error'));
      // Refresh call after error
      mockedGetCheckpoints.mockResolvedValueOnce({ data: { items: mockCheckpoints, total: 2 } });

      const { result } = renderHook(() => useCheckpoints('pt-7'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let rewindResult: string | null = 'NOT_SET';
      await act(async () => {
        rewindResult = await result.current.rewind('cp-bad');
      });

      expect(rewindResult).toBeNull();
    });

    it('create does not throw on API error', async () => {
      mockedGetCheckpoints.mockResolvedValueOnce({ data: { items: [], total: 0 } });
      mockedCreateCheckpoint.mockRejectedValueOnce(new Error('Create failed'));
      mockedGetCheckpoints.mockResolvedValueOnce({ data: { items: [], total: 0 } });

      const { result } = renderHook(() => useCheckpoints('pt-8'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Should not throw
      await act(async () => {
        await result.current.create('should not throw');
      });

      expect(mockedCreateCheckpoint).toHaveBeenCalled();
    });
  });

  describe('refresh()', () => {
    it('re-fetches checkpoints when called', async () => {
      mockedGetCheckpoints
        .mockResolvedValueOnce({ data: { items: [mockCheckpoints[0]], total: 1 } })
        .mockResolvedValueOnce({ data: { items: mockCheckpoints, total: 2 } });

      const { result } = renderHook(() => useCheckpoints('pt-9'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.checkpoints).toHaveLength(1);

      // Trigger refresh
      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.checkpoints).toHaveLength(2);
      });

      expect(mockedGetCheckpoints).toHaveBeenCalledTimes(2);
    });
  });
});
