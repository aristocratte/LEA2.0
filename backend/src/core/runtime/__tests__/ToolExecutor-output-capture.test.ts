/**
 * C7 — Tool Orchestration & Streaming: Smart Output Capture
 *
 * Tests that ToolExecutor captures large tool outputs in RuntimeTaskManager
 * and provides agents with truncated previews + retrieval references.
 *
 * Validates:
 * - Small results pass through inline (no capture)
 * - Large string results are captured and previewed
 * - Bash-style results with existing taskId get stdout replaced with reference
 * - MCP tools benefit from automatic capture
 * - Full output is retrievable via RuntimeTaskManager.getTaskOutput()
 * - Fallback when RuntimeTaskManager is not available
 * - No regression on normal tool execution
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry, buildTool } from '../ToolRegistry.js';
import { ToolExecutor } from '../ToolExecutor.js';
import { RuntimeTaskManager } from '../RuntimeTaskManager.js';

// ============================================================================
// FIXTURES
// ============================================================================

/** Create a tool that returns a given data value. */
function createMockTool(resultData: unknown, options?: Partial<{ name: string; maxResultSizeChars: number }>) {
  return buildTool({
    name: options?.name ?? 'test_tool',
    description: 'Test tool for output capture',
    inputSchema: z.object({ query: z.string() }),
    call: async () => ({ data: resultData }),
    maxResultSizeChars: options?.maxResultSizeChars ?? 100_000,
  });
}

/** Generate a string of exactly N characters. */
function generateString(size: number): string {
  return 'X'.repeat(size);
}

/** Generate realistic-looking nmap-style output of N characters. */
function generateNmapOutput(size: number): string {
  const header = 'PORT   STATE SERVICE     VERSION\n';
  const line = '22/tcp  open  ssh         OpenSSH 8.9p1 Ubuntu\n80/tcp  open  http        Apache httpd 2.4.52\n443/tcp open  https       nginx 1.24.0\n';
  const remaining = size - header.length;
  return header + line.repeat(Math.ceil(remaining / line.length)).slice(0, remaining);
}

// ============================================================================
// TESTS
// ============================================================================

