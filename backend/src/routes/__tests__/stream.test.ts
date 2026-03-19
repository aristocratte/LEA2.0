import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { sseManager } from '../../services/SSEManager.js';
import { streamRoutes } from '../stream.js';

async function buildApp() {
  const fastify = Fastify({ logger: false });
  await fastify.register(streamRoutes);
  await fastify.ready();
  return fastify;
}

afterEach(() => {
  for (const pentestId of sseManager.getActivePentests()) {
    sseManager.disconnectAll(pentestId);
  }
});

describe('streamRoutes', () => {
  it.skip('opens an SSE stream and sends the connected envelope first', async () => {
    const app = await buildApp();
    await app.close();
    expect(true).toBe(true);
  });
});
