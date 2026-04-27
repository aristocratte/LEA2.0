/**
 * McpToolBridge Tests — C5 MCP Unification
 *
 * Covers:
 * - Tool adaptation from MCP format to ToolRegistry
 * - Registration with mcp: prefix
 * - Graceful degradation when MCP is unavailable
 * - Exclusion patterns (shell_exec filtering)
 * - Re-sync (unregister old, register new)
 * - /api/tools visibility of bridged tools
 */

import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../../runtime/ToolRegistry.js';
import type { KaliMCPClient, MCPTool } from '../../../services/mcp/KaliMCPClient.js';
import { McpToolBridge } from '../McpToolBridge.js';
import { toolRoutes } from '../../../routes/tools.js';

// ============================================================================
// FIXTURES
// ============================================================================

/** Create a mock KaliMCPClient with controllable behavior. */
function createMockClient(overrides: {
  tools?: MCPTool[];
  connected?: boolean;
  callResult?: { success: boolean; output?: string; error?: string; duration: number };
  healthCheck?: boolean;
}): Partial<KaliMCPClient> {
  let mutableTools = overrides.tools ?? [
    { name: 'nmap_scan', description: 'Run Nmap scan', inputSchema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } },
    { name: 'whois_lookup', description: 'WHOIS lookup', inputSchema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } },
    { name: 'shell_exec', description: 'Execute shell command' },
  ];

  const client = {
    isConnected: () => overrides.connected ?? true,
    healthCheck: async () => overrides.healthCheck ?? true,
    listTools: async () => mutableTools,
    callTool: async (_name: string, _args: Record<string, unknown>) =>
      overrides.callResult ?? { success: true, output: 'mock output', duration: 42, toolName: _name },
    clearToolCache: vi.fn(),
    getMode: () => 'jsonrpc' as const,
    getEndpoint: () => 'http://localhost:3002/mcp',
    getContainerName: () => 'lea-kali-mcp',
  } as unknown as KaliMCPClient;

  // Expose setter for test mutation
  (client as any).__setTools = (t: MCPTool[]) => { mutableTools = t; };

  return client;
}

/** Build a Fastify app with tool registry and routes. */
async function buildApp(registry: ToolRegistry) {
  const fastify = Fastify({ logger: false });
  (fastify as any).toolRegistry = registry;
  await fastify.register(toolRoutes);
  await fastify.ready();
  return fastify;
}

// ============================================================================
// TESTS
// ============================================================================

