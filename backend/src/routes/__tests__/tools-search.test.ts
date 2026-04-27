/**
 * C8 — Tool Search API Tests
 *
 * Tests the search/filter query params on GET /api/tools:
 * - Text search (q) on name, aliases, description
 * - Source filter (source=local|mcp|skill)
 * - Status filters (enabled, readOnly)
 * - Combination of params
 * - Backward compatibility (no params = all tools)
 */

import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry, buildTool } from '../../core/runtime/ToolRegistry.js';
import { toolRoutes } from '../../routes/tools.js';

// ============================================================================
// FIXTURES
// ============================================================================

/** Build a minimal Fastify app with tool registry and routes. */
async function buildApp(registry: ToolRegistry) {
  const fastify = Fastify({ logger: false });
  (fastify as any).toolRegistry = registry;
  await fastify.register(toolRoutes);
  await fastify.ready();
  return fastify;
}

/** Register a set of local + MCP-like tools for testing. */
function registerTestTools(registry: ToolRegistry): void {
  // Local tools
  registry.register(
    buildTool({
      name: 'bash',
      description: 'Execute shell commands on the system',
      inputSchema: z.object({ command: z.string() }),
      call: async () => ({ data: 'ok' }),
      maxResultSizeChars: 10_000_000,
      source: 'local',
      isReadOnly: (input) => input.command.startsWith('ls '),
      isDestructive: (input) => input.command.includes('rm '),
    })
  );

  registry.register(
    buildTool({
      name: 'task_output',
      description: 'Retrieve output from a background task',
      inputSchema: z.object({ taskId: z.string() }),
      call: async () => ({ data: 'ok' }),
      maxResultSizeChars: 10_000_000,
      source: 'local',
    })
  );

  registry.register(
    buildTool({
      name: 'send_message',
      description: 'Send a message to another agent',
      inputSchema: z.object({ to: z.string(), message: z.string() }),
      call: async () => ({ data: 'ok' }),
      maxResultSizeChars: 1_000,
      source: 'local',
    })
  );

  // MCP-bridged tools
  registry.register(
    buildTool({
      name: 'mcp:nmap_scan',
      description: '[MCP] Port scanning with Nmap',
      aliases: ['nmap_scan'],
      inputSchema: z.object({ target: z.string() }),
      call: async () => ({ data: 'ports open' }),
      maxResultSizeChars: 100_000,
      source: 'mcp',
    })
  );

  registry.register(
    buildTool({
      name: 'mcp:whois_lookup',
      description: '[MCP] WHOIS domain lookup',
      aliases: ['whois_lookup'],
      inputSchema: z.object({ target: z.string() }),
      call: async () => ({ data: 'domain info' }),
      maxResultSizeChars: 100_000,
      source: 'mcp',
    })
  );

  registry.register(
    buildTool({
      name: 'mcp:dig_lookup',
      description: '[MCP] DNS record lookup via dig',
      inputSchema: z.object({ domain: z.string(), type: z.string() }),
      call: async () => ({ data: 'dns records' }),
      maxResultSizeChars: 100_000,
      source: 'mcp',
    })
  );

  // Declarative skill tools
  registry.register(
    buildTool({
      name: 'skill:recon_quick',
      description: '[Skill] Quick reconnaissance workflow',
      aliases: ['recon_quick'],
      inputSchema: z.object({ target: z.string() }),
      call: async () => ({ data: 'workflow complete' }),
      maxResultSizeChars: 50_000,
      source: 'skill',
    })
  );

  // Disabled tool (for enabled filter testing)
  registry.register(
    buildTool({
      name: 'deprecated_ftp_scan',
      description: '[DEPRECATED] FTP service scanner — disabled',
      inputSchema: z.object({ target: z.string() }),
      call: async () => ({ data: 'deprecated' }),
      maxResultSizeChars: 100_000,
      source: 'local',
      isEnabled: () => false,
    })
  );
}

// ============================================================================
// TESTS
// ============================================================================

