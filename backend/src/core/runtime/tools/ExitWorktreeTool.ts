/**
 * @module core/runtime/tools/ExitWorktreeTool
 * @description Tool for agents to exit and optionally remove a git worktree.
 *
 * Finds the worktree associated with the current agent and either keeps it
 * (for later use) or removes it. If removing with uncommitted changes,
 * the caller must explicitly set discardChanges=true.
 *
 * Cleanup policy:
 * - action='keep': Worktree and branch are preserved on disk
 * - action='remove': Worktree is deleted; requires discardChanges=true if changes exist
 * - On agent kill: No auto-cleanup (documented limitation)
 * - On server shutdown: worktreeManager.cleanup() is called
 */

import { z } from 'zod';
import type { Tool, ToolDef, ToolResult } from '../../types/tool-types.js';
import { buildTool } from '../ToolRegistry.js';
import { getAgentContext } from '../../swarm/AgentContext.js';
import type { WorktreeManager } from '../../worktree/WorktreeManager.js';

// ============================================================================
// SCHEMAS
// ============================================================================

const ExitWorktreeInputSchema = z.object({
  action: z.enum(['keep', 'remove']).describe(
    'Whether to keep or remove the worktree. "keep" leaves it on disk; "remove" deletes it.'
  ),
  discardChanges: z.boolean().optional().describe(
    'Required true when action="remove" and the worktree has uncommitted changes. Refuses to remove otherwise.'
  ),
}) as z.ZodType<{ action: 'keep' | 'remove'; discardChanges?: boolean }>;

export type ExitWorktreeInput = z.infer<typeof ExitWorktreeInputSchema>;

const ExitWorktreeOutputSchema = z.object({
  action: z.string(),
  originalCwd: z.string(),
  message: z.string(),
});

export type ExitWorktreeOutput = z.infer<typeof ExitWorktreeOutputSchema>;

// ============================================================================
// TOOL FACTORY
// ============================================================================

/**
 * Create the exit_worktree tool.
 *
 * Requires a WorktreeManager instance to look up and remove worktrees.
 *
 * @param worktreeManager - The WorktreeManager for the current repo
 * @returns A Tool implementation for exiting worktrees
 */
export function createExitWorktreeTool(worktreeManager: WorktreeManager): Tool<ExitWorktreeInput, ExitWorktreeOutput> {
  const toolDef: ToolDef<ExitWorktreeInput, ExitWorktreeOutput> = {
    name: 'exit_worktree',
    description:
      'Exit the current git worktree. Use "keep" to leave the worktree for later use, or "remove" to delete it. If removing with uncommitted changes, set discardChanges=true.',
    inputSchema: ExitWorktreeInputSchema,
    outputSchema: ExitWorktreeOutputSchema,
    maxResultSizeChars: 2_000,

    async call(
      input: ExitWorktreeInput,
      _context,
    ): Promise<ToolResult<ExitWorktreeOutput>> {
      // Resolve agentId from context
      const agentContext = getAgentContext();
      const agentId = agentContext?.agentId;

      if (!agentId) {
        return {
          data: {
            action: input.action,
            originalCwd: '',
            message: 'Cannot exit worktree: agent context not found.',
          },
        };
      }

      // Find the active worktree for this agent
      const slug = worktreeManager.getActiveSlug(agentId);
      if (!slug) {
        return {
          data: {
            action: input.action,
            originalCwd: '',
            message: `No active worktree found for agent '${agentId}'.`,
          },
        };
      }

      const session = worktreeManager.get(slug);
      if (!session) {
        return {
          data: {
            action: input.action,
            originalCwd: '',
            message: `Worktree session '${slug}' not found.`,
          },
        };
      }

      if (input.action === 'keep') {
        // Deactivate but don't remove
        const originalCwd = worktreeManager.deactivate(agentId);

        return {
          data: {
            action: 'keep',
            originalCwd: session.originalCwd,
            message: `Worktree '${slug}' kept at ${session.worktreePath}. Original cwd: ${session.originalCwd}.`,
          },
        };
      }

      // action === 'remove'
      try {
        // Deactivate first
        const originalCwd = worktreeManager.deactivate(agentId);
        worktreeManager.remove(slug, {
          force: input.discardChanges ?? false,
          removeBranch: true,
        });

        return {
          data: {
            action: 'remove',
            originalCwd: session.originalCwd,
            message: `Worktree '${slug}' removed. Restored to original cwd: ${session.originalCwd}.`,
          },
        };
      } catch (err: any) {
        // Detect "has uncommitted changes" style errors
        const msg = err.message ?? '';
        if (msg.toLowerCase().includes('uncommitted') || msg.toLowerCase().includes('changes')) {
          return {
            data: {
              action: 'remove',
              originalCwd: session.originalCwd,
              message: `Cannot remove worktree '${slug}': it has uncommitted changes. Set discardChanges=true to force removal.`,
            },
          };
        }

        return {
          data: {
            action: 'remove',
            originalCwd: session.originalCwd,
            message: `Failed to remove worktree '${slug}': ${msg}`,
          },
        };
      }
    },

    async checkPermissions() {
      return { behavior: 'allow' };
    },

    isEnabled() {
      return worktreeManager.isAvailable();
    },

    isReadOnly() {
      // Exiting/removing a worktree mutates the git repo
      return false;
    },

    isConcurrencySafe() {
      // Two agents should not remove the same worktree concurrently
      return false;
    },

    isDestructive(input) {
      // Removing a worktree is destructive (deletes files on disk)
      return input.action === 'remove';
    },

    userFacingName(input) {
      return input.action === 'remove' ? 'Remove worktree' : 'Keep worktree';
    },

    getActivityDescription(input) {
      return input.action === 'remove' ? 'Removing worktree' : 'Keeping worktree';
    },
  };

  return buildTool<ExitWorktreeInput, ExitWorktreeOutput>(toolDef);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default createExitWorktreeTool;
