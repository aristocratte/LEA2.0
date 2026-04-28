/**
 * SSE Routes - Server-Sent Events endpoint
 */

import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { sseManager } from '../services/SSEManager.js';
import {
  getLatestPentestEventSequence,
  listPentestEventEnvelopes,
  parseEventCursor,
} from '../services/PentestEventService.js';
import { resolveAllowedCorsOrigin } from '../services/SecurityPolicy.js';
import type { FastifyRequestWithParams } from '../types/fastify.d.js';

export async function streamRoutes(fastify: FastifyInstance) {
  // GET /api/pentests/:id/stream - SSE endpoint
  fastify.get('/api/pentests/:id/stream', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];
    const query = (request.query || {}) as { lastEventId?: string | number; sinceSeq?: string | number };

    const origin = request.headers.origin;
    const allowedOrigin = resolveAllowedCorsOrigin(origin);
    if (origin && !allowedOrigin) {
      return reply.code(403).send({ error: 'Origin not allowed' });
    }

    // CORS headers (reply.raw bypasses Fastify CORS plugin)
    if (allowedOrigin) {
      reply.raw.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
      reply.raw.setHeader('Vary', 'Origin');
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
    const querySinceSeq = parseEventId(query.sinceSeq);
    const lastEventId = headerLastEventId ?? queryLastEventId ?? querySinceSeq;
    const lastSequence = parseEventCursor(lastEventId);

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

    const replayedEvents = await listPentestEventEnvelopes(fastify.prisma, id, { sinceSeq: lastSequence });
    let latestReplaySequence = lastSequence ?? 0;
    for (const event of replayedEvents) {
      client.send(event.eventType, event, event.id);
      latestReplaySequence = Math.max(latestReplaySequence, event.sequence);
    }

    const latestDurableSequence = await getLatestPentestEventSequence(fastify.prisma, id);
    sseManager.seedSequence(id, Math.max(latestReplaySequence, latestDurableSequence));

    // Register client with SSE manager after durable replay; the in-memory queue
    // remains only a short-lived cache for events not yet flushed to storage.
    sseManager.register(id, client, { lastEventId: latestReplaySequence > 0 ? String(latestReplaySequence) : lastEventId });

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
