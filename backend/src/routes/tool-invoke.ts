/**
 * Tool Invoke Route — POST /api/tools/:name/invoke
 *
 * INTERNAL / RUNTIME / DEBUG surface.
 *
 * This endpoint allows direct tool invocation outside of the agent loop.
 * It is intended for debugging, testing, and runtime inspection purposes.
 *
 * SECURITY MODEL:
 * - All tools go through ToolExecutor's full pipeline:
 *   registry lookup, input validation (Zod), enabled check,
 *   permission check (checkPermissions), hooks (pre-tool/post-tool),
 *   and smart output capture.
 * - Non-interactive mode: PermissionRequestStore is NOT wired to the API
 *   ToolExecutor. When a tool's checkPermissions returns 'ask' (requires
 *   user approval), it is treated as 'deny'. This prevents indefinite hangs.
 * - Each request gets a fresh AbortController with a configurable timeout
 *   (default 60s, env: LEA_TOOL_TIMEOUT_MS).
 * - Session IDs are auto-generated with the `api-` prefix to distinguish
 *   API invocations from agent sessions in logs/hooks.
 * - C11 security gate:
 *   - LEA_ENABLE_TOOL_INVOKE_API must be "true"; otherwise the endpoint
 *     returns 404 to avoid exposing this debug surface by accident.
 *   - LEA_API_KEY is required even when global API auth is disabled.
 *   - LEA_TOOL_INVOKE_ALLOW controls allowed tools (default: skill:*).
 *   - LEA_TOOL_INVOKE_DENY controls blocked tools and wins over allow
 *     (default: bash,shell_exec,mcp:shell_exec).
 *
 * NOT intended as a general-purpose user-facing API.
 */

import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { ToolRegistry } from '../core/runtime/ToolRegistry.js';
import type { ToolExecutor } from '../core/runtime/ToolExecutor.js';
import type { Tool } from '../core/types/tool-types.js';
import { parseJsonWithSchema, pentestScopeSchema } from '../types/schemas.js';

// ============================================
// HELPERS
// ============================================

function getExecutor(fastify: FastifyInstance): ToolExecutor | undefined {
  return (fastify as any).apiToolExecutor as ToolExecutor | undefined;
}

function getRegistry(fastify: FastifyInstance): ToolRegistry | undefined {
  return (fastify as any).toolRegistry as ToolRegistry | undefined;
}

const CAPTURE_TASK_ID_RE = /taskId="([^"]+)"/;

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_ALLOW_PATTERNS = ['skill:*'];
const DEFAULT_DENY_PATTERNS = ['bash', 'shell_exec', 'mcp:shell_exec'];

function isPermissionDenied(errorCode: string | undefined): boolean {
  return (
    errorCode === 'permission_denied' ||
    errorCode === 'permission_denied_by_user' ||
    errorCode === 'permission_approval_required' ||
    errorCode === 'scope_denied'
  );
}

function isInvokeApiEnabled(): boolean {
  return process.env.LEA_ENABLE_TOOL_INVOKE_API === 'true';
}

function getConfiguredApiKey(): string | undefined {
  const key = process.env.LEA_API_KEY?.trim();
  return key || undefined;
}

function getBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || undefined;
}

function parsePatterns(raw: string | undefined, defaults: readonly string[]): string[] {
  if (raw === undefined) return [...defaults];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesGlob(pattern: string, value: string): boolean {
  if (pattern === '*') return true;
  const regex = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);
  return regex.test(value);
}

function matchesPolicyPattern(
  pattern: string,
  target: { names: readonly string[]; source: string },
): boolean {
  if (pattern.startsWith('source:')) {
    return target.source === pattern.slice('source:'.length);
  }

  return target.names.some((name) => matchesGlob(pattern, name));
}

function evaluateInvokePolicy(tool: Tool, requestedName: string): { allowed: true } | { allowed: false; reason: string } {
  const target = {
    names: Array.from(new Set([tool.name, requestedName, ...(tool.aliases ?? [])])),
    source: tool.source ?? 'local',
  };
  const denyPatterns = parsePatterns(process.env.LEA_TOOL_INVOKE_DENY, DEFAULT_DENY_PATTERNS);
  const allowPatterns = parsePatterns(process.env.LEA_TOOL_INVOKE_ALLOW, DEFAULT_ALLOW_PATTERNS);

  if (denyPatterns.some((pattern) => matchesPolicyPattern(pattern, target))) {
    return { allowed: false, reason: `Tool "${tool.name}" is denied by API invoke policy` };
  }

  if (!allowPatterns.some((pattern) => matchesPolicyPattern(pattern, target))) {
    return { allowed: false, reason: `Tool "${tool.name}" is not allowed for API invocation` };
  }

  return { allowed: true };
}

function getToolInvokeTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.LEA_TOOL_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function requiresTrustedScope(tool: Tool): boolean {
  return tool.source === 'mcp';
}

async function buildTrustedRuntimeContext(
  fastify: FastifyInstance,
  pentestId: string | undefined,
): Promise<Record<string, unknown> | undefined> {
  if (!pentestId) return undefined;

  const pentest = await fastify.prisma.pentest.findUnique({
    where: { id: pentestId },
    select: { id: true, target: true, scope: true },
  });

  if (!pentest) {
    return undefined;
  }

  const scope = parseJsonWithSchema(pentestScopeSchema, pentest.scope, {
    inScope: [],
    outOfScope: [],
  });

  return {
    pentestId: pentest.id,
    target: pentest.target,
    inScope: scope.inScope,
    outOfScope: scope.outOfScope,
    scopeMode: 'extended',
  };
}

// ============================================
// ROUTES
// ============================================

export async function toolInvokeRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/tools/:name/invoke — execute a tool via the runtime pipeline
  fastify.post<{ Params: { name: string }; Body: { input?: unknown; sessionId?: string; agentId?: string; pentestId?: string; context?: Record<string, unknown> } }>(
    '/api/tools/:name/invoke',
    async (request, reply) => {
      if (!isInvokeApiEnabled()) {
        return reply.code(404).send({ error: 'Tool invoke API is disabled' });
      }

      const configuredApiKey = getConfiguredApiKey();
      if (!configuredApiKey) {
        return reply.code(503).send({ error: 'Tool invoke API auth is not configured' });
      }

      const bearerToken = getBearerToken(request.headers.authorization);
      if (bearerToken !== configuredApiKey) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const executor = getExecutor(fastify);
      const registry = getRegistry(fastify);

      if (!executor || !registry) {
        return reply.code(503).send({ error: 'Tool execution runtime not available' });
      }

      const { name } = request.params;
      const body = request.body ?? {};

      // input must be present and non-null — shape validation is ToolExecutor's job
      if (body.input === undefined || body.input === null) {
        return reply.code(400).send({ error: "Request body must include 'input' field" });
      }

      // Resolve tool (handles aliases)
      const tool = registry.get(name);
      if (!tool) {
        return reply.code(404).send({ error: `Tool "${name}" not found` });
      }

      // Use canonical name (not alias)
      const canonicalName = tool.name;
      const policy = evaluateInvokePolicy(tool, name);
      if (!policy.allowed) {
        return reply.code(403).send({ error: policy.reason });
      }

      if (requiresTrustedScope(tool) && !body.pentestId) {
        return reply.code(403).send({ error: `Tool "${canonicalName}" requires pentestId for trusted runtime scope` });
      }

      const trustedRuntimeContext = await buildTrustedRuntimeContext(fastify, body.pentestId);
      if (body.pentestId && !trustedRuntimeContext) {
        return reply.code(404).send({ error: `Pentest "${body.pentestId}" not found` });
      }

      // Generate IDs
      const toolUseId = `api-${randomUUID()}`;
      const sessionId = body.sessionId ?? `api-${randomUUID()}`;

      // AbortController with configurable timeout
      const timeoutMs = getToolInvokeTimeoutMs();
      const abortController = new AbortController();
      let timedOut = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<'timeout'>((resolve) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          abortController.abort();
          resolve('timeout');
        }, timeoutMs);
      });

      try {
        const result = await Promise.race([
          executor.execute({
            toolUseId,
            toolName: canonicalName,
            input: body.input as Record<string, unknown>,
            sessionId,
            abortController,
            agentId: body.agentId,
            runtimeContext: trustedRuntimeContext,
          }),
          timeoutPromise,
        ]);

        if (result === 'timeout' || timedOut) {
          return reply.code(504).send({
            toolName: canonicalName,
            toolUseId,
            success: false,
            error: `Tool "${canonicalName}" timed out after ${timeoutMs}ms`,
          });
        }

        const isSuccess = !result.event.isError;
        const resultStr = (result.event.result as string) ?? '';

        // Extract captureTaskId if output was captured in RuntimeTaskManager
        const captureMatch = resultStr.match(CAPTURE_TASK_ID_RE);
        const captureTaskId = captureMatch?.[1];

        if (isSuccess) {
          return {
            toolName: canonicalName,
            toolUseId,
            success: true,
            result: resultStr,
            metadata: {
              sessionId,
              captureTaskId,
              truncated: !!captureTaskId,
              resultLength: resultStr.length,
            },
          };
        } else {
          const statusCode = isPermissionDenied(result.errorCode) ? 403 : 200;
          return reply.code(statusCode).send({
            toolName: canonicalName,
            toolUseId,
            success: false,
            result: resultStr,
            error: {
              code: result.errorCode,
              recoverable: result.recoverable,
              suggestions: result.suggestions,
            },
          });
        }
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    },
  );
}
