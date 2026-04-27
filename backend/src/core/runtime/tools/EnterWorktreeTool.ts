/**
 * @module core/runtime/tools/EnterWorktreeTool
 * @description Tool for agents to create and enter a git worktree.
 *
 * Creates an isolated git worktree where the agent can work independently
 * without affecting the main working directory. The agent's operations
 * will be scoped to the new worktree path.
 *
 * Cleanup policy:
 * - Worktree is kept until explicit exit_worktree or DELETE API call
 * - No auto-cleanup on agent kill (documented limitation)
 * - On server shutdown, worktreeManager.cleanup() is called
 */

import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Tool, ToolDef, ToolResult } from '../../types/tool-types.js';
import { buildTool } from '../ToolRegistry.js';
import { getAgentContext } from '../../swarm/AgentContext.js';
import type { WorktreeManager } from '../../worktree/WorktreeManager.js';

// ============================================================================
// SCHEMAS
// ============================================================================

const EnterWorktreeInputSchema = z.object({
  name: z.string().optional().describe(
    'Optional name/slug for the worktree. Auto-generated if not provided.'
  ),
}) as z.ZodType<{ name?: string }>;

export type EnterWorktreeInput = z.infer<typeof EnterWorktreeInputSchema>;

const EnterWorktreeOutputSchema = z.object({
  worktreePath: z.string(),
  branch: z.string(),
  slug: z.string(),
  message: z.string(),
});

export type EnterWorktreeOutput = z.infer<typeof EnterWorktreeOutputSchema>;

// ============================================================================
// SLUG GENERATION
// ============================================================================

/**
 * Generate a random slug for a worktree.
 * Uses a short hex string for uniqueness.
 */
function generateSlug(): string {
  return `wt-${randomBytes(4).toString('hex')}`;
}

/**
 * Sanitize a user-provided name into a valid slug.
 * Replaces non-alphanumeric characters with hyphens, collapses multiples.
 */
function sanitizeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

// ============================================================================
// TOOL FACTORY
// ============================================================================

/**
 * Create the enter_worktree tool.
 *
 * Requires a WorktreeManager instance to create worktrees.
 *
 * @param worktreeManager - The WorktreeManager for the current repo
 * @returns A Tool implementation for entering worktrees
 */
export function createEnterWorktreeTool(worktreeManager: WorktreeManager): Tool<EnterWorktreeInput, EnterWorktreeOutput> {
  const toolDef: ToolDef<EnterWorktreeInput, EnterWorktreeOutput> = {
    name: 'enter_worktree',
    description:
      'Create and enter an isolated git worktree. Use this when you need to work on a separate branch without affecting the main working directory. The worktree is kept until you call exit_worktree or a DELETE API call.',
    inputSchema: EnterWorktreeInputSchema,
    outputSchema: EnterWorktreeOutputSchema,
    maxResultSizeChars: 2_000,

    async call(
      input: EnterWorktreeInput,
      _context,
    ): Promise<ToolResult<EnterWorktreeOutput>> {
      // Check if worktrees are available
      if (!worktreeManager.isAvailable()) {
        return {
          data: {
            worktreePath: '',
            branch: '',
            slug: '',
            message: 'Worktrees are not available. Ensure the server is running inside a git repository.',
          },
        };
      }

      // Resolve agentId from context
      const agentContext = getAgentContext();
      const agentId = agentContext?.agentId;

      // Generate or sanitize slug
      const slug = input.name ? sanitizeSlug(input.name) : generateSlug();

      try {
        const session = worktreeManager.create({
          slug,
          agentId,
        });

        // Activate the worktree — this makes it the effective cwd for the agent
        // The ToolExecutor will now read from WorktreeManager dynamically
        if (agentId) {
          worktreeManager.activate(agentId, session.slug);
        }

        return {
          data: {
            worktreePath: session.worktreePath,
            branch: session.branch,
            slug: session.slug,
            message: `Worktree created and activated at ${session.worktreePath} on branch ${session.branch}. All file operations will now target this path.`,
          },
        };
      } catch (err: any) {
        return {
          data: {
            worktreePath: '',
            branch: '',
            slug: '',
            message: `Failed to create worktree: ${err.message}`,
          },
        };
      }
    },

    async checkPermissions() {
      // Creating a worktree is a side-effect but generally safe
      return { behavior: 'allow' };
    },

    isEnabled() {
      return worktreeManager.isAvailable();
    },

    isReadOnly() {
      // Creating a worktree mutates the git repo (adds a worktree + branch)
      return false;
    },

    isConcurrencySafe() {
      // Two agents should not create the same-named worktree concurrently
      return false;
    },

    isDestructive() {
      // Not destructive — creates new resources only
      return false;
    },

    userFacingName(input) {
      return input.name ? `Enter worktree '${input.name}'` : 'Enter new worktree';
    },

    getActivityDescription(input) {
      return input.name ? `Creating worktree '${input.name}'` : 'Creating new worktree';
    },
  };

  return buildTool<EnterWorktreeInput, EnterWorktreeOutput>(toolDef);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default createEnterWorktreeTool;
