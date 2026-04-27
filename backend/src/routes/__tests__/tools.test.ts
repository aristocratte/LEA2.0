/**
 * Tool Routes Tests — C4 Tool Discovery Endpoint
 */

import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry, buildTool } from '../../core/runtime/ToolRegistry.js';
import type { Tool } from '../../core/types/tool-types.js';

import { toolRoutes } from '../tools.js';

// ============================================
// FIXTURES
// ============================================

/** Create a minimal tool for testing. */
function makeTestTool(overrides: {
  name?: string;
  description?: string;
  aliases?: string[];
  isEnabled?: () => boolean;
  isReadOnly?: (input: unknown) => boolean;
  isConcurrencySafe?: (input: unknown) => boolean;
  isDestructive?: (input: unknown) => boolean;
} = {}): Tool {
  return buildTool({
    name: overrides.name ?? 'test_tool',
    description: overrides.description ?? 'A test tool for discovery',
    inputSchema: z.object({ query: z.string() }),
    call: async () => ({ data: 'ok' }),
    maxResultSizeChars: 1000,
    ...overrides,
  });
}

/** Build a Fastify app with an optional ToolRegistry. */
async function buildApp(registry?: ToolRegistry | null) {
  const fastify = Fastify({ logger: false });

  if (registry !== undefined && registry !== null) {
    // Same pattern as commands.test.ts: raw decoration
    (fastify as any).toolRegistry = registry;
  }

  await fastify.register(toolRoutes);
  await fastify.ready();

  return fastify;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// ============================================
// TESTS
// ============================================

describe('toolRoutes — GET /api/tools', () => {
  it('returns list of enabled tools with metadata', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTestTool({ name: 'bash' }));
    registry.register(makeTestTool({ name: 'read_file' }));

    const fastify = await buildApp(registry);

    try {
      const response = await request(fastify.server).get('/api/tools');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);

      const names = response.body.data.map((t: any) => t.name);
      expect(names).toContain('bash');
      expect(names).toContain('read_file');
    } finally {
      await fastify.close();
    }
  });

  it('excludes disabled tools from the list', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTestTool({ name: 'enabled_tool' }));
    registry.register(makeTestTool({
      name: 'disabled_tool',
      isEnabled: () => false,
    }));

    const fastify = await buildApp(registry);

    try {
      const response = await request(fastify.server).get('/api/tools');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('enabled_tool');
    } finally {
      await fastify.close();
    }
  });

  it('includes all required metadata fields per tool', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTestTool({
      name: 'scanner',
      description: 'Scans a target for vulnerabilities',
      aliases: ['scan'],
      isReadOnly: () => true,
      isConcurrencySafe: () => true,
      isDestructive: () => false,
    }));

    const fastify = await buildApp(registry);

    try {
      const response = await request(fastify.server).get('/api/tools');
      const tool = response.body.data[0];

      expect(tool).toEqual({
        name: 'scanner',
        aliases: ['scan'],
        description: 'Scans a target for vulnerabilities',
        source: 'local',
        enabled: true,
        readOnly: true,
        concurrencySafe: true,
        destructive: false,
        maxResultSizeChars: 1000,
        inputSchema: { query: 'string' },
      });
    } finally {
      await fastify.close();
    }
  });

  it('includes inputSchema preview for object schemas', async () => {
    const registry = new ToolRegistry();
    registry.register(
      buildTool({
        name: 'complex_tool',
        description: 'Complex input schema',
        inputSchema: z.object({
          host: z.string(),
          port: z.number().default(8080),
          verbose: z.boolean().optional(),
          tags: z.array(z.string()).default([]),
        }),
        call: async () => ({ data: 'ok' }),
        maxResultSizeChars: 500,
      })
    );

    const fastify = await buildApp(registry);

    try {
      const response = await request(fastify.server).get('/api/tools');
      const tool = response.body.data[0];

      expect(tool.inputSchema).toEqual({
        host: 'string',
        port: 'default',
        verbose: 'optional',
        tags: 'default',
      });
    } finally {
      await fastify.close();
    }
  });

  it('omits inputSchema for non-object schemas', async () => {
    const registry = new ToolRegistry();
    registry.register(
      buildTool({
        name: 'simple_tool',
        description: 'String-only input',
        inputSchema: z.string(),
        call: async () => ({ data: 'ok' }),
        maxResultSizeChars: 100,
      })
    );

    const fastify = await buildApp(registry);

    try {
      const response = await request(fastify.server).get('/api/tools');
      const tool = response.body.data[0];

      expect(tool.name).toBe('simple_tool');
      // Non-object schemas don't produce a shape preview
      expect(tool.inputSchema).toBeUndefined();
    } finally {
      await fastify.close();
    }
  });

  it('returns 503 when ToolRegistry is not available', async () => {
    const fastify = await buildApp(null);

    try {
      const response = await request(fastify.server).get('/api/tools');

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('Tool registry not available');
    } finally {
      await fastify.close();
    }
  });

  it('returns empty list when no tools are registered', async () => {
    const registry = new ToolRegistry();
    const fastify = await buildApp(registry);

    try {
      const response = await request(fastify.server).get('/api/tools');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    } finally {
      await fastify.close();
    }
  });
});

describe('toolRoutes — GET /api/tools/:name', () => {
  it('returns tool detail by canonical name', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTestTool({ name: 'nmap_scan' }));

    const fastify = await buildApp(registry);

    try {
      const response = await request(fastify.server).get('/api/tools/nmap_scan');

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('nmap_scan');
      expect(response.body.data.description).toBe('A test tool for discovery');
    } finally {
      await fastify.close();
    }
  });

  it('resolves alias to canonical tool', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTestTool({
      name: 'nmap_scan',
      aliases: ['nmap'],
    }));

    const fastify = await buildApp(registry);

    try {
      const response = await request(fastify.server).get('/api/tools/nmap');

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('nmap_scan'); // Canonical name
      expect(response.body.data.aliases).toEqual(['nmap']);
    } finally {
      await fastify.close();
    }
  });

  it('returns 404 for unknown tool name', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTestTool());

    const fastify = await buildApp(registry);

    try {
      const response = await request(fastify.server).get('/api/tools/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('nonexistent');
    } finally {
      await fastify.close();
    }
  });

  it('returns 503 when ToolRegistry is not available', async () => {
    const fastify = await buildApp(null);

    try {
      const response = await request(fastify.server).get('/api/tools/bash');

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('Tool registry not available');
    } finally {
      await fastify.close();
    }
  });

  it('reports destructive flag correctly', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTestTool({
      name: 'rm_rf',
      description: 'Removes files permanently',
      isDestructive: () => true,
    }));

    const fastify = await buildApp(registry);

    try {
      const response = await request(fastify.server).get('/api/tools/rm_rf');

      expect(response.status).toBe(200);
      expect(response.body.data.destructive).toBe(true);
    } finally {
      await fastify.close();
    }
  });
});
