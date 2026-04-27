/**
 * Tools API Client
 *
 * Functions for interacting with the tool discovery endpoints.
 * All calls hit /api/tools on the real backend.
 */

import { requestJson } from './api';

// ============================================
// TYPES
// ============================================

export type ToolSource = 'local' | 'mcp' | 'skill' | 'plugin' | 'lsp';

export interface ToolMetadata {
  name: string;
  aliases?: string[];
  description: string;
  source?: ToolSource;
  enabled: boolean;
  readOnly: boolean;
  concurrencySafe: boolean;
  destructive: boolean;
  maxResultSizeChars: number;
  inputSchema?: Record<string, string>;
}

interface RawToolMetadata {
  name: string;
  aliases?: string[];
  description: string;
  source?: ToolSource;
  enabled: boolean;
  readOnly: boolean;
  concurrencySafe: boolean;
  destructive: boolean;
  maxResultSizeChars: number;
  inputSchema?: Record<string, string>;
}

// No normalization needed — backend returns clean types

// ============================================
// API FUNCTIONS
// ============================================

/**
 * List all available tools with optional search/filter.
 * GET /api/tools?q=...&source=...&readOnly=...
 */
export async function listTools(params?: {
  q?: string;
  source?: ToolSource;
  readOnly?: boolean;
}): Promise<ToolMetadata[]> {
  const query: Record<string, string> = {};
  if (params?.q) query.q = params.q;
  if (params?.source) query.source = params.source;
  if (params?.readOnly !== undefined) query.readOnly = String(params.readOnly);

  const res = await requestJson<{ data: RawToolMetadata[] }>('/api/tools', {
    query: Object.keys(query).length > 0 ? query : undefined,
  });
  return res.data;
}

/**
 * Get detailed info for a single tool by name or alias.
 * GET /api/tools/:name
 */
export async function getTool(name: string): Promise<ToolMetadata> {
  const res = await requestJson<{ data: RawToolMetadata }>(
    `/api/tools/${encodeURIComponent(name)}`
  );
  return res.data;
}

// Export as grouped API object
export const toolsApi = { listTools, getTool };
