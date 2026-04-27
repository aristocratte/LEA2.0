/**
 * BashTool — Tool for agents to execute bash commands.
 *
 * Wraps ShellTask to provide command execution capabilities for agents.
 * Supports both foreground (wait for result) and background (return taskId) modes.
 *
 * Permission checks are split:
 * - checkPermissions(): bash-specific checks (security patterns, destructive commands, etc.)
 * - Global PermissionEngine handles rules, mode, classifier, etc.
 */

import { z } from 'zod';
import { ShellTask } from '../../swarm/ShellTask.js';
import { StallDetector } from '../../swarm/StallDetector.js';
import { TaskManager } from '../../swarm/TaskManager.js';
import type { RuntimeTaskManager } from '../RuntimeTaskManager.js';
import type { ToolDef, ToolResult, ToolUseContext, ToolPermissionResult } from '../../types/tool-types.js';
import { stripSafeEnvVars } from '../../bash/envVarStripper.js';
import { analyzeBashCommand, adaptPermissionContext } from '../../bash/bashToolAnalysis.js';
import { findMatchingBashRule } from '../../bash/bashPermissions.js';
import { getCommandStatus, interpretExitCode } from '../../bash/exitCodeSemantics.js';

// ============================================================================
// TYPES
// ============================================================================

export interface BashToolInput {
  command: string;
  timeout?: number;
  background?: boolean;
}

