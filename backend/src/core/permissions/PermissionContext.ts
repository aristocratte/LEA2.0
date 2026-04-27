/**
 * @module permissions/PermissionContext
 * @description AsyncLocalStorage-based context for permission propagation.
 *
 * When LEA spawns sub-agents, the parent's permission context needs to flow
 * into child agents. This module provides an AsyncLocalStorage store that
 * automatically propagates through the async call tree.
 *
 * Inspired by Claude Code's PermissionContext.ts (React-backed in CC,
 * AsyncLocalStorage in LEA for non-React environments).
 */

import { AsyncLocalStorage } from 'node:async_hooks';

import type {
  PermissionContext,
  PermissionDecision,
  PermissionMode,
  PermissionUpdate,
  PermissionRule,
} from './types.js';

import { applyPermissionUpdates } from './PermissionEngine.js';

// ---------------------------------------------------------------------------
// AsyncLocalStorage store
// ---------------------------------------------------------------------------

/**
 * The root AsyncLocalStorage that carries the current permission context
 * through the async call tree.
 */
export const permissionStorage = new AsyncLocalStorage<PermissionContext>();

// ---------------------------------------------------------------------------
// Context accessors
// ---------------------------------------------------------------------------

/**
 * Get the current permission context from the AsyncLocalStorage store.
 * Returns `null` if no context is set (e.g., outside of a `runWithContext` call).
 */
export function getPermissionContext(): PermissionContext | null {
  return permissionStorage.getStore() ?? null;
}

/**
 * Require the current permission context. Throws if none is set.
 */
export function requirePermissionContext(): PermissionContext {
  const ctx = permissionStorage.getStore();
  if (!ctx) {
    throw new Error('No permission context is set in the current async scope.');
  }
  return ctx;
}

/**
 * Run a callback within a permission context.
 * The context is available via {@link getPermissionContext} for the duration
 * of the callback and any async operations it spawns.
 */
export function runWithContext<T>(
  context: PermissionContext,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return permissionStorage.run(context, fn);
}

/**
 * Run a callback within a derived permission context.
 * The derived context starts from the current context (if any) and applies
 * the given updates.
 */
export function runWithDerivedContext<T>(
  updates: readonly PermissionUpdate[],
  fn: () => T | Promise<T>,
  fallback?: PermissionContext,
): T | Promise<T> {
  const current = permissionStorage.getStore() ?? fallback;
  if (!current) {
    throw new Error('No permission context to derive from and no fallback provided.');
  }
  const derived = applyPermissionUpdates(current, updates);
  return permissionStorage.run(derived, fn);
}

/**
 * Run a callback with a temporary mode override.
 * The mode is restored after the callback completes.
 */
export function runWithMode<T>(
  mode: PermissionMode,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const current = permissionStorage.getStore();
  if (!current) {
    throw new Error('No permission context to override mode for.');
  }
  const overridden = { ...current, mode };
  return permissionStorage.run(overridden, fn);
}

// ---------------------------------------------------------------------------
// Default context factory
// ---------------------------------------------------------------------------

/** Options for creating a default permission context. */
export type DefaultContextOptions = {
  /** Permission mode. @default 'default' */
  readonly mode?: PermissionMode;
  /** Working directories the agent may access. @default [process.cwd()] */
  readonly workingDirectories?: readonly string[];
  /** Whether this is a headless session. @default false */
  readonly headless?: boolean;
  /** Initial allow rules by source. */
  readonly allowRules?: Partial<Record<string, readonly string[]>>;
  /** Initial deny rules by source. */
  readonly denyRules?: Partial<Record<string, readonly string[]>>;
  /** Initial ask rules by source. */
  readonly askRules?: Partial<Record<string, readonly string[]>>;
};

/**
 * Create a default permission context.
 */
export function createDefaultContext(options: DefaultContextOptions = {}): PermissionContext {
  const workDirs = new Map<string, string>();
  for (const dir of options.workingDirectories ?? [process.cwd()]) {
    workDirs.set(dir, dir);
  }

  return {
    mode: options.mode ?? 'default',
    alwaysAllowRules: options.allowRules ?? {},
    alwaysDenyRules: options.denyRules ?? {},
    alwaysAskRules: options.askRules ?? {},
    additionalWorkingDirectories: workDirs,
    shouldAvoidPermissionPrompts: options.headless ?? false,
  };
}

// ---------------------------------------------------------------------------
// Resolve-once helper
// ---------------------------------------------------------------------------

/**
 * Create a "resolve-once" wrapper for a permission decision promise.
 * Ensures only one caller wins the race to resolve.
 */
export type ResolveOnce<T> = {
  resolve(value: T): void;
  isResolved(): boolean;
  /** Atomically check-and-mark as resolved. Returns true if this caller won. */
  claim(): boolean;
};

/**
 * Wrap a resolve function in a resolve-once guard.
 */
export function createResolveOnce<T>(resolve: (value: T) => void): ResolveOnce<T> {
  let claimed = false;
  let delivered = false;
  return {
    resolve(value: T) {
      if (delivered) return;
      delivered = true;
      claimed = true;
      resolve(value);
    },
    isResolved() {
      return claimed;
    },
    claim() {
      if (claimed) return false;
      claimed = true;
      return true;
    },
  };
}
