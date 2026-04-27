/**
 * C6 — Agent Runtime Integration: MCP tools via ToolExecutor
 *
 * Tests the full execution chain:
 *   McpToolBridge.syncToRegistry() → ToolRegistry → ToolExecutor.execute() → result
 *
 * Validates:
 * - MCP tools are executable through the standard runtime path
 * - Permissions (checkPermissions) apply correctly
 * - Result format is agent-consumable (clean string, not JSON-wrapped object)
 * - Hooks fire for MCP tool lifecycle events
 * - isEnabled() reflects MCP connectivity state
 * - No regression on local tools coexisting in same registry
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry, buildTool } from '../ToolRegistry.js';
import { ToolExecutor } from '../ToolExecutor.js';
import { createDefaultContext } from '../../permissions/PermissionContext.js';
import type { KaliMCPClient, MCPTool } from '../../../services/mcp/KaliMCPClient.js';
import { McpToolBridge } from '../../mcp/McpToolBridge.js';

// ============================================================================
// FIXTURES
// ============================================================================

/** Create a mock KaliMCPClient with controllable behavior. */
function createMockClient(overrides?: {
  tools?: MCPTool[];
  connected?: boolean;
  callResult?: { success: boolean; output?: string; error?: string; duration: number };
  healthCheck?: boolean;
}): Partial<KaliMCPClient> {
  const tools = overrides?.tools ?? [
    { name: 'nmap_scan', description: 'Run Nmap scan', inputSchema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } },
    { name: 'whois_lookup', description: 'WHOIS lookup', inputSchema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } },
  ];

  let mutableTools = tools;
  const client = {
    isConnected: () => overrides?.connected ?? true,
    healthCheck: async () => overrides?.healthCheck ?? true,
    listTools: async () => mutableTools,
    callTool: async (_name: string, _args: Record<string, unknown>) =>
      overrides?.callResult ?? { success: true, output: 'mock output', duration: 42, toolName: _name },
    clearToolCache: vi.fn(),
    getMode: () => 'jsonrpc' as const,
    getEndpoint: () => 'http://localhost:3002/mcp',
    getContainerName: () => 'lea-kali-mcp',
  } as unknown as KaliMCPClient;

  (client as any).__setTools = (t: MCPTool[]) => { mutableTools = t; };
  return client;
}

// ============================================================================
// TESTS
// ============================================================================

