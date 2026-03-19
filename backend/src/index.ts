import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { pentestRoutes } from './routes/pentests.js';
import { streamRoutes } from './routes/stream.js';
import { reportRoutes } from './routes/reports.js';
import { providerRoutes } from './routes/providers.js';
import { swarmRoutes } from './routes/swarm.js';
import { validateRoutes } from './routes/validate.js';

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
const buildDatabaseUrl = (): string | undefined => {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', process.env.PRISMA_CONNECTION_LIMIT || '10');
    }
    return url.toString();
  } catch {
    return raw;
  }
};

const databaseUrl = buildDatabaseUrl();

const prisma = new PrismaClient({
  datasources: databaseUrl
    ? { db: { url: databaseUrl } }
    : undefined,
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'warn', 'error']
    : ['warn', 'error'],
});

fastify.decorate('prisma', prisma);

// Optional API key auth — only active when LEA_API_KEY env var is set
const LEA_API_KEY = process.env.LEA_API_KEY;

if (LEA_API_KEY) {
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip auth for health check and public routes
    if (request.url === '/health' || request.url === '/api/health') return;

    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== LEA_API_KEY) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
}

// Register routes
await fastify.register(pentestRoutes);
await fastify.register(streamRoutes);
await fastify.register(reportRoutes);
await fastify.register(providerRoutes);
await fastify.register(swarmRoutes);
await fastify.register(validateRoutes);

// Health check
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Compatibility health check (frontend proxy expects /api/health)
fastify.get('/api/health', async (request, reply) => {
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

function loadSSLConfig() {
  const enabled = process.env.SSL_ENABLED === 'true';
  if (!enabled) return null;

  try {
    const key = readFileSync(process.env.SSL_KEY_PATH || './certs/server.key');
    const cert = readFileSync(process.env.SSL_CERT_PATH || './certs/server.crt');
    const ca = process.env.SSL_CA_PATH ? readFileSync(process.env.SSL_CA_PATH) : undefined;
    return { key, cert, ca };
  } catch (err: any) {
    console.error(`[SSL] Failed to load certificates: ${err.message}`);
    return null;
  }
}

// Start server
const start = async () => {
  try {
    const ssl = loadSSLConfig();
    const useSSL = ssl !== null;
    const port = useSSL 
      ? (Number(process.env.SSL_PORT) || 3443) 
      : (Number(process.env.PORT) || 3001);
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ 
      port, 
      host,
      ...(useSSL && ssl ? { https: ssl } : {}),
    });

    const protocol = useSSL ? 'https' : 'http';
    console.log(`
    ╔═════════════════════════════════════════════════════╗
    ║                                                   ║
    ║   LEA/EASM AI Platform - Backend Server           ║
    ║                                                   ║
    ║   ✓ Server running on: ${protocol}://${host}:${port}${' '.repeat(Math.max(0, 10 - String(port).length))}     ║
    ║   ✓ SSL: ${useSSL ? 'enabled' : 'disabled'}${' '.repeat(Math.max(0, 36 - (useSSL ? 'enabled' : 'disabled').length))}║
    ║   ✓ Environment: ${process.env.NODE_ENV || 'development'}${' '.repeat(Math.max(0, 25 - (process.env.NODE_ENV || 'development').length))}║
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
