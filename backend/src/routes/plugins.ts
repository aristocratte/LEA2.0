import type { FastifyInstance } from 'fastify';
import type { PluginManager } from '../core/plugins/index.js';

function getPluginManager(fastify: FastifyInstance): PluginManager | undefined {
  return (fastify as any).pluginManager as PluginManager | undefined;
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

function requireApiKey(request: { headers: { authorization?: string } }, reply: any): boolean {
  const apiKey = getConfiguredApiKey();
  if (!apiKey) {
    reply.code(503).send({ error: 'Plugin management auth is not configured' });
    return false;
  }
  if (getBearerToken(request.headers.authorization) !== apiKey) {
    reply.code(401).send({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export async function pluginRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/plugins', async (_request, reply) => {
    const pluginManager = getPluginManager(fastify);
    if (!pluginManager) {
      return reply.code(503).send({ error: 'Plugin manager not available' });
    }

    return { data: pluginManager.getSnapshot() };
  });

  fastify.post('/api/plugins/reload', async (request, reply) => {
    const pluginManager = getPluginManager(fastify);
    if (!pluginManager) {
      return reply.code(503).send({ error: 'Plugin manager not available' });
    }
    if (!requireApiKey(request, reply)) return reply;

    return { data: await pluginManager.reload() };
  });

  fastify.post<{ Params: { id: string } }>('/api/plugins/:id/trust', async (request, reply) => {
    const pluginManager = getPluginManager(fastify);
    if (!pluginManager) {
      return reply.code(503).send({ error: 'Plugin manager not available' });
    }
    if (!requireApiKey(request, reply)) return reply;

    try {
      return { data: await pluginManager.trust(request.params.id) };
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  fastify.post<{ Params: { id: string } }>('/api/plugins/:id/deny', async (request, reply) => {
    const pluginManager = getPluginManager(fastify);
    if (!pluginManager) {
      return reply.code(503).send({ error: 'Plugin manager not available' });
    }
    if (!requireApiKey(request, reply)) return reply;

    try {
      return { data: await pluginManager.deny(request.params.id) };
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
