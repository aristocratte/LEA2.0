'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { pentestsApi } from '@/lib/api';
import type { Checkpoint } from '@/types';

// ============================================================================
// HOOK
// ============================================================================

export function useCheckpoints(pentestId: string | null): {
  checkpoints: Checkpoint[];
  isLoading: boolean;
  create: (label?: string) => Promise<void>;
  rewind: (checkpointId: string) => Promise<string | null>;
  refresh: () => void;
} {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchedRef = useRef(false);
  const fetchIndexRef = useRef(0);

  const fetchCheckpoints = useCallback(async (index: number) => {
    if (!pentestId || fetchedRef.current) return;

    fetchedRef.current = true;
    setIsLoading(true);

    try {
      const res = await pentestsApi.getCheckpoints(pentestId);
      // Only update if this is still the latest request
      if (index === fetchIndexRef.current) {
        const payload = res && 'data' in res ? res.data : res;
        setCheckpoints(payload?.items ?? []);
      }
    } catch {
      // API error — silently return empty list
      setCheckpoints([]);
    } finally {
      if (index === fetchIndexRef.current) {
        setIsLoading(false);
      }
    }
  }, [pentestId]);

  useEffect(() => {
    const idx = ++fetchIndexRef.current;
    fetchedRef.current = false;
    fetchCheckpoints(idx);
  }, [fetchCheckpoints]);

  const create = useCallback(async (label?: string) => {
    if (!pentestId) return;
    try {
      await pentestsApi.createCheckpoint(pentestId, label ? { label } : undefined);
    } catch {
      // Silently ignore create errors
    }
    // Refresh after create
    fetchedRef.current = false;
    const idx = ++fetchIndexRef.current;
    fetchCheckpoints(idx);
  }, [pentestId, fetchCheckpoints]);

  const rewind = useCallback(async (checkpointId: string): Promise<string | null> => {
    if (!pentestId) return null;
    try {
      const res = await pentestsApi.rewindToCheckpoint(pentestId, checkpointId);
      const payload = res && 'data' in res ? res.data : res;
      // Refresh after rewind
      fetchedRef.current = false;
      const idx = ++fetchIndexRef.current;
      fetchCheckpoints(idx);
      return payload?.preRewindCheckpointId ?? null;
    } catch {
      // Refresh even on error to show current state
      fetchedRef.current = false;
      const idx = ++fetchIndexRef.current;
      fetchCheckpoints(idx);
      return null;
    }
  }, [pentestId, fetchCheckpoints]);

  const refresh = useCallback(() => {
    fetchedRef.current = false;
    const idx = ++fetchIndexRef.current;
    fetchCheckpoints(idx);
  }, [fetchCheckpoints]);

  return {
    checkpoints,
    isLoading,
    create,
    rewind,
    refresh,
  };
}