describe('C7 — Smart Output Capture in ToolExecutor', () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;
  let rtm: RuntimeTaskManager;

  beforeEach(() => {
    registry = new ToolRegistry();
    rtm = new RuntimeTaskManager();
    executor = new ToolExecutor(registry);
    executor.setRuntimeTaskManager(rtm);
  });

  // ============================================
  // SCENARIO 1: Small result → inline, no capture
  // ============================================

  describe('small tool results pass through inline', () => {
    it('returns short string result without creating a runtime task', async () => {
      const smallOutput = generateString(500); // Well under threshold
      registry.register(createMockTool(smallOutput));

      const result = await executor.execute({
        toolUseId: 'call-001',
        toolName: 'test_tool',
        input: { query: 'hello' },
        sessionId: 'sess-small',
        abortController: new AbortController(),
      });

      expect(result.event.isError).toBeUndefined();
      expect(result.event.result).toBe(smallOutput);

      // No runtime task was created for this execution
      const tasks = rtm.listTasks();
      expect(tasks).toHaveLength(0);
    });

    it('returns short object result without creating a runtime task', async () => {
      registry.register(createMockTool({ status: 'ok', count: 42 }));

      const result = await executor.execute({
        toolUseId: 'call-002',
        toolName: 'test_tool',
        input: { query: 'check' },
        sessionId: 'sess-obj',
        abortController: new AbortController(),
      });

      expect(result.event.isError).toBeUndefined();
      const parsed = JSON.parse(result.event.result as string);
      expect(parsed.status).toBe('ok');
      expect(parsed.count).toBe(42);

      // No runtime task created
      expect(rtm.listTasks()).toHaveLength(0);
    });
  });

  // ============================================
  // SCENARIO 2: Large result → capture + preview + reference
  // ============================================

  describe('large string results are captured in RuntimeTaskManager', () => {
    it('captures full output and returns preview with taskId reference', async () => {
      const bigOutput = generateNmapOutput(50_000); // 50K chars — well above 15K threshold
      registry.register(createMockTool(bigOutput));

      const result = await executor.execute({
        toolUseId: 'call-large-001',
        toolName: 'test_tool',
        input: { query: '10.0.0.1' },
        sessionId: 'sess-large',
        abortController: new AbortController(),
      });

      expect(result.event.isError).toBeUndefined();

      const output = result.event.result as string;

      // Should contain the nmap header (preview)
      expect(output).toContain('PORT   STATE SERVICE');

      // Should contain truncation message with taskId reference
      expect(output).toContain('truncated');
      expect(output).toContain('task_output');
      expect(output).toMatch(/taskId="out-test_tool-\d+"/);

      // Result should be shorter than original (preview + suffix)
      expect(output.length).toBeLessThan(bigOutput.length);

      // A runtime task should have been created with the full output
      const tasks = rtm.listTasks();
      expect(tasks).toHaveLength(1);

      const task = tasks[0];
      expect(task.command).toContain('tool:test_tool');
      expect(task.status).toBe('completed');
    });

    it('stores the COMPLETE output in RuntimeTaskManager (not just preview)', async () => {
      const bigOutput = generateString(30_000);
      registry.register(createMockTool(bigOutput));

      await executor.execute({
        toolUseId: 'call-full-001',
        toolName: 'test_tool',
        input: { query: 'big' },
        sessionId: 'sess-full',
        abortController: new AbortController(),
      });

      // Get the captured task's output
      const tasks = rtm.listTasks();
      expect(tasks).toHaveLength(1);

      const capturedOutput = rtm.getTaskOutput(tasks[0].taskId)!;
      expect(capturedOutput.output).toBe(bigOutput); // EXACT match, not truncated
      expect(capturedOutput.totalBytes).toBe(30_000);
      expect(capturedOutput.isComplete).toBe(true);
    });

    it('agent receives approximately AGENT_PREVIEW_CHARS + suffix', async () => {
      const bigOutput = generateString(50_000);
      registry.register(createMockTool(bigOutput));

      const result = await executor.execute({
        toolUseId: 'call-preview-001',
        toolName: 'test_tool',
        input: { query: 'preview' },
        sessionId: 'sess-preview',
        abortController: new AbortController(),
      });

      const output = result.event.result as string;
      // Should be roughly AGENT_PREVIEW_CHARS (10K) + suffix (~150 chars)
      expect(output.length).toBeLessThan(12_000);
      expect(output.length).toBeGreaterThan(10_000);
    });
  });

  // ============================================
  // SCENARIO 3: Bash-style result with existing taskId
  // ============================================

  describe('bash-style results with taskId get stdout replaced by reference', () => {
    it('replaces stdout field with reference to existing taskId', async () => {
      const bashResult = {
        taskId: 'shell-abc-123',
        status: 'completed' as const,
        exitCode: 0,
        stdout: generateNmapOutput(200_000), // Huge stdout
        stderr: '',
      };
      registry.register(createMockTool(bashResult));

      const result = await executor.execute({
        toolUseId: 'bash-001',
        toolName: 'test_tool',
        input: { query: 'nmap scan' },
        sessionId: 'sess-bash',
        abortController: new AbortController(),
      });

      expect(result.event.isError).toBeUndefined();

      const parsed = JSON.parse(result.event.result as string);

      // TaskId preserved
      expect(parsed.taskId).toBe('shell-abc-123');
      expect(parsed.status).toBe('completed');
      expect(parsed.exitCode).toBe(0);

      // Stdout replaced with reference (NOT the raw 200K)
      expect(parsed.stdout).toContain('bytes');
      expect(parsed.stdout).toContain('task_output');
      expect(parsed.stdout).toContain('shell-abc-123');

      // Stderr untouched
      expect(parsed.stderr).toBe('');

      // No NEW runtime task created (output already in shell-abc-123)
      const tasks = rtm.listTasks();
      // The only tasks would be from other sources; we didn't create an "out-*" task here
      const captureTasks = tasks.filter((t) => t.taskId.startsWith('out-'));
      expect(captureTasks).toHaveLength(0);
    });
  });

  // ============================================
  // SCENARIO 4: MCP-style large output (automatic capture)
  // ============================================

  describe('MCP tools with large output are automatically captured', () => {
    it('MCP nmap_scan style output gets captured like any other large tool', async () => {
      // Simulate what McpToolBridge.call() returns: a clean string
      const mcpOutput = generateNmapOutput(120_000);
      registry.register(
        buildTool({
          name: 'mcp:nmap_scan',
          description: '[MCP] Nmap port scanning',
          inputSchema: z.object({ target: z.string() }),
          call: async () => ({ data: mcpOutput }),
          maxResultSizeChars: 100_000,
        })
      );

      const result = await executor.execute({
        toolUseId: 'mcp-call-001',
        toolName: 'mcp:nmap_scan',
        input: { target: '192.168.1.0/24' },
        sessionId: 'sess-mcp',
        abortController: new AbortController(),
      });

      expect(result.event.isError).toBeUndefined();

      const output = result.event.result as string;
      expect(output).toContain('PORT   STATE SERVICE'); // Preview has header
      expect(output).toContain('truncated');
      expect(output).toContain('task_output');
      expect(output).toMatch(/taskId="out-mcp:nmap_scan-\d+"/);

      // Full output retrievable
      const tasks = rtm.listTasks();
      const mcpTask = tasks.find((t) => t.taskId.startsWith('out-mcp:nmap_scan'));
      expect(mcpTask).toBeDefined();

      if (mcpTask) {
        const stored = rtm.getTaskOutput(mcpTask.taskId)!;
        expect(stored.output).toBe(mcpOutput); // Exact full output
        expect(stored.totalBytes).toBe(120_000);
      }
    });
  });

  // ============================================
  // SCENARIO 5: Retrieval via task_output pattern
  // ============================================

  describe('full output is retrievable via RuntimeTaskManager', () => {
    it('task_output can retrieve the exact original output', async () => {
      const original = `Line 1: important data\n` +
        `Line 2: ${generateString(20_000)}\n` +
        `Line 3: critical finding at offset 20001\n` +
        `Line 4: end of report`;

      registry.register(createMockTool(original));

      const execResult = await executor.execute({
        toolUseId: 'call-retrieve-001',
        toolName: 'test_tool',
        input: { query: 'retrieve me' },
        sessionId: 'sess-retrieve',
        abortController: new AbortController(),
      });

      // Agent got truncated version
      const agentOutput = execResult.event.result as string;
      expect(agentOutput).toContain('Line 1: important data');
      expect(agentOutput).toContain('truncated');

      // Extract taskId from the agent's result
      const taskIdMatch = agentOutput.match(/taskId="([^"]+)"/);
      expect(taskIdMatch).not.toBeNull();

      // Simulate what task_output tool would do
      const taskId = taskIdMatch![1];
      const fullOutput = rtm.getTaskOutput(taskId)!;

      expect(fullOutput.isComplete).toBe(true);
      expect(fullOutput.output).toBe(original); // Exact match
      expect(fullOutput.output).toContain('Line 3: critical finding at offset 20001');
      expect(fullOutput.output).toContain('Line 4: end of report');
    });

    it('supports offset/limit pagination on captured output', async () => {
      // Generate non-uniform content so pages differ
      const big = Array.from({ length: 25_000 }, (_, i) => String.fromCharCode(65 + (i % 26))).join('');
      registry.register(createMockTool(big));

      await executor.execute({
        toolUseId: 'call-paginate-001',
        toolName: 'test_tool',
        input: { query: 'paginate' },
        sessionId: 'sess-paginate',
        abortController: new AbortController(),
      });

      const tasks = rtm.listTasks();
      const taskId = tasks[0].taskId;

      // Paginated read
      const page1 = rtm.getTaskOutput(taskId, 0, 5000)!;
      expect(page1.output.length).toBe(5000);
      expect(page1.totalBytes).toBe(25_000);

      const page2 = rtm.getTaskOutput(taskId, 5000, 5000)!;
      expect(page2.output.length).toBe(5000);
      expect(page2.output).not.toBe(page1.output); // Different content
    });
  });

  // ============================================
  // SCENARIO 6: No RuntimeTaskManager → fallback
  // ============================================

  describe('fallback when RuntimeTaskManager is not set', () => {
    it('falls back to simple truncation without crashing', async () => {
      const executorNoRtm = new ToolExecutor(registry);
      // Note: NO setRuntimeTaskManager called

      const bigOutput = generateString(150_000); // Exceeds both thresholds
      registry.register(createMockTool(bigOutput, { maxResultSizeChars: 10_000 }));

      const result = await executorNoRtm.execute({
        toolUseId: 'no-rtm-001',
        toolName: 'test_tool',
        input: { query: 'no rtm' },
        sessionId: 'sess-no-rtm',
        abortController: new AbortController(),
      });

      // Should still return a valid result (just truncated)
      expect(result.event.isError).toBeUndefined();
      const output = result.event.result as string;

      // Simple truncation (uses maxResultSizeChars)
      expect(output).toContain('[truncated]');
      // But NO taskId reference (no capture happened)
      expect(output).not.toContain('task_output');
    });
  });

  // ============================================
  // SCENARIO 7: No regression on normal execution
  // ============================================

  describe('regression check — normal tool execution unchanged', () => {
    it('tool errors still produce isError results', async () => {
      registry.register(
        buildTool({
          name: 'failing_tool',
          description: 'Always fails',
          inputSchema: z.object({}),
          call: async () => { throw new Error('tool exploded'); },
          maxResultSizeChars: 1000,
        })
      );

      const result = await executor.execute({
        toolUseId: 'fail-001',
        toolName: 'failing_tool',
        input: {},
        sessionId: 'sess-error',
        abortController: new AbortController(),
      });

      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('tool exploded');
    });

    it('disabled tools still return disabled error', async () => {
      registry.register(
        buildTool({
          name: 'disabled_tool',
          description: 'Disabled tool',
          inputSchema: z.object({}),
          call: async () => ({ data: 'should not reach' }),
          isEnabled: () => false,
          maxResultSizeChars: 1000,
        })
      );

      const result = await executor.execute({
        toolUseId: 'disabled-001',
        toolName: 'disabled_tool',
        input: {},
        sessionId: 'sess-disabled',
        abortController: new AbortController(),
      });

      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('currently disabled');
    });

    it('input validation still rejects bad input', async () => {
      registry.register(
        buildTool({
          name: 'validated_tool',
          description: 'Needs proper input',
          inputSchema: z.object({ requiredField: z.string() }),
          call: async () => ({ data: 'ok' }),
          maxResultSizeChars: 1000,
        })
      );

      const result = await executor.execute({
        toolUseId: 'validate-001',
        toolName: 'validated_tool',
        input: {}, // Missing requiredField
        sessionId: 'sess-validate',
        abortController: new AbortController(),
      });

      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('Input validation failed');
    });

    it('hooks still fire normally', async () => {
      const { HookBus } = await import('../../hooks/HookBus.js');
      const hookBus = new HookBus();
      executor.setHookBus(hookBus);

      const preEvents: Array<unknown> = [];
      const postEvents: Array<unknown> = [];
      hookBus.on('pre-tool', (e) => { preEvents.push(e); });
      hookBus.on('post-tool', (e) => { postEvents.push(e); });

      registry.register(createMockTool('normal result'));

      await executor.execute({
        toolUseId: 'hook-regression-001',
        toolName: 'test_tool',
        input: { query: 'hook test' },
        sessionId: 'sess-hooks-reg',
        abortController: new AbortController(),
      });

      expect(preEvents).toHaveLength(1);
      expect(postEvents).toHaveLength(1);
      expect((postEvents[0] as any).result).toBe('normal result');
    });

    it('multiple tools coexist correctly', async () => {
      // Register multiple tools with different sizes
      registry.register(createMockTool(generateString(100), { name: 'tiny' }));
      registry.register(createMockTool(generateString(20_000), { name: 'large' }));
      registry.register(
        buildTool({
          name: 'bash_like',
          description: 'Bash-like tool',
          inputSchema: z.object({}),
          call: async () => ({
            data: { taskId: 'bash-task-99', status: 'completed', exitCode: 0, stdout: generateString(50_000), stderr: '' },
          }),
          maxResultSizeChars: 10_000_000,
        })
      );

      // Tiny tool — inline
      const tinyResult = await executor.execute({
        toolUseId: 'coexist-1',
        toolName: 'tiny',
        input: { query: 'a' },
        sessionId: 'sess-coexist',
        abortController: new AbortController(),
      });
      expect((tinyResult.event.result as string).length).toBe(100);

      // Large tool — captured
      const largeResult = await executor.execute({
        toolUseId: 'coexist-2',
        toolName: 'large',
        input: { query: 'b' },
        sessionId: 'sess-coexist',
        abortController: new AbortController(),
      });
      expect(largeResult.event.result).toContain('truncated');

      // Bash-like — reference
      const bashResult = await executor.execute({
        toolUseId: 'coexist-3',
        toolName: 'bash_like',
        input: {},
        sessionId: 'sess-coexist',
        abortController: new AbortController(),
      });
      const parsedBash = JSON.parse(bashResult.event.result as string);
      expect(parsedBash.stdout).toContain('task_output');
      expect(parsedBash.stdout).toContain('bash-task-99');

      // All 3 should have worked without interference
      const tasks = rtm.listTasks();
      // 1 capture task for "large" tool (tiny and bash_like don't create capture tasks)
      expect(tasks.filter((t) => t.taskId.startsWith('out-'))).toHaveLength(1);
    });
  });
});
