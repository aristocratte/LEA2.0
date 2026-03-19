/**
 * SSE Routes - Server-Sent Events endpoint
 */

import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { sseManager } from '../services/SSEManager.js';
import type { FastifyRequestWithParams } from '../types/fastify.d.js';

export async function streamRoutes(fastify: FastifyInstance) {
  // GET /api/pentests/:id/stream - SSE endpoint
  fastify.get('/api/pentests/:id/stream', async (request, reply) => {
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

    // Create SSE client
    const clientId = randomUUID();
    const parseEventId = (value: unknown): string | undefined => {
      if (typeof value === 'string' && value.trim()) return value.trim();
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? String(Math.floor(parsed)) : undefined;
    };
    const headerLastEventIdRaw = Array.isArray(request.headers['last-event-id'])
      ? request.headers['last-event-id'][0]
      : request.headers['last-event-id'];
    const headerLastEventId = parseEventId(headerLastEventIdRaw);
    const queryLastEventId = parseEventId(query.lastEventId);
    const lastEventId = headerLastEventId ?? queryLastEventId;

    const client = {
      id: clientId,
      send: (event: string, data: any, eventId?: string) => {
        try {
          if (eventId !== undefined) {
            reply.raw.write(`id: ${eventId}\n`);
          }
          reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (error) {
          console.error(`[SSE] Error sending to client ${clientId}:`, error);
        }
      },
      connectedAt: new Date(),
    };

    // Register client with SSE manager
    sseManager.register(id, client, { lastEventId });

    // Send initial connection event
    client.send('connected', {
      runId: id,
      source: 'system',
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'connected',
      payload: {
        type: 'connected',
        connection_id: clientId,
        pentest_id: id,
        timestamp: Date.now(),
      }
    });

    // Heartbeat to keep connection alive (every 15s)
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': heartbeat\n\n');
      } catch (error) {
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
        console.log(`[SSE] Client ${clientId} disconnected from pentest ${id}`);
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
