/**
 * C12 — Skills management API tests.
 */

import Fastify from 'fastify';
import request from 'supertest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ToolExecutor } from '../../core/runtime/ToolExecutor.js';
import { ToolRegistry, buildTool } from '../../core/runtime/ToolRegistry.js';
import { SkillManager } from '../../core/skills/index.js';
import { skillRoutes } from '../skills.js';

const TEST_API_KEY = 'test-skills-key';
const ORIGINAL_API_KEY = process.env.LEA_API_KEY;

async function buildApp(skillsDir: string) {
  const fastify = Fastify({ logger: false });
  const registry = new ToolRegistry();
  const executor = new ToolExecutor(registry);

  registry.register(
    buildTool({
      name: 'mcp:whois_lookup',
      description: 'WHOIS lookup',
      inputSchema: z.object({ target: z.string() }),
      call: async (args) => ({ data: `WHOIS: ${args.target}` }),
      maxResultSizeChars: 10_000,
      source: 'mcp',
    }),
  );

  const skillManager = new SkillManager({ registry, executor, skillsDir });
  await skillManager.reload();

  (fastify as any).toolRegistry = registry;
  (fastify as any).skillManager = skillManager;

  await fastify.register(skillRoutes);
  await fastify.ready();

  return { fastify, registry, skillManager };
}

async function writeSkill(dir: string, filename: string, id: string) {
  await writeFile(
    join(dir, filename),
    JSON.stringify({
      id,
      description: `${id} workflow`,
      aliases: [`${id}_alias`],
      inputSchema: { target: 'string' },
      steps: [{ id: 'whois', tool: 'mcp:whois_lookup', input: { target: '{{target}}' } }],
    }),
    'utf8',
  );
}

describe('C12 — skillRoutes', () => {
  let dir: string;

  beforeEach(async () => {
    process.env.LEA_API_KEY = TEST_API_KEY;
    dir = await mkdtemp(join(tmpdir(), 'lea-skills-routes-'));
  });

  afterEach(async () => {
    if (ORIGINAL_API_KEY === undefined) {
      delete process.env.LEA_API_KEY;
    } else {
      process.env.LEA_API_KEY = ORIGINAL_API_KEY;
    }
    await rm(dir, { recursive: true, force: true });
  });

  it('GET /api/skills lists loaded skills and metadata', async () => {
    await writeSkill(dir, 'safe-whois.json', 'safe_whois');
    const { fastify } = await buildApp(dir);

    try {
      const res = await request(fastify.server).get('/api/skills');

      expect(res.status).toBe(200);
      expect(res.body.data.skills).toHaveLength(1);
      expect(res.body.data.skills[0]).toMatchObject({
        id: 'safe_whois',
        toolName: 'skill:safe_whois',
        aliases: ['safe_whois', 'safe_whois_alias'],
        description: 'safe_whois workflow',
      });
      expect(res.body.data.skills[0].steps).toEqual([
        { id: 'whois', tool: 'mcp:whois_lookup', optional: false },
      ]);
      expect(res.body.data.errors).toEqual([]);
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/skills/reload requires a valid API key', async () => {
    const { fastify } = await buildApp(dir);

    try {
      const missing = await request(fastify.server).post('/api/skills/reload').send({});
      expect(missing.status).toBe(401);

      const invalid = await request(fastify.server)
        .post('/api/skills/reload')
        .set('Authorization', 'Bearer wrong')
        .send({});
      expect(invalid.status).toBe(401);
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/skills/reload loads new skills and registers their tools', async () => {
    const { fastify, registry } = await buildApp(dir);

    try {
      await writeSkill(dir, 'safe-whois.json', 'safe_whois');

      const res = await request(fastify.server)
        .post('/api/skills/reload')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.registered).toBe(1);
      expect(res.body.data.skills.map((skill: any) => skill.toolName)).toEqual(['skill:safe_whois']);
      expect(registry.has('skill:safe_whois')).toBe(true);
    } finally {
      await fastify.close();
    }
  });

  it('reload unregisters stale previously managed skills', async () => {
    await writeSkill(dir, 'safe-whois.json', 'safe_whois');
    const { fastify, registry } = await buildApp(dir);

    try {
      await rm(join(dir, 'safe-whois.json'));
      await writeSkill(dir, 'new-whois.json', 'new_whois');

      const res = await request(fastify.server)
        .post('/api/skills/reload')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({});

      expect(res.status).toBe(200);
      expect(registry.has('skill:safe_whois')).toBe(false);
      expect(registry.has('skill:new_whois')).toBe(true);
    } finally {
      await fastify.close();
    }
  });

  it('surfaces invalid skill definition errors without registering the file', async () => {
    await writeFile(
      join(dir, 'broken.json'),
      JSON.stringify({ id: 'broken', description: '', steps: [] }),
      'utf8',
    );

    const { fastify, registry } = await buildApp(dir);

    try {
      const res = await request(fastify.server).get('/api/skills');

      expect(res.status).toBe(200);
      expect(res.body.data.skills).toEqual([]);
      expect(res.body.data.errors[0]).toContain('Invalid skill definition broken.json');
      expect(registry.has('skill:broken')).toBe(false);
    } finally {
      await fastify.close();
    }
  });
});
