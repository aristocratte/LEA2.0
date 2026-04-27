import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extensionsApi } from '@/lib/extensions-api';
import { useRuntimeExtensions } from '../use-runtime-extensions';

vi.mock('@/lib/extensions-api', () => ({
  extensionsApi: {
    getHooksSnapshot: vi.fn(),
    getMcpStatus: vi.fn(),
    getPlugins: vi.fn(),
    syncMcpTools: vi.fn(),
    reloadPlugins: vi.fn(),
    trustPlugin: vi.fn(),
    denyPlugin: vi.fn(),
  },
}));

const mockedExtensionsApi = vi.mocked(extensionsApi);

describe('useRuntimeExtensions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExtensionsApi.getHooksSnapshot.mockResolvedValue({
      observationOnly: true,
      events: [],
    });
    mockedExtensionsApi.getMcpStatus.mockResolvedValue({
      connected: false,
      mode: null,
      endpoint: '',
      containerName: '',
      bridgedTools: [],
    });
    mockedExtensionsApi.getPlugins.mockResolvedValue({
      pluginsDir: '/tmp/plugins',
      trustStorePath: '/tmp/plugins/.trust.json',
      plugins: [],
      errors: [],
    });
    mockedExtensionsApi.syncMcpTools.mockResolvedValue({
      registered: 1,
      toolNames: ['mcp:nmap_scan'],
      mcpHealthy: true,
    });
    mockedExtensionsApi.reloadPlugins.mockResolvedValue({
      pluginsDir: '/tmp/plugins',
      trustStorePath: '/tmp/plugins/.trust.json',
      plugins: [],
      errors: [],
    });
    mockedExtensionsApi.trustPlugin.mockResolvedValue({
      pluginsDir: '/tmp/plugins',
      trustStorePath: '/tmp/plugins/.trust.json',
      plugins: [{ id: 'safe', name: 'Safe', version: '1.0.0', description: 'Safe plugin', directory: '/tmp/plugins/safe', digest: 'abc', trust: 'trusted', state: 'loaded', skills: [], registeredTools: [], errors: [] }],
      errors: [],
    });
    mockedExtensionsApi.denyPlugin.mockResolvedValue({
      pluginsDir: '/tmp/plugins',
      trustStorePath: '/tmp/plugins/.trust.json',
      plugins: [{ id: 'safe', name: 'Safe', version: '1.0.0', description: 'Safe plugin', directory: '/tmp/plugins/safe', digest: 'abc', trust: 'denied', state: 'denied', skills: [], registeredTools: [], errors: [] }],
      errors: [],
    });
  });

  it('fetches runtime extension snapshots on mount', async () => {
    const { result } = renderHook(() => useRuntimeExtensions());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.hooks?.observationOnly).toBe(true);
    expect(result.current.mcp?.connected).toBe(false);
    expect(result.current.plugins?.plugins).toHaveLength(0);
  });

  it('returns an actionable auth message for unauthorized API responses', async () => {
    mockedExtensionsApi.getHooksSnapshot.mockRejectedValueOnce(new Error('Unauthorized'));

    const { result } = renderHook(() => useRuntimeExtensions());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.error).toContain('NEXT_PUBLIC_LEA_DEV_API_KEY');
  });

  it('syncs MCP tools and refreshes MCP status', async () => {
    const { result } = renderHook(() => useRuntimeExtensions());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    mockedExtensionsApi.getMcpStatus.mockResolvedValueOnce({
      connected: true,
      mode: 'jsonrpc',
      endpoint: 'http://kali:3001',
      containerName: 'lea-kali',
      bridgedTools: ['mcp:nmap_scan'],
    });

    await act(async () => {
      await result.current.syncMcp();
    });

    expect(mockedExtensionsApi.syncMcpTools).toHaveBeenCalledTimes(1);
    expect(result.current.mcp?.bridgedTools).toEqual(['mcp:nmap_scan']);
  });

  it('updates plugin snapshot after trust/deny actions', async () => {
    const { result } = renderHook(() => useRuntimeExtensions());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.trustPlugin('safe');
    });

    expect(result.current.plugins?.plugins[0].trust).toBe('trusted');

    await act(async () => {
      await result.current.denyPlugin('safe');
    });

    expect(result.current.plugins?.plugins[0].trust).toBe('denied');
  });
});
