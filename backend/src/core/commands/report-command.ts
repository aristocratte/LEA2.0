/**
 * @module core/commands/report-command
 * @description Prompt command that generates a pentest report prompt.
 */

import type { PromptCommand } from '../types/command-types.js';

export const reportCommand: PromptCommand = {
  type: 'prompt',
  name: 'report',
  description: 'Generate a penetration testing report',
  group: 'actions',

  async getPrompt(args: string): Promise<string> {
    const scope = args.trim() || 'comprehensive';
    return `Generate a ${scope} penetration testing report covering all findings, risk assessments, and remediation recommendations.`;
  },
};
