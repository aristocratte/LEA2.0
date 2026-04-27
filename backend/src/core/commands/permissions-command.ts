/**
 * @module core/commands/permissions-command
 * @description Lists, approves, or denies permission requests.
 */

import type { LocalCommand, CommandContext, CommandResult } from '../types/command-types.js';

export const permissionsCommand: LocalCommand = {
  type: 'local',
  name: 'permissions',
  aliases: ['perms', 'p'],
  description: 'List, approve, or deny permission requests',
  argHints: 'list | approve <id> | deny <id>',
  group: 'actions',

  async call(args: string, context: CommandContext): Promise<CommandResult> {
    try {
      const permStore = context.permissionRequestStore as any;

      if (!permStore) {
        return {
          type: 'text',
          content: 'Error: Permission store not available.',
        };
      }

      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0]?.toLowerCase();

      // list (default)
      if (!subcommand || subcommand === 'list') {
        const pending: any[] = await permStore.listPending();

        if (pending.length === 0) {
          return {
            type: 'text',
            content: 'No pending permission requests.',
          };
        }

        const lines = pending.map((req) => {
          const id = req.id ?? '?';
          const agent = req.agentId ?? req.requestor ?? 'unknown';
          const action = req.action ?? req.type ?? 'unknown';
          const status = req.status ?? 'pending';
          return `- [${status}] ${action} (by ${agent}, id: ${id})`;
        });

        return {
          type: 'text',
          content: lines.join('\n'),
        };
      }

      // approve <id>
      if (subcommand === 'approve') {
        const id = parts.slice(1).join(' ').trim();
        if (!id) {
          return {
            type: 'text',
            content: 'Error: Permission ID required. Usage: /permissions approve <id>',
          };
        }

        await permStore.approve(id, {});
        return {
          type: 'text',
          content: `Permission ${id} approved.`,
        };
      }

      // deny <id>
      if (subcommand === 'deny') {
        const id = parts.slice(1).join(' ').trim();
        if (!id) {
          return {
            type: 'text',
            content: 'Error: Permission ID required. Usage: /permissions deny <id>',
          };
        }

        await permStore.deny(id, {});
        return {
          type: 'text',
          content: `Permission ${id} denied.`,
        };
      }

      return {
        type: 'text',
        content: `Unknown subcommand: ${subcommand}. Usage: /permissions list | approve <id> | deny <id>`,
      };
    } catch (error: any) {
      return {
        type: 'text',
        content: `Error: ${error.message ?? 'Failed to manage permissions'}`,
      };
    }
  },
};
