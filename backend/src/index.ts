import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pentestRoutes } from './routes/pentests.js';
import { streamRoutes } from './routes/stream.js';
import { reportRoutes } from './routes/reports.js';
import { providerRoutes } from './routes/providers.js';
import { swarmRoutes } from './routes/swarm.js';
import { validateRoutes } from './routes/validate.js';
import { agentRoutes } from './routes/agents.js';
import { teamRoutes } from './routes/teams.js';
import { taskRoutes } from './routes/tasks.js';
import { runtimeTaskRoutes } from './routes/runtime-tasks.js';
import { messageRoutes } from './routes/messages.js';
import { TeamManager } from './core/swarm/TeamManager.js';
import { PersistentTaskManager } from './core/swarm/PersistentTaskManager.js';
import { SwarmOrchestrator } from './core/swarm/SwarmOrchestrator.js';
import { ToolRegistry } from './core/runtime/ToolRegistry.js';
import { CommandRegistry } from './core/runtime/CommandRegistry.js';
import { NotificationQueue } from './core/swarm/NotificationQueue.js';
import { TranscriptLogger } from './core/runtime/TranscriptLogger.js';
import { ConversationCompactor } from './core/runtime/ConversationCompactor.js';
import { SessionMemoryStore } from './core/memory/SessionMemoryStore.js';
import { MemoryExtractor } from './core/memory/MemoryExtractor.js';
import { CostTracker } from './core/analytics/CostTracker.js';
import { SessionStats } from './core/analytics/SessionStats.js';
import { createCallModel } from './core/runtime/LLMExecutor.js';
import { SwarmEventEmitter } from './agents/swarm/SwarmEventEmitter.js';
import { sseManager } from './services/SSEManager.js';
import { createSwarmState } from './agents/swarm/types.js';
import type { AIClient } from './services/ai/AIClient.js';
import { AnthropicClient } from './services/ai/AnthropicClient.js';
import { ZhipuClient } from './services/ai/ZhipuClient.js';
import { GeminiClient } from './services/ai/GeminiClient.js';
import { AntigravityClient } from './services/ai/AntigravityClient.js';
import { CodexClient } from './services/ai/CodexClient.js';
import { OpenCodeClient } from './services/ai/OpenCodeClient.js';
import { providerManager } from './services/ProviderManager.js';
import { RuntimeTaskManager } from './core/runtime/RuntimeTaskManager.js';
import { StallDetector } from './core/swarm/StallDetector.js';
import { TaskManager } from './core/swarm/TaskManager.js';
import { createBashTool } from './core/runtime/tools/BashTool.js';
import { createTaskOutputTool } from './core/runtime/tools/TaskOutputTool.js';
import { createToolSearchTool } from './core/runtime/tools/ToolSearchTool.js';
import { MessageBus } from './core/swarm/MessageBus.js';
import { createSendMessageTool } from './core/runtime/tools/SendMessageTool.js';
import { PermissionRequestStore } from './core/permissions/PermissionRequestStore.js';
import { createDefaultContext } from './core/permissions/PermissionContext.js';
import { AgentPermissionContextStore } from './core/permissions/AgentPermissionContextStore.js';
import { PermissionSyncManager } from './core/swarm/PermissionSync.js';
import { LeaderPermissionBridge } from './core/swarm/PermissionBridge.js';
import { permissionRoutes } from './routes/permissions.js';
import { PlanModeManager } from './core/runtime/PlanModeManager.js';
import { createEnterPlanModeTool, createExitPlanModeTool } from './core/runtime/tools/PlanModeTools.js';
import { planModeRoutes } from './routes/plan-mode.js';
import { commandRoutes } from './routes/commands.js';
import { worktreeRoutes } from './routes/worktrees.js';
import { statsRoutes } from './routes/stats.js';
import { memoriesRoutes } from './routes/memories.js';
import { awaySummaryRoutes } from './routes/away-summary.js';
import { toolRoutes } from './routes/tools.js';
import { CheckpointService } from './services/context/CheckpointService.js';
import { WorktreeManager } from './core/worktree/index.js';
import { findGitRoot } from './core/worktree/git-operations.js';
import { createEnterWorktreeTool } from './core/runtime/tools/EnterWorktreeTool.js';
import { createExitWorktreeTool } from './core/runtime/tools/ExitWorktreeTool.js';
import { HookBus } from './core/hooks/HookBus.js';
import { McpToolBridge } from './core/mcp/McpToolBridge.js';
import { ToolExecutor } from './core/runtime/ToolExecutor.js';
import { toolInvokeRoutes } from './routes/tool-invoke.js';
import { SkillManager } from './core/skills/index.js';
import { skillRoutes } from './routes/skills.js';
import { PluginManager } from './core/plugins/index.js';
import { pluginRoutes } from './routes/plugins.js';
import { LspAnalysisService, createLspDiagnosticsTool, createLspSymbolsTool } from './core/lsp/index.js';
import { lspRoutes } from './routes/lsp.js';
import { hookRoutes } from './routes/hooks.js';
import { mcpRoutes } from './routes/mcp.js';

