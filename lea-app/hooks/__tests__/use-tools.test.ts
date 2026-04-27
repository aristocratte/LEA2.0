/**
 * use-tools Hook Tests
 *
 * Tests the useTools hook:
 * - Fetch on mount populates tools
 * - search() filters locally
 * - setSourceFilter() filters by source
 * - Combined search + source filter
 * - refresh re-fetches
 * - Error handling
 */

import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useTools } from '../use-tools';

// Mock the API module
vi.mock('@/lib/tools-api', () => ({
  toolsApi: {
    listTools: vi.fn(),
  },
}));

import { toolsApi } from '@/lib/tools-api';
const mockedListTools = vi.mocked(toolsApi.listTools);

// ============================================
// FIXTURES
// ============================================

const FIXTURE_TOOLS = [
  {
    name: 'bash',
    description: 'Execute shell commands',
    source: 'local' as const,
    enabled: true,
    readOnly: false,
    concurrencySafe: false,
    destructive: false,
    maxResultSizeChars: 10_000_000,
  },
  {
    name: 'task_output',
    description: 'Retrieve output from a background task',
    source: 'local' as const,
    enabled: true,
    readOnly: true,
    concurrencySafe: true,
    destructive: false,
    maxResultSizeChars: 10_000_000,
  },
  {
    name: 'mcp:nmap_scan',
    description: '[MCP] Port scanning with Nmap',
    aliases: ['nmap_scan'],
    source: 'mcp' as const,
    enabled: true,
    readOnly: false,
    concurrencySafe: false,
    destructive: false,
    maxResultSizeChars: 100_000,
  },
  {
    name: 'mcp:whois_lookup',
    description: '[MCP] WHOIS domain lookup',
    aliases: ['whois_lookup'],
    source: 'mcp' as const,
    enabled: true,
    readOnly: true,
    concurrencySafe: true,
    destructive: false,
    maxResultSizeChars: 100_000,
  },
  {
    name: 'skill:recon_quick',
    description: 'Run a quick reconnaissance workflow',
    aliases: ['recon_quick'],
    source: 'skill' as const,
    enabled: true,
    readOnly: false,
    concurrencySafe: false,
    destructive: false,
    maxResultSizeChars: 50_000,
  },
];

// ============================================
// TESTS
// ============================================

