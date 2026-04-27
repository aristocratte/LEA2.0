// @vitest-environment jsdom
/**
 * useAwaySummary Hook Tests
 *
 * Tests for the away summary hook covering:
 * - Fetches summary on mount with pentestId
 * - Does not fetch when pentestId is null
 * - Passes `since` from localStorage to API
 * - Updates visitedAt after fetch
 * - Returns null on API error
 * - Dismiss functionality works
 * - Only fetches once (not polling)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAwaySummary } from '../use-away-summary';

// Mock api module
vi.mock('@/lib/api', () => ({
  requestJson: vi.fn(),
}));

import { requestJson } from '@/lib/api';

// Mock localStorage (jsdom may not have full support)
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

const mockedRequestJson = vi.mocked(requestJson);

// ============================================================================
// FIXTURES
// ============================================================================

const mockSummary = {
  hasActivity: true,
  headline: '2 findings, 1 agent active',
  highlights: [
    { kind: 'finding' as const, text: 'SQL Injection in login form', detail: 'severity: critical' },
    { kind: 'memory' as const, text: 'nginx/1.24 on :80' },
    { kind: 'agent' as const, text: '1 agent still running' },
  ],
  stats: {
    agentsActive: 1,
    agentsCompleted: 0,
    findingsNew: 2,
    memoriesExtracted: 1,
    tasksCompleted: 0,
    errorsCount: 0,
  },
  period: {
    since: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    until: new Date().toISOString(),
  },
};

// ============================================================================
// TESTS
// ============================================================================

describe('useAwaySummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('fetching behavior', () => {
    it('fetches summary on mount when pentestId is provided', async () => {
      mockedRequestJson.mockResolvedValueOnce({ data: mockSummary });

      const { result } = renderHook(() => useAwaySummary('pt-1'));

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.summary).toEqual(mockSummary);
      expect(mockedRequestJson).toHaveBeenCalledTimes(1);
      expect(mockedRequestJson).toHaveBeenCalledWith(
        expect.stringContaining('/api/pentests/pt-1/away-summary'),
        expect.any(Object),
      );
    });

    it('does not fetch when pentestId is null', () => {
      const { result } = renderHook(() => useAwaySummary(null));

      expect(result.current.summary).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(mockedRequestJson).not.toHaveBeenCalled();
    });

    it('only fetches once (no polling)', async () => {
      mockedRequestJson.mockResolvedValue({ data: mockSummary });

      const { result } = renderHook(() => useAwaySummary('pt-1'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Wait a bit — should NOT call again
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      expect(mockedRequestJson).toHaveBeenCalledTimes(1);
    });
  });

  describe('localStorage visitedAt', () => {
    it('passes since timestamp from localStorage when available', async () => {
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      localStorage.setItem('lea:visitedAt:pt-2', since);

      mockedRequestJson.mockResolvedValueOnce({ data: mockSummary });

      renderHook(() => useAwaySummary('pt-2'));

      await waitFor(() => expect(mockedRequestJson).toHaveBeenCalled());

      const callArgs = mockedRequestJson.mock.calls[0][1] as { query?: Record<string, string> };
      expect(callArgs.query?.since).toBe(since);
    });

    it('does not pass since when no previous visit in storage', async () => {
      mockedRequestJson.mockResolvedValueOnce({ data: mockSummary });

      renderHook(() => useAwaySummary('pt-3'));

      await waitFor(() => expect(mockedRequestJson).toHaveBeenCalled());

      const callArgs = mockedRequestJson.mock.calls[0][1] as { query?: Record<string, string> };
      expect(callArgs.query?.since).toBeUndefined();
    });

    it('updates visitedAt after successful fetch', async () => {
      mockedRequestJson.mockResolvedValueOnce({ data: mockSummary });

      const { result } = renderHook(() => useAwaySummary('pt-4'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stored = localStorage.getItem('lea:visitedAt:pt-4');
      expect(stored).toBeTruthy();
      // Should be a valid ISO date within last few seconds
      const storedDate = new Date(stored!);
      const ageMs = Date.now() - storedDate.getTime();
      expect(ageMs).toBeLessThan(5000); // < 5s ago
    });
  });

  describe('error handling', () => {
    it('returns null summary when API throws', async () => {
      mockedRequestJson.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAwaySummary('pt-5'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.summary).toBeNull();
    });

    it('returns null when backend returns no data', async () => {
      mockedRequestJson.mockResolvedValueOnce({ data: null });

      const { result } = renderHook(() => useAwaySummary('pt-6'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.summary).toBeNull();
    });
  });

  describe('dismiss', () => {
    it('starts undismissed and can be dismissed', async () => {
      mockedRequestJson.mockResolvedValueOnce({ data: mockSummary });

      const { result } = renderHook(() => useAwaySummary('pt-7'));

      await waitFor(() => expect(result.current.summary).not.toBeNull());

      expect(result.current.dismissed).toBe(false);

      act(() => {
        result.current.dismiss();
      });

      expect(result.current.dismissed).toBe(true);
    });
  });
});
