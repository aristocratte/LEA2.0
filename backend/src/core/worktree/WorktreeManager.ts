import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import type { WorktreeSession, WorktreeCreateOptions, WorktreeRemoveOptions, WorktreeInfo } from './types.js';
import {
  findGitRoot,
  getCurrentBranch,
  createGitWorktree,
  removeGitWorktree,
  deleteBranch,
  hasUncommittedChanges,
  listGitWorktrees,
} from './git-operations.js';

const WORKTREES_DIR = '.lea/worktrees';

/** Sentinel key for session-level activation (UI-driven, not agent-scoped). */
export const SESSION_KEY = '__session__';

export class WorktreeManager {
  private sessions = new Map<string, WorktreeSession>();
  private readonly repoRoot: string | null;
  /** Map of agentId -> slug for tracking which agent is in which worktree. */
  private activeWorktrees = new Map<string, string>();

  constructor(repoRoot: string | null) {
    this.repoRoot = repoRoot;
  }

  /** Check if worktree mode is available (git repo exists). */
  isAvailable(): boolean {
    return this.repoRoot !== null;
  }

  /** Get the repo root. */
  getRepoRoot(): string | null {
    return this.repoRoot;
  }

  /** Create a new worktree and return the session. */
  create(options: WorktreeCreateOptions): WorktreeSession {
    if (!this.repoRoot) {
      throw new Error('Not in a git repository. Worktree mode requires a git repo.');
    }

    const slug = options.slug.replace(/[^a-zA-Z0-9_-]/g, '-');
    const branch = options.branch ?? `wt/${slug}`;
    const baseBranch = options.baseBranch ?? getCurrentBranch(this.repoRoot);
    const worktreePath = join(this.repoRoot, WORKTREES_DIR, slug);

    // Idempotent: if worktree already exists, return existing session
    const existing = this.sessions.get(slug);
    if (existing && existsSync(worktreePath)) {
      return existing;
    }

    // Ensure worktrees directory exists
    const worktreesDir = join(this.repoRoot, WORKTREES_DIR);
    mkdirSync(worktreesDir, { recursive: true });

    // Create the git worktree
    createGitWorktree(this.repoRoot, worktreePath, branch, baseBranch);

    const session: WorktreeSession = {
      slug,
      worktreePath,
      branch,
      agentId: options.agentId,
      originalCwd: this.repoRoot,
      createdAt: new Date(),
    };

    this.sessions.set(slug, session);
    return session;
  }

  /** Remove a worktree by slug. */
  remove(slug: string, options?: WorktreeRemoveOptions): void {
    if (!this.repoRoot) {
      throw new Error('Not in a git repository.');
    }

    const session = this.sessions.get(slug);
    if (!session) {
      throw new Error(`Worktree "${slug}" not found.`);
    }

    // Check for uncommitted changes
    if (!options?.force && existsSync(session.worktreePath)) {
      const hasChanges = hasUncommittedChanges(session.worktreePath);
      if (hasChanges) {
        throw new Error(
          `Worktree "${slug}" has uncommitted changes. Use force: true to remove anyway.`,
        );
      }
    }

    // Remove the git worktree
    if (existsSync(session.worktreePath)) {
      try {
        removeGitWorktree(this.repoRoot, session.worktreePath);
      } catch {
        // Fallback: manual cleanup
        try { rmSync(session.worktreePath, { recursive: true, force: true }); } catch {}
      }
    }

    // Delete the branch if requested
    if (options?.removeBranch !== false) {
      deleteBranch(this.repoRoot, session.branch);
    }

    this.sessions.delete(slug);

    // Clean up any active worktree references pointing to this slug
    for (const [agentId, activeSlug] of this.activeWorktrees.entries()) {
      if (activeSlug === slug) {
        this.activeWorktrees.delete(agentId);
      }
    }
  }

  /** Get a worktree session by slug. */
  get(slug: string): WorktreeSession | undefined {
    return this.sessions.get(slug);
  }

  /** Get the worktree path for an agent (from agentId field on session). */
  getForAgent(agentId: string): string | undefined {
    for (const session of this.sessions.values()) {
      if (session.agentId === agentId) {
        return session.worktreePath;
      }
    }
    return undefined;
  }

  /** Get the slug of the active worktree for an agent. */
  getActiveSlug(agentId: string): string | undefined {
    return this.activeWorktrees.get(agentId);
  }

  /** Activate a worktree for an agent — sets it as the current working context. */
  activate(agentId: string, slug: string): void {
    const session = this.sessions.get(slug);
    if (!session) {
      throw new Error(`Worktree "${slug}" not found.`);
    }
    this.activeWorktrees.set(agentId, slug);
  }

  /** Deactivate the worktree for an agent — returns the original cwd. */
  deactivate(agentId: string): string | undefined {
    const slug = this.activeWorktrees.get(agentId);
    if (!slug) return undefined;
    const session = this.sessions.get(slug);
    this.activeWorktrees.delete(agentId);
    return session?.originalCwd ?? this.repoRoot ?? undefined;
  }

  /** Get the active worktree path for an agent (the one they're currently "in"). */
  getActiveWorktreePath(agentId: string): string | undefined {
    const slug = this.activeWorktrees.get(agentId);
    if (!slug) return undefined;
    return this.sessions.get(slug)?.worktreePath;
  }

  /** List all managed worktrees with status info. */

  // ==========================================================================
  // SESSION-LEVEL OPERATIONS (UI-driven, not agent-scoped)
  // ==========================================================================

  /** Activate a worktree at session level (for UI use, not tied to a specific agent). */
  activateSession(slug: string): void {
    this.activate(SESSION_KEY, slug);
  }

  /** Deactivate the session-level worktree. Returns the original cwd or undefined. */
  deactivateSession(): string | undefined {
    return this.deactivate(SESSION_KEY);
  }

  /** Get the session-level active worktree slug. */
  getActiveSessionSlug(): string | undefined {
    return this.activeWorktrees.get(SESSION_KEY);
  }

  /** Get the session-level active worktree path. */
  getActiveSessionPath(): string | undefined {
    const slug = this.activeWorktrees.get(SESSION_KEY);
    if (!slug) return undefined;
    return this.sessions.get(slug)?.worktreePath;
  }

  /** Get the session-level active worktree info (or undefined). */
  getActiveSession(): WorktreeInfo | undefined {
    const slug = this.activeWorktrees.get(SESSION_KEY);
    if (!slug) return undefined;
    return this.list().find(w => w.slug === slug);
  }

  /** List all managed worktrees with status info. */
  list(): WorktreeInfo[] {
    return Array.from(this.sessions.values()).map((session) => ({
      slug: session.slug,
      worktreePath: session.worktreePath,
      branch: session.branch,
      agentId: session.agentId,
      createdAt: session.createdAt,
      hasChanges: existsSync(session.worktreePath)
        ? hasUncommittedChanges(session.worktreePath)
        : false,
    }));
  }

  /** Clean up all managed worktrees (for shutdown). */
  cleanup(): void {
    if (!this.repoRoot) return;

    for (const session of this.sessions.values()) {
      try {
        if (existsSync(session.worktreePath)) {
          removeGitWorktree(this.repoRoot, session.worktreePath);
        }
        deleteBranch(this.repoRoot, session.branch);
      } catch {
        // Best-effort cleanup during shutdown
      }
    }
    this.sessions.clear();
    this.activeWorktrees.clear();
  }
}
