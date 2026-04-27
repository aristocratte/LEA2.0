import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { LspAnalysisService, LspQuery } from '../core/lsp/index.js';

const LspQueryBodySchema = z.object({
  paths: z.array(z.string().min(1)).optional(),
  limit: z.number().int().min(1).max(200).finite().optional(),
});

function getLspService(fastify: FastifyInstance): LspAnalysisService | undefined {
  return (fastify as any).lspAnalysisService as LspAnalysisService | undefined;
}

export function parseLspQueryBody(body: unknown): LspQuery {
  return LspQueryBodySchema.parse(body ?? {});
}

export async function lspRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: LspQuery }>('/api/lsp/diagnostics', async (request, reply) => {
    const service = getLspService(fastify);
    if (!service) return reply.code(503).send({ error: 'LSP service not available' });
    try {
      return { data: await service.diagnostics(parseLspQueryBody(request.body)) };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  fastify.post<{ Body: LspQuery }>('/api/lsp/symbols', async (request, reply) => {
    const service = getLspService(fastify);
    if (!service) return reply.code(503).send({ error: 'LSP service not available' });
    try {
      return { data: await service.symbols(parseLspQueryBody(request.body)) };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
