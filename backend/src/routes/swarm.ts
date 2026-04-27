/**
 * Swarm Routes — Pentest domain swarm endpoints.
 *
 * ## Architecture (C3)
 *
 * These routes use **PentestOrchestrator** (service layer), NOT SwarmOrchestrator
 * (core layer). See PentestOrchestrator.ts header for the full double-swarm rationale.
 *
 * Shared services (ProviderManager, HookBus, CheckpointService) are injected from
 * the Fastify instance to avoid duplicate singletons.
 */

import { randomUUID } from 'node:crypto';
import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sseManager } from '../services/SSEManager.js';
import { ProviderManager } from '../services/ProviderManager.js';
import { PentestOrchestrator } from '../services/PentestOrchestrator.js';
import { SysReptorService } from '../services/SysReptorService.js';
import type { FastifyRequestWithParams } from '../types/fastify.d.js';

const StartSwarmSchema = z.object({
  task: z.string().max(5000).optional(),
  scope: z.array(z.string().min(1)).max(200).optional(),
  maxAgents: z.number().int().min(1).max(30).optional(),
  maxConcurrentAgents: z.number().int().min(1).max(20).optional(),
  autoPushToSysReptor: z.boolean().optional(),
  runtime: z.object({
    mode: z.enum(['live', 'scenario', 'replay']).optional(),
    scenarioId: z.string().min(1).optional(),
    traceId: z.string().min(1).optional(),
    speed: z.number().positive().optional(),
    startAtSequence: z.number().int().min(1).optional(),
    autoStart: z.boolean().optional(),
    capture: z.boolean().optional(),
    failureProfileId: z.string().min(1).optional(),
  }).optional(),
});

const ApproveSensitiveToolSchema = z.object({
  approvalId: z.string().min(1),
});

