/**
 * @module core/commands
 * @description Barrel file for all built-in slash commands.
 *
 * Re-exports the command context builder and all 14 command implementations,
 * plus provides a registration helper that bulk-registers commands into a
 * CommandRegistry instance.
 */

import type { CommandRegistry } from '../runtime/CommandRegistry.js';
import type { ServiceMap } from './command-context.js';

import { helpCommand } from './help-command.js';
import { statusCommand } from './status-command.js';
import { tasksCommand } from './tasks-command.js';
import { agentsCommand } from './agents-command.js';
import { teamsCommand } from './teams-command.js';
import { permissionsCommand } from './permissions-command.js';
import { planCommand } from './plan-command.js';
import { costCommand } from './cost-command.js';
import { scanCommand } from './scan-command.js';
import { pauseCommand } from './pause-command.js';
import { resumeCommand } from './resume-command.js';
import { reportCommand } from './report-command.js';
import { clearCommand } from './clear-command.js';
import { findingsCommand } from './findings-command.js';

// Re-export command context utilities
export { buildServerCommandContext } from './command-context.js';
export type { ServiceMap } from './command-context.js';

// Re-export individual commands for direct consumption
export { helpCommand } from './help-command.js';
export { statusCommand } from './status-command.js';
export { tasksCommand } from './tasks-command.js';
export { agentsCommand } from './agents-command.js';
export { teamsCommand } from './teams-command.js';
export { permissionsCommand } from './permissions-command.js';
export { planCommand } from './plan-command.js';
export { costCommand } from './cost-command.js';
export { scanCommand } from './scan-command.js';
export { pauseCommand } from './pause-command.js';
export { resumeCommand } from './resume-command.js';
export { reportCommand } from './report-command.js';
export { clearCommand } from './clear-command.js';
export { findingsCommand } from './findings-command.js';

/**
 * Register all built-in commands into a CommandRegistry.
 *
 * Stores the registry reference in the services map so the help command
 * can enumerate all registered commands at runtime.
 *
 * @param registry - The CommandRegistry instance to register into.
 * @param services - The service map (will be mutated to set commandRegistry).
 */
export function registerBuiltinCommands(
  registry: CommandRegistry,
  services: ServiceMap,
): void {
  const commands = [
    helpCommand,
    statusCommand,
    tasksCommand,
    agentsCommand,
    teamsCommand,
    permissionsCommand,
    planCommand,
    costCommand,
    scanCommand,
    pauseCommand,
    resumeCommand,
    reportCommand,
    clearCommand,
    findingsCommand,
  ];

  for (const cmd of commands) {
    registry.register(cmd, 'builtin');
  }

  // Store registry in services so help command can list all commands
  services.commandRegistry = registry;
}
