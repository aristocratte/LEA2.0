import type { FastifyInstance } from 'fastify';
import type { HookBus } from '../core/hooks/index.js';
import type { HookEventName } from '../core/hooks/types.js';

const HOOK_EVENTS: HookEventName[] = ['pre-tool', 'post-tool', 'tool-failure', 'agent-idle', 'agent-completed'];

function getHookBus(fastify: FastifyInstance): HookBus | undefined {
  return (fastify as any).hookBus as HookBus | undefined;
}

export async function hookRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/hooks', async (_request, reply) => {
    const hookBus = getHookBus(fastify);
    if (!hookBus) return reply.code(503).send({ error: 'Hook bus not available' });

    return {
      data: {
        observationOnly: true,
        events: HOOK_EVENTS.map((event) => ({
          name: event,
          listenerCount: hookBus.listenerCount(event),
          hasListeners: hookBus.hasListeners(event),
        })),
      },
    };
  });
}