const DenySensitiveToolSchema = z.object({
  approvalId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

const RuntimeControlSchema = z.object({
  action: z.enum(['pause', 'resume', 'step', 'jump_to_sequence', 'jump_to_correlation']),
  sequence: z.number().int().min(1).optional(),
  correlationId: z.string().min(1).optional(),
});

export async function swarmRoutes(fastify: FastifyInstance): Promise<void> {
  // Use the shared ProviderManager (same instance as SwarmOrchestrator in index.ts)
  const providerManager = (fastify as any).providerManager as ProviderManager ?? new ProviderManager();
  const orchestrator = new PentestOrchestrator(fastify.prisma, providerManager, undefined, {
    hookBus: (fastify as any).hookBus,
    checkpointService: (fastify as any).checkpointService,
  });

  const ensurePentestExists = async (id: string) => {
    const pentest = await fastify.prisma.pentest.findUnique({ where: { id } });
    if (!pentest) {
      return false;
    }
    return true;
  };

  const sendSwarmError = (reply: FastifyReply, error: any, fallbackMessage: string) => {
    const message = error?.message || fallbackMessage;
    const normalized = String(message).toLowerCase();
    const statusCode = normalized.includes('not found') || normalized.includes('no active swarm run')
      ? 404
      : 400;
    return reply.code(statusCode).send({ error: message });
  };

  const extractProjectId = (eventData: unknown): string | null => {
    if (!eventData || typeof eventData !== 'object' || Array.isArray(eventData)) {
      return null;
    }

    const raw = (eventData as Record<string, unknown>).sysReptorProjectId;
    const projectId = String(raw || '').trim();
    return projectId || null;
  };

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

    if (!(await ensurePentestExists(id))) {
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
          runtime: data.runtime,
        }
      );

      return { data: result };
    } catch (error: any) {
      return reply.code(400).send({ error: error?.message || 'Unable to start swarm' });
    }
  });

  // GET /api/pentests/:id/swarm/state
  fastify.get('/api/pentests/:id/swarm/state', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    if (!(await ensurePentestExists(id))) {
      return reply.code(404).send({ error: 'Pentest not found' });
    }

    try {
      const run = await orchestrator.getSwarmRun(id);
      return { data: run };
    } catch (error: any) {
      return sendSwarmError(reply, error, 'Unable to load swarm state');
    }
  });

  // GET /api/pentests/:id/swarm/history
  fastify.get('/api/pentests/:id/swarm/history', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    if (!(await ensurePentestExists(id))) {
      return reply.code(404).send({ error: 'Pentest not found' });
    }

    try {
      const history = await orchestrator.getSwarmHistory(id);
      return { data: history };
    } catch (error: any) {
      return sendSwarmError(reply, error, 'Unable to load swarm history');
    }
  });

  fastify.post('/api/pentests/:id/swarm/runtime/control', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];
    const parse = RuntimeControlSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({ error: 'Invalid runtime control payload', details: parse.error.issues });
    }

    if (!(await ensurePentestExists(id))) {
      return reply.code(404).send({ error: 'Pentest not found' });
    }

    try {
      const result = await orchestrator.controlSwarmRuntime(id, parse.data);
      return { data: result };
    } catch (error: any) {
      return sendSwarmError(reply, error, 'Unable to control swarm runtime');
    }
  });

  fastify.get('/api/pentests/:id/swarm/traces', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];
    if (!(await ensurePentestExists(id))) {
      return reply.code(404).send({ error: 'Pentest not found' });
    }

    try {
      const traces = await orchestrator.listSwarmTraces(id);
      return { data: traces };
    } catch (error: any) {
      return sendSwarmError(reply, error, 'Unable to list swarm traces');
    }
  });

  fastify.get('/api/swarm/traces/:traceId', async (request, reply) => {
    const { traceId } = request.params as { traceId: string };

    try {
      const trace = await orchestrator.getSwarmTrace(traceId);
      if (!trace) {
        return reply.code(404).send({ error: 'Trace not found' });
      }
      return { data: trace };
    } catch (error: any) {
      return sendSwarmError(reply, error, 'Unable to load swarm trace');
    }
  });

  // POST /api/pentests/:id/swarm/pause
  fastify.post('/api/pentests/:id/swarm/pause', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    if (!(await ensurePentestExists(id))) {
      return reply.code(404).send({ error: 'Pentest not found' });
    }

    try {
      const run = await orchestrator.pauseSwarmAudit(id);
      return { data: run };
    } catch (error: any) {
      return sendSwarmError(reply, error, 'Unable to pause swarm');
    }
  });

  // POST /api/pentests/:id/swarm/resume
  fastify.post('/api/pentests/:id/swarm/resume', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    if (!(await ensurePentestExists(id))) {
      return reply.code(404).send({ error: 'Pentest not found' });
    }

    try {
      const run = await orchestrator.resumeSwarmAudit(id);
      return { data: run };
    } catch (error: any) {
      return sendSwarmError(reply, error, 'Unable to resume swarm');
    }
  });

  // POST /api/pentests/:id/swarm/force-merge
  fastify.post('/api/pentests/:id/swarm/force-merge', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    if (!(await ensurePentestExists(id))) {
      return reply.code(404).send({ error: 'Pentest not found' });
    }

    try {
      const run = await orchestrator.forceMergeSwarmAudit(id);
      return { data: run };
    } catch (error: any) {
      return sendSwarmError(reply, error, 'Unable to force-merge swarm');
    }
  });

  // POST /api/pentests/:id/swarm/tools/approve
  fastify.post('/api/pentests/:id/swarm/tools/approve', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];
    const parse = ApproveSensitiveToolSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({ error: 'Invalid approval payload', details: parse.error.issues });
    }

    if (!(await ensurePentestExists(id))) {
      return reply.code(404).send({ error: 'Pentest not found' });
    }

    try {
      await orchestrator.approveSwarmSensitiveTool(id, parse.data.approvalId);

      return {
        data: {
          approvalId: parse.data.approvalId,
          decision: 'APPROVED',
        },
      };
    } catch (error: any) {
      return sendSwarmError(reply, error, 'Unable to approve sensitive tool');
    }
  });

  // POST /api/pentests/:id/swarm/tools/deny
  fastify.post('/api/pentests/:id/swarm/tools/deny', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];
    const parse = DenySensitiveToolSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({ error: 'Invalid denial payload', details: parse.error.issues });
    }

    if (!(await ensurePentestExists(id))) {
      return reply.code(404).send({ error: 'Pentest not found' });
    }

    try {
      await orchestrator.denySwarmSensitiveTool(
        id,
        parse.data.approvalId,
        parse.data.reason
      );

      return {
        data: {
          approvalId: parse.data.approvalId,
          decision: 'DENIED',
          reason: parse.data.reason,
        },
      };
    } catch (error: any) {
      return sendSwarmError(reply, error, 'Unable to deny sensitive tool');
    }
  });

  // GET /api/pentests/:id/swarm/report.pdf
  fastify.get('/api/pentests/:id/swarm/report.pdf', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    if (!(await ensurePentestExists(id))) {
      return reply.code(404).send({ error: 'Pentest not found' });
    }

    const events = await fastify.prisma.pentestEvent.findMany({
      where: {
        pentest_id: id,
        event_type: 'swarm_run_completed',
      },
      orderBy: { sequence: 'desc' },
      take: 20,
      select: { event_data: true },
    });

    const projectId = events
      .map((event) => extractProjectId(event.event_data))
      .find((value): value is string => Boolean(value));

    if (!projectId) {
      return reply.code(404).send({ error: 'No SysReptor project linked for this pentest' });
    }

    try {
      const sysReptor = new SysReptorService();
      const report = await sysReptor.renderReport(projectId);
      const pdfBuffer = report.data ? Buffer.from(report.data) : Buffer.alloc(0);

      if (pdfBuffer.length === 0) {
        return reply.code(502).send({ error: 'SysReptor returned an empty PDF report' });
      }

      reply.header('Content-Type', report.contentType || 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="swarm-report-${id}.pdf"`);
      return reply.send(pdfBuffer);
    } catch (error: any) {
      console.error(`[Swarm] Unable to download SysReptor report for pentest ${id}:`, error);
      return reply.code(502).send({ error: error?.message || 'Unable to download SysReptor report' });
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

    // Create SSE client
    const clientId = randomUUID();
    const client = {
      id: clientId,
      send: (event: string, data: any, eventId?: string) => {
        try {
          if (eventId !== undefined) {
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
      runId: id,
      source: 'system',
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'swarm_connected',
      payload: {
        type: 'swarm_connected',
        connection_id: clientId,
        pentest_id: id,
        timestamp: Date.now(),
      }
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
