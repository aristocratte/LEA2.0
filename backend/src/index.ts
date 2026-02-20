/**
 * LEA Backend - Main Entry Point
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import { pentestRoutes } from './routes/pentests.js';
import { streamRoutes } from './routes/stream.js';
import { reportRoutes } from './routes/reports.js';
import { providerRoutes } from './routes/providers.js';

const fastify = Fastify({
  logger: true,
});

// Register plugins
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001').split(',');

await fastify.register(cors, {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  credentials: true,
});

// Register Prisma
fastify.decorate('prisma', new PrismaClient());

// Register routes
await fastify.register(pentestRoutes);
await fastify.register(streamRoutes);
await fastify.register(reportRoutes);
await fastify.register(providerRoutes);

// Health check
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('[Server] Shutting down gracefully...');
  await fastify.prisma.$disconnect();
  await fastify.close();
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Start server
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001;
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });

    console.log(`
    ╔═════════════════════════════════════════════════════╗
    ║                                                   ║
    ║   LEA/EASM AI Platform - Backend Server           ║
    ║                                                   ║
    ║   ✓ Server running on: http://${host}:${port}     ║
    ║   ✓ Environment: ${process.env.NODE_ENV || 'development'}                  ║
    ║                                                   ║
    ╚═════════════════════════════════════════════════════╝
    `);

    // Check MCP Kali container health (non-blocking)
    try {
      const { kaliMcpClient } = await import('./services/mcp/KaliMCPClient.js');
      const healthy = await kaliMcpClient.healthCheck();
      if (healthy) {
        const tools = await kaliMcpClient.listTools();
        console.log(`    ✓ MCP Kali container: healthy (${tools.length} tools available)`);
      } else {
        console.log('    ⚠ MCP Kali container: not responding (run ./start.sh to start Docker)');
      }
    } catch (err: any) {
      console.log(`    ⚠ MCP Kali container: ${err.message}`);
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
