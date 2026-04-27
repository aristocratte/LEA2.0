// @vitest-environment jsdom
/**
 * usePermissions Hook Tests
 *
 * Tests for the usePermissions hook covering:
 * - Fetches pending requests on mount (when enabled)
 * - Does not fetch when disabled
 * - Returns loading=true initially
 * - Returns hasPending correctly
 * - approve calls API and refreshes
 * - deny calls API and refreshes
 * - Returns error on fetch failure
 * - Clears error on successful retry
 * - Returns correct state structure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePermissions } from '../use-permissions';
import { permissionsApi, type PermissionRequestItem } from '@/lib/permissions-api';

// Mock the permissions-api module
vi.mock('@/lib/permissions-api', () => ({
  permissionsApi: {
    listPending: vi.fn(),
    getRequest: vi.fn(),
    approve: vi.fn(),
    deny: vi.fn(),
    getContext: vi.fn(),
    listContexts: vi.fn(),
  },
}));

const mockPendingRequests: PermissionRequestItem[] = [
  {
    requestId: 'req-1',
    agentId: 'agent-1',
    agentName: 'Recon Agent',
    toolName: 'nmap_scan',
    toolUseId: 'tool-1',
    input: { target: '192.168.1.1', ports: '1-1000' },
    description: 'Run an Nmap scan on the target',
    reason: 'Port enumeration required for recon phase',
    timestamp: Date.now(),
    status: 'pending',
  },
  {
    requestId: 'req-2',
    agentId: 'agent-2',
    agentName: 'Web Scanner',
    toolName: 'http_request',
    toolUseId: 'tool-2',
    input: { url: 'https://target.example.com/admin' },
    description: 'Send HTTP request to admin endpoint',
    reason: 'Checking for exposed admin panel',
    timestamp: Date.now(),
    status: 'pending',
  },
];

describe('usePermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Fetch', () => {
    it('fetches pending requests on mount when enabled', async () => {
      vi.mocked(permissionsApi.listPending).mockResolvedValue(mockPendingRequests);

      const { result } = await act(async () => {
        return renderHook(() => usePermissions({ enabled: true }));
      });

      await waitFor(() => {
        expect(permissionsApi.listPending).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(result.current.pendingRequests).toEqual(mockPendingRequests);
        expect(result.current.loading).toBe(false);
      });
    });

    it('does not fetch when enabled=false', async () => {
      vi.mocked(permissionsApi.listPending).mockResolvedValue(mockPendingRequests);

      const { result } = await act(async () => {
        return renderHook(() => usePermissions({ enabled: false }));
      });

      expect(permissionsApi.listPending).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(true);
      expect(result.current.pendingRequests).toEqual([]);
    });

    it('returns loading=true initially', async () => {
      vi.mocked(permissionsApi.listPending).mockResolvedValue(mockPendingRequests);

      const { result } = await act(async () => {
        return renderHook(() => usePermissions({ enabled: false }));
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  describe('hasPending', () => {
    it('returns hasPending=true when requests exist', async () => {
      vi.mocked(permissionsApi.listPending).mockResolvedValue(mockPendingRequests);

      const { result } = await act(async () => {
        return renderHook(() => usePermissions({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.hasPending).toBe(true);
        expect(result.current.pendingRequests.length).toBe(2);
      });
    });

    it('returns hasPending=false when no requests', async () => {
      vi.mocked(permissionsApi.listPending).mockResolvedValue([]);

      const { result } = await act(async () => {
        return renderHook(() => usePermissions({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.hasPending).toBe(false);
        expect(result.current.pendingRequests).toEqual([]);
      });
    });
  });

  describe('Error Handling', () => {
    it('returns error on fetch failure', async () => {
      vi.mocked(permissionsApi.listPending).mockRejectedValue(new Error('Network error'));

      const { result } = await act(async () => {
        return renderHook(() => usePermissions({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
        expect(result.current.loading).toBe(false);
        expect(result.current.pendingRequests).toEqual([]);
      });
    });

    it('clears error on successful retry', async () => {
      vi.mocked(permissionsApi.listPending)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockPendingRequests);

      const { result } = await act(async () => {
        return renderHook(() => usePermissions({ enabled: false }));
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
        expect(result.current.pendingRequests).toEqual(mockPendingRequests);
      });
    });
  });

  describe('approve', () => {
    it('calls permissionsApi.approve and refreshes', async () => {
      const approvedRequest: PermissionRequestItem = {
        ...mockPendingRequests[0],
        status: 'approved',
        result: { decision: 'allow' },
      };

      vi.mocked(permissionsApi.listPending).mockResolvedValue(mockPendingRequests);
      vi.mocked(permissionsApi.approve).mockResolvedValue(approvedRequest);

      const { result } = await act(async () => {
        return renderHook(() => usePermissions({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });
      await waitFor(() => {
        expect(result.current.pendingRequests).toEqual(mockPendingRequests);
      });

      await act(async () => {
        await result.current.approve('req-1');
      });

      expect(permissionsApi.approve).toHaveBeenCalledWith('req-1', undefined);
      // listPending called once for initial refresh, once after approve
      expect(permissionsApi.listPending).toHaveBeenCalledTimes(2);
    });

    it('approves with alwaysAllow option', async () => {
      vi.mocked(permissionsApi.listPending).mockResolvedValue(mockPendingRequests);
      vi.mocked(permissionsApi.approve).mockResolvedValue({
        ...mockPendingRequests[0],
        status: 'approved',
      });

      const { result } = await act(async () => {
        return renderHook(() => usePermissions({ enabled: false }));
      });

      await act(async () => {
        await result.current.approve('req-1', { alwaysAllow: true });
      });

      expect(permissionsApi.approve).toHaveBeenCalledWith('req-1', { alwaysAllow: true });
    });
  });

  describe('deny', () => {
    it('calls permissionsApi.deny and refreshes', async () => {
      const deniedRequest: PermissionRequestItem = {
        ...mockPendingRequests[0],
        status: 'denied',
        result: { decision: 'deny', feedback: 'Not allowed' },
      };

      vi.mocked(permissionsApi.listPending).mockResolvedValue(mockPendingRequests);
      vi.mocked(permissionsApi.deny).mockResolvedValue(deniedRequest);

      const { result } = await act(async () => {
        return renderHook(() => usePermissions({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.deny('req-1');
      });

      expect(permissionsApi.deny).toHaveBeenCalledWith('req-1', undefined);
      // listPending called once for initial refresh, once after deny
      expect(permissionsApi.listPending).toHaveBeenCalledTimes(2);
    });

    it('calls permissionsApi.deny with feedback', async () => {
      vi.mocked(permissionsApi.listPending).mockResolvedValue(mockPendingRequests);
      vi.mocked(permissionsApi.deny).mockResolvedValue({
        ...mockPendingRequests[0],
        status: 'denied',
      });

      const { result } = await act(async () => {
        return renderHook(() => usePermissions({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.deny('req-1', 'Too risky');
      });

      expect(permissionsApi.deny).toHaveBeenCalledWith('req-1', 'Too risky');
    });
  });

  describe('Return Values', () => {
    it('returns correct state structure', async () => {
      vi.mocked(permissionsApi.listPending).mockResolvedValue(mockPendingRequests);

      const { result } = await act(async () => {
        return renderHook(() => usePermissions({ enabled: false }));
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current).toHaveProperty('pendingRequests');
        expect(result.current).toHaveProperty('loading');
        expect(result.current).toHaveProperty('error');
        expect(result.current).toHaveProperty('refresh');
        expect(result.current).toHaveProperty('approve');
        expect(result.current).toHaveProperty('deny');
        expect(result.current).toHaveProperty('hasPending');
      });
    });
  });
});
