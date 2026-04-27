/**
 * Command Routes - REST API endpoints for slash command system
 *
 * Exposes CommandRegistry functionality via HTTP:
 * - List all available commands
 * - Execute a command by name/alias
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CommandRegistry } from '../core/runtime/CommandRegistry.js';

// ============================================
// SCHEMAS
// ============================================

const ExecuteSchema = z.object({
  command: z.string().min(1),
  args: z.string().default(''),
  sessionId: z.string().optional(),
  scope: z.object({
    pentestId: z.string().optional(),
    teamId: z.string().optional(),
  }).optional(),
});

// ============================================
// HELPERS
// ============================================

function getRegistry(fastify: FastifyInstance): CommandRegistry | undefined {
  return (fastify as any).commandRegistry as CommandRegistry | undefined;
}

// ============================================
// ROUTES
// ============================================

export async function commandRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/commands — list available commands
  fastify.get('/api/commands', async (request, reply) => {
    const registry = getRegistry(fastify);
    if (!registry) {
      return reply.code(503).send({ error: 'Command registry not available' });
    }

    const commands = registry.getAll();
    const data = commands.map(cmd => ({
      name: cmd.name,
      type: cmd.type,
      aliases: cmd.aliases ? [...cmd.aliases] : undefined,
      description: cmd.description,
      argHints: cmd.argHints,
      group: cmd.group,
    }));

    return { data };
  });

  // POST /api/commands/execute — execute a command
  fastify.post('/api/commands/execute', async (request, reply) => {
    const registry = getRegistry(fastify);
    if (!registry) {
      return reply.code(503).send({ error: 'Command registry not available' });
    }

    const parsed = ExecuteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid request',
        details: parsed.error.flatten(),
      });
    }

    const { command, args, sessionId, scope } = parsed.data;

    // Build context
    const context = {
      sessionId: sessionId ?? 'server',
      args,
      toolUseContext: {} as any,
      tools: new Map() as any,
      commandRegistry: registry,
      swarmOrchestrator: (fastify as any).swarmOrchestrator,
      persistentTaskManager: (fastify as any).persistentTaskManager,
      teamManager: (fastify as any).teamManager,
      runtimeTaskManager: (fastify as any).runtimeTaskManager,
      permissionRequestStore: (fastify as any).permissionRequestStore,
      planModeManager: (fastify as any).planModeManager,
      prisma: fastify.prisma,
      sseManager: (fastify as any).sseManager,
      swarmState: (fastify as any).swarmState,
      scope: scope ?? {},
    };

    try {
      const result = await registry.execute(command, args, context);
      return { data: { type: result.type, content: result.content } };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message ?? 'Command execution failed' });
    }
  });
}
