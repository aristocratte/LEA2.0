/**
 * C9 — Tool Invoke Route Tests
 *
 * Tests POST /api/tools/:name/invoke:
 * - Valid invocation (local tool)
 * - Alias resolution to canonical name
 * - Auto-generated sessionId
 * - Provided sessionId preserved
 * - Long output captured in RuntimeTaskManager
 * - Missing input → 400
 * - Tool not found → 404
 * - Disabled tool → success=false
 * - Permission deny → 403 + success=false
 * - Permission ask → 403 + success=false (non-interactive)
 * - Invalid input (Zod failure) → success=false, recoverable
 * - ToolExecutor unavailable → 503
 * - ToolRegistry unavailable → 503
 * - C11 security gate: feature flag, API key auth, and tool allow/deny policy
 */

import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry, buildTool } from '../../core/runtime/ToolRegistry.js';
import { ToolExecutor } from '../../core/runtime/ToolExecutor.js';
import { RuntimeTaskManager } from '../../core/runtime/RuntimeTaskManager.js';
import { createSkillTool } from '../../core/skills/index.js';
import { toolInvokeRoutes } from '../tool-invoke.js';

const TEST_API_KEY = 'test-tool-invoke-key';
const ORIGINAL_ENV = {
  LEA_ENABLE_TOOL_INVOKE_API: process.env.LEA_ENABLE_TOOL_INVOKE_API,
  LEA_API_KEY: process.env.LEA_API_KEY,
  LEA_TOOL_INVOKE_ALLOW: process.env.LEA_TOOL_INVOKE_ALLOW,
  LEA_TOOL_INVOKE_DENY: process.env.LEA_TOOL_INVOKE_DENY,
  LEA_SKILL_STEP_ALLOW: process.env.LEA_SKILL_STEP_ALLOW,
  LEA_SKILL_STEP_DENY: process.env.LEA_SKILL_STEP_DENY,
  LEA_TOOL_TIMEOUT_MS: process.env.LEA_TOOL_TIMEOUT_MS,
};

// ============================================
// FIXTURES
// ============================================

/** Build a minimal Fastify app with registry + executor + route. */
async function buildApp(options?: {
  registry?: ToolRegistry;
  executor?: ToolExecutor;
  rtm?: RuntimeTaskManager;
}) {
  const fastify = Fastify({ logger: false });

  const registry = options?.registry ?? new ToolRegistry();
  const rtm = options?.rtm ?? new RuntimeTaskManager();
  const executor =
    options?.executor ??
    (() => {
      const ex = new ToolExecutor(registry);
      ex.setRuntimeTaskManager(rtm);
      return ex;
    })();

  (fastify as any).toolRegistry = registry;
  (fastify as any).apiToolExecutor = executor;

  await fastify.register(toolInvokeRoutes);
  await fastify.ready();
  return fastify;
}

