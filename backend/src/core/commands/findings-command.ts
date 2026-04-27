/**
 * @module core/commands/findings-command
 * @description Lists findings from the current swarm run, with optional severity filter.
 */

import type { LocalCommand, CommandContext, CommandResult } from '../types/command-types.js';

export const findingsCommand: LocalCommand = {
  type: 'local',
  name: 'findings',
  aliases: ['find'],
  description: 'List findings from the current swarm run',
  argHints: '[--severity=...]',
  group: 'navigation',

  async call(args: string, context: CommandContext): Promise<CommandResult> {
    try {
      const swarmState = context.swarmState as any;

      if (!swarmState) {
        return {
          type: 'text',
          content: 'Error: Swarm state not available.',
        };
      }

      // Extract severity filter from args
      const severityMatch = args.match(/--severity[=\s]+(\w+)/i);
      const severityFilter = severityMatch?.[1]?.toLowerCase() ?? null;

      // Get findings from swarm state
      const findings: any[] = swarmState.findings ?? [];

      if (findings.length === 0) {
        return {
          type: 'text',
          content: 'No findings yet.',
        };
      }

      // Filter by severity if requested
      const filtered = severityFilter
        ? findings.filter((f) => (f.severity ?? '').toLowerCase() === severityFilter)
        : findings;

      if (filtered.length === 0) {
        return {
          type: 'text',
          content: severityFilter
            ? `No findings with severity "${severityFilter}".`
            : 'No findings yet.',
        };
      }

      const lines = filtered.map((finding) => {
        const severity = (finding.severity ?? 'unknown').toUpperCase();
        const title = finding.title ?? finding.name ?? 'Untitled';
        const id = finding.id ?? '';
        const severityBadge = severity === 'CRITICAL' ? '[CRITICAL]'
          : severity === 'HIGH' ? '[HIGH]'
          : severity === 'MEDIUM' ? '[MEDIUM]'
          : severity === 'LOW' ? '[LOW]'
          : `[${severity}]`;
        return `- ${severityBadge} ${title}${id ? ` (${id})` : ''}`;
      });

      return {
        type: 'text',
        content: `Findings (${filtered.length}):\n${lines.join('\n')}`,
      };
    } catch (error: any) {
      return {
        type: 'text',
        content: `Error: ${error.message ?? 'Failed to list findings'}`,
      };
    }
  },
};
