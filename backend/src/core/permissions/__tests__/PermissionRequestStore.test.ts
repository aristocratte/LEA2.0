/**
 * PermissionRequestStore Tests
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PermissionRequestStore } from '../PermissionRequestStore.js';

describe('PermissionRequestStore', () => {
  let store: PermissionRequestStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new PermissionRequestStore({ maxAge: 5000 });
  });

  afterEach(() => {
    store.stop();
    vi.useRealTimers();
  });

  describe('create', () => {
    it('creates an item with correct fields', () => {
      const item = store.create({
        agentId: 'agent-1',
        agentName: 'Recon Alpha',
        toolName: 'bash',
        toolUseId: 'call_123',
        input: { command: 'whoami' },
        description: 'Execute a bash command',
        reason: 'Requires user approval',
      });

      expect(item.requestId).toBeDefined();
      expect(item.requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(item.agentId).toBe('agent-1');
      expect(item.agentName).toBe('Recon Alpha');
      expect(item.toolName).toBe('bash');
      expect(item.toolUseId).toBe('call_123');
      expect(item.input).toEqual({ command: 'whoami' });
      expect(item.description).toBe('Execute a bash command');
      expect(item.reason).toBe('Requires user approval');
      expect(item.status).toBe('pending');
      expect(item.timestamp).toBeTypeOf('number');
    });
  });

  describe('get', () => {
    it('returns item by requestId', () => {
      const created = store.create({
        agentId: 'agent-1',
        agentName: 'Agent',
        toolName: 'bash',
        toolUseId: 'call_1',
        input: {},
        description: 'desc',
        reason: 'reason',
      });

      const found = store.get(created.requestId);
      expect(found).toBeDefined();
      expect(found!.requestId).toBe(created.requestId);
    });

    it('returns undefined for unknown requestId', () => {
      expect(store.get('nonexistent')).toBeUndefined();
    });
  });

  describe('listPending', () => {
    it('returns only pending items', () => {
      const item1 = store.create({
        agentId: 'agent-1', agentName: 'A', toolName: 'bash',
        toolUseId: 'c1', input: {}, description: 'd', reason: 'r',
      });
      const item2 = store.create({
        agentId: 'agent-2', agentName: 'B', toolName: 'bash',
        toolUseId: 'c2', input: {}, description: 'd', reason: 'r',
      });

      // Approve item1
      store.approve(item1.requestId);

      const pending = store.listPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].requestId).toBe(item2.requestId);
    });

    it('returns empty array when no pending items', () => {
      expect(store.listPending()).toEqual([]);
    });
  });

  describe('listByAgent', () => {
    it('filters by agentId', () => {
      store.create({
        agentId: 'agent-1', agentName: 'A', toolName: 'bash',
        toolUseId: 'c1', input: {}, description: 'd', reason: 'r',
      });
      store.create({
        agentId: 'agent-2', agentName: 'B', toolName: 'bash',
        toolUseId: 'c2', input: {}, description: 'd', reason: 'r',
      });
      store.create({
        agentId: 'agent-1', agentName: 'A', toolName: 'write',
        toolUseId: 'c3', input: {}, description: 'd', reason: 'r',
      });

      const agent1Items = store.listByAgent('agent-1');
      expect(agent1Items).toHaveLength(2);
      expect(agent1Items.every(i => i.agentId === 'agent-1')).toBe(true);
    });
  });

  describe('approve', () => {
    it('updates status and resolves the promise', async () => {
      const item = store.create({
        agentId: 'agent-1', agentName: 'A', toolName: 'bash',
        toolUseId: 'c1', input: {}, description: 'd', reason: 'r',
      });

      const promise = store.waitForResolution(item.requestId);

      // Approve before the promise resolves
      const approved = store.approve(item.requestId);

      expect(approved).toBeDefined();
      expect(approved!.status).toBe('approved');
      expect(approved!.result).toEqual({ decision: 'allow', updatedInput: undefined });

      const result = await promise;
      expect(result.decision).toBe('allow');
    });

    it('passes updatedInput through', async () => {
      const item = store.create({
        agentId: 'agent-1', agentName: 'A', toolName: 'bash',
        toolUseId: 'c1', input: { command: 'rm -rf /' }, description: 'd', reason: 'r',
      });

      const promise = store.waitForResolution(item.requestId);

      store.approve(item.requestId, { updatedInput: { command: 'ls' } });

      const result = await promise;
      expect(result.decision).toBe('allow');
      expect(result.updatedInput).toEqual({ command: 'ls' });
    });

    it('returns undefined for non-pending item', () => {
      const item = store.create({
        agentId: 'agent-1', agentName: 'A', toolName: 'bash',
        toolUseId: 'c1', input: {}, description: 'd', reason: 'r',
      });

      store.approve(item.requestId);
      // Try to approve again
      expect(store.approve(item.requestId)).toBeUndefined();
    });

    it('returns undefined for unknown requestId', () => {
      expect(store.approve('nonexistent')).toBeUndefined();
    });
  });

  describe('deny', () => {
    it('updates status and resolves the promise with deny', async () => {
      const item = store.create({
        agentId: 'agent-1', agentName: 'A', toolName: 'bash',
        toolUseId: 'c1', input: {}, description: 'd', reason: 'r',
      });

      const promise = store.waitForResolution(item.requestId);

      const denied = store.deny(item.requestId, 'Too dangerous');

      expect(denied).toBeDefined();
      expect(denied!.status).toBe('denied');
      expect(denied!.result).toEqual({ decision: 'deny', feedback: 'Too dangerous' });

      const result = await promise;
      expect(result.decision).toBe('deny');
      expect(result.feedback).toBe('Too dangerous');
    });

    it('returns undefined for non-pending item', () => {
      const item = store.create({
        agentId: 'agent-1', agentName: 'A', toolName: 'bash',
        toolUseId: 'c1', input: {}, description: 'd', reason: 'r',
      });

      store.deny(item.requestId);
      // Try to deny again
      expect(store.deny(item.requestId)).toBeUndefined();
    });
  });

  describe('waitForResolution', () => {
    it('blocks until resolved', async () => {
      const item = store.create({
        agentId: 'agent-1', agentName: 'A', toolName: 'bash',
        toolUseId: 'c1', input: {}, description: 'd', reason: 'r',
      });

      const promise = store.waitForResolution(item.requestId);

      // Resolve after a tick
      await Promise.resolve();
      store.approve(item.requestId);

      const result = await promise;
      expect(result.decision).toBe('allow');
    });

    it('resolves immediately for already-resolved items', async () => {
      const item = store.create({
        agentId: 'agent-1', agentName: 'A', toolName: 'bash',
        toolUseId: 'c1', input: {}, description: 'd', reason: 'r',
      });

      store.approve(item.requestId);

      const result = await store.waitForResolution(item.requestId);
      expect(result.decision).toBe('allow');
    });

    it('rejects for unknown requestId', async () => {
      await expect(store.waitForResolution('nonexistent')).rejects.toThrow('not found');
    });

    it('auto-denies after timeout', async () => {
      const item = store.create({
        agentId: 'agent-1', agentName: 'A', toolName: 'bash',
        toolUseId: 'c1', input: {}, description: 'd', reason: 'r',
      });

      const promise = store.waitForResolution(item.requestId, 3000);

      // Advance past timeout
      vi.advanceTimersByTime(3001);

      const result = await promise;
      expect(result.decision).toBe('deny');
      expect(result.feedback).toBe('Permission request timed out');

      // Check status is expired
      const stored = store.get(item.requestId);
      expect(stored!.status).toBe('expired');
    });
  });

  describe('expiry and cleanup', () => {
    it('cleans up expired pending items', () => {
      const item = store.create({
        agentId: 'agent-1', agentName: 'A', toolName: 'bash',
        toolUseId: 'c1', input: {}, description: 'd', reason: 'r',
      });

      // Advance past maxAge
      vi.advanceTimersByTime(5001);

      // Call the private cleanupExpired via start/stop pattern
      // Instead, we'll verify through deny that it handles expired items
      // Actually, let's test that the item gets expired via waitForResolution
      const promise = store.waitForResolution(item.requestId);
      vi.advanceTimersByTime(5001);

      return promise.then(result => {
        expect(result.decision).toBe('deny');
        expect(store.get(item.requestId)!.status).toBe('expired');
      });
    });
  });

  describe('start/stop', () => {
    it('stop denies all pending requests', () => {
      const item = store.create({
        agentId: 'agent-1', agentName: 'A', toolName: 'bash',
        toolUseId: 'c1', input: {}, description: 'd', reason: 'r',
      });

      store.stop();

      const stored = store.get(item.requestId);
      expect(stored!.status).toBe('denied');
      expect(stored!.result!.feedback).toBe('Server shutting down');
    });
  });
});