function invoke(app: Awaited<ReturnType<typeof buildApp>>, path: string) {
  return request(app.server)
    .post(path)
    .set('Authorization', `Bearer ${TEST_API_KEY}`);
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

/** Generate a string longer than OUTPUT_CAPTURE_THRESHOLD (15_000 chars). */
function generateLongOutput(length: number): string {
  return Array.from({ length }, (_, i) => String.fromCharCode(65 + (i % 26))).join('');
}

// ============================================
// TESTS
// ============================================

describe('C9 — Tool Invoke Route', () => {
  beforeEach(() => {
    process.env.LEA_ENABLE_TOOL_INVOKE_API = 'true';
    process.env.LEA_API_KEY = TEST_API_KEY;
    process.env.LEA_TOOL_INVOKE_ALLOW = '*';
    delete process.env.LEA_TOOL_INVOKE_DENY;
    process.env.LEA_SKILL_STEP_ALLOW = '*';
    delete process.env.LEA_SKILL_STEP_DENY;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    restoreEnv();
  });

  // ============================================
  // C11 SECURITY GATE
  // ============================================

  describe('C11 security gate', () => {
    it('returns 404 when tool invoke API feature flag is disabled', async () => {
      process.env.LEA_ENABLE_TOOL_INVOKE_API = 'false';

      const registry = new ToolRegistry();
      registry.register(
        buildTool({
          name: 'test',
          description: 'Test',
          inputSchema: z.object({}),
          call: async () => ({ data: 'should not run' }),
          maxResultSizeChars: 10_000,
        }),
      );

      const app = await buildApp({ registry });
      try {
        const res = await request(app.server)
          .post('/api/tools/test/invoke')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({ input: {} });

        expect(res.status).toBe(404);
        expect(res.body.error).toContain('disabled');
      } finally {
        await app.close();
      }
    });

    it('returns 503 when API key auth is not configured', async () => {
      delete process.env.LEA_API_KEY;

      const app = await buildApp();
      try {
        const res = await request(app.server)
          .post('/api/tools/test/invoke')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({ input: {} });

        expect(res.status).toBe(503);
        expect(res.body.error).toContain('auth');
      } finally {
        await app.close();
      }
    });

    it('returns 401 when Authorization header is missing', async () => {
      const app = await buildApp();
      try {
        const res = await request(app.server)
          .post('/api/tools/test/invoke')
          .send({ input: {} });

        expect(res.status).toBe(401);
      } finally {
        await app.close();
      }
    });

    it('returns 401 when Authorization header is invalid', async () => {
      const app = await buildApp();
      try {
        const res = await request(app.server)
          .post('/api/tools/test/invoke')
          .set('Authorization', 'Bearer wrong-key')
          .send({ input: {} });

        expect(res.status).toBe(401);
      } finally {
        await app.close();
      }
    });

    it('returns 504 when the executor exceeds the configured timeout', async () => {
      process.env.LEA_TOOL_TIMEOUT_MS = '10';

      const registry = new ToolRegistry();
      registry.register(
        buildTool({
          name: 'slow_tool',
          description: 'Never resolves',
          inputSchema: z.object({}),
          call: async () => ({ data: 'should not run' }),
          maxResultSizeChars: 10_000,
        }),
      );

      const executor = {
        execute: () => new Promise(() => undefined),
      } as unknown as ToolExecutor;

      const app = await buildApp({ registry, executor });
      try {
        const res = await invoke(app, '/api/tools/slow_tool/invoke')
          .send({ input: {} });

        expect(res.status).toBe(504);
        expect(res.body.error).toContain('timed out');
      } finally {
        await app.close();
      }
    });

    it('falls back to the default timeout when LEA_TOOL_TIMEOUT_MS is invalid', async () => {
      process.env.LEA_TOOL_TIMEOUT_MS = 'not-a-number';

      const registry = new ToolRegistry();
      registry.register(
        buildTool({
          name: 'slow_but_valid',
          description: 'Resolves after a short delay',
          inputSchema: z.object({}),
          call: async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            return { data: 'ok' };
          },
          maxResultSizeChars: 10_000,
        }),
      );

      const app = await buildApp({ registry });
      try {
        const res = await invoke(app, '/api/tools/slow_but_valid/invoke')
          .send({ input: {} });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.result).toBe('ok');
      } finally {
        await app.close();
      }
    });

    it('blocks local tools by default policy', async () => {
      delete process.env.LEA_TOOL_INVOKE_ALLOW;

      const registry = new ToolRegistry();
      registry.register(
        buildTool({
          name: 'echo',
          description: 'Echo input back',
          inputSchema: z.object({ message: z.string() }),
          call: async (args) => ({ data: `Echo: ${args.message}` }),
          maxResultSizeChars: 10_000,
        }),
      );

      const app = await buildApp({ registry });
      try {
        const res = await invoke(app, '/api/tools/echo/invoke')
          .send({ input: { message: 'hello' } });

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('not allowed');
      } finally {
        await app.close();
      }
    });

    it('allows skill tools by default policy', async () => {
      delete process.env.LEA_TOOL_INVOKE_ALLOW;

      const registry = new ToolRegistry();
      const executor = new ToolExecutor(registry);
      registry.register(
        buildTool({
          name: 'echo',
          description: 'Echo input back',
          inputSchema: z.object({ message: z.string() }),
          call: async (args) => ({ data: `Echo: ${args.message}` }),
          maxResultSizeChars: 10_000,
        }),
      );
      registry.register(
        createSkillTool(
          {
            id: 'echo_target',
            description: 'Echo a target through a workflow',
            inputSchema: { target: { type: 'string' } },
            steps: [{ id: 'echo', tool: 'echo', input: { message: 'target={{target}}' } }],
          },
          { executor },
        ),
      );

      const app = await buildApp({ registry, executor });
      try {
        const res = await invoke(app, '/api/tools/echo_target/invoke')
          .send({ input: { target: 'example.com' } });

        expect(res.status).toBe(200);
        expect(res.body.toolName).toBe('skill:echo_target');
      } finally {
        await app.close();
      }
    });

    it('denylist wins over allowlist for bash', async () => {
      process.env.LEA_TOOL_INVOKE_ALLOW = '*';
      delete process.env.LEA_TOOL_INVOKE_DENY;

      const registry = new ToolRegistry();
      registry.register(
        buildTool({
          name: 'bash',
          description: 'Shell execution',
          inputSchema: z.object({ command: z.string() }),
          call: async () => ({ data: 'should not run' }),
          maxResultSizeChars: 10_000,
        }),
      );

      const app = await buildApp({ registry });
      try {
        const res = await invoke(app, '/api/tools/bash/invoke')
          .send({ input: { command: 'echo nope' } });

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('denied');
      } finally {
        await app.close();
      }
    });
  });

  // ============================================
  // SUCCESS CASES
  // ============================================

  describe('successful invocation', () => {
    it('invokes a local tool with valid input', async () => {
      const registry = new ToolRegistry();
      registry.register(
        buildTool({
          name: 'echo',
          description: 'Echo input back',
          inputSchema: z.object({ message: z.string() }),
          call: async (args) => ({ data: `Echo: ${args.message}` }),
          maxResultSizeChars: 10_000,
        }),
      );

      const app = await buildApp({ registry });
      try {
        const res = await invoke(app, '/api/tools/echo/invoke')
          .send({ input: { message: 'hello' } });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.toolName).toBe('echo');
        expect(res.body.result).toBe('Echo: hello');
        expect(res.body.toolUseId).toMatch(/^api-/);
        expect(res.body.metadata.sessionId).toMatch(/^api-/);
      } finally {
        await app.close();
      }
    });

    it('resolves alias to canonical name', async () => {
      const registry = new ToolRegistry();
      registry.register(
        buildTool({
          name: 'mcp:nmap_scan',
          description: 'Nmap scanner',
          aliases: ['nmap_scan'],
          inputSchema: z.object({ target: z.string() }),
          call: async (args) => ({ data: `Scanned ${args.target}` }),
          maxResultSizeChars: 10_000,
        }),
      );

      const app = await buildApp({ registry });
      try {
        const res = await invoke(app, '/api/tools/nmap_scan/invoke')  // alias
          .send({ input: { target: '10.0.0.1' } });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.toolName).toBe('mcp:nmap_scan'); // canonical, not alias
      } finally {
        await app.close();
      }
    });

    it('auto-generates api- prefixed sessionId when none provided', async () => {
      const registry = new ToolRegistry();
      registry.register(
        buildTool({
          name: 'test',
          description: 'Test',
          inputSchema: z.object({ x: z.number() }),
          call: async () => ({ data: 'ok' }),
          maxResultSizeChars: 10_000,
        }),
      );

      const app = await buildApp({ registry });
      try {
        const res = await invoke(app, '/api/tools/test/invoke')
          .send({ input: { x: 1 } });

        expect(res.status).toBe(200);
        expect(res.body.metadata.sessionId).toMatch(/^api-/);
      } finally {
        await app.close();
      }
    });

    it('uses provided sessionId', async () => {
      const registry = new ToolRegistry();
      registry.register(
        buildTool({
          name: 'test',
          description: 'Test',
          inputSchema: z.object({ x: z.number() }),
          call: async () => ({ data: 'ok' }),
          maxResultSizeChars: 10_000,
        }),
      );

      const app = await buildApp({ registry });
      try {
        const res = await invoke(app, '/api/tools/test/invoke')
          .send({ input: { x: 1 }, sessionId: 'my-session-42' });

        expect(res.status).toBe(200);
        expect(res.body.metadata.sessionId).toBe('my-session-42');
      } finally {
        await app.close();
      }
    });

    it('invokes a skill tool through the same runtime endpoint', async () => {
      const registry = new ToolRegistry();
      const executor = new ToolExecutor(registry);

      registry.register(
        buildTool({
          name: 'echo',
          description: 'Echo input back',
          inputSchema: z.object({ message: z.string() }),
          call: async (args) => ({ data: `Echo: ${args.message}` }),
          maxResultSizeChars: 10_000,
        }),
      );

      registry.register(
        createSkillTool(
          {
            id: 'echo_target',
            description: 'Echo a target through a workflow',
            inputSchema: { target: { type: 'string' } },
            steps: [{ id: 'echo', tool: 'echo', input: { message: 'target={{target}}' } }],
          },
          { executor },
        ),
      );

      const app = await buildApp({ registry, executor });
      try {
        const res = await invoke(app, '/api/tools/echo_target/invoke')
          .send({ input: { target: 'example.com' } });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.toolName).toBe('skill:echo_target');
        const payload = JSON.parse(res.body.result);
        expect(payload.steps[0]).toMatchObject({
          id: 'echo',
          tool: 'echo',
          success: true,
          result: 'Echo: target=example.com',
        });
      } finally {
        await app.close();
      }
    });
  });

  // ============================================
  // OUTPUT CAPTURE
  // ============================================

  describe('long output capture', () => {
    it('captures long output in RuntimeTaskManager with reference', async () => {
      const registry = new ToolRegistry();
      const rtm = new RuntimeTaskManager();

      const longOutput = generateLongOutput(20_000);
      registry.register(
        buildTool({
          name: 'big_output',
          description: 'Returns large output',
          inputSchema: z.object({}),
          call: async () => ({ data: longOutput }),
          maxResultSizeChars: 1_000_000,
        }),
      );

      const app = await buildApp({ registry, rtm });
      try {
        const res = await invoke(app, '/api/tools/big_output/invoke')
          .send({ input: {} });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.metadata.captureTaskId).toBeDefined();
        expect(res.body.metadata.truncated).toBe(true);
        expect(res.body.result.length).toBeLessThan(longOutput.length);
        expect(res.body.result).toContain('task_output');
      } finally {
        await app.close();
      }
    });
  });

  // ============================================
  // ERROR CASES
  // ============================================

  describe('error handling', () => {
    it('returns 400 when input is missing', async () => {
      const app = await buildApp();
      try {
        const res = await invoke(app, '/api/tools/test/invoke')
          .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('input');
      } finally {
        await app.close();
      }
    });

    it('returns 400 when input is null', async () => {
      const app = await buildApp();
      try {
        const res = await invoke(app, '/api/tools/test/invoke')
          .send({ input: null });

        expect(res.status).toBe(400);
      } finally {
        await app.close();
      }
    });

    it('returns 404 when tool not found', async () => {
      const app = await buildApp();
      try {
        const res = await invoke(app, '/api/tools/nonexistent_xyz/invoke')
          .send({ input: {} });

        expect(res.status).toBe(404);
        expect(res.body.error).toContain('not found');
      } finally {
        await app.close();
      }
    });

    it('returns success=false for disabled tool', async () => {
      const registry = new ToolRegistry();
      registry.register(
        buildTool({
          name: 'disabled_tool',
          description: 'A disabled tool',
          inputSchema: z.object({}),
          call: async () => ({ data: 'should not reach' }),
          maxResultSizeChars: 10_000,
          isEnabled: () => false,
        }),
      );

      const app = await buildApp({ registry });
      try {
        const res = await invoke(app, '/api/tools/disabled_tool/invoke')
          .send({ input: {} });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.toolName).toBe('disabled_tool');
      } finally {
        await app.close();
      }
    });

    it('returns 403 when checkPermissions denies', async () => {
      const registry = new ToolRegistry();
      registry.register(
        buildTool({
          name: 'deny_tool',
          description: 'Tool that denies permission',
          inputSchema: z.object({}),
          call: async () => ({ data: 'should not reach' }),
          maxResultSizeChars: 10_000,
          checkPermissions: async () => ({
            behavior: 'deny' as const,
            message: 'Not allowed',
          }),
        }),
      );

      const app = await buildApp({ registry });
      try {
        const res = await invoke(app, '/api/tools/deny_tool/invoke')
          .send({ input: {} });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('permission_denied');
      } finally {
        await app.close();
      }
    });

    it('returns 403 when checkPermissions asks (non-interactive)', async () => {
      const registry = new ToolRegistry();
      registry.register(
        buildTool({
          name: 'ask_tool',
          description: 'Tool that requires approval',
          inputSchema: z.object({}),
          call: async () => ({ data: 'should not reach' }),
          maxResultSizeChars: 10_000,
          checkPermissions: async () => ({
            behavior: 'ask' as const,
            message: 'Requires user approval',
          }),
        }),
      );

      const app = await buildApp({ registry });
      try {
        const res = await invoke(app, '/api/tools/ask_tool/invoke')
          .send({ input: {} });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('permission_approval_required');
      } finally {
        await app.close();
      }
    });

    it('returns success=false for invalid input (Zod failure)', async () => {
      const registry = new ToolRegistry();
      registry.register(
        buildTool({
          name: 'strict_tool',
          description: 'Requires specific schema',
          inputSchema: z.object({ host: z.string(), port: z.number() }),
          call: async () => ({ data: 'ok' }),
          maxResultSizeChars: 10_000,
        }),
      );

      const app = await buildApp({ registry });
      try {
        const res = await invoke(app, '/api/tools/strict_tool/invoke')
          .send({ input: { wrong_field: true } });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.error.recoverable).toBe(true);
      } finally {
        await app.close();
      }
    });
  });

  // ============================================
  // INFRASTRUCTURE ERRORS
  // ============================================

  describe('infrastructure unavailability', () => {
    it('returns 503 when apiToolExecutor is not available', async () => {
      const fastify = Fastify({ logger: false });
      (fastify as any).toolRegistry = new ToolRegistry();
      // No apiToolExecutor
      await fastify.register(toolInvokeRoutes);
      await fastify.ready();

      try {
        const res = await request(fastify.server)
          .post('/api/tools/test/invoke')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({ input: {} });

        expect(res.status).toBe(503);
      } finally {
        await fastify.close();
      }
    });

    it('returns 503 when toolRegistry is not available', async () => {
      const fastify = Fastify({ logger: false });
      // No toolRegistry, no apiToolExecutor
      await fastify.register(toolInvokeRoutes);
      await fastify.ready();

      try {
        const res = await request(fastify.server)
          .post('/api/tools/test/invoke')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({ input: {} });

        expect(res.status).toBe(503);
      } finally {
        await fastify.close();
      }
    });
  });
});
