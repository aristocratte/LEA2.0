/**
 * @module core/commands/tasks-command
 * @description Lists or shows details of persistent tasks.
 */

import type { LocalCommand, CommandContext, CommandResult } from '../types/command-types.js';

export const tasksCommand: LocalCommand = {
  type: 'local',
  name: 'tasks',
  aliases: ['task', 't'],
  description: 'List or inspect persistent tasks',
  argHints: 'list | <id>',
  group: 'navigation',

  async call(args: string, context: CommandContext): Promise<CommandResult> {
    try {
      const taskManager = context.persistentTaskManager as any;

      if (!taskManager) {
        return {
          type: 'text',
          content: 'Error: Task manager not available.',
        };
      }

      const trimmed = args.trim();

      // Subcommand: list (default)
      if (!trimmed || trimmed === 'list') {
        const scope: any = {};
        const ctxScope = (context as any).scope as any;
        if (ctxScope?.pentestId) scope.pentestId = ctxScope.pentestId;
        if (ctxScope?.teamId) scope.teamId = ctxScope.teamId;

        const tasks: any[] = await taskManager.listTasks(Object.keys(scope).length > 0 ? { scope } : {});

        if (tasks.length === 0) {
          return {
            type: 'text',
            content: 'No tasks found.',
          };
        }

        const lines = tasks.map((task) => {
          const status = (task.status ?? 'unknown').toUpperCase();
          const subject = task.subject ?? task.title ?? task.name ?? 'Untitled';
          const owner = task.owner ?? task.assignee ?? 'unassigned';
          return `- [${status}] ${subject} (${owner})`;
        });

        return {
          type: 'text',
          content: lines.join('\n'),
        };
      }

      // Subcommand: task ID
      const task = await taskManager.getTask(trimmed);

      if (!task) {
        return {
          type: 'text',
          content: `Task not found: ${trimmed}`,
        };
      }

      const detailLines: string[] = [
        `Task: ${task.subject ?? task.title ?? task.name ?? trimmed}`,
        `Status: ${task.status ?? 'unknown'}`,
        `Owner: ${task.owner ?? task.assignee ?? 'unassigned'}`,
      ];

      if (task.description) {
        detailLines.push(`Description: ${task.description}`);
      }

      if (task.createdAt) {
        detailLines.push(`Created: ${task.createdAt}`);
      }

      return {
        type: 'text',
        content: detailLines.join('\n'),
      };
    } catch (error: any) {
      return {
        type: 'text',
        content: `Error: ${error.message ?? 'Failed to list tasks'}`,
      };
    }
  },
};
