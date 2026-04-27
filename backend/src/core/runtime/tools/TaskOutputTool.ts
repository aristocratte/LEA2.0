/**
 * TaskOutputTool — Tool for agents to check background task output.
 *
 * Allows agents to query the status and output of background bash tasks
 * that were started with the bash tool's background mode.
 */

import { z } from 'zod';
import type { RuntimeTaskManager } from '../RuntimeTaskManager.js';
import type { ToolDef, ToolResult, ToolUseContext } from '../../types/tool-types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TaskOutputToolInput {
  taskId: string;
  wait?: boolean;
  timeout?: number;
}

export interface TaskOutputToolOutput {
  taskId: string;
  status: string;
  output: string;
  isComplete: boolean;
  exitCode?: number;
}

// ============================================================================
// INPUT SCHEMA
// ============================================================================

const TaskOutputToolInputSchema = z.object({
  taskId: z.string().min(1, 'Task ID cannot be empty'),
  wait: z.boolean().default(false),
  timeout: z.number().int().min(0).default(5000),
});

// ============================================================================
// TASK OUTPUT TOOL
// ============================================================================

export function createTaskOutputTool(runtimeTaskManager: RuntimeTaskManager): ToolDef<TaskOutputToolInput, TaskOutputToolOutput> {
  return {
    name: 'task_output',
    description: 'Get the output and status of a background bash task. Use wait=true to wait for completion.',
    inputSchema: TaskOutputToolInputSchema,
    maxResultSizeChars: 10_000_000, // 10MB

    async call(args: TaskOutputToolInput, _toolContext: ToolUseContext): Promise<ToolResult<TaskOutputToolOutput>> {
      const { taskId, wait, timeout } = args;

      const getResult = (): TaskOutputToolOutput | null => {
        const task = runtimeTaskManager.getTask(taskId);
        if (!task) {
          return null;
        }

        const output = runtimeTaskManager.getTaskOutput(taskId);
        if (!output) {
          return null;
        }

        return {
          taskId,
          status: task.status,
          output: output.output,
          isComplete: output.isComplete,
          exitCode: task.exitCode,
        };
      };

      // If not waiting, return current state immediately
      if (!wait) {
        const result = getResult();
        if (!result) {
          return {
            data: {
              taskId,
              status: 'not_found',
              output: '',
              isComplete: true,
            },
          };
        }
        return { data: result };
      }

      // Wait for completion with timeout
      const startTime = Date.now();
      const pollInterval = 100; // ms
      const effectiveTimeout = timeout ?? 5000;

      while (Date.now() - startTime < effectiveTimeout) {
        const task = runtimeTaskManager.getTask(taskId);
        if (!task) {
          return {
            data: {
              taskId,
              status: 'not_found',
              output: '',
              isComplete: true,
            },
          };
        }

        const output = runtimeTaskManager.getTaskOutput(taskId);
        if (!output) {
          return {
            data: {
              taskId,
              status: 'not_found',
              output: '',
              isComplete: true,
            },
          };
        }

        if (output.isComplete) {
          return {
            data: {
              taskId,
              status: task.status,
              output: output.output,
              isComplete: true,
              exitCode: task.exitCode,
            },
          };
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      // Timeout reached - return current partial state
      const partialResult = getResult();
      if (!partialResult) {
        return {
          data: {
            taskId,
            status: 'not_found',
            output: '',
            isComplete: true,
          },
        };
      }

      return {
        data: {
          ...partialResult,
          status: 'timeout',
        },
      };
    },

    isReadOnly(_input: TaskOutputToolInput): boolean {
      return true;
    },

    isConcurrencySafe(_input: TaskOutputToolInput): boolean {
      return true;
    },

    isDestructive(_input: TaskOutputToolInput): boolean {
      return false;
    },

    userFacingName(_input: TaskOutputToolInput): string {
      return 'task_output';
    },

    getActivityDescription(input: TaskOutputToolInput): string | null {
      return `Checking output for task ${input.taskId.slice(0, 8)}...`;
    },
  };
}