export interface BashToolOutput {
  taskId: string;
  status: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

export interface BashToolContext {
  taskManager: TaskManager;
  runtimeTaskManager: RuntimeTaskManager;
  stallDetector: StallDetector;
  agentId?: string;
}

// ============================================================================
// INPUT SCHEMA
// ============================================================================

const BashToolInputSchema = z.object({
  command: z.string().min(1, 'Command cannot be empty'),
  timeout: z.number().int().min(0).default(30000),
  background: z.boolean().default(false),
});

// ============================================================================
// BASH TOOL
// ============================================================================

export function createBashTool(context: BashToolContext): ToolDef<BashToolInput, BashToolOutput> {
  const { taskManager, runtimeTaskManager, stallDetector, agentId } = context;
  const shellTask = new ShellTask(taskManager, stallDetector);

  return {
    name: 'bash',
    description: 'Execute a bash command. Use background=true for long-running commands and check output later with task_output tool.',
    inputSchema: BashToolInputSchema,
    maxResultSizeChars: 10_000_000, // 10MB

    // ========================================================================
    // PERMISSION CHECKS (bash-specific only)
    // ========================================================================

    async checkPermissions(
      input: BashToolInput,
      toolContext: ToolUseContext,
    ): Promise<ToolPermissionResult<BashToolInput>> {
      const { command } = input;
      // Ensure cwd from ToolUseContext is available in the permission context
      const permContextWithCwd = toolContext.permissions.cwd
        ? toolContext.permissions
        : { ...toolContext.permissions, cwd: toolContext.cwd };
      const bashPermissionContext = adaptPermissionContext(permContextWithCwd);
      const normalizedCommand = stripSafeEnvVars(command).trim();
      const analysis = analyzeBashCommand(command, bashPermissionContext);

      const denyRule = findMatchingBashRule(normalizedCommand, bashPermissionContext.denyRules);
      if (denyRule) {
        return {
          behavior: 'deny',
          message: `Denied by bash rule: ${denyRule.content}`,
        };
      }

      const askRule = findMatchingBashRule(normalizedCommand, bashPermissionContext.askRules);
      if (askRule) {
        return {
          behavior: 'ask',
          message: `Approval required by bash rule: ${askRule.content}`,
        };
      }

      if (!analysis.security.safe) {
        return {
          behavior: 'deny',
          message: analysis.security.reason ?? 'Command failed security validation',
        };
      }

      if (analysis.dangerousEnvVars.length > 0) {
        return {
          behavior: 'deny',
          message: `Dangerous environment variable: ${analysis.dangerousEnvVars[0]} (possible binary hijacking)`,
        };
      }

      if (command.includes('`')) {
        return {
          behavior: 'ask',
          message: 'Backtick command substitution requires approval',
        };
      }

      const blockingPathCheck = analysis.security.pathChecks.find((check) => !check.allowed);
      if (blockingPathCheck) {
        const reason = blockingPathCheck.reason ?? `Path requires approval: ${blockingPathCheck.path}`;
        const hardDeny =
          reason.includes('Path traversal') ||
          reason.includes('Null byte');

        return {
          behavior: hardDeny ? 'deny' : 'ask',
          message: reason,
        };
      }

      if (analysis.destructiveWarning) {
        return {
          behavior: 'ask',
          message: analysis.destructiveWarning,
        };
      }

      if (analysis.semantic.isPrivilegeEscalation) {
        return {
          behavior: 'ask',
          message: `Privilege escalation command requires approval: ${analysis.baseCommand}`,
        };
      }

      if (analysis.semantic.warnings.length > 0) {
        return {
          behavior: 'ask',
          message: analysis.semantic.warnings.join('; '),
        };
      }

      if (toolContext.permissions.mode === 'plan' && !analysis.isReadOnly) {
        return {
          behavior: 'ask',
          message: `Plan mode: command is not read-only: ${command.slice(0, 100)}`,
        };
      }

      const allowRule = findMatchingBashRule(normalizedCommand, bashPermissionContext.allowRules);
      if (allowRule) {
        return {
          behavior: 'allow',
        };
      }

      return { behavior: 'passthrough' };
    },

    isReadOnly(input: BashToolInput): boolean {
      return analyzeBashCommand(input.command).isReadOnly;
    },

    isConcurrencySafe(_input: BashToolInput): boolean {
      return false;
    },

    isDestructive(input: BashToolInput): boolean {
      return analyzeBashCommand(input.command).isDestructive;
    },

    userFacingName(_input: BashToolInput): string {
      return 'bash';
    },

    getActivityDescription(input: BashToolInput): string | null {
      // Truncate command for display
      const truncated = input.command.length > 50
        ? input.command.slice(0, 47) + '...'
        : input.command;
      return `Executing: ${truncated}`;
    },

    // ========================================================================
    // EXECUTION
    // ========================================================================

    async call(args: BashToolInput, toolContext: ToolUseContext): Promise<ToolResult<BashToolOutput>> {
      const { command, timeout, background } = args;
      const effectiveAgentId = toolContext.agentId ?? agentId;
      const analysis = analyzeBashCommand(command);
      let taskId = '';

      // Execute the command
      const taskState = shellTask.execute(command, {
        timeout,
        background,
        agentId: effectiveAgentId,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        cwd: toolContext.cwd ?? process.cwd(),
        onStdoutChunk: (chunk) => {
          if (taskId) runtimeTaskManager.appendOutput(taskId, chunk);
        },
        onStderrChunk: (chunk) => {
          if (taskId) runtimeTaskManager.appendOutput(taskId, chunk);
        },
      });

      taskId = taskState.taskId;

      // Register with RuntimeTaskManager for output tracking
      runtimeTaskManager.registerTask(taskId, {
        taskId,
        command,
        agentId: effectiveAgentId,
        status: 'running',
      });

      // Finalize task lifecycle in RuntimeTaskManager
      const streamOutput = async () => {
        try {
          const result = await taskState.resultPromise;

          if (!result) {
            throw new Error('ShellTask returned undefined result');
          }

          const status = getCommandStatus(
            analysis.baseCommand,
            result.code,
            result.stdout,
            result.stderr,
          );
          const interpretation = interpretExitCode(
            analysis.baseCommand,
            result.code,
            result.stdout,
            result.stderr,
          );

          if (status === 'failed') {
            runtimeTaskManager.failTask(
              taskId,
              interpretation.message ?? `Command exited with code ${result.code}`,
            );
          } else {
            runtimeTaskManager.completeTask(taskId, result.code);
          }

          return { result, status };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          runtimeTaskManager.failTask(taskId, errorMessage);
          throw error;
        }
      };

      // For background tasks, return immediately with taskId
      if (background) {
        // Start streaming in background
        streamOutput().catch(() => {
          // Errors handled in streamOutput
        });

        return {
          data: {
            taskId,
            status: 'running',
          },
        };
      }

      // For foreground tasks, wait for completion
      const { result, status } = await streamOutput();

      return {
        data: {
          taskId,
          status,
          exitCode: result.code,
          stdout: result.stdout,
          stderr: result.stderr,
        },
      };
    },
  };
}
