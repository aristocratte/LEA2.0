/**
 * PermissionRequestStore — alwaysAllow feature tests
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PermissionRequestStore } from '../PermissionRequestStore.js';

describe('PermissionRequestStore — alwaysAllow', () => {
  let store: PermissionRequestStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new PermissionRequestStore({ maxAge: 5000 });
  });

  afterEach(() => {
    store.stop();
    vi.useRealTimers();
  });

  // Helper to create a standard request
  function createRequest(toolName = 'bash') {
    return store.create({
      agentId: 'agent-1',
      agentName: 'Recon Alpha',
      toolName,
      toolUseId: 'call_1',
      input: { command: 'whoami' },
      description: 'Execute bash',
      reason: 'Needs approval',
    });
  }

  // -----------------------------------------------------------------------
  // 1. approve with alwaysAllow=true stores permissionUpdates in result
  // -----------------------------------------------------------------------
  it('stores permissionUpdates when alwaysAllow is true', () => {
    const item = createRequest();

    const approved = store.approve(item.requestId, { alwaysAllow: true });

    expect(approved).toBeDefined();
    expect(approved!.status).toBe('approved');
    expect(approved!.permissionUpdates).toBeDefined();
    expect(approved!.permissionUpdates).toHaveLength(1);
    expect(approved!.permissionUpdates![0]).toEqual({
      type: 'addRules',
      rules: [{ toolName: 'bash' }],
      behavior: 'allow',
      destination: 'session',
    });
  });

  // -----------------------------------------------------------------------
  // 2. approve with alwaysAllow=false (default) — no permissionUpdates
  // -----------------------------------------------------------------------
  it('does not produce permissionUpdates when alwaysAllow is false (default)', () => {
    const item = createRequest();

    const approved = store.approve(item.requestId);

    expect(approved).toBeDefined();
    expect(approved!.status).toBe('approved');
    expect(approved!.permissionUpdates).toBeUndefined();
  });

  it('does not produce permissionUpdates when alwaysAllow is explicitly false', () => {
    const item = createRequest();

    const approved = store.approve(item.requestId, { alwaysAllow: false });

    expect(approved).toBeDefined();
    expect(approved!.permissionUpdates).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 3. approve with alwaysAllow=true for a specific tool creates rule
  // -----------------------------------------------------------------------
  it('creates rule with correct toolName for the approved tool', () => {
    const item = createRequest('nmap_scan');

    const approved = store.approve(item.requestId, { alwaysAllow: true });

    expect(approved!.permissionUpdates).toHaveLength(1);
    expect(approved!.permissionUpdates![0].rules[0].toolName).toBe('nmap_scan');
    expect(approved!.permissionUpdates![0].type).toBe('addRules');
    expect(approved!.permissionUpdates![0].behavior).toBe('allow');
    expect(approved!.permissionUpdates![0].destination).toBe('session');
  });

  // -----------------------------------------------------------------------
  // 4. getPermissionUpdates returns updates for approved request
  // -----------------------------------------------------------------------
  it('getPermissionUpdates returns updates for approved request with alwaysAllow', () => {
    const item = createRequest();
    store.approve(item.requestId, { alwaysAllow: true });

    const updates = store.getPermissionUpdates(item.requestId);

    expect(updates).toBeDefined();
    expect(updates).toHaveLength(1);
    expect(updates![0].rules[0].toolName).toBe('bash');
  });

  // -----------------------------------------------------------------------
  // 5. getPermissionUpdates returns undefined for denied request
  // -----------------------------------------------------------------------
  it('getPermissionUpdates returns undefined for denied request', () => {
    const item = createRequest();
    store.deny(item.requestId, 'Blocked');

    expect(store.getPermissionUpdates(item.requestId)).toBeUndefined();
  });

  it('getPermissionUpdates returns undefined for approved request without alwaysAllow', () => {
    const item = createRequest();
    store.approve(item.requestId);

    expect(store.getPermissionUpdates(item.requestId)).toBeUndefined();
  });

  it('getPermissionUpdates returns undefined for unknown requestId', () => {
    expect(store.getPermissionUpdates('nonexistent')).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 6. alwaysAllow still works with updatedInput
  // -----------------------------------------------------------------------
  it('works alongside updatedInput', () => {
    const item = createRequest();

    const approved = store.approve(item.requestId, {
      updatedInput: { command: 'ls -la' },
      alwaysAllow: true,
    });

    expect(approved!.result!.updatedInput).toEqual({ command: 'ls -la' });
    expect(approved!.permissionUpdates).toHaveLength(1);
    expect(approved!.permissionUpdates![0].rules[0].toolName).toBe('bash');
  });

  // -----------------------------------------------------------------------
  // 7. stored item is retrievable via get() with permissionUpdates
  // -----------------------------------------------------------------------
  it('get() returns the item with permissionUpdates after alwaysAllow approval', () => {
    const item = createRequest();

    store.approve(item.requestId, { alwaysAllow: true });

    const stored = store.get(item.requestId);
    expect(stored!.permissionUpdates).toBeDefined();
    expect(stored!.permissionUpdates).toHaveLength(1);
  });
});
