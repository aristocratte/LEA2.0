'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  skillsApi,
  type SkillInvokeResult,
  type SkillMetadata,
  type SkillsSnapshot,
} from '@/lib/skills-api';

interface UseSkillsOptions {
  autoFetch?: boolean;
}

interface SkillInvocationState {
  toolName?: string;
  isLoading: boolean;
  result: SkillInvokeResult | null;
  error: string | null;
}

export interface UseSkillsReturn {
  snapshot: SkillsSnapshot | null;
  skills: SkillMetadata[];
  isLoading: boolean;
  isReloading: boolean;
  error: string | null;
  invocation: SkillInvocationState;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
  invoke: (toolName: string, input: Record<string, unknown>) => Promise<SkillInvokeResult | null>;
  clearInvocation: () => void;
}

export function useSkills(options?: UseSkillsOptions): UseSkillsReturn {
  const autoFetch = options?.autoFetch !== false;

  const [snapshot, setSnapshot] = useState<SkillsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(autoFetch);
  const [isReloading, setIsReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invocation, setInvocation] = useState<SkillInvocationState>({
    isLoading: false,
    result: null,
    error: null,
  });

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await skillsApi.listSkills();
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    setIsReloading(true);
    setError(null);
    try {
      const data = await skillsApi.reloadSkills();
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload skills');
    } finally {
      setIsReloading(false);
    }
  }, []);

  const invoke = useCallback(async (toolName: string, input: Record<string, unknown>) => {
    setInvocation({ toolName, isLoading: true, result: null, error: null });
    try {
      const result = await skillsApi.invokeSkill(toolName, input);
      setInvocation({ toolName, isLoading: false, result, error: null });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to invoke skill';
      setInvocation({ toolName, isLoading: false, result: null, error: message });
      return null;
    }
  }, []);

  const clearInvocation = useCallback(() => {
    setInvocation({ isLoading: false, result: null, error: null });
  }, []);

  useEffect(() => {
    if (autoFetch) {
      void refresh();
    }
  }, [autoFetch, refresh]);

  return {
    snapshot,
    skills: snapshot?.skills ?? [],
    isLoading,
    isReloading,
    error,
    invocation,
    refresh,
    reload,
    invoke,
    clearInvocation,
  };
}
