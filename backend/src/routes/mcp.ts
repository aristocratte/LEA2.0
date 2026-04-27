import type { FastifyInstance } from 'fastify';
import type { McpToolBridge } from '../core/mcp/McpToolBridge.js';
import { kaliMcpClient } from '../services/mcp/KaliMCPClient.js';

function getBridge(fastify: FastifyInstance): McpToolBridge | undefined {
  return (fastify as any).mcpToolBridge as McpToolBridge | undefined;
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

export async function mcpRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/mcp/status', async () => {
    const bridge = getBridge(fastify);
    const connected = kaliMcpClient.isConnected();
    return {
      data: {
        connected,
        mode: kaliMcpClient.getMode(),
        endpoint: kaliMcpClient.getEndpoint(),
        containerName: kaliMcpClient.getContainerName(),
        bridgedTools: bridge?.getBridgedNames() ?? [],
      },
    };
  });

  fastify.post('/api/mcp/sync', async (request, reply) => {
    const apiKey = getConfiguredApiKey();
    if (!apiKey) return reply.code(503).send({ error: 'MCP sync auth is not configured' });
    if (getBearerToken(request.headers.authorization) !== apiKey) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const bridge = getBridge(fastify);
    if (!bridge) return reply.code(503).send({ error: 'MCP bridge not available' });
    return { data: await bridge.syncToRegistry() };
  });
}
