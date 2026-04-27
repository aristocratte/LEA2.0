/**
 * Agent Routes — Core-layer generic agent endpoints.
 *
 * ## Architecture (C3)
 *
 * These routes use **SwarmOrchestrator** (core layer), NOT PentestOrchestrator
 * (service layer). See SwarmOrchestrator.ts header for the full double-swarm rationale.
 *
 * Exposes SwarmOrchestrator functionality via HTTP:
 * - Spawn new agents
 * - Send messages to agents
 * - List and query agents
 * - Kill individual agents
 * - Shutdown all agents
 */

import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { SwarmOrchestrator } from '../core/swarm/SwarmOrchestrator.js';
import type { FastifyRequestWithParams } from '../types/fastify.d.js';

// ============================================
// TYPES
// ============================================

export interface FastifyAgentInstance extends FastifyInstance {
  swarmOrchestrator: SwarmOrchestrator;
}

interface AgentRequestParams {
  agentId: string;
}

// ============================================
// SCHEMAS
// ============================================

const SpawnRequestSchema = z.object({
  name: z.string().min(1).max(50),
  role: z.string().optional(),
  prompt: z.string().min(1),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  swarmRunId: z.string().optional(),
  pentestId: z.string().optional(),
});

const MessageRequestSchema = z.object({
  text: z.string().min(1),
});

// ============================================
// ROUTES
// ============================================

