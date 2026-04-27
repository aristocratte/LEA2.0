/**
 * Command Routes Tests
 */

import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandRegistry } from '../../core/runtime/CommandRegistry.js';
import type { Command } from '../../core/types/command-types.js';

import { commandRoutes } from '../commands.js';

// Helper: create a minimal local command
function makeLocalCommand(overrides: Partial<Command> = {}): Command {
  return {
    type: 'local',
    name: 'test-cmd',
    description: 'A test command',
    ...overrides,
  } as Command;
}

// Helper: build a Fastify app with optional registry
async function buildApp(registry?: CommandRegistry | null) {
  const fastify = Fastify({ logger: false });

  if (registry !== undefined && registry !== null) {
    (fastify as any).commandRegistry = registry;
  }
  // If registry is explicitly null or undefined, don't set it

  await fastify.register(commandRoutes);
  await fastify.ready();

  return fastify;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('commandRoutes', () => {
  // ============================================
  // GET /api/commands
  // ============================================

  it('GET /api/commands returns command list with metadata', async () => {
    const registry = new CommandRegistry();
    registry.register(
      makeLocalCommand({
        name: 'status',
        description: 'Show status',
        aliases: ['st'],
        argHints: '[filter]',
        group: 'info',
      }),
      'builtin',
    );
    registry.register(
      makeLocalCommand({
        name: 'help',
        description: 'Show help',
      }),
      'builtin',
    );

    const fastify = await buildApp(registry);

    try {
      const response = await request(fastify.server).get('/api/commands');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);

      const status = response.body.data.find((c: any) => c.name === 'status');
      expect(status).toEqual({
        name: 'status',
        type: 'local',
        aliases: ['st'],
        description: 'Show status',
        argHints: '[filter]',
        group: 'info',
      });

      const help = response.body.data.find((c: any) => c.name === 'help');
      expect(help).toEqual({
        name: 'help',
        type: 'local',
        aliases: undefined,
        description: 'Show help',
        argHints: undefined,
        group: undefined,
      });
    } finally {
      await fastify.close();
    }
  });

  it('GET /api/commands returns 503 when registry not available', async () => {
    // Build app without setting commandRegistry on fastify
    const fastify = await buildApp(null);

    try {
      const response = await request(fastify.server).get('/api/commands');

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('Command registry not available');
    } finally {
      await fastify.close();
    }
  });

  // ============================================
  // POST /api/commands/execute
  // ============================================

  it('POST /api/commands/execute with valid command returns result', async () => {
    const registry = new CommandRegistry();
    const callMock = vi.fn().mockResolvedValue({
      type: 'text',
      content: 'All systems operational',
    });

    registry.register(
      {
        type: 'local',
        name: 'status',
        description: 'Show status',
        call: callMock,
      } as any,
      'builtin',
    );

    const fastify = await buildApp(registry);

    try {
      const response = await request(fastify.server)
        .post('/api/commands/execute')
        .send({ command: 'status', args: '--json' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: {
          type: 'text',
          content: 'All systems operational',
        },
      });

      expect(callMock).toHaveBeenCalledWith('--json', expect.any(Object));
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/commands/execute with unknown command returns result (not 500)', async () => {
    const registry = new CommandRegistry();
    // Registry is empty — no commands registered

    const fastify = await buildApp(registry);

    try {
      const response = await request(fastify.server)
        .post('/api/commands/execute')
        .send({ command: 'nonexistent' });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        type: 'text',
        content: 'Unknown command: nonexistent',
      });
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/commands/execute with invalid payload returns 400', async () => {
    const registry = new CommandRegistry();
    const fastify = await buildApp(registry);

    try {
      // Missing required 'command' field
      const response = await request(fastify.server)
        .post('/api/commands/execute')
        .send({ args: 'something' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
      expect(response.body.details).toBeDefined();
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/commands/execute passes sessionId and scope in context', async () => {
    const registry = new CommandRegistry();
    const callMock = vi.fn().mockResolvedValue({
      type: 'text',
      content: 'ok',
    });

    registry.register(
      {
        type: 'local',
        name: 'check',
        description: 'Check something',
        call: callMock,
      } as any,
      'builtin',
    );

    const fastify = await buildApp(registry);

    try {
      const response = await request(fastify.server)
        .post('/api/commands/execute')
        .send({
          command: 'check',
          args: 'test',
          sessionId: 'session-123',
          scope: { pentestId: 'pentest-1' },
        });

      expect(response.status).toBe(200);

      const context = callMock.mock.calls[0][1];
      expect(context.sessionId).toBe('session-123');
      expect(context.scope).toEqual({ pentestId: 'pentest-1' });
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/commands/execute returns 500 when command throws', async () => {
    const registry = new CommandRegistry();
    const callMock = vi.fn().mockRejectedValue(new Error('Something broke'));

    registry.register(
      {
        type: 'local',
        name: 'fail',
        description: 'Fails on purpose',
        call: callMock,
      } as any,
      'builtin',
    );

    const fastify = await buildApp(registry);

    try {
      const response = await request(fastify.server)
        .post('/api/commands/execute')
        .send({ command: 'fail' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Something broke');
    } finally {
      await fastify.close();
    }
  });
});