describe('C6 — MCP Tool Execution via ToolExecutor (E2E)', () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;
  const allowMcpPermissions = createDefaultContext({
    allowRules: { session: ['mcp:nmap_scan', 'mcp:whois_lookup'] },
  });

  beforeEach(() => {
    registry = new ToolRegistry();
    executor = new ToolExecutor(registry);
  });

  // ============================================
  // BASIC EXECUTION
  // ============================================

  describe('ToolExecutor executes bridged MCP tools', () => {
    it('executes mcp:* tool and returns clean string result', async () => {
      // Arrange: bridge MCP tools into registry
      const client = createMockClient({
        callResult: { success: true, output: 'PORT   STATE SERVICE\n22/tcp  open  ssh\n80/tcp  open  http\n', duration: 1234 },
      });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry();

      // Act: execute via standard ToolExecutor path
      const result = await executor.execute({
        toolUseId: 'mcp-call-001',
        toolName: 'mcp:nmap_scan',
        input: { target: '10.0.0.1' },
        sessionId: 'sess-mcp-e2e',
        abortController: new AbortController(),
        permissions: allowMcpPermissions,
      });

      // Assert
      expect(result.event.type).toBe('tool_result');
      expect(result.event.id).toBe('mcp-call-001');
      expect(result.event.toolName).toBe('mcp:nmap_scan');
      expect(result.event.isError).toBeUndefined();

      // KEY ASSERTION: result is a clean string, NOT '{"output":"..."}'
      const output = result.event.result as string;
      expect(output).toContain('PORT   STATE SERVICE');
      expect(output).toContain('22/tcp  open  ssh');
      expect(output).not.toContain('"output"');
      expect(output).not.toContain('{');

      expect(result.recoverable).toBe(true);
    });

    it('returns error message in result when MCP tool fails', async () => {
      const client = createMockClient({
        callResult: { success: false, error: 'Target host unreachable', duration: 100 },
      });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry();

      const result = await executor.execute({
        toolUseId: 'mcp-fail-001',
        toolName: 'mcp:nmap_scan',
        input: { target: '10.0.0.1' },
        sessionId: 'sess-mcp-e2e',
        abortController: new AbortController(),
        permissions: allowMcpPermissions,
      });

      // MCP errors are delivered as result text (not thrown), so isError may not be set
      // The key is that the error information reaches the agent
      const output = result.event.result as string;
      expect(output).toContain('[MCP Error]');
      expect(output).toContain('Target host unreachable');
    });

    it('returns error when MCP tool not found in registry', async () => {
      // No bridge sync — registry empty of MCP tools
      const result = await executor.execute({
        toolUseId: 'mcp-nf-001',
        toolName: 'mcp:nmap_scan',
        input: {},
        sessionId: 'sess-mcp-e2e',
        abortController: new AbortController(),
        permissions: allowMcpPermissions,
      });

      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('not found in registry');
      expect(result.recoverable).toBe(false);
    });
  });

  // ============================================
  // ENABLED STATE
  // ============================================

  describe('isEnabled() gates execution', () => {
    it('denies execution when MCP client is disconnected', async () => {
      const client = createMockClient({ connected: false });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry(); // Syncs but tools show as disabled

      const result = await executor.execute({
        toolUseId: 'mcp-disc-001',
        toolName: 'mcp:nmap_scan',
        input: { target: '10.0.0.1' },
        sessionId: 'sess-mcp-e2e',
        abortController: new AbortController(),
        permissions: allowMcpPermissions,
      });

      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('currently disabled');
      expect(result.recoverable).toBe(false);
    });

    it('allows execution when MCP client is connected', async () => {
      const client = createMockClient({ connected: true });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry();

      const result = await executor.execute({
        toolUseId: 'mcp-conn-001',
        toolName: 'mcp:nmap_scan',
        input: { target: '10.0.0.1' },
        sessionId: 'sess-mcp-e2e',
        abortController: new AbortController(),
        permissions: allowMcpPermissions,
      });

      expect(result.event.isError).toBeUndefined();
    });
  });

  // ============================================
  // COEXISTENCE WITH LOCAL TOOLS
  // ============================================

  describe('MCP and local tools coexist in same registry', () => {
    it('local tool still works after MCP bridge sync', async () => {
      // Register a local tool first
      registry.register(
        buildTool({
          name: 'local_echo',
          description: 'Local echo tool',
          inputSchema: z.object({ msg: z.string() }),
          call: async ({ msg }) => ({ data: `local: ${msg}` }),
          maxResultSizeChars: 500,
        })
      );

      // Then bridge MCP tools
      const client = createMockClient({
        callResult: { success: true, output: 'mcp result here', duration: 10 },
      });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry();

      // Execute local tool
      const localResult = await executor.execute({
        toolUseId: 'local-001',
        toolName: 'local_echo',
        input: { msg: 'hello' },
        sessionId: 'sess-coexist',
        abortController: new AbortController(),
        permissions: allowMcpPermissions,
      });
      expect(localResult.event.result).toBe('local: hello');

      // Execute MCP tool
      const mcpResult = await executor.execute({
        toolUseId: 'mcp-001',
        toolName: 'mcp:nmap_scan',
        input: { target: '10.0.0.1' },
        sessionId: 'sess-coexist',
        abortController: new AbortController(),
        permissions: allowMcpPermissions,
      });
      expect(mcpResult.event.result).toBe('mcp result here');

      // Both tools visible in registry
      expect(registry.getAll().size).toBeGreaterThanOrEqual(2);
      expect(registry.get('local_echo')).toBeDefined();
      expect(registry.get('mcp:nmap_scan')).toBeDefined();
    });

    it('getEnabled() returns both local and MCP tools', async () => {
      registry.register(
        buildTool({
          name: 'local_tool',
          description: 'A local tool',
          inputSchema: z.object({}),
          call: async () => ({ data: 'ok' }),
          maxResultSizeChars: 100,
        })
      );

      const client = createMockClient();
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry();

      const enabled = registry.getEnabled();
      const names = enabled.map((t) => t.name);

      expect(names).toContain('local_tool');
      expect(names).toContain('mcp:nmap_scan');
      expect(names).toContain('mcp:whois_lookup');
    });
  });

  // ============================================
  // HOOK EMISSION
  // ============================================

  describe('hooks fire for MCP tool execution', () => {
    it('emits pre-tool and post-tool hooks', async () => {
      const { HookBus } = await import('../../hooks/HookBus.js');
      const hookBus = new HookBus();
      executor.setHookBus(hookBus);

      const preEvents: Array<unknown> = [];
      const postEvents: Array<unknown> = [];

      // Register hooks (return values intentionally discarded)
      hookBus.on('pre-tool', (e) => { preEvents.push(e); });
      hookBus.on('post-tool', (e) => { postEvents.push(e); });

      const client = createMockClient({
        callResult: { success: true, output: 'hooked output', duration: 5 },
      });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry();

      await executor.execute({
        toolUseId: 'hook-001',
        toolName: 'mcp:whois_lookup',
        input: { target: 'example.com' },
        sessionId: 'sess-hooks',
        abortController: new AbortController(),
        permissions: allowMcpPermissions,
      });

      expect(preEvents).toHaveLength(1);
      expect((preEvents[0] as any).toolName).toBe('mcp:whois_lookup');
      expect((preEvents[0] as any).input).toEqual({ target: 'example.com' });

      expect(postEvents).toHaveLength(1);
      expect((postEvents[0] as any).toolName).toBe('mcp:whois_lookup');
      // Post-hook result should be the clean string
      expect((postEvents[0] as any).result).toBe('hooked output');
    });

    it('does NOT emit tool-failure hook on MCP error (errors are results, not exceptions)', async () => {
      const { HookBus } = await import('../../hooks/HookBus.js');
      const hookBus = new HookBus();
      executor.setHookBus(hookBus);

      const failureEvents: Array<unknown> = [];
      // Register hook (return value intentionally discarded)
      hookBus.on('tool-failure', (e) => { failureEvents.push(e); });

      const client = createMockClient({
        callResult: { success: false, error: 'Connection refused', duration: 1 },
      });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry();

      await executor.execute({
        toolUseId: 'fail-hook-001',
        toolName: 'mcp:nmap_scan',
        input: { target: '10.0.0.1' },
        sessionId: 'sess-fail-hook',
        abortController: new AbortController(),
        permissions: allowMcpPermissions,
      });

      // MCP errors return normally (not thrown), so tool-failure hook should NOT fire
      // The error is delivered to the agent as a normal result with isError=true
      expect(failureEvents).toHaveLength(0);

      // But the result contains the error text (delivered to agent as message)
      const result = await executor.execute({
        toolUseId: 'fail-hook-002',
        toolName: 'mcp:nmap_scan',
        input: { target: '10.0.0.1' },
        sessionId: 'sess-fail-hook',
        abortController: new AbortController(),
        permissions: allowMcpPermissions,
      });
      expect(result.event.result).toContain('[MCP Error]');
      expect(result.event.result).toContain('Connection refused');
    });
  });

  // ============================================
  // INPUT SCHEMA VALIDATION
  // ============================================

  describe('input schema passes through for MCP tools', () => {
    it('accepts any input shape due to passthrough schema', async () => {
      const client = createMockClient({
        callResult: { success: true, output: 'ok', duration: 1 },
      });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry();

      // MCP tools use z.object({}).passthrough() — should accept anything
      const result = await executor.execute({
        toolUseId: 'schema-001',
        toolName: 'mcp:nmap_scan',
        input: { target: '10.0.0.1', extraField: 'allowed', nested: { key: 'val' } },
        sessionId: 'sess-schema',
        abortController: new AbortController(),
        permissions: allowMcpPermissions,
      });

      // Should NOT get a validation error — passthrough accepts extra fields
      expect(result.event.isError).toBeUndefined();
    });
  });

  // ============================================
  // ALIAS RESOLUTION
  // ============================================

  describe('alias resolution for MCP tools', () => {
    it('executes by original MCP name (alias)', async () => {
      const client = createMockClient({
        callResult: { success: true, output: 'alias result', duration: 10 },
      });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry();

      // Use original name without mcp: prefix (it's registered as alias)
      const result = await executor.execute({
        toolUseId: 'alias-001',
        toolName: 'nmap_scan', // Original name, not prefixed
        input: { target: '10.0.0.1' },
        sessionId: 'sess-alias',
        abortController: new AbortController(),
        permissions: allowMcpPermissions,
      });

      // ToolRegistry.get() resolves aliases, so this should work
      expect(result.event.isError).toBeUndefined();
      expect(result.event.result).toBe('alias result');
    });
  });

  // ============================================
  // RESULT TRUNCATION
  // ============================================

  describe('large MCP results are truncated properly', () => {
    it('truncates oversized MCP output at maxResultSizeChars', async () => {
      const bigOutput = 'X'.repeat(200_000); // 200KB output
      const client = createMockClient({
        callResult: { success: true, output: bigOutput, duration: 5000 },
      });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry();

      const result = await executor.execute({
        toolUseId: 'truncate-001',
        toolName: 'mcp:nmap_scan',
        input: { target: '10.0.0.1' },
        sessionId: 'sess-trunc',
        abortController: new AbortController(),
        permissions: allowMcpPermissions,
      });

      expect(result.event.isError).toBeUndefined();
      const output = result.event.result as string;
      // Should be truncated with ... suffix
      expect(output.length).toBeLessThan(bigOutput.length);
      expect(output.endsWith('...[truncated]')).toBe(true);
    });
  });
});
