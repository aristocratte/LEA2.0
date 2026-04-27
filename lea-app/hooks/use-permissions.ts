/**
 * usePermissions Hook
 *
 * Polls the permissions API every 5 seconds to keep the pending request list fresh.
 * Handles loading, error, and retry states.
 *
 * This is the SINGLE SOURCE OF TRUTH for permission data in the frontend.
 * All components should use this hook instead of calling permissionsApi directly.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  permissionsApi,
  type PermissionRequestItem,
} from '@/lib/permissions-api';

interface UsePermissionsOptions {
  /**
   * Polling interval in milliseconds (default: 5000)
   */
  interval?: number;
  /**
   * Whether to enable polling (default: true)
   */
  enabled?: boolean;
}

export function usePermissions(options: UsePermissionsOptions = {}) {
  const { interval = 5000, enabled = true } = options;

  const [pendingRequests, setPendingRequests] = useState<PermissionRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use ref to track if component is mounted
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const data = await permissionsApi.listPending();
      if (mountedRef.current) {
        // Only keep truly pending items
        const pending = data.filter((r) => r.status === 'pending');
        setPendingRequests(pending);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch permissions';
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

  // Approve action
  const approve = useCallback(async (requestId: string, options?: { alwaysAllow?: boolean }) => {
    const result = await permissionsApi.approve(requestId, options);
    // Refresh after approving
    await refresh();
    return result;
  }, [refresh]);

  // Deny action
  const deny = useCallback(async (requestId: string, feedback?: string) => {
    const result = await permissionsApi.deny(requestId, feedback);
    // Refresh after denying
    await refresh();
    return result;
  }, [refresh]);

  // Derived: whether there are pending requests
  const hasPending = pendingRequests.length > 0;

  return {
    pendingRequests,
    loading,
    error,
    refresh,
    approve,
    deny,
    hasPending,
  };
}