describe('useTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListTools.mockResolvedValue(FIXTURE_TOOLS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // FETCH ON MOUNT
  // ============================================

  describe('fetch on mount', () => {
    it('fetches tools on mount by default', async () => {
      const { result } = renderHook(() => useTools());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.tools).toHaveLength(0);

      await act(async () => {
        // Wait for fetch to resolve
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.tools).toHaveLength(5);
      expect(result.current.error).toBeNull();
      expect(mockedListTools).toHaveBeenCalledTimes(1);
    });

    it('does not auto-fetch when autoFetch=false', async () => {
      const { result } = renderHook(() => useTools({ autoFetch: false }));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.tools).toHaveLength(0);
      expect(mockedListTools).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // LOCAL SEARCH FILTER
  // ============================================

  describe('search()', () => {
    it('filters tools by name', async () => {
      const { result } = renderHook(() => useTools());
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      act(() => { result.current.search('nmap'); });

      expect(result.current.filteredTools).toHaveLength(1);
      expect(result.current.filteredTools[0].name).toBe('mcp:nmap_scan');
    });

    it('filters by alias', async () => {
      const { result } = renderHook(() => useTools());
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      act(() => { result.current.search('whois'); });

      expect(result.current.filteredTools).toHaveLength(1);
      expect(result.current.filteredTools[0].name).toBe('mcp:whois_lookup');
    });

    it('filters by description text', async () => {
      const { result } = renderHook(() => useTools());
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      act(() => { result.current.search('shell'); });

      expect(result.current.filteredTools).toHaveLength(1);
      expect(result.current.filteredTools[0].name).toBe('bash');
    });

    it('returns empty array for non-matching query', async () => {
      const { result } = renderHook(() => useTools());
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      act(() => { result.current.search('nonexistent_xyz'); });

      expect(result.current.filteredTools).toHaveLength(0);
    });

    it('is case-insensitive', async () => {
      const { result } = renderHook(() => useTools());
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      act(() => { result.current.search('NMAP'); });

      expect(result.current.filteredTools).toHaveLength(1);
    });

    it('clearing search returns all (source-filtered) tools', async () => {
      const { result } = renderHook(() => useTools());
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      act(() => { result.current.search('nmap'); });
      expect(result.current.filteredTools).toHaveLength(1);

      act(() => { result.current.search(''); });
      expect(result.current.filteredTools).toHaveLength(5); // All tools restored
    });
  });

  // ============================================
  // SOURCE FILTER
  // ============================================

  describe('setSourceFilter()', () => {
    it('filters to local tools only', async () => {
      const { result } = renderHook(() => useTools());
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      act(() => { result.current.setSourceFilter('local'); });

      expect(result.current.filteredTools).toHaveLength(2);
      expect(result.current.filteredTools.every((t) => t.source === 'local')).toBe(true);
    });

    it('filters to MCP tools only', async () => {
      const { result } = renderHook(() => useTools());
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      act(() => { result.current.setSourceFilter('mcp'); });

      expect(result.current.filteredTools).toHaveLength(2);
      expect(result.current.filteredTools.every((t) => t.source === 'mcp')).toBe(true);
    });

    it('filters to skill tools only', async () => {
      const { result } = renderHook(() => useTools());
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      act(() => { result.current.setSourceFilter('skill'); });

      expect(result.current.filteredTools).toHaveLength(1);
      expect(result.current.filteredTools[0].name).toBe('skill:recon_quick');
    });

    it('undefined shows all tools', async () => {
      const { result } = renderHook(() => useTools());
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      act(() => { result.current.setSourceFilter('local'); });
      expect(result.current.filteredTools).toHaveLength(2);

      act(() => { result.current.setSourceFilter(undefined); });
      expect(result.current.filteredTools).toHaveLength(5);
    });
  });

  // ============================================
  // COMBINED FILTERS
  // ============================================

  describe('combined search + source filter', () => {
    it('q + source filter together', async () => {
      const { result } = renderHook(() => useTools());
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      act(() => {
        result.current.search('lookup');
        result.current.setSourceFilter('mcp');
      });

      expect(result.current.filteredTools).toHaveLength(1);
      expect(result.current.filteredTools[0].name).toBe('mcp:whois_lookup');
    });

    it('q with no match in filtered source returns empty', async () => {
      const { result } = renderHook(() => useTools());
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      act(() => {
        result.current.search('bash');
        result.current.setSourceFilter('mcp');
      });

      expect(result.current.filteredTools).toHaveLength(0);
    });
  });

  // ============================================
  // REFRESH
  // ============================================

  describe('refresh()', () => {
    it('re-fetches tools from server', async () => {
      const { result } = renderHook(() => useTools());
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      expect(mockedListTools).toHaveBeenCalledTimes(1);

      // Simulate server-side change
      const updatedTools = [...FIXTURE_TOOLS, {
        name: 'new_tool',
        description: 'A newly added tool',
        source: 'local' as const,
        enabled: true,
        readOnly: false,
        concurrencySafe: false,
        destructive: false,
        maxResultSizeChars: 50000,
      }];
      mockedListTools.mockResolvedValue(updatedTools);

      await act(async () => { await result.current.refresh(); });

      expect(result.current.tools).toHaveLength(6);
      expect(mockedListTools).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================
  // ERROR HANDLING
  // ============================================

  describe('error handling', () => {
    it('sets error when fetch fails', async () => {
      mockedListTools.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useTools());
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe('Network error');
      expect(result.current.tools).toHaveLength(0);
    });
  });
});
