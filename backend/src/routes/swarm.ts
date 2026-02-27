import { randomUUID } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sseManager } from '../services/SSEManager.js';
import { ProviderManager } from '../services/ProviderManager.js';
import { PentestOrchestrator } from '../services/PentestOrchestrator.js';
import type { FastifyRequestWithParams } from '../types/fastify.d.js';

const StartSwarmSchema = z.object({
  task: z.string().max(5000).optional(),
  scope: z.array(z.string().min(1)).max(200).optional(),
  maxAgents: z.number().int().min(1).max(30).optional(),
  maxConcurrentAgents: z.number().int().min(1).max(20).optional(),
  autoPushToSysReptor: z.boolean().optional(),
});

export async function swarmRoutes(fastify: FastifyInstance): Promise<void> {
  const providerManager = new ProviderManager();
  const orchestrator = new PentestOrchestrator(fastify.prisma, providerManager);

  // POST /api/pentests/:id/swarm/start
  fastify.post('/api/pentests/:id/swarm/start', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    const parse = StartSwarmSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid swarm payload',
        details: parse.error.issues,
      });
    }

    const pentest = await fastify.prisma.pentest.findUnique({ where: { id } });
    if (!pentest) {
      return reply.code(404).send({ error: 'Pentest not found' });
    }

    try {
      const data = parse.data;
      const result = await orchestrator.startSwarmAudit(
        id,
        data.task || 'Execute dynamic pentest swarm',
        {
          scope: data.scope,
          maxAgents: data.maxAgents,
          maxConcurrentAgents: data.maxConcurrentAgents,
          autoPushToSysReptor: data.autoPushToSysReptor,
        }
      );

      return { data: result };
    } catch (error: any) {
      return reply.code(400).send({ error: error?.message || 'Unable to start swarm' });
    }
  });

  // GET /api/pentests/:id/swarm/stream - dedicated swarm SSE endpoint
  fastify.get('/api/pentests/:id/swarm/stream', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];
    const query = (request.query || {}) as { lastEventId?: string | number };

    // CORS headers (reply.raw bypasses Fastify CORS plugin)
    const origin = request.headers.origin;
    if (origin) {
      reply.raw.setHeader('Access-Control-Allow-Origin', origin);
      reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // Setup SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    const parseEventId = (value: unknown): number | undefined => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
    };

    const headerLastEventIdRaw = Array.isArray(request.headers['last-event-id'])
      ? request.headers['last-event-id'][0]
      : request.headers['last-event-id'];
    const headerLastEventId = parseEventId(headerLastEventIdRaw);
    const queryLastEventId = parseEventId(query.lastEventId);
    const lastEventId = headerLastEventId ?? queryLastEventId;

    // Create SSE client
    const clientId = randomUUID();
    const client = {
      id: clientId,
      send: (event: string, data: any, eventId?: number) => {
        try {
          if (typeof eventId === 'number' && eventId > 0) {
            reply.raw.write(`id: ${eventId}\n`);
          }
          reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (error) {
          console.error(`[SSE][Swarm] Error sending to client ${clientId}:`, error);
        }
      },
      connectedAt: new Date(),
    };

    // Register client with SSE manager
    sseManager.register(id, client, { lastEventId });

    // Send initial connection event
    client.send('swarm_connected', {
      connection_id: clientId,
      pentest_id: id,
      timestamp: Date.now(),
      last_event_id: sseManager.getLatestEventId(id),
    });

    // Heartbeat to keep connection alive (every 15s)
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    // Hijack the response so Fastify doesn't finalize it when the handler returns
    reply.hijack();

    // Keep connection open — wait until the TCP socket closes (client disconnected)
    // NOTE: Do NOT use request.raw 'end' (fires immediately on GET) or reply.raw 'close'
    // (fires when response finishes). The raw socket 'close' is the correct event.
    await new Promise<void>((resolve) => {
      const socket = request.raw.socket;

      const cleanup = () => {
        clearInterval(heartbeat);
        sseManager.unregister(id, clientId);
        console.log(`[SSE][Swarm] Client ${clientId} disconnected from pentest ${id}`);
        resolve();
      };

      if (socket) {
        socket.once('close', cleanup);
      } else {
        // Fallback: listen on request 'close' (node 18+ http2 compat)
        request.raw.once('close', cleanup);
      }
    });
  });
}
