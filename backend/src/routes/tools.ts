/**
 * Tool Routes — REST API endpoints for tool discovery.
 *
 * Exposes ToolRegistry metadata via HTTP:
 * - List all available tools with structured metadata
 * - Get detailed info for a single tool (by name or alias)
 *
 * ## Architecture (C4)
 *
 * This is the discovery layer for ToolRegistry. It does NOT execute tools —
 * it only exposes their metadata so that agents, admin UIs, and monitoring
 * can enumerate available capabilities. The MCP bridge (C5) will register
 * dynamic MCP tools into this same registry, making them visible here too.
 */

import { FastifyInstance, FastifyReply } from 'fastify';
import type { z } from 'zod';
import type { Tool, ToolSource } from '../core/types/tool-types.js';
import type { ToolRegistry } from '../core/runtime/ToolRegistry.js';

// ============================================
// TYPES
// ============================================

/** Serializable tool metadata returned by the API. */
export interface ToolMetadata {
  name: string;
  aliases?: string[];
  description: string;
  source?: ToolSource;
  enabled: boolean;
  readOnly: boolean;
  concurrencySafe: boolean;
  destructive: boolean;
  maxResultSizeChars: number;
  /** Preview of input schema fields (object schemas only). */
  inputSchema?: Record<string, string>;
}

// ============================================
// HELPERS
// ============================================

function getRegistry(fastify: FastifyInstance): ToolRegistry | undefined {
  return (fastify as any).toolRegistry as ToolRegistry | undefined;
}

function safeToolBoolean(read: () => boolean, fallback = false): boolean {
  try {
    return read();
  } catch {
    // Some tools need real invocation input to classify read-only/destructive
    // behavior. Discovery should degrade to conservative metadata, not 500.
    return fallback;
  }
}

function isToolEnabled(tool: Tool): boolean {
  return safeToolBoolean(() => tool.isEnabled(), false);
}

function isToolReadOnly(tool: Tool): boolean {
  return safeToolBoolean(() => tool.isReadOnly(undefined as never), false);
}

function isToolConcurrencySafe(tool: Tool): boolean {
  return safeToolBoolean(() => tool.isConcurrencySafe(undefined as never), false);
}

function isToolDestructive(tool: Tool): boolean {
  return safeToolBoolean(() => tool.isDestructive?.(undefined as never) ?? false, false);
}

/**
 * Serialize a Tool instance to stable JSON-safe metadata.
 *
 * Only reads synchronous properties and calls methods with no-arg defaults
 * (isReadOnly(undefined), etc.) to produce a snapshot that doesn't depend
 * on runtime context (sessionId, agentId, permissions, etc.).
 */
function serializeTool(tool: Tool): ToolMetadata {
  // Extract input schema preview for ZodObject schemas
  let inputSchema: Record<string, string> | undefined;
  try {
    const schema = tool.inputSchema;
    if ('shape' in schema && typeof schema.shape === 'object') {
      const shape = (schema as Record<string, unknown>).shape as Record<string, unknown>;
      inputSchema = {};
      for (const [key, val] of Object.entries(shape)) {
        const def = (val as { _def?: { typeName?: string } })._def;
        const typeName = def?.typeName ?? 'unknown';
        const cleanName = typeof typeName === 'string' && typeName.startsWith('Zod')
          ? typeName.slice(3)
          : String(typeName);
        inputSchema[key] = cleanName.toLowerCase();
      }
    }
  } catch {
    // Non-object schemas (ZodString, ZodUnion, etc.) — skip preview
  }

  return {
    name: tool.name,
    aliases: tool.aliases ? [...tool.aliases] : undefined,
    description: tool.description,
    source: tool.source ?? 'local',
    enabled: isToolEnabled(tool),
    readOnly: isToolReadOnly(tool),
    concurrencySafe: isToolConcurrencySafe(tool),
    destructive: isToolDestructive(tool),
    maxResultSizeChars: tool.maxResultSizeChars,
    inputSchema,
  };
}

// ============================================
// ROUTES
// ============================================

export async function toolRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/tools — list all enabled tools with metadata (supports search/filter)
  fastify.get('/api/tools', async (request, reply) => {
    const registry = getRegistry(fastify);
    if (!registry) {
      return reply.code(503).send({ error: 'Tool registry not available' });
    }

    // Parse optional query params
    const { q, source, enabled, readOnly } = request.query as Record<string, string | undefined>;

    // Start from all tools when 'enabled' param is explicitly requested,
    // otherwise default to enabled-only (backward compatible).
    const wantExplicitEnabled = enabled !== undefined;
    let tools = wantExplicitEnabled ? Array.from(registry.getAll().values()) : registry.getEnabled();

    // Filter by source
    if (source) {
      tools = tools.filter((t) => (t.source ?? 'local') === source);
    }

    // Filter by enabled status
    if (enabled !== undefined) {
      const wantEnabled = enabled === 'true';
      tools = tools.filter((t) => isToolEnabled(t) === wantEnabled);
    }

    // Filter by readOnly
    if (readOnly !== undefined) {
      const wantReadOnly = readOnly === 'true';
      tools = tools.filter((t) => isToolReadOnly(t) === wantReadOnly);
    }

    // Text search on name, aliases, description
    if (q) {
      const query = q.toLowerCase();
      tools = tools.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          (t.aliases?.some((a) => a.toLowerCase().includes(query)) ?? false) ||
          t.description.toLowerCase().includes(query),
      );
    }

    const data: ToolMetadata[] = tools.map(serializeTool);

    return { data };
  });

  // GET /api/tools/:name — get single tool detail (by name or alias)
  fastify.get<{ Params: { name: string } }>('/api/tools/:name', async (request, reply) => {
    const registry = getRegistry(fastify);
    if (!registry) {
      return reply.code(503).send({ error: 'Tool registry not available' });
    }

    const { name } = request.params;
    const tool = registry.get(name);

    if (!tool) {
      return reply.code(404).send({ error: `Tool "${name}" not found` });
    }

    return { data: serializeTool(tool) };
  });
}
