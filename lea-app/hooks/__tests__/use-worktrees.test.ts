/**
 * useWorktrees Hook Tests
 *
 * @vitest-environment jsdom
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWorktrees } from '@/hooks/use-worktrees';
import { worktreesApi } from '@/lib/worktrees-api';

// Mock the worktrees API
vi.mock('@/lib/worktrees-api', () => ({
  worktreesApi: {
    list: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    getActive: vi.fn(),
    getSessionActive: vi.fn(),
    deactivateSession: vi.fn(),
  },
}));

describe('useWorktrees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Don't use fake timers by default - only for specific polling tests
  });

  it('fetches worktree list on mount', async () => {
    const mockWorktrees = [
      {
        slug: 'test-1',
        worktreePath: '/path/to/test-1',
        branch: 'feature/test-1',
        agentId: 'agent-1',
        createdAt: '2024-01-01T00:00:00Z',
        hasChanges: false,
      },
    ];

    vi.mocked(worktreesApi.list).mockResolvedValue(mockWorktrees);
    vi.mocked(worktreesApi.getSessionActive).mockResolvedValue(null);

    const { result } = renderHook(() => useWorktrees());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(worktreesApi.list).toHaveBeenCalledTimes(1);
    expect(result.current.worktrees).toEqual(mockWorktrees);
  });

  it('activeWorktree is null when no worktrees exist', async () => {
    vi.mocked(worktreesApi.list).mockResolvedValue([]);
    vi.mocked(worktreesApi.getSessionActive).mockResolvedValue(null);

    const { result } = renderHook(() => useWorktrees());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activeWorktree).toBeNull();
    expect(result.current.worktrees).toEqual([]);
  });

  it('activeWorktree is set when backend returns one for agent', async () => {
    const mockWorktrees = [
      {
        slug: 'agent-1-worktree',
        worktreePath: '/path/to/agent-1',
        branch: 'feature/agent-1',
        agentId: 'agent-1',
        createdAt: '2024-01-01T00:00:00Z',
        hasChanges: false,
      },
    ];

    const mockActive = {
      slug: 'agent-1-worktree',
      worktreePath: '/path/to/agent-1',
      branch: 'feature/agent-1',
      agentId: 'agent-1',
      hasChanges: false,
    };

    vi.mocked(worktreesApi.list).mockResolvedValue(mockWorktrees);
    vi.mocked(worktreesApi.getActive).mockResolvedValue(mockActive);

    const { result } = renderHook(() => useWorktrees({ agentId: 'agent-1' }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(worktreesApi.getActive).toHaveBeenCalledWith('agent-1');
    expect(result.current.activeWorktree).toEqual(mockActive);
  });

  it('activeWorktree uses session-level endpoint when no agentId provided', async () => {
    const mockWorktrees = [
      {
        slug: 'session-worktree',
        worktreePath: '/path/to/session',
        branch: 'feature/session',
        createdAt: '2024-01-01T00:00:00Z',
        hasChanges: false,
      },
    ];

    const mockActive = {
      slug: 'session-worktree',
      worktreePath: '/path/to/session',
      branch: 'feature/session',
      hasChanges: false,
    };

    vi.mocked(worktreesApi.list).mockResolvedValue(mockWorktrees);
    vi.mocked(worktreesApi.getSessionActive).mockResolvedValue(mockActive);

    const { result } = renderHook(() => useWorktrees());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Should use the session-level endpoint (real source of truth)
    expect(worktreesApi.getSessionActive).toHaveBeenCalled();
    expect(worktreesApi.getActive).not.toHaveBeenCalled();
    expect(result.current.activeWorktree).toEqual(mockActive);
  });

  it('activeWorktree is null when session-level endpoint returns null', async () => {
    const mockWorktrees = [
      {
        slug: 'agent-1-worktree',
        worktreePath: '/path/to/agent-1',
        branch: 'feature/agent-1',
        agentId: 'agent-1',
        createdAt: '2024-01-01T00:00:00Z',
        hasChanges: false,
      },
    ];

    vi.mocked(worktreesApi.list).mockResolvedValue(mockWorktrees);
    vi.mocked(worktreesApi.getSessionActive).mockResolvedValue(null);

    const { result } = renderHook(() => useWorktrees());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // No session-level active worktree → null (no heuristic)
    expect(result.current.activeWorktree).toBeNull();
  });

  it('enterWorktree calls API with activate:true and refreshes', async () => {
    const mockSession = {
      slug: 'new-worktree',
      worktreePath: '/path/to/new',
      branch: 'feature/new',
      originalCwd: '/original/cwd',
      createdAt: '2024-01-01T00:00:00Z',
    };

    const mockWorktrees = [
      {
        slug: 'new-worktree',
        worktreePath: '/path/to/new',
        branch: 'feature/new',
        createdAt: '2024-01-01T00:00:00Z',
        hasChanges: false,
      },
    ];

    vi.mocked(worktreesApi.create).mockResolvedValue(mockSession);
    vi.mocked(worktreesApi.list).mockResolvedValue(mockWorktrees);
    vi.mocked(worktreesApi.getSessionActive).mockResolvedValue(null);

    const { result } = renderHook(() => useWorktrees());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const session = await result.current.enterWorktree({ slug: 'new-worktree' });
      expect(session).toEqual(mockSession);
    });

    // Should pass activate: true since no agentId
    expect(worktreesApi.create).toHaveBeenCalledWith({ slug: 'new-worktree', activate: true });
    expect(worktreesApi.list).toHaveBeenCalledTimes(2); // initial + after create
  });

  it('exitWorktree deactivates session then removes and refreshes', async () => {
    const mockWorktrees = [
      {
        slug: 'existing-worktree',
        worktreePath: '/path/to/existing',
        branch: 'feature/existing',
        createdAt: '2024-01-01T00:00:00Z',
        hasChanges: false,
      },
    ];

    vi.mocked(worktreesApi.list).mockResolvedValue(mockWorktrees);
    vi.mocked(worktreesApi.getSessionActive).mockResolvedValue(null);
    vi.mocked(worktreesApi.deactivateSession).mockResolvedValue({ deactivated: true, originalCwd: '/repo' });
    vi.mocked(worktreesApi.remove).mockResolvedValue({ message: 'Worktree removed' });

    const { result } = renderHook(() => useWorktrees());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const success = await result.current.exitWorktree('existing-worktree');
      expect(success).toBe(true);
    });

    expect(worktreesApi.deactivateSession).toHaveBeenCalled();
    expect(worktreesApi.remove).toHaveBeenCalledWith('existing-worktree', undefined);
    expect(worktreesApi.list).toHaveBeenCalledTimes(2); // initial + after remove
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(worktreesApi.list).mockRejectedValue(new Error('API Error'));
    vi.mocked(worktreesApi.getSessionActive).mockRejectedValue(new Error('API Error'));

    const { result } = renderHook(() => useWorktrees());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('API Error');
    expect(result.current.worktrees).toEqual([]);
  });

  describe('polling behavior', () => {
    it('does not poll when enabled is false', async () => {
      vi.mocked(worktreesApi.list).mockResolvedValue([]);

      const { result } = renderHook(() => useWorktrees({ enabled: false, interval: 1000 }));

      // When disabled, no fetch happens immediately
      expect(result.current.loading).toBe(true);
      expect(worktreesApi.list).not.toHaveBeenCalled();
    });
  });
});
