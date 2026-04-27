// @vitest-environment jsdom

import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { statsApi, type GlobalStats, type SessionStats } from '@/lib/stats-api';
import { useSessionStats } from '../use-session-stats';

vi.mock('@/lib/stats-api', () => ({
  statsApi: {
    getGlobal: vi.fn(),
    getSession: vi.fn(),
  },
}));

const globalStats: GlobalStats = {
  totalInputTokens: 1200,
  totalOutputTokens: 400,
  totalCostUsd: 0.12,
  totalCalls: 3,
  sessionCount: 1,
  activeModels: ['claude'],
};

const sessionStats: SessionStats = {
  sessionId: 'session-1',
  timestamp: '2026-04-25T00:00:00.000Z',
  llm: {
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    costUsd: 0.01,
    callCount: 1,
    models: ['claude'],
    lastModel: 'claude',
  },
  swarm: {
    activeAgents: 0,
    idleAgents: 0,
    totalAgents: 0,
    findingsCount: 0,
  },
  tasks: {
    pending: 0,
    inProgress: 0,
    completed: 0,
    total: 0,
  },
  permissions: {
    pending: 0,
  },
};

describe('useSessionStats', () => {
  beforeEach(() => {
    vi.mocked(statsApi.getGlobal).mockResolvedValue(globalStats);
    vi.mocked(statsApi.getSession).mockResolvedValue(sessionStats);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const flushPromises = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it('fetches once on mount and waits for the polling interval before refetching', async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useSessionStats('session-1', 15_000));

    await flushPromises();

    expect(result.current.isLoading).toBe(false);
    expect(statsApi.getGlobal).toHaveBeenCalledTimes(1);
    expect(statsApi.getSession).toHaveBeenCalledTimes(1);
    expect(result.current.global).toEqual(globalStats);
    expect(result.current.session).toEqual(sessionStats);

    await flushPromises();

    expect(statsApi.getGlobal).toHaveBeenCalledTimes(1);
    expect(statsApi.getSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999);
    });

    expect(statsApi.getGlobal).toHaveBeenCalledTimes(1);
    expect(statsApi.getSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(statsApi.getGlobal).toHaveBeenCalledTimes(2);
    expect(statsApi.getSession).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('refreshes stats manually without requiring a session id', async () => {
    const { result } = renderHook(() => useSessionStats(undefined, 15_000));

    await flushPromises();

    expect(result.current.isLoading).toBe(false);
    expect(statsApi.getGlobal).toHaveBeenCalledTimes(1);
    expect(statsApi.getSession).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.refresh();
    });

    expect(statsApi.getGlobal).toHaveBeenCalledTimes(2);
    expect(statsApi.getSession).not.toHaveBeenCalled();
  });
});