export async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  const orchestrator = (fastify as any).swarmOrchestrator as SwarmOrchestrator | undefined;

  if (!orchestrator) {
    // This should not happen since orchestrator is wired at boot time
    fastify.log.warn('SwarmOrchestrator not initialized, agent routes will return 503');
    // Graceful: register routes but return 503 until orchestrator is ready
    fastify.addHook('onRequest', async (_, reply) => {
      reply.code(503).send({ error: 'SwarmOrchestrator not initialized' });
    });
    return;
  }

  const sendAgentError = (reply: FastifyReply, error: any, fallbackMessage: string, statusCode = 400) => {
    const message = error?.message || fallbackMessage;
    return reply.code(statusCode).send({ error: message });
  };

  // POST /api/agents/spawn - Spawn a new agent
  fastify.post('/api/agents/spawn', async (request, reply) => {
    const parse = SpawnRequestSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid spawn payload',
        details: parse.error.issues,
      });
    }

    try {
      const data = parse.data;
      const swarmRunId = data.swarmRunId || 'default-swarm';
      const pentestId = data.pentestId || 'default-pentest';

      const result = await orchestrator.spawnAgent({
        name: data.name,
        role: data.role || 'Agent',
        prompt: data.prompt,
        swarmRunId,
        pentestId,
        model: data.model,
        systemPrompt: data.systemPrompt,
        allowedTools: data.allowedTools,
      });

      if (!result.success) {
        return reply.code(400).send({ error: result.error || 'Failed to spawn agent' });
      }

      return reply.code(201).send({
        data: {
          agentId: result.agentId,
          taskId: result.taskId,
        },
      });
    } catch (error: any) {
      return sendAgentError(reply, error, 'Unable to spawn agent');
    }
  });

  // POST /api/agents/:agentId/message - Send message to agent
  fastify.post('/api/agents/:agentId/message', async (request, reply) => {
    const { agentId } = request.params as AgentRequestParams;

    const parse = MessageRequestSchema.safeParse(request.body || {});
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid message payload',
        details: parse.error.issues,
      });
    }

    try {
      orchestrator.sendMessage(agentId, parse.data.text);
      return reply.code(202).send({ data: { message: 'Message delivered' } });
    } catch (error: any) {
      const message = error?.message || 'Unable to send message';
      const statusCode = message.includes('not found') ? 404 : 400;
      return sendAgentError(reply, error, 'Unable to send message', statusCode);
    }
  });

  // GET /api/agents - List all agents
  fastify.get('/api/agents', async (request, reply) => {
    try {
      const agents = orchestrator.listAgents();
      return { data: agents };
    } catch (error: any) {
      return sendAgentError(reply, error, 'Unable to list agents');
    }
  });

  // GET /api/agents/:agentId - Get single agent status (enriched with health and task info)
  fastify.get('/api/agents/:agentId', async (request, reply) => {
    const { agentId } = request.params as AgentRequestParams;

    try {
      const trackedAgent = orchestrator.getAgent(agentId);
      if (!trackedAgent) {
        return reply.code(404).send({ error: 'Agent not found' });
      }

      const agents = orchestrator.listAgents();
      const agent = agents.find(a => a.agentId === agentId);

      if (!agent) {
        return reply.code(404).send({ error: 'Agent not found' });
      }

      // Enrich with task info from TaskManager
      const taskManager = orchestrator.getTaskManager();
      const task = taskManager.getTask(trackedAgent.taskId);

      // Enrich with recent transcript (last 10 entries)
      const transcriptLogger = orchestrator.getTranscriptLogger();
      let recentTranscript: any[] | undefined;
      if (transcriptLogger) {
        const entries = await transcriptLogger.getLastN(
          trackedAgent.identity.swarmRunId,
          agentId,
          10
        );
        recentTranscript = entries.map(e => ({
          timestamp: e.timestamp,
          role: e.role,
          content: e.content,
          turn: e.turn,
        }));
      }

      return {
        data: {
          ...agent,
          task: task ? {
            taskId: task.taskId,
            description: task.description,
            status: task.status,
            startTime: task.startTime,
            endTime: task.endTime,
            error: task.error,
          } : undefined,
          recentTranscript,
        },
      };
    } catch (error: any) {
      return sendAgentError(reply, error, 'Unable to get agent');
    }
  });

  // GET /api/agents/:agentId/transcript - Get agent transcript
  fastify.get('/api/agents/:agentId/transcript', async (request, reply) => {
    const { agentId } = request.params as AgentRequestParams;
    const query = request.query as { limit?: string };

    try {
      const trackedAgent = orchestrator.getAgent(agentId);
      if (!trackedAgent) {
        return reply.code(404).send({ error: 'Agent not found' });
      }

      const transcriptLogger = orchestrator.getTranscriptLogger();
      if (!transcriptLogger) {
        return reply.code(503).send({ error: 'Transcript logging not available' });
      }

      // Parse limit parameter (default to 50, max 200)
      const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));

      const entries = await transcriptLogger.getLastN(
        trackedAgent.identity.swarmRunId,
        agentId,
        limit
      );

      return {
        data: {
          agentId,
          swarmRunId: trackedAgent.identity.swarmRunId,
          limit,
          count: entries.length,
          transcript: entries.map(e => ({
            timestamp: e.timestamp,
            role: e.role,
            content: e.content,
            turn: e.turn,
          })),
        },
      };
    } catch (error: any) {
      return sendAgentError(reply, error, 'Unable to get transcript');
    }
  });

  // DELETE /api/agents/:agentId - Kill an agent
  fastify.delete('/api/agents/:agentId', async (request, reply) => {
    const { agentId } = request.params as AgentRequestParams;

    try {
      const killed = await orchestrator.killAgent(agentId);
      if (!killed) {
        return reply.code(404).send({ error: 'Agent not found' });
      }

      return reply.code(202).send({ data: { message: 'Agent killed' } });
    } catch (error: any) {
      return sendAgentError(reply, error, 'Unable to kill agent');
    }
  });

  // POST /api/agents/shutdown - Shutdown all agents
  fastify.post('/api/agents/shutdown', async (request, reply) => {
    try {
      await orchestrator.shutdown();
      return reply.code(202).send({ data: { message: 'All agents shut down' } });
    } catch (error: any) {
      return sendAgentError(reply, error, 'Unable to shutdown agents');
    }
  });
}
