/**
 * @module core/runtime/tools/PlanModeTools
 * @description Tools for agents to enter and exit plan mode.
 *
 * Plan mode restricts agents to read-only operations unless explicitly
 * approved. This is useful when agents need to analyze and plan before
 * executing mutations.
 *
 * Inspired by claude-code's EnterPlanModeTool and ExitPlanModeTool.
 */

import { z } from 'zod';
import type { ToolDef, ToolResult, ToolUseContext } from '../../types/tool-types.js';

// ============================================================================
// SCHEMAS
// ============================================================================

const EnterPlanModeSchema = z.object({
  reason: z.string().optional().describe('Why entering plan mode'),
});

const ExitPlanModeSchema = z.object({
  reason: z.string().optional().describe('Why exiting plan mode'),
  summary: z.string().optional().describe('Summary of what was planned'),
});

// ============================================================================
// ENTER PLAN MODE TOOL
// ============================================================================

/**
 * Create the enter_plan_mode tool.
 *
 * Signals the agent's intent to enter plan mode. The actual mode change
 * is handled by the permission system via the PlanModeManager.
 */
export function createEnterPlanModeTool(): ToolDef<{ reason?: string }, { success: boolean; message: string }> {
  return {
    name: 'enter_plan_mode',
    description:
      'Enter plan mode. In plan mode, you can analyze and plan but non-read-only tools require approval. Use this when you need to think through an approach before executing.',
    inputSchema: EnterPlanModeSchema,
    maxResultSizeChars: 10_000,

    async call(
      _input: { reason?: string },
      _context: ToolUseContext,
    ): Promise<ToolResult<{ success: boolean; message: string }>> {
      // The actual mode change is handled by the PlanModeManager,
      // which updates the agent's PermissionContext to mode='plan'.
      // This tool signals the intent and returns guidance.
      return {
        data: {
          success: true,
          message:
            'Entered plan mode. You can analyze and plan freely. Non-read-only operations will require approval.',
        },
      };
    },

    isReadOnly(): boolean {
      return true;
    },

    isEnabled(): boolean {
      return true;
    },
  };
}

// ============================================================================
// EXIT PLAN MODE TOOL
// ============================================================================

/**
 * Create the exit_plan_mode tool.
 *
 * Signals the agent's intent to exit plan mode and return to normal
 * execution. The actual mode change is handled by the PlanModeManager.
 */
export function createExitPlanModeTool(): ToolDef<
  { reason?: string; summary?: string },
  { success: boolean; message: string }
> {
  return {
    name: 'exit_plan_mode',
    description:
      'Exit plan mode and return to normal execution mode. Use after planning is complete and you are ready to execute.',
    inputSchema: ExitPlanModeSchema,
    maxResultSizeChars: 10_000,

    async call(
      input: { reason?: string; summary?: string },
      _context: ToolUseContext,
    ): Promise<ToolResult<{ success: boolean; message: string }>> {
      return {
        data: {
          success: true,
          message: input.summary
            ? `Exited plan mode. Plan summary: ${input.summary}`
            : 'Exited plan mode. Ready to execute.',
        },
      };
    },

    isReadOnly(): boolean {
      return true;
    },

    isEnabled(): boolean {
      return true;
    },
  };
}
