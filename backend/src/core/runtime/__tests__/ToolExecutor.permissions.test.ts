/**
 * @module core/runtime/ToolExecutor/permissions-tests
 * @description Integration tests for ToolExecutor permission pipeline.
 *
 * Tests the full permission flow from ToolExecutor through PermissionEngine
 * to PermissionRequestStore, covering allow/deny/ask/timeout scenarios.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { ToolExecutor } from '../ToolExecutor.js';
import { ToolRegistry, buildTool } from '../ToolRegistry.js';
import { PermissionRequestStore } from '../../permissions/PermissionRequestStore.js';
import { createDefaultContext } from '../../permissions/PermissionContext.js';

describe('ToolExecutor — permission pipeline', () => {
  let registry: ToolRegistry;
  let abortController: AbortController;

  const sessionId = 'perm-test-session';

  /** Helper to register a tool whose checkPermissions returns a given behavior. */
  function registerToolWithPermission(
    name: string,
    behavior: 'passthrough' | 'allow' | 'deny' | 'ask',
    message?: string,
  ) {
    // Use registry.register() with a raw ToolDef (not double-wrapped via buildTool)
    registry.register({
      name,
      description: `Test tool with ${behavior} permission`,
      inputSchema: z.object({ value: z.string() }),
      call: async (input: { value: string }) => ({ data: `executed: ${input.value}` }),
      checkPermissions: async () => ({
        behavior: behavior as any,
        ...(message ? { message } : {}),
      }),
      isEnabled: () => true,
      maxResultSizeChars: 10_000,
    });
  }

  /** Helper to register a simple tool with passthrough permissions. */
  function registerPassthroughTool(name = 'test_tool') {
    registerToolWithPermission(name, 'passthrough');
  }

  beforeEach(() => {
    registry = new ToolRegistry();
    abortController = new AbortController();
  });

  // -------------------------------------------------------------------------
  // 1. Legacy path — no PermissionRequestStore
  // -------------------------------------------------------------------------
  describe('1. Tool denied — no store (headless path)', () => {
    it('converts passthrough to approval-required when no store is configured', async () => {
      registerPassthroughTool();

      const executor = new ToolExecutor(registry); // no store

      const result = await executor.execute({
        toolUseId: 'call_legacy_1',
        toolName: 'test_tool',
        input: { value: 'hello' },
        sessionId,
        abortController,
      });

      expect(result.event.type).toBe('tool_result');
      expect(result.event.id).toBe('call_legacy_1');
      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('permissions');
      expect(result.errorCode).toBe('permission_approval_required');
      expect(result.recoverable).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Permission allow via rule
  // -------------------------------------------------------------------------
  describe('2. Tool allowed — with store, permission allow', () => {
    it('returns result immediately when alwaysAllowRules match the tool', async () => {
      registerPassthroughTool();

      const store = new PermissionRequestStore();
      const executor = new ToolExecutor(registry, store);

      const ctx = createDefaultContext({
        allowRules: { session: ['test_tool'] },
      });

      const result = await executor.execute({
        toolUseId: 'call_allow_1',
        toolName: 'test_tool',
        input: { value: 'allowed' },
        sessionId,
        abortController,
        permissions: ctx,
      });

      expect(result.event.isError).toBeUndefined();
      expect(result.event.result).toBe('executed: allowed');

      // No pending request should have been created
      expect(store.listPending()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Permission deny via rule
  // -------------------------------------------------------------------------
  describe('3. Tool denied — permission deny', () => {
    it('returns error when alwaysDenyRules match the tool', async () => {
      registerPassthroughTool();

      const store = new PermissionRequestStore();
      const executor = new ToolExecutor(registry, store);

      const ctx = createDefaultContext({
        denyRules: { session: ['test_tool'] },
      });

      const result = await executor.execute({
        toolUseId: 'call_deny_1',
        toolName: 'test_tool',
        input: { value: 'denied' },
        sessionId,
        abortController,
        permissions: ctx,
      });

      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('denied');
      expect(result.recoverable).toBe(true);

      // No pending request should have been created (deny is immediate)
      expect(store.listPending()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Ask -> approve -> executes
  // -------------------------------------------------------------------------
  describe('4. Tool ask -> approve -> executes', () => {
    it('blocks until approved, then returns the tool result', async () => {
      registerPassthroughTool();

      const store = new PermissionRequestStore();
      const executor = new ToolExecutor(registry, store);

      // Default context with no rules -> engine will convert passthrough to ask
      const ctx = createDefaultContext();

      // Start execution (will block waiting for approval)
      const executePromise = executor.execute({
        toolUseId: 'call_ask_approve',
        toolName: 'test_tool',
        input: { value: 'needs_approval' },
        sessionId,
        abortController,
        permissions: ctx,
      });

      // Wait for the pending request to appear in the store
      await new Promise((r) => setTimeout(r, 50));
      const pending = store.listPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].toolName).toBe('test_tool');
      expect(pending[0].status).toBe('pending');

      // Approve the request
      store.approve(pending[0].requestId);

      // Execution should now complete
      const result = await executePromise;

      expect(result.event.isError).toBeUndefined();
      expect(result.event.result).toBe('executed: needs_approval');
      expect(result.recoverable).toBe(true);

      // The request should now be approved
      const resolved = store.get(pending[0].requestId);
      expect(resolved?.status).toBe('approved');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Ask -> deny -> error
  // -------------------------------------------------------------------------
  describe('5. Tool ask -> deny -> error', () => {
    it('blocks until denied, then returns an error', async () => {
      registerPassthroughTool();

      const store = new PermissionRequestStore();
      const executor = new ToolExecutor(registry, store);

      const ctx = createDefaultContext();

      const executePromise = executor.execute({
        toolUseId: 'call_ask_deny',
        toolName: 'test_tool',
        input: { value: 'will_be_denied' },
        sessionId,
        abortController,
        permissions: ctx,
      });

      // Wait for pending request
      await new Promise((r) => setTimeout(r, 50));
      const pending = store.listPending();
      expect(pending).toHaveLength(1);

      // Deny with feedback
      store.deny(pending[0].requestId, 'User rejected this tool call');

      const result = await executePromise;

      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('User rejected this tool call');
      expect(result.recoverable).toBe(true);
      expect(result.suggestions).toContain('User denied the permission request');

      const resolved = store.get(pending[0].requestId);
      expect(resolved?.status).toBe('denied');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Ask -> timeout -> auto-deny
  // -------------------------------------------------------------------------
  describe('6. Tool ask -> timeout -> auto-deny', () => {
    it('returns error when the permission request times out', async () => {
      registerPassthroughTool();

      const store = new PermissionRequestStore({ maxAge: 200 });
      const executor = new ToolExecutor(registry, store);

      const ctx = createDefaultContext();

      const result = await executor.execute({
        toolUseId: 'call_timeout',
        toolName: 'test_tool',
        input: { value: 'will_timeout' },
        sessionId,
        abortController,
        permissions: ctx,
      });

      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('timed out');
      expect(result.recoverable).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Unknown tool — returns error before permission check
  // -------------------------------------------------------------------------
  describe('7. Unknown tool — returns error before permission check', () => {
    it('returns "not found" error without creating a permission request', async () => {
      // Do NOT register any tool

      const store = new PermissionRequestStore();
      const executor = new ToolExecutor(registry, store);

      const ctx = createDefaultContext();

      const result = await executor.execute({
        toolUseId: 'call_unknown',
        toolName: 'nonexistent_tool',
        input: { value: 'oops' },
        sessionId,
        abortController,
        permissions: ctx,
      });

      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('not found in registry');
      expect(result.recoverable).toBe(false);

      // No permission request should have been created
      expect(store.listPending()).toHaveLength(0);
    });
  });
});
