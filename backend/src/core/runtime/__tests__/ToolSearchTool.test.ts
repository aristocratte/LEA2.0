import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ToolRegistry, buildTool } from '../ToolRegistry.js';
import { createToolSearchTool } from '../tools/ToolSearchTool.js';

function registerFixtureTools(registry: ToolRegistry) {
  registry.register(buildTool({
    name: 'bash',
    description: 'Run a shell command',
    inputSchema: z.object({ command: z.string() }),
    call: async () => ({ data: 'ok' }),
    maxResultSizeChars: 1000,
  }));
  registry.register(buildTool({
    name: 'mcp:nmap_scan',
    aliases: ['nmap_scan'],
    description: '[MCP] Run Nmap scan',
    source: 'mcp',
    inputSchema: z.object({ target: z.string() }),
    call: async () => ({ data: 'ok' }),
    isReadOnly: () => false,
    maxResultSizeChars: 1000,
  }));
  registry.register(buildTool({
    name: 'skill:passive_recon',
    aliases: ['passive_recon'],
    description: 'Passive recon workflow',
    source: 'skill',
    inputSchema: z.object({ target: z.string() }),
    call: async () => ({ data: 'ok' }),
    isReadOnly: () => true,
    maxResultSizeChars: 1000,
  }));
}

describe('ToolSearchTool', () => {
  it('searches tools by query and source through the registry', async () => {
    const registry = new ToolRegistry();
    registerFixtureTools(registry);
    const searchTool = createToolSearchTool(registry);
    registry.register(searchTool);

    const result = await searchTool.call({ q: 'recon', source: 'skill' }, {} as any);

    expect(result.data.total).toBe(1);
    expect(result.data.tools[0]).toMatchObject({
      name: 'skill:passive_recon',
      source: 'skill',
      readOnly: true,
    });
  });

  it('resolves aliases and limits returned results', async () => {
    const registry = new ToolRegistry();
    registerFixtureTools(registry);
    const searchTool = createToolSearchTool(registry);
    registry.register(searchTool);

    const tool = registry.get('search_tools') as typeof searchTool;
    const result = await tool.call({ q: 'scan', limit: 1 }, {} as any);

    expect(result.data.total).toBe(1);
    expect(result.data.tools).toHaveLength(1);
    expect(result.data.tools[0].name).toBe('mcp:nmap_scan');
  });
});