const sslConfig = loadSSLConfig();

const fastify = Fastify({
  logger: true,
  ...(sslConfig ? { https: sslConfig } : {}),
});

// Decorate Fastify with shared ProviderManager (used by both SwarmOrchestrator and PentestOrchestrator)
fastify.decorate('providerManager', providerManager);

// Register plugins
const parseCsvEnv = (value: string | undefined, fallback: string[]): string[] => {
  const parsed = value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return parsed && parsed.length > 0 ? parsed : fallback;
};

const allowedOrigins = parseCsvEnv(process.env.ALLOWED_ORIGINS, [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
]);
const allowDevCors = process.env.LEA_ALLOW_DEV_CORS === 'true';

await fastify.register(cors, {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || allowDevCors) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  credentials: true,
});

fastify.addHook('onRequest', async (_request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('Cross-Origin-Resource-Policy', 'same-origin');
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

// ============================================================================
// SWARM ORCHESTRATOR SETUP
// ============================================================================

/**
 * Create an AIClient for a given model identifier.
 * Uses ProviderManager to resolve the provider and create the appropriate client.
 */
async function resolveClientForModel(model: string): Promise<AIClient | null> {
  // Try to resolve provider from model ID
  const provider = await providerManager.getProvider(model);

  if (!provider) {
    console.warn(`[SwarmOrchestrator] No provider found for model: ${model}`);
    return null;
  }

  // Check if provider is healthy
  if (!providerManager.isHealthy(provider)) {
    console.warn(`[SwarmOrchestrator] Provider ${provider.type} is not healthy`);
    return null;
  }

  // Create appropriate client based on provider type
  switch (provider.type) {
    case 'ANTHROPIC':
      return new AnthropicClient(provider.decryptedKey ?? undefined);

    case 'ZHIPU':
      if (!provider.decryptedKey) {
        console.warn('[SwarmOrchestrator] ZHIPU provider requires API key');
        return null;
      }
      return new ZhipuClient(
        provider.decryptedKey,
        provider.base_url ?? undefined,
        'zhipu'
      );

    case 'OPENAI':
      if (!provider.decryptedKey) {
        console.warn('[SwarmOrchestrator] OPENAI provider requires API key');
        return null;
      }
      return new ZhipuClient(
        provider.decryptedKey,
        provider.base_url ?? 'https://api.openai.com/v1',
        'openai'
      );

    case 'GEMINI':
      return new GeminiClient(
        provider.decryptedKey ?? '',
        {
          accessToken: provider.oauth_access_token ?? undefined,
          refreshToken: provider.oauth_refresh_token ?? undefined,
          expiresAt: provider.oauth_expiry ?? undefined,
        }
      );

    case 'ANTIGRAVITY':
      if (!provider.oauth_refresh_token) {
        console.warn('[SwarmOrchestrator] Antigravity provider requires OAuth login');
        return null;
      }
      return new AntigravityClient(provider.oauth_refresh_token);

    case 'CODEX':
      if (!provider.decryptedKey) {
        console.warn('[SwarmOrchestrator] CODEX provider requires API key');
        return null;
      }
      return new CodexClient(
        provider.decryptedKey,
        provider.base_url ?? undefined
      );

    case 'OPENCODE':
      if (!provider.decryptedKey) {
        console.warn('[SwarmOrchestrator] OPENCODE provider requires API key');
        return null;
      }
      return new OpenCodeClient(
        provider.decryptedKey,
        provider.base_url ?? undefined
      );

    case 'CUSTOM':
      if (provider.base_url) {
        if (!provider.decryptedKey) {
          console.warn('[SwarmOrchestrator] CUSTOM provider with base_url requires API key');
          return null;
        }
        return new ZhipuClient(provider.decryptedKey, provider.base_url, 'custom');
      }
      return new AnthropicClient(provider.decryptedKey ?? undefined);

    default:
      console.warn(`[SwarmOrchestrator] Unknown provider type: ${provider.type}`);
      return null;
  }
}

// Create core runtime components
const toolRegistry = new ToolRegistry();
fastify.decorate('toolRegistry', toolRegistry);
const commandRegistry = new CommandRegistry();
const notificationQueue = new NotificationQueue();
const transcriptLogger = new TranscriptLogger('data/transcripts');
const conversationCompactor = new ConversationCompactor();
const sessionMemoryStore = new SessionMemoryStore(prisma);
const memoryExtractor = new MemoryExtractor({
  prisma,
  memoryStore: sessionMemoryStore,
  callModel: async function* (params) {
    // Reuse the same callModel wrapper for extraction (uses default model)
    for await (const event of rawCallModel(params)) {
      yield event;
    }
  },
});
const costTracker = new CostTracker();
const sessionStats = new SessionStats(costTracker);

// Create PersistentTaskManager (needed by SwarmOrchestrator for agent lifecycle cleanup)
const persistentTaskManager = new PersistentTaskManager({ prisma });
fastify.decorate('persistentTaskManager', persistentTaskManager);

// Create RuntimeTaskManager for shell task output tracking
const runtimeTaskManager = new RuntimeTaskManager();
fastify.decorate('runtimeTaskManager', runtimeTaskManager);

// Create TaskManager and StallDetector for shell task execution
const taskManager = new TaskManager();
const stallDetector = new StallDetector(() => {
  // No-op stall handler for now
});

// Register bash and task_output tools
toolRegistry.register(
  createBashTool({
    taskManager,
    runtimeTaskManager,
    stallDetector,
    agentId: undefined,
  })
);

toolRegistry.register(
  createTaskOutputTool(runtimeTaskManager)
);
toolRegistry.register(createToolSearchTool(toolRegistry));

const lspAnalysisService = new LspAnalysisService(process.cwd());
fastify.decorate('lspAnalysisService', lspAnalysisService);
toolRegistry.register(createLspDiagnosticsTool(lspAnalysisService));
toolRegistry.register(createLspSymbolsTool(lspAnalysisService));

// Create MessageBus for inter-agent messaging
const messageBus = new MessageBus();
fastify.decorate('messageBus', messageBus);

// Create HookBus for runtime hook emission
const hookBus = new HookBus();
fastify.decorate('hookBus', hookBus);

// ============================================================================
// PERMISSION SYSTEM
// ============================================================================

// Create PermissionRequestStore for interactive permission resolution
const permissionRequestStore = new PermissionRequestStore();
permissionRequestStore.start();
fastify.decorate('permissionRequestStore', permissionRequestStore);

// Create default permission context for the swarm
const defaultPermissionContext = createDefaultContext({
  mode: 'default',
  headless: false,
});

// Create agent permission context store for per-agent contexts
const agentContextStore = new AgentPermissionContextStore(defaultPermissionContext);
fastify.decorate('agentContextStore', agentContextStore);

// Create permission sync manager (started/stopped per swarm run)
const permissionSync = new PermissionSyncManager();
fastify.decorate('permissionSync', permissionSync);

// Create PlanModeManager for per-agent plan mode tracking
const planModeManager = new PlanModeManager(agentContextStore);
fastify.decorate('planModeManager', planModeManager);

// Register plan mode tools for agents
toolRegistry.register(createEnterPlanModeTool());
toolRegistry.register(createExitPlanModeTool());

// Create WorktreeManager for git worktree isolation
const gitRoot = findGitRoot(process.cwd());
const worktreeManager = new WorktreeManager(gitRoot);
fastify.decorate('worktreeManager', worktreeManager);

// Register worktree tools for agents
toolRegistry.register(createEnterWorktreeTool(worktreeManager));
toolRegistry.register(createExitWorktreeTool(worktreeManager));

// Register send_message tool for agents
toolRegistry.register(
  createSendMessageTool(messageBus)
);

// ============================================================================
// MCP TOOL BRIDGE — Expose Kali MCP tools in ToolRegistry (C5)
// ============================================================================

const mcpToolBridge = new McpToolBridge(
  // Lazy import to avoid circular deps at module level
  (await import('./services/mcp/KaliMCPClient.js')).kaliMcpClient,
  toolRegistry,
  {
    prefix: 'mcp:',
    excludePatterns: [/^shell_exec$/i],
    resolveExecutionContext: async (_toolName, _args, context) => {
      const pentestId = typeof context.pentestId === 'string' ? context.pentestId : undefined;
      if (!pentestId) return undefined;

      const pentest = await prisma.pentest.findUnique({
        where: { id: pentestId },
        select: { id: true, target: true, scope: true },
      });
      if (!pentest) return undefined;

      const scope = pentest.scope && typeof pentest.scope === 'object' && !Array.isArray(pentest.scope)
        ? pentest.scope as Record<string, unknown>
        : {};
      const asStringArray = (value: unknown): string[] =>
        Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

      return {
        pentestId: pentest.id,
        actor: typeof context.agentId === 'string' ? context.agentId : undefined,
        target: pentest.target,
        inScope: asStringArray(scope.inScope),
        outOfScope: asStringArray(scope.outOfScope),
        scopeMode: 'extended',
      };
    },
  }
);
fastify.decorate('mcpToolBridge', mcpToolBridge);
// Non-blocking: if Kali container isn't up, tools simply won't appear in registry
mcpToolBridge.syncToRegistry().then((result) => {
  if (result.mcpHealthy) {
    console.log(`[MCP Bridge] ${result.registered} MCP tools available via /api/tools`);
  } else {
    console.log('[MCP Bridge] Kali container not available — MCP tools will appear when container starts');
  }
}).catch(() => {
  // Silent fail — MCP is optional at boot
});

// Create SwarmEventEmitter
const swarmState = createSwarmState();
const swarmEventEmitter = new SwarmEventEmitter(prisma, sseManager, swarmState);

// Create callModel function using LLMExecutor's factory
// Wrap to intercept usage events for cost tracking
const rawCallModel = createCallModel(async (model: string) => {
  const client = await resolveClientForModel(model);
  return client;
});

const callModel = async function* (params: import('./core/types/session-types.js').ModelCallParams): AsyncGenerator<import('./core/types/session-types.js').StreamEvent> {
  // Use the real sessionId from params (set by AgentRunnerAdapter: `${swarmRunId}-${agentId}`)
  // Fallback to 'global' for ad-hoc calls outside agent context
  const sessionId = params.sessionId ?? 'global';
  for await (const event of rawCallModel(params)) {
    if (event.type === 'usage') {
      costTracker.track(sessionId, event.model, event.inputTokens, event.outputTokens);
    }
    yield event;
  }
};

// Create SwarmOrchestrator
const swarmOrchestrator = new SwarmOrchestrator({
  callModel,
  toolRegistry,
  commandRegistry,
  taskManager,
  eventEmitter: swarmEventEmitter,
  notificationQueue,
  defaultModel: process.env.DEFAULT_MODEL || 'claude-sonnet-4-6',
  compactor: conversationCompactor,
  transcriptLogger,
  modelContextWindow: 200000, // Default context window for Claude Sonnet 4.6
  persistentTaskManager,
  runtimeTaskManager,
  permissionRequestStore,
  permissionContext: defaultPermissionContext,
  agentContextStore,
  permissionSync,
  planModeManager,
  worktreeManager,
  memoryStore: sessionMemoryStore,
  memoryExtractor,
  hookBus,
});

// Decorate Fastify instance with SwarmOrchestrator
fastify.decorate('swarmOrchestrator', swarmOrchestrator);
fastify.decorate('costTracker', costTracker);
fastify.decorate('sessionStats', sessionStats);

// Standalone API ToolExecutor — non-interactive, shares same services
const apiToolExecutor = new ToolExecutor(toolRegistry);
apiToolExecutor.setHookBus(hookBus);
apiToolExecutor.setRuntimeTaskManager(runtimeTaskManager);
if (worktreeManager) apiToolExecutor.setWorktreeManager(worktreeManager);
fastify.decorate('apiToolExecutor', apiToolExecutor);

// C10/C12 — Declarative skills are loaded as `skill:*` tools and managed via SkillManager.
const skillsDir = process.env.LEA_SKILLS_DIR ?? join(process.cwd(), 'skills');
const skillManager = new SkillManager({ registry: toolRegistry, executor: apiToolExecutor, skillsDir });
fastify.decorate('skillManager', skillManager);

try {
  const result = await skillManager.reload();

  if (result.registered > 0) {
    console.log(`[Skills] Registered ${result.registered} skill tool(s) from ${skillsDir}`);
  }
  if (result.skipped > 0) {
    console.log(`[Skills] Skipped ${result.skipped} already registered skill tool(s)`);
  }
  if (result.errors.length > 0) {
    console.warn(`[Skills] ${result.errors.length} skill(s) failed to register: ${result.errors.join('; ')}`);
  }
} catch (err: any) {
  console.warn(`[Skills] Failed to load skills: ${err.message}`);
}

// C14 — Local plugin runtime. Plugins are manifest-only and can contribute
// declarative skills after explicit trust; no arbitrary plugin code is executed.
const pluginsDir = process.env.LEA_PLUGINS_DIR ?? join(process.cwd(), 'plugins');
const pluginTrustStorePath = process.env.LEA_PLUGIN_TRUST_STORE ?? join(process.cwd(), '.lea', 'plugin-trust.json');
const pluginManager = new PluginManager({
  pluginsDir,
  trustStorePath: pluginTrustStorePath,
  registry: toolRegistry,
  executor: apiToolExecutor,
});
fastify.decorate('pluginManager', pluginManager);

try {
  const result = await pluginManager.reload();
  const loaded = result.plugins.filter((plugin) => plugin.state === 'loaded').length;
  if (result.plugins.length > 0) {
    console.log(`[Plugins] ${loaded}/${result.plugins.length} plugin(s) loaded from ${pluginsDir}`);
  }
  if (result.errors.length > 0) {
    console.warn(`[Plugins] ${result.errors.length} plugin scan error(s): ${result.errors.join('; ')}`);
  }
} catch (err: any) {
  console.warn(`[Plugins] Failed to load plugins: ${err.message}`);
}

// Decorate Fastify with CommandRegistry
// (registerBuiltinCommands will be called after all services are available)
fastify.decorate('commandRegistry', commandRegistry);

// ============================================================================
// TEAM MANAGER
// ============================================================================

const teamManager = new TeamManager({ prisma });
fastify.decorate('teamManager', teamManager);

// ============================================================================
// CHECKPOINT SERVICE
// ============================================================================

const checkpointService = new CheckpointService(prisma);
fastify.decorate('checkpointService', checkpointService);

// ============================================================================
// REGISTER BUILTIN COMMANDS
// ============================================================================

// Register builtin slash commands after all services are available
try {
  const { registerBuiltinCommands } = await import('./core/commands/index.js');
  registerBuiltinCommands(commandRegistry, {
    commandRegistry,
    swarmOrchestrator,
    persistentTaskManager,
    teamManager,
    runtimeTaskManager,
    permissionRequestStore,
    planModeManager,
    hookBus,
    prisma,
    sseManager,
    swarmState,
    costTracker,
    sessionStats,
  });
  console.log('[Commands] Builtin slash commands registered');
} catch (err: any) {
  console.warn(`[Commands] Failed to register builtin commands: ${err.message}`);
}

// ============================================================================
// API KEY AUTH
// ============================================================================

// Optional global API key auth.
//
// Keep this opt-in until LEA has real browser/session auth: enabling a global
// bearer gate without a server-side UI proxy blocks the current web app.
// Sensitive runtime mutation routes still enforce their own LEA_API_KEY checks.
const LEA_API_KEY = process.env.LEA_API_KEY?.trim();
const LEA_REQUIRE_API_KEY = process.env.LEA_REQUIRE_API_KEY === 'true';
const LEA_ALLOW_UNAUTHENTICATED_PRODUCTION = process.env.LEA_ALLOW_UNAUTHENTICATED_PRODUCTION === 'true';
const isProduction = process.env.NODE_ENV === 'production';
const hasValidProductionApiKey = Boolean(
  LEA_API_KEY && LEA_API_KEY.length >= 32 && !LEA_API_KEY.startsWith('CHANGE_')
);
const publicPaths = new Set(['/health', '/api/health']);

if (LEA_REQUIRE_API_KEY && !hasValidProductionApiKey) {
  throw new Error(
    '[Security] LEA_REQUIRE_API_KEY=true requires LEA_API_KEY with at least 32 non-placeholder characters.'
  );
}

const getBearerToken = (authHeader: string | undefined): string | undefined => {
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || undefined;
};

const safeTokenEquals = (received: string | undefined, expected: string): boolean => {
  if (!received) return false;

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
};

if (LEA_REQUIRE_API_KEY) {
  fastify.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0];
    if (request.method === 'OPTIONS' || publicPaths.has(path)) return;

    if (!safeTokenEquals(getBearerToken(request.headers.authorization), LEA_API_KEY!)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
} else if (isProduction && !LEA_ALLOW_UNAUTHENTICATED_PRODUCTION) {
  fastify.log.warn('[Security] Global API auth is disabled in production. Set LEA_REQUIRE_API_KEY=true only when a server-side UI proxy or external auth layer injects Authorization headers.');
} else if (isProduction) {
  fastify.log.warn('[Security] Production global API auth warning acknowledged by LEA_ALLOW_UNAUTHENTICATED_PRODUCTION=true');
}

// Register routes
await fastify.register(pentestRoutes);
await fastify.register(streamRoutes);
await fastify.register(reportRoutes);
await fastify.register(providerRoutes);
await fastify.register(swarmRoutes);
await fastify.register(validateRoutes);
await fastify.register(agentRoutes);
await fastify.register(teamRoutes);
await fastify.register(taskRoutes);
await fastify.register(runtimeTaskRoutes);
await fastify.register(messageRoutes);
await fastify.register(permissionRoutes);
await fastify.register(planModeRoutes);
await fastify.register(commandRoutes);
await fastify.register(worktreeRoutes);
await fastify.register(statsRoutes);
await fastify.register(memoriesRoutes);
await fastify.register(awaySummaryRoutes);
await fastify.register(skillRoutes);
await fastify.register(pluginRoutes);
await fastify.register(lspRoutes);
await fastify.register(hookRoutes);
await fastify.register(mcpRoutes);
await fastify.register(toolRoutes);
await fastify.register(toolInvokeRoutes);

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
  // Stop permission request store (denies all pending requests)
  permissionRequestStore.stop();
  // Stop permission sync manager
  permissionSync.stop();
  // Shutdown SwarmOrchestrator first to stop all agents
  await swarmOrchestrator.shutdown();
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
    throw new Error(`[SSL] SSL_ENABLED=true but certificate files could not be loaded: ${err.message}`);
  }
}

// Start server
const start = async () => {
  try {
    const useSSL = sslConfig !== null;
    const port = useSSL 
      ? (Number(process.env.SSL_PORT) || 3443) 
      : (Number(process.env.PORT) || 3001);
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ 
      port, 
      host,
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
