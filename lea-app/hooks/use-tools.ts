'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ToolMetadata, ToolSource } from '@/lib/tools-api';
import { toolsApi } from '@/lib/tools-api';

// ============================================
// TYPES
// ============================================

interface UseToolsOptions {
  /** Auto-fetch on mount (default: true). */
  autoFetch?: boolean;
}

interface UseToolsReturn {
  /** All fetched tools (unfiltered). */
  tools: ToolMetadata[];
  /** Tools filtered by current search and source filter. */
  filteredTools: ToolMetadata[];
  /** Whether a fetch is in progress. */
  isLoading: boolean;
  /** Error message if fetch failed. */
  error: string | null;
  /** Current search query. */
  searchQuery: string;
  /** Current source filter: undefined = all, 'local', 'mcp', or 'skill'. */
  sourceFilter: ToolSource | undefined;
  /** Set the search query (local filter on already-fetched tools). */
  search: (q: string) => void;
  /** Set the source filter. */
  setSourceFilter: (source?: ToolSource) => void;
  /** Re-fetch from server. */
  refresh: () => Promise<void>;
}

// ============================================
// HOOK
// ============================================

export function useTools(options?: UseToolsOptions): UseToolsReturn {
  const autoFetch = options?.autoFetch !== false;

  const [tools, setTools] = useState<ToolMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(autoFetch);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilterState] = useState<ToolSource | undefined>(undefined);

  // Fetch all tools from server
  const fetchTools = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await toolsApi.listTools();
      setTools(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tools');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) fetchTools();
  }, [autoFetch, fetchTools]);

  // Local filter: apply search + source filter in memory
  const filteredTools = useMemo(() => {
    let result = tools;

    // Source filter
    if (sourceFilter) {
      result = result.filter((t) => (t.source ?? 'local') === sourceFilter);
    }

    // Text search (case-insensitive on name, aliases, description)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.aliases?.some((a) => a.toLowerCase().includes(q)) ?? false) ||
          t.description.toLowerCase().includes(q)
      );
    }

    return result;
  }, [tools, searchQuery, sourceFilter]);

  const search = useCallback((q: string) => setSearchQuery(q), []);

  const setSourceFilter = useCallback((source?: ToolSource) => setSourceFilterState(source), []);

  return {
    tools,
    filteredTools,
    isLoading,
    error,
    searchQuery,
    sourceFilter,
    search,
    setSourceFilter,
    refresh: fetchTools,
  };
}
