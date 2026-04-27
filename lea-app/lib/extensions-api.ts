import { requestJson } from './api';

export interface HookEventMetadata {
  name: string;
  listenerCount: number;
  hasListeners: boolean;
}

export interface HooksSnapshot {
  observationOnly: boolean;
  events: HookEventMetadata[];
}

export interface McpStatus {
  connected: boolean;
  mode: string | null;
  endpoint: string;
  containerName: string;
  bridgedTools: string[];
}

export interface McpSyncResult {
  registered: number;
  toolNames: string[];
  mcpHealthy: boolean;
}

export interface PluginSnapshot {
  id: string;
  name: string;
  version: string;
  description: string;
  directory: string;
  digest: string;
  trust: 'untrusted' | 'trusted' | 'denied';
  state: 'untrusted' | 'trusted' | 'denied' | 'loaded' | 'error';
  skills: string[];
  registeredTools: string[];
  errors: string[];
}

export interface PluginManagerSnapshot {
  pluginsDir: string;
  trustStorePath: string;
  loadedAt?: string;
  plugins: PluginSnapshot[];
  errors: string[];
}

export interface LspDiagnostic {
  file: string;
  line: number;
  column: number;
  code: string | number;
  category: 'error' | 'warning' | 'suggestion' | 'message';
  message: string;
}

export interface LspSymbol {
  file: string;
  name: string;
  kind: string;
  line: number;
  column: number;
  exported: boolean;
}

export interface LspQuery {
  paths?: string[];
  limit?: number;
}

export interface LspDiagnosticsResult {
  files: string[];
  diagnostics: LspDiagnostic[];
}

export interface LspSymbolsResult {
  files: string[];
  symbols: LspSymbol[];
}

export async function getHooksSnapshot(): Promise<HooksSnapshot> {
  const res = await requestJson<{ data: HooksSnapshot }>('/api/hooks');
  return res.data;
}

export async function getMcpStatus(): Promise<McpStatus> {
  const res = await requestJson<{ data: McpStatus }>('/api/mcp/status');
  return res.data;
}

export async function getPlugins(): Promise<PluginManagerSnapshot> {
  const res = await requestJson<{ data: PluginManagerSnapshot }>('/api/plugins');
  return res.data;
}

export async function syncMcpTools(): Promise<McpSyncResult> {
  const res = await requestJson<{ data: McpSyncResult }>('/api/mcp/sync', {
    method: 'POST',
    body: {},
  });
  return res.data;
}

export async function reloadPlugins(): Promise<PluginManagerSnapshot> {
  const res = await requestJson<{ data: PluginManagerSnapshot }>('/api/plugins/reload', {
    method: 'POST',
    body: {},
  });
  return res.data;
}

export async function trustPlugin(id: string): Promise<PluginManagerSnapshot> {
  const res = await requestJson<{ data: PluginManagerSnapshot }>(`/api/plugins/${encodeURIComponent(id)}/trust`, {
    method: 'POST',
    body: {},
  });
  return res.data;
}

export async function denyPlugin(id: string): Promise<PluginManagerSnapshot> {
  const res = await requestJson<{ data: PluginManagerSnapshot }>(`/api/plugins/${encodeURIComponent(id)}/deny`, {
    method: 'POST',
    body: {},
  });
  return res.data;
}

export async function runLspDiagnostics(query: LspQuery): Promise<LspDiagnosticsResult> {
  const res = await requestJson<{ data: LspDiagnosticsResult }>('/api/lsp/diagnostics', {
    method: 'POST',
    body: query,
  });
  return res.data;
}

export async function runLspSymbols(query: LspQuery): Promise<LspSymbolsResult> {
  const res = await requestJson<{ data: LspSymbolsResult }>('/api/lsp/symbols', {
    method: 'POST',
    body: query,
  });
  return res.data;
}

export const extensionsApi = {
  getHooksSnapshot,
  getMcpStatus,
  getPlugins,
  syncMcpTools,
  reloadPlugins,
  trustPlugin,
  denyPlugin,
  runLspDiagnostics,
  runLspSymbols,
};
