import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { ToolExecutor } from '../../runtime/ToolExecutor.js';
import { ToolRegistry, buildTool } from '../../runtime/ToolRegistry.js';
import { PluginManager } from '../PluginManager.js';
import { z } from 'zod';

async function createPluginFixture() {
  const root = await mkdtemp(join(tmpdir(), 'lea-plugin-'));
  const pluginDir = join(root, 'safe-recon');
  await mkdir(pluginDir);
  await writeFile(join(pluginDir, 'lea-plugin.json'), JSON.stringify({
    id: 'safe_recon',
    name: 'Safe Recon',
    version: '1.0.0',
    description: 'Trusted passive recon workflows',
    skills: ['whois.json'],
  }), 'utf8');
  await writeFile(join(pluginDir, 'whois.json'), JSON.stringify({
    id: 'plugin_whois',
    description: 'Run WHOIS through MCP',
    inputSchema: { target: { type: 'string' } },
    steps: [{ id: 'whois', tool: 'mcp:whois_lookup', input: { target: '{{target}}' } }],
    readOnly: true,
  }), 'utf8');
  return root;
}

describe('PluginManager', () => {
  it('requires trust before registering plugin skill tools', async () => {
    const pluginsDir = await createPluginFixture();
    const registry = new ToolRegistry();
    registry.register(buildTool({
      name: 'mcp:whois_lookup',
      description: 'WHOIS',
      source: 'mcp',
      inputSchema: z.object({ target: z.string() }),
      call: async ({ target }) => ({ data: `whois ${target}` }),
      maxResultSizeChars: 1000,
    }));
    const executor = new ToolExecutor(registry);
    const manager = new PluginManager({
      pluginsDir,
      trustStorePath: join(pluginsDir, '.trust.json'),
      registry,
      executor,
    });

    const untrusted = await manager.reload();
    expect(untrusted.plugins[0]).toMatchObject({
      id: 'safe_recon',
      trust: 'untrusted',
      state: 'untrusted',
      registeredTools: [],
    });
    expect(registry.get('skill:plugin_whois')).toBeUndefined();

    const trusted = await manager.trust('safe_recon');
    expect(trusted.plugins[0].state).toBe('loaded');
    expect(trusted.plugins[0].registeredTools).toContain('skill:plugin_whois');
    expect(registry.get('skill:plugin_whois')).toBeDefined();

    const denied = await manager.deny('safe_recon');
    expect(denied.plugins[0].trust).toBe('denied');
    expect(registry.get('skill:plugin_whois')).toBeUndefined();
  });

  it('rejects plugin skill paths that escape via absolute prefix siblings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lea-plugin-'));
    const pluginDir = join(root, 'safe-recon');
    const outsideDir = `${pluginDir}-outside`;
    await mkdir(pluginDir);
    await mkdir(outsideDir);

    const outsideSkill = join(outsideDir, 'evil.json');
    await writeFile(join(pluginDir, 'lea-plugin.json'), JSON.stringify({
      id: 'unsafe_recon',
      name: 'Unsafe Recon',
      version: '1.0.0',
      description: 'Invalid plugin used to verify path containment',
      skills: [outsideSkill],
    }), 'utf8');
    await writeFile(outsideSkill, JSON.stringify({
      id: 'evil',
      description: 'This must never load',
      inputSchema: {},
      steps: [],
    }), 'utf8');

    const registry = new ToolRegistry();
    const manager = new PluginManager({
      pluginsDir: root,
      trustStorePath: join(root, '.trust.json'),
      registry,
      executor: new ToolExecutor(registry),
    });

    const snapshot = await manager.reload();

    expect(snapshot.plugins).toHaveLength(0);
    expect(snapshot.errors[0]).toContain('escapes plugin directory');
    expect(registry.get('skill:evil')).toBeUndefined();
  });

  it('rejects plugin skill symlinks that resolve outside the plugin directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lea-plugin-'));
    const pluginDir = join(root, 'safe-recon');
    const outsideDir = await mkdtemp(join(tmpdir(), 'lea-plugin-outside-'));
    await mkdir(pluginDir);

    const outsideSkill = join(outsideDir, 'evil.json');
    const linkedSkill = join(pluginDir, 'linked.json');
    await writeFile(join(pluginDir, 'lea-plugin.json'), JSON.stringify({
      id: 'symlink_recon',
      name: 'Symlink Recon',
      version: '1.0.0',
      description: 'Invalid plugin used to verify realpath containment',
      skills: ['linked.json'],
    }), 'utf8');
    await writeFile(outsideSkill, JSON.stringify({
      id: 'evil',
      description: 'This must never load',
      inputSchema: {},
      steps: [],
    }), 'utf8');
    await symlink(outsideSkill, linkedSkill);

    const registry = new ToolRegistry();
    const manager = new PluginManager({
      pluginsDir: root,
      trustStorePath: join(root, '.trust.json'),
      registry,
      executor: new ToolExecutor(registry),
    });

    const snapshot = await manager.reload();

    expect(snapshot.plugins).toHaveLength(0);
    expect(snapshot.errors[0]).toContain('escapes plugin directory');
    expect(registry.get('skill:evil')).toBeUndefined();
  });
});
