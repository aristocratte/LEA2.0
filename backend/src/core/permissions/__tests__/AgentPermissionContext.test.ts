import { describe, it, expect } from 'vitest';
import { AgentPermissionContextStore } from '../AgentPermissionContextStore.js';
import type { PermissionContext, PermissionUpdate } from '../types.js';
import { createDefaultContext } from '../PermissionContext.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStoreWithDefault(
  overrides?: Parameters<typeof createDefaultContext>[0],
): AgentPermissionContextStore {
  return new AgentPermissionContextStore(createDefaultContext(overrides));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentPermissionContextStore', () => {
  // 1. createContext → stores and returns context derived from default
  it('createContext stores and returns a context derived from the default', () => {
    const store = makeStoreWithDefault();
    const ctx = store.createContext('agent-1');

    expect(store.hasContext('agent-1')).toBe(true);
    expect(store.getContext('agent-1')).toBe(ctx);
    // Mode should match the default
    expect(ctx.mode).toBe(store.getDefaultContext().mode);
  });

  // 2. createContext with overrides → mode and rules are customized
  it('createContext applies mode and rule overrides', () => {
    const store = makeStoreWithDefault();
    const ctx = store.createContext('agent-2', {
      mode: 'bypassPermissions',
      allowRules: { session: ['Bash', 'Read'] },
      denyRules: { command: ['Write'] },
    });

    expect(ctx.mode).toBe('bypassPermissions');
    expect(ctx.alwaysAllowRules.session).toEqual(['Bash', 'Read']);
    expect(ctx.alwaysDenyRules.command).toEqual(['Write']);
  });

  // 3. getContext → returns stored context
  it('getContext returns the stored context for a known agent', () => {
    const store = makeStoreWithDefault();
    const created = store.createContext('agent-3');
    const retrieved = store.getContext('agent-3');
    expect(retrieved).toBe(created);
  });

  // 4. getContext for unknown agent → returns default
  it('getContext returns the default for an unknown agent', () => {
    const store = makeStoreWithDefault();
    const ctx = store.getContext('unknown-agent');
    expect(ctx).toBe(store.getDefaultContext());
  });

  // 5. updateContext → applies updates correctly
  it('updateContext applies permission updates and returns the new context', () => {
    const store = makeStoreWithDefault();
    store.createContext('agent-4');

    const updates: readonly PermissionUpdate[] = [
      {
        type: 'addRules',
        rules: [{ toolName: 'Bash' }],
        behavior: 'allow',
        destination: 'session',
      },
    ];

    const updated = store.updateContext('agent-4', updates);
    expect(updated.alwaysAllowRules.session).toContain('Bash');

    // The store should reflect the update on subsequent lookups
    expect(store.getContext('agent-4').alwaysAllowRules.session).toContain('Bash');
  });

  // 6. updateContext for unknown agent → throws
  it('updateContext throws for an unknown agent', () => {
    const store = makeStoreWithDefault();
    expect(() => store.updateContext('ghost', [])).toThrow(
      'No context for agent ghost',
    );
  });

  // 7. listContexts → returns all with correct counts
  it('listContexts returns summaries with correct rule counts', () => {
    const store = makeStoreWithDefault();
    store.createContext('a');
    store.createContext('b', {
      allowRules: { session: ['Bash', 'Read'] },
      denyRules: { command: ['Write', 'Delete'] },
    });

    const list = store.listContexts();
    expect(list).toHaveLength(2);

    const infoA = list.find(i => i.agentId === 'a')!;
    expect(infoA.allowRuleCount).toBe(0);
    expect(infoA.denyRuleCount).toBe(0);
    expect(infoA.askRuleCount).toBe(0);

    const infoB = list.find(i => i.agentId === 'b')!;
    expect(infoB.allowRuleCount).toBe(2);
    expect(infoB.denyRuleCount).toBe(2);
  });

  // 8. removeContext → removes and returns true
  it('removeContext removes the context and returns true', () => {
    const store = makeStoreWithDefault();
    store.createContext('agent-5');
    expect(store.hasContext('agent-5')).toBe(true);

    const removed = store.removeContext('agent-5');
    expect(removed).toBe(true);
    expect(store.hasContext('agent-5')).toBe(false);
  });

  // 9. removeContext for unknown → returns false
  it('removeContext returns false for an unknown agent', () => {
    const store = makeStoreWithDefault();
    expect(store.removeContext('nope')).toBe(false);
  });

  // 10. hasContext → correct boolean
  it('hasContext returns true when context exists, false otherwise', () => {
    const store = makeStoreWithDefault();
    expect(store.hasContext('x')).toBe(false);
    store.createContext('x');
    expect(store.hasContext('x')).toBe(true);
  });

  // 11. getDefaultContext → returns the default
  it('getDefaultContext returns the store default', () => {
    const customDefault = createDefaultContext({ mode: 'plan' });
    const store = new AgentPermissionContextStore(customDefault);
    expect(store.getDefaultContext()).toBe(customDefault);
    expect(store.getDefaultContext().mode).toBe('plan');
  });

  // 12. createContext inherits default rules
  it('createContext inherits the default context rules', () => {
    const store = makeStoreWithDefault({
      allowRules: { userSettings: ['Read', 'Glob'] },
      denyRules: { policySettings: ['Bash(rm -rf)'] },
      askRules: { projectSettings: ['Write'] },
    });

    const ctx = store.createContext('inheritor');

    expect(ctx.alwaysAllowRules.userSettings).toEqual(['Read', 'Glob']);
    expect(ctx.alwaysDenyRules.policySettings).toEqual(['Bash(rm -rf)']);
    expect(ctx.alwaysAskRules.projectSettings).toEqual(['Write']);
  });
});