describe('C8 — Tool Search API', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registerTestTools(registry);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // ============================================
  // BACKWARD COMPATIBILITY — no params
  // ============================================

  describe('backward compatibility', () => {
    it('returns all enabled tools when no params given', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools');

        expect(res.status).toBe(200);
        const names = res.body.data.map((t: any) => t.name);
        expect(names).toContain('bash');
        expect(names).toContain('task_output');
        expect(names).toContain('mcp:nmap_scan');
        expect(names).toContain('mcp:whois_lookup');
        expect(res.body.data.length).toBe(7); // All enabled tools (8 registered, 1 disabled)
      } finally {
        await app.close();
      }
    });
  });

  // ============================================
  // TEXT SEARCH (q)
  // ============================================

  describe('text search (q)', () => {
    it('filters by tool name', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools?q=nmap');

        expect(res.status).toBe(200);
        const names = res.body.data.map((t: any) => t.name);
        expect(names).toEqual(['mcp:nmap_scan']);
        expect(res.body.data.length).toBe(1);
      } finally {
        await app.close();
      }
    });

    it('searches by alias (unprefixed MCP name)', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools?q=whois');

        expect(res.status).toBe(200);
        const names = res.body.data.map((t: any) => t.name);
        expect(names).toEqual(['mcp:whois_lookup']);
      } finally {
        await app.close();
      }
    });

    it('searches by description text', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools?q=shell');

        expect(res.status).toBe(200);
        const names = res.body.data.map((t: any) => t.name);
        expect(names).toContain('bash'); // "shell commands" in description
      } finally {
        await app.close();
      }
    });

    it('returns empty array for non-matching query', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools?q=nonexistent_tool_xyz');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(0);
      } finally {
        await app.close();
      }
    });

    it('case-insensitive search', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools?q=NMAP');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      } finally {
        await app.close();
      }
    });
  });

  // ============================================
  // SOURCE FILTER
  // ============================================

  describe('source filter', () => {
    it('source=local returns only local tools', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools?source=local');

        expect(res.status).toBe(200);
        const names = res.body.data.map((t: any) => t.name);
        expect(names).toContain('bash');
        expect(names).toContain('task_output');
        expect(names).not.toContain('mcp:');
        expect(res.body.data.length).toBe(3); // bash, task_output, send_message
      } finally {
        await app.close();
      }
    });

    it('source=mcp returns only MCP tools', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools?source=mcp');

        expect(res.status).toBe(200);
        const names = res.body.data.map((t: any) => t.name);
        expect(names).toContain('mcp:nmap_scan');
        expect(names).toContain('mcp:whois_lookup');
        expect(names).toContain('mcp:dig_lookup');
        expect(names).not.toContain('bash');
        expect(res.body.data.length).toBe(3); // 3 MCP tools
      } finally {
        await app.close();
      }
    });

    it('source=skill returns only skill tools', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools?source=skill');

        expect(res.status).toBe(200);
        const names = res.body.data.map((t: any) => t.name);
        expect(names).toEqual(['skill:recon_quick']);
        expect(res.body.data[0].source).toBe('skill');
      } finally {
        await app.close();
      }
    });

    it('each result includes the source field', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools');

        expect(res.status).toBe(200);
        const localTool = res.body.data.find((t: any) => t.name === 'bash');
        expect(localTool?.source).toBe('local');

        const mcpTool = res.body.data.find((t: any) => t.name === 'mcp:nmap_scan');
        expect(mcpTool?.source).toBe('mcp');

        const skillTool = res.body.data.find((t: any) => t.name === 'skill:recon_quick');
        expect(skillTool?.source).toBe('skill');
      } finally {
        await app.close();
      }
    });

    it('does not crash when metadata helpers require real tool input', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools/bash');

        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('bash');
        expect(res.body.data.readOnly).toBe(false);
        expect(res.body.data.destructive).toBe(false);
      } finally {
        await app.close();
      }
    });
  });

  // ============================================
  // ENABLED FILTER
  // ============================================

  describe('enabled filter', () => {
    it('without param returns only enabled tools (backward compat)', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools');

        expect(res.status).toBe(200);
        const names = res.body.data.map((t: any) => t.name);
        expect(names).not.toContain('deprecated_ftp_scan');
        // All 7 enabled tools present
        expect(res.body.data.length).toBe(7);
      } finally {
        await app.close();
      }
    });

    it('enabled=true returns only enabled tools', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools?enabled=true');

        expect(res.status).toBe(200);
        const names = res.body.data.map((t: any) => t.name);
        expect(names).not.toContain('deprecated_ftp_scan');
        expect(res.body.data.length).toBe(7);
      } finally {
        await app.close();
      }
    });

    it('enabled=false returns only disabled tools', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools?enabled=false');

        expect(res.status).toBe(200);
        const names = res.body.data.map((t: any) => t.name);
        expect(names).toEqual(['deprecated_ftp_scan']);
        expect(res.body.data.length).toBe(1);
      } finally {
        await app.close();
      }
    });

    it('disabled tool has enabled=false in metadata', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools?enabled=false');

        expect(res.status).toBe(200);
        const tool = res.body.data[0];
        expect(tool.name).toBe('deprecated_ftp_scan');
        expect(tool.enabled).toBe(false);
      } finally {
        await app.close();
      }
    });
  });

  // ============================================
  // COMBINATION FILTERS
  // ============================================

  describe('combined filters', () => {
    it('q + source filters together', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools?q=dig&source=mcp');

        expect(res.status).toBe(200);
        const names = res.body.data.map((t: any) => t.name);
        expect(names).toEqual(['mcp:dig_lookup']); // Only MCP tool matching "dig"
      } finally {
        await app.close();
      }
    });

    it('q with no match in filtered source returns empty', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools?q=bash&source=mcp');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(0);
      } finally {
        await app.close();
      }
    });
  });

  // ============================================
  // SINGLE TOOL DETAIL (unchanged)
  // ============================================

  describe('single tool detail still works', () => {
    it('GET /api/tools/:name returns tool with source field', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools/mcp:nmap_scan');

        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('mcp:nmap_scan');
        expect(res.body.data.source).toBe('mcp');
        expect(res.body.data.aliases).toEqual(['nmap_scan']);
      } finally {
        await app.close();
      }
    });

    it('local tool detail shows source=local', async () => {
      const app = await buildApp(registry);
      try {
        const res = await request(app.server).get('/api/tools/bash');

        expect(res.status).toBe(200);
        expect(res.body.data.source).toBe('local');
      } finally {
        await app.close();
      }
    });
  });
});
