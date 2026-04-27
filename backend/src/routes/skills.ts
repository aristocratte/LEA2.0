/**
 * Skills Routes — management surface for declarative skill tools.
 *
 * GET /api/skills lists the current loaded skill snapshot.
 * POST /api/skills/reload reloads JSON definitions from LEA_SKILLS_DIR and
 * requires the same LEA_API_KEY bearer token used by internal debug surfaces.
 */

import type { FastifyInstance } from 'fastify';
import type { SkillManager } from '../core/skills/index.js';

function getSkillManager(fastify: FastifyInstance): SkillManager | undefined {
  return (fastify as any).skillManager as SkillManager | undefined;
}

function getConfiguredApiKey(): string | undefined {
  const key = process.env.LEA_API_KEY?.trim();
  return key || undefined;
}

function getBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || undefined;
}

export async function skillRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/skills', async (_request, reply) => {
    const skillManager = getSkillManager(fastify);
    if (!skillManager) {
      return reply.code(503).send({ error: 'Skill manager not available' });
    }

    return { data: skillManager.getSnapshot() };
  });

  fastify.post('/api/skills/reload', async (request, reply) => {
    const skillManager = getSkillManager(fastify);
    if (!skillManager) {
      return reply.code(503).send({ error: 'Skill manager not available' });
    }

    const apiKey = getConfiguredApiKey();
    if (!apiKey) {
      return reply.code(503).send({ error: 'Skills reload auth is not configured' });
    }

    if (getBearerToken(request.headers.authorization) !== apiKey) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const data = await skillManager.reload();
    return { data };
  });
}
