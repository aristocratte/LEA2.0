/**
 * useSkills hook tests.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSkills } from '../use-skills';

vi.mock('@/lib/skills-api', () => ({
  skillsApi: {
    listSkills: vi.fn(),
    reloadSkills: vi.fn(),
    invokeSkill: vi.fn(),
  },
}));

import { skillsApi } from '@/lib/skills-api';

const mockedSkillsApi = vi.mocked(skillsApi);

const SNAPSHOT = {
  skillsDir: '/tmp/skills',
  loadedAt: '2026-04-25T00:00:00.000Z',
  registered: 1,
  skipped: 0,
  errors: [],
  skills: [
    {
      id: 'safe_whois',
      toolName: 'skill:safe_whois',
      aliases: ['safe_whois'],
      description: 'Safe WHOIS workflow',
      steps: [{ id: 'whois', tool: 'mcp:whois_lookup', optional: false }],
      readOnly: false,
      concurrencySafe: false,
      destructive: false,
      maxResultSizeChars: 50_000,
    },
  ],
};

describe('useSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSkillsApi.listSkills.mockResolvedValue(SNAPSHOT);
    mockedSkillsApi.reloadSkills.mockResolvedValue(SNAPSHOT);
    mockedSkillsApi.invokeSkill.mockResolvedValue({
      toolName: 'skill:safe_whois',
      toolUseId: 'api-1',
      success: true,
      result: '{"success":true}',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches skills on mount', async () => {
    const { result } = renderHook(() => useSkills());

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.skills).toHaveLength(1);
    expect(result.current.snapshot?.skillsDir).toBe('/tmp/skills');
  });

  it('reloads skills and updates snapshot', async () => {
    const { result } = renderHook(() => useSkills({ autoFetch: false }));

    await act(async () => {
      await result.current.reload();
    });

    expect(mockedSkillsApi.reloadSkills).toHaveBeenCalledTimes(1);
    expect(result.current.skills[0].id).toBe('safe_whois');
  });

  it('invokes a skill and stores result', async () => {
    const { result } = renderHook(() => useSkills({ autoFetch: false }));

    await act(async () => {
      await result.current.invoke('skill:safe_whois', { target: 'example.com' });
    });

    expect(mockedSkillsApi.invokeSkill).toHaveBeenCalledWith('skill:safe_whois', {
      target: 'example.com',
    });
    expect(result.current.invocation.result?.success).toBe(true);
  });

  it('stores invocation errors without throwing', async () => {
    mockedSkillsApi.invokeSkill.mockRejectedValue(new Error('Invoke disabled'));
    const { result } = renderHook(() => useSkills({ autoFetch: false }));

    await act(async () => {
      const value = await result.current.invoke('skill:safe_whois', {});
      expect(value).toBeNull();
    });

    expect(result.current.invocation.error).toBe('Invoke disabled');
  });
});