describe('McpToolBridge', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // ============================================
  // SYNC & REGISTRATION
  // ============================================

  describe('syncToRegistry()', () => {
    it('registers MCP tools with mcp: prefix', async () => {
      const client = createMockClient({});
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);

      const result = await bridge.syncToRegistry();

      expect(result.mcpHealthy).toBe(true);
      expect(result.registered).toBe(2); // nmap_scan + whois_lookup (shell_exec excluded)
      expect(result.toolNames).toContain('mcp:nmap_scan');
      expect(result.toolNames).toContain('mcp:whois_lookup');
      expect(result.toolNames).not.toContain('mcp:shell_exec');
    });

    it('excludes tools matching excludePatterns', async () => {
      const client = createMockClient({
        tools: [
          { name: 'nmap_scan', description: 'Nmap' },
          { name: 'shell_exec', description: 'Shell' },
          { name: 'dangerous_rm', description: 'Remove files' },
        ],
      });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry, {
        excludePatterns: [/^shell_exec$/i, /^dangerous_/i],
      });

      const result = await bridge.syncToRegistry();

      expect(result.registered).toBe(1);
      expect(result.toolNames).toEqual(['mcp:nmap_scan']);
    });

    it('respects maxTools limit', async () => {
      const client = createMockClient({
        tools: Array.from({ length: 10 }, (_, i) => ({
          name: `tool_${i}`,
          description: `Tool ${i}`,
        })),
      });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry, { maxTools: 3 });

      const result = await bridge.syncToRegistry();

      expect(result.registered).toBe(3);
    });

    it('returns empty result when MCP is not healthy', async () => {
      const client = createMockClient({ connected: false, healthCheck: false });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);

      const result = await bridge.syncToRegistry();

      expect(result.mcpHealthy).toBe(false);
      expect(result.registered).toBe(0);
      expect(result.toolNames).toHaveLength(0);
      expect(registry.getAll().size).toBe(0);
    });

    it('returns empty result when listTools throws', async () => {
      const client = createMockClient({});
      client.listTools = async () => { throw new Error('MCP server down'); };

      const bridge = new McpToolBridge(client as KaliMCPClient, registry);

      const result = await bridge.syncToRegistry();

      expect(result.mcpHealthy).toBe(false);
      expect(result.registered).toBe(0);
    });

    it('handles empty tool list from MCP', async () => {
      const client = createMockClient({ tools: [] });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);

      const result = await bridge.syncToRegistry();

      expect(result.registered).toBe(0);
      expect(result.mcpHealthy).toBe(true);
    });
  });

  // ============================================
  // RE-SYNC (CLEAN UP OLD TOOLS)
  // ============================================

  describe('re-sync (idempotency)', () => {
    it('removes old bridged tools on re-sync', async () => {
      const client = createMockClient({
        tools: [{ name: 'nmap_scan', description: 'Nmap' }],
      });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);

      // First sync
      await bridge.syncToRegistry();
      expect(registry.getAll().size).toBe(1);
      expect(bridge.getBridgedNames()).toContain('mcp:nmap_scan');

      // Change available tools
      (client as any).__setTools([{ name: 'dig_lookup', description: 'DNS' }]);

      // Re-sync
      const result = await bridge.syncToRegistry();

      expect(result.registered).toBe(1);
      expect(result.toolNames).toContain('mcp:dig_lookup');
      expect(result.toolNames).not.toContain('mcp:nmap_scan');
      expect(registry.getAll().size).toBe(1); // Only the new tool
      expect(bridge.isBridged('nmap_scan')).toBe(false);
      expect(bridge.isBridged('dig_lookup')).toBe(true);
    });
  });

  // ============================================
  // TOOL METADATA & EXECUTION
  // ============================================

  describe('bridged tool properties', () => {
    it('creates tools with correct metadata', async () => {
      const client = createMockClient({
        tools: [{
          name: 'nmap_scan',
          description: 'Port scanning with Nmap',
          inputSchema: { type: 'object', properties: { target: { type: 'string' }, ports: { type: 'string' } } },
        }],
      });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry();

      const tool = registry.get('mcp:nmap_scan');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('mcp:nmap_scan');
      expect(tool!.description).toContain('[MCP]');
      expect(tool!.description).contain('Port scanning with Nmap');
      expect(tool!.aliases).toContain('nmap_scan');
      expect(tool!.isEnabled()).toBe(true);
      expect(tool!.isReadOnly(undefined as never)).toBe(false);
      expect(tool!.isConcurrencySafe(undefined as never)).toBe(false);
      expect(tool!.isDestructive?.(undefined as never)).toBe(false);
    });

    it('delegates execution to kaliMcpClient.callTool()', async () => {
      let calledName: string | undefined;
      let calledArgs: Record<string, unknown> | undefined;
      let calledContext: unknown;

      const client = createMockClient({
        tools: [{
          name: 'curl_request',
          description: 'HTTP request',
          inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
        }],
        callResult: { success: true, output: '<!DOCTYPE html>', duration: 123 },
      });
      // Intercept callTool to capture arguments
      const originalCall = client.callTool!;
      client.callTool = async (name, args, timeoutMs, context) => {
        calledName = name;
        calledArgs = args;
        calledContext = context;
        return originalCall(name, args, timeoutMs, context);
      };

      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry();

      const tool = registry.get('mcp:curl_request')!;
      const result = await tool.call({ url: 'https://example.com' }, {
        mcpContext: {
          pentestId: 'pt-1',
          target: 'example.com',
          inScope: ['example.com'],
          outOfScope: ['evil.example'],
        },
      } as any);

      expect(calledName).toBe('curl_request'); // Original name, NOT prefixed
      expect(calledArgs).toEqual({ url: 'https://example.com' });
      expect(calledContext).toMatchObject({
        pentestId: 'pt-1',
        target: 'example.com',
        inScope: ['example.com'],
        outOfScope: ['evil.example'],
      });
      expect(result.data).toBe('<!DOCTYPE html>'); // Returns clean string, not wrapped object
      expect(result.metadata?.duration).toBe(123);
    });

    it('reflects MCP connectivity in isEnabled()', async () => {
      const client = createMockClient({
        tools: [{ name: 'test_tool', description: 'Test' }],
      });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry();

      const tool = registry.get('mcp:test_tool')!;

      // Connected → enabled
      expect(tool.isEnabled()).toBe(true);

      // Disconnect → disabled
      (client as any).isConnected = () => false;
      expect(tool.isEnabled()).toBe(false);
    });

    it('adapts JSON Schema inputSchema to Zod object', async () => {
      const client = createMockClient({
        tools: [{
          name: 'complex',
          description: 'Complex schema',
          inputSchema: {
            type: 'object',
            properties: {
              host: { type: 'string' },
              port: { type: 'number' },
              verbose: { type: 'boolean' },
            },
            required: ['host'],
          },
        }],
      });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry();

      const tool = registry.get('mcp:complex')!;
      // Should have a ZodObject schema (for /api/tools metadata preview)
      const schema = tool.inputSchema;
      expect('shape' in schema && typeof (schema as any).shape === 'object').toBe(true);
    });
  });

  // ============================================
  // API VISIBILITY (/api/tools)
  // ============================================

  describe('/api/tools visibility', () => {
    it('bridged tools appear in GET /api/tools response', async () => {
      const client = createMockClient({
        tools: [
          { name: 'nmap_scan', description: 'Nmap scan', inputSchema: { type: 'object', properties: { target: { type: 'string' } } } },
          { name: 'whois_lookup', description: 'WHOIS lookup' },
        ],
      });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry();

      const fastify = await buildApp(registry);
      try {
        const res = await request(fastify.server).get('/api/tools');

        expect(res.status).toBe(200);
        const names = res.body.data.map((t: any) => t.name);
        expect(names).toContain('mcp:nmap_scan');
        expect(names).toContain('mcp:whois_lookup');

        // Verify MCP tool metadata shape
        const mcpTool = res.body.data.find((t: any) => t.name === 'mcp:nmap_scan');
        expect(mcpTool.description).toContain('[MCP]');
        expect(mcpTool.enabled).toBe(true);
        expect(mcpTool.readOnly).toBe(false);
        expect(mcpTool.concurrencySafe).toBe(false);
      } finally {
        await fastify.close();
      }
    });

    it('no MCP tools appear when bridge has not synced or MCP is down', async () => {
      // Registry is empty — no sync performed
      const fastify = await buildApp(registry);
      try {
        const res = await request(fastify.server).get('/api/tools');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(0);
      } finally {
        await fastify.close();
      }
    });

    it('bridged tools are findable by alias (original MCP name)', async () => {
      const client = createMockClient({
        tools: [{ name: 'nmap_scan', description: 'Nmap' }],
      });
      const bridge = new McpToolBridge(client as KaliMCPClient, registry);
      await bridge.syncToRegistry();

      const fastify = await buildApp(registry);
      try {
        // Lookup by original MCP name (alias)
        const res = await request(fastify.server).get('/api/tools/nmap_scan');

        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('mcp:nmap_scan'); // Returns canonical (prefixed) name
      } finally {
        await fastify.close();
      }
    });
  });
});

describe('PentestOrchestrator — no McpService dependency', () => {
  it('does not import McpService', async () => {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(
      new URL('../../../services/PentestOrchestrator.ts', import.meta.url),
      'utf-8'
    );
    expect(content).not.toContain("from './mcp/McpService.js'");
    expect(content).not.toContain('new McpService');
  });

  it('executeSwarmTool uses only kaliMcpClient path', async () => {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(
      new URL('../../../services/PentestOrchestrator.ts', import.meta.url),
      'utf-8'
    );
    // executeSwarmTool should have exactly one MCP path (kaliMcpClient)
    const swarmToolSection = content.slice(
      content.indexOf('async executeSwarmTool'),
      content.indexOf('async startSwarmAudit')
    );
    expect(swarmToolSection).toContain('kaliMcpClient.callTool');
    expect(swarmToolSection).not.toContain('mcpService.executeTool');
    expect(swarmToolSection).not.toContain('this.mcpService');
  });
});
