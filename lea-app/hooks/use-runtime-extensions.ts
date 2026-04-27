import { useCallback, useEffect, useState } from 'react';
import { extensionsApi, type HooksSnapshot, type McpStatus, type PluginManagerSnapshot } from '@/lib/extensions-api';

export interface RuntimeExtensionsState {
  hooks: HooksSnapshot | null;
  mcp: McpStatus | null;
  plugins: PluginManagerSnapshot | null;
  isLoading: boolean;
  isSyncingMcp: boolean;
  isReloadingPlugins: boolean;
  pendingPluginId: string | null;
  error: string | null;
  actionError: string | null;
  refresh: () => Promise<void>;
  syncMcp: () => Promise<void>;
  reloadPlugins: () => Promise<void>;
  trustPlugin: (id: string) => Promise<void>;
  denyPlugin: (id: string) => Promise<void>;
}

function getRuntimeExtensionsError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.toLowerCase().includes('unauthorized')) {
    return 'Runtime extension status requires API auth. In local development, set NEXT_PUBLIC_LEA_DEV_API_KEY to match LEA_API_KEY.';
  }
  return message;
}

export function useRuntimeExtensions(): RuntimeExtensionsState {
  const [hooks, setHooks] = useState<HooksSnapshot | null>(null);
  const [mcp, setMcp] = useState<McpStatus | null>(null);
  const [plugins, setPlugins] = useState<PluginManagerSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingMcp, setIsSyncingMcp] = useState(false);
  const [isReloadingPlugins, setIsReloadingPlugins] = useState(false);
  const [pendingPluginId, setPendingPluginId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setActionError(null);
    try {
      const [hooksSnapshot, mcpStatus, pluginSnapshot] = await Promise.all([
        extensionsApi.getHooksSnapshot(),
        extensionsApi.getMcpStatus(),
        extensionsApi.getPlugins(),
      ]);
      setHooks(hooksSnapshot);
      setMcp(mcpStatus);
      setPlugins(pluginSnapshot);
    } catch (err) {
      setError(getRuntimeExtensionsError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const syncMcp = useCallback(async () => {
    setIsSyncingMcp(true);
    setActionError(null);
    try {
      await extensionsApi.syncMcpTools();
      const mcpStatus = await extensionsApi.getMcpStatus();
      setMcp(mcpStatus);
    } catch (err) {
      setActionError(getRuntimeExtensionsError(err));
    } finally {
      setIsSyncingMcp(false);
    }
  }, []);

  const reloadPlugins = useCallback(async () => {
    setIsReloadingPlugins(true);
    setActionError(null);
    try {
      const snapshot = await extensionsApi.reloadPlugins();
      setPlugins(snapshot);
    } catch (err) {
      setActionError(getRuntimeExtensionsError(err));
    } finally {
      setIsReloadingPlugins(false);
    }
  }, []);

  const trustPlugin = useCallback(async (id: string) => {
    setPendingPluginId(id);
    setActionError(null);
    try {
      const snapshot = await extensionsApi.trustPlugin(id);
      setPlugins(snapshot);
    } catch (err) {
      setActionError(getRuntimeExtensionsError(err));
    } finally {
      setPendingPluginId(null);
    }
  }, []);

  const denyPlugin = useCallback(async (id: string) => {
    setPendingPluginId(id);
    setActionError(null);
    try {
      const snapshot = await extensionsApi.denyPlugin(id);
      setPlugins(snapshot);
    } catch (err) {
      setActionError(getRuntimeExtensionsError(err));
    } finally {
      setPendingPluginId(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    hooks,
    mcp,
    plugins,
    isLoading,
    isSyncingMcp,
    isReloadingPlugins,
    pendingPluginId,
    error,
    actionError,
    refresh,
    syncMcp,
    reloadPlugins,
    trustPlugin,
    denyPlugin,
  };
}
