/**
 * Help Command Tests
 *
 * Tests for the /help slash command which lists all
 * registered commands with their descriptions.
 */

import { describe, expect, it } from 'vitest';
import { CommandRegistry } from '../../runtime/CommandRegistry.js';
import type { Command, CommandContext } from '../../types/command-types.js';

/**
 * Helper: create a context with a command registry.
 */
function makeContext(registry: CommandRegistry): CommandContext {
  return {
    sessionId: 'test-session',
    args: '',
    toolUseContext: {} as any,
    tools: new Map() as any,
    commandRegistry: registry,
  } as CommandContext;
}

/**
 * Helper: create a help command that lists registry commands.
 */
function createHelpCommand(): Command {
  return {
    type: 'local',
    name: 'help',
    description: 'List available commands',
    call: async (_args: string, context: any) => {
      const registry = context.commandRegistry as CommandRegistry;
      if (!registry) {
        return { type: 'text', content: 'No command registry available' };
      }

      const commands = registry.getAll();
      if (commands.length === 0) {
        return { type: 'text', content: 'No commands available' };
      }

      const lines = commands.map(cmd => {
        const alias = cmd.aliases?.length ? ` (${cmd.aliases.join(', ')})` : '';
        return `  /${cmd.name}${alias} — ${cmd.description}`;
      });

      return { type: 'text', content: `Available commands:\n${lines.join('\n')}` };
    },
  } as Command;
}

describe('help command', () => {
  it('returns text result listing all commands', async () => {
    const registry = new CommandRegistry();

    // Register several commands
    registry.register(
      {
        type: 'local',
        name: 'status',
        description: 'Show system status',
        aliases: ['st'],
        call: async () => ({ type: 'text', content: 'ok' }),
      } as any,
      'builtin',
    );
    registry.register(
      {
        type: 'local',
        name: 'agents',
        description: 'List active agents',
        call: async () => ({ type: 'text', content: 'ok' }),
      } as any,
      'builtin',
    );

    // Register help command last
    registry.register(createHelpCommand(), 'builtin');

    const context = makeContext(registry);
    const result = await registry.execute('help', '', context);

    expect(result.type).toBe('text');
    expect(result.content).toContain('Available commands:');
    expect(result.content).toContain('/status');
    expect(result.content).toContain('(st)');
    expect(result.content).toContain('Show system status');
    expect(result.content).toContain('/agents');
    expect(result.content).toContain('List active agents');
  });

  it('returns text with "No commands available" when registry is empty', async () => {
    const registry = new CommandRegistry();

    // Register only the help command
    registry.register(createHelpCommand(), 'builtin');

    const context = makeContext(registry);
    const result = await registry.execute('help', '', context);

    expect(result.type).toBe('text');
    // The help command itself is registered, so it will show at least itself.
    // But if we want to test the empty case, we need a registry with no commands
    // OTHER than help — which means help still lists itself.
    // Let's test with a fresh registry that has no commands at all.
    // We'll call help's call method directly with an empty registry.
    const emptyRegistry = new CommandRegistry();
    const emptyContext = makeContext(emptyRegistry);
    const helpCmd = createHelpCommand();
    const directResult = await (helpCmd as any).call('', emptyContext);

    expect(directResult.type).toBe('text');
    expect(directResult.content).toBe('No commands available');
  });
});
