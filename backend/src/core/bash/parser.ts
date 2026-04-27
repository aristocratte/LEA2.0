/**
 * LEA Command Parser — Additional parsing functions
 *
 * Extends the base parser with compound command splitting, pipe chain
 * extraction, redirect extraction, and comment stripping.
 */


import { tryParseShellCommand } from './shellQuote.js';
import type { ParseEntry } from './types.js';

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Split a command string by shell operators (&&, ||, ;, |, |&)
 * while respecting quoting and escaping.
 */
export function splitCommandWithOperators(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;
  let i = 0;

  while (i < command.length) {
    const ch = command[i]!;

    if (escaped) {
      current += ch;
      escaped = false;
      i++;
      continue;
    }

    if (ch === '\\' && !inSingleQuote) {
      current += ch;
      escaped = true;
      i++;
      continue;
    }

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += ch;
      i++;
      continue;
    }

    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
      i++;
      continue;
    }

    // Check for multi-char operators
    if (!inSingleQuote && !inDoubleQuote) {
      const two = command.slice(i, i + 2);
      if (two === '&&' || two === '||' || two === '|&' || two === ';;') {
        if (current.trim()) tokens.push(current.trim());
        tokens.push(two);
        current = '';
        i += 2;
        continue;
      }
      if (ch === '|' || ch === ';') {
        if (current.trim()) tokens.push(current.trim());
        tokens.push(ch);
        current = '';
        i++;
        continue;
      }
    }

    current += ch;
    i++;
  }

  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

// ────────────────────────────────────────────────────────────
// ParsedCommand Interface
// ────────────────────────────────────────────────────────────

/**
 * A single parsed command with metadata.
 */
export interface ParsedCommand {
  /** The raw command string */
  command: string;
  /** The base command (first word) */
  baseCommand: string;
  /** Arguments to the command */
  args: string[];
  /** Whether this command is part of a pipeline */
  piped: boolean;
  /** Input redirect target */
  stdinRedirect?: string;
  /** Output redirect target */
  stdoutRedirect?: string;
  /** Stderr redirect target */
  stderrRedirect?: string;
  /** Append mode for output redirect */
  appendStdout?: boolean;
  /** Append mode for stderr redirect */
  appendStderr?: boolean;
}

// ────────────────────────────────────────────────────────────
// Compound Commands
// ────────────────────────────────────────────────────────────

/**
 * Parse a compound command string into individual commands.
 * Handles &&, ||, ;, and | operators.
 *
 * @param command - The compound command string
 * @returns Array of parsed commands
 */
export function parseCompoundCommands(command: string): ParsedCommand[] {
  const parts = splitCommandWithOperators(command);
  const operators = new Set(['&&', '||', ';', '|', ';;']);
  const commands: ParsedCommand[] = [];

  // Reconstruct individual commands from the split parts
  let currentParts: string[] = [];
  let piped = false;
  const pipePositions = new Set<number>();

  // First pass: identify pipe positions
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '|') {
      pipePositions.add(i);
    }
  }

  // Second pass: build commands
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;

    if (operators.has(part)) {
      if (part === '|') {
        // Next command is piped
        piped = true;
      } else if (part === '&&' || part === '||' || part === ';') {
        piped = false;
      }

      // Build the command from accumulated parts
      if (currentParts.length > 0) {
        const cmdStr = currentParts.join(' ').trim();
        if (cmdStr) {
          commands.push(buildParsedCommand(cmdStr, piped));
        }
        currentParts = [];
      }
      continue;
    }

    currentParts.push(part);
  }

  // Don't forget the last command
  if (currentParts.length > 0) {
    const cmdStr = currentParts.join(' ').trim();
    if (cmdStr) {
      commands.push(buildParsedCommand(cmdStr, false));
    }
  }

  // Fix pipe flags: a command that feeds into a pipe should have piped=true
  // and a command that receives from a pipe should also have piped=true
  for (let i = 0; i < commands.length; i++) {
    if (i < commands.length - 1) {
      // Check if the next operator was a pipe
      // The last command before a pipe sends data (piped=true for sender)
    }
  }

  return commands;
}

/**
 * Build a ParsedCommand from a raw command string.
 */
function buildParsedCommand(command: string, piped: boolean): ParsedCommand {
  const result = tryParseShellCommand(command);
  const tokens = result.success
    ? result.tokens.filter((t): t is string => typeof t === 'string')
    : command.trim().split(/\s+/);

  const baseCommand = tokens[0] ?? command;
  const args = tokens.slice(1);

  // Extract redirects from args
  const redirects = extractRedirectsFromArgs(args);
  const filteredArgs = redirects.remainingArgs;

  return {
    command,
    baseCommand,
    args: filteredArgs,
    piped,
    stdinRedirect: redirects.stdin,
    stdoutRedirect: redirects.stdout,
    stderrRedirect: redirects.stderr,
    appendStdout: redirects.appendStdout,
    appendStderr: redirects.appendStderr,
  };
}

// ────────────────────────────────────────────────────────────
// Pipe Chain
// ────────────────────────────────────────────────────────────

/**
 * Parse a command string and extract the pipe chain.
 * Returns individual commands in a pipeline.
 *
 * @param command - The command string possibly containing pipes
 * @returns Array of command strings in the pipeline
 */
export function parsePipeChain(command: string): string[] {
  const parts = splitCommandWithOperators(command);
  const commands: string[] = [];
  let currentParts: string[] = [];

  for (const part of parts) {
    if (part === '|') {
      if (currentParts.length > 0) {
        const cmd = currentParts.join(' ').trim();
        if (cmd) commands.push(cmd);
        currentParts = [];
      }
      continue;
    }

    if (part === '&&' || part === '||' || part === ';') {
      // Non-pipe operators end the pipeline
      if (currentParts.length > 0) {
        const cmd = currentParts.join(' ').trim();
        if (cmd) commands.push(cmd);
      }
      break;
    }

    currentParts.push(part);
  }

  if (currentParts.length > 0) {
    const cmd = currentParts.join(' ').trim();
    if (cmd) commands.push(cmd);
  }

  return commands;
}

// ────────────────────────────────────────────────────────────
// Redirect Extraction
// ────────────────────────────────────────────────────────────

/**
 * Extract redirect operators from a command string.
 *
 * @param command - The command string
 * @returns Redirect targets for stdout, stderr, stdin
 */
export function extractRedirects(command: string): {
  stdout?: string;
  stderr?: string;
  stdin?: string;
  appendStdout?: boolean;
  appendStderr?: boolean;
  commandWithoutRedirects: string;
} {
  const result = tryParseShellCommand(command);
  if (!result.success) {
    return { commandWithoutRedirects: command };
  }

  let stdout: string | undefined;
  let stderr: string | undefined;
  let stdin: string | undefined;
  let appendStdout: boolean | undefined;
  let appendStderr: boolean | undefined;
  const kept: string[] = [];

  const tokens = result.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const part = tokens[i];
    const next = tokens[i + 1];

    if (typeof part === 'string' && typeof next === 'string') {
      // > file
      if (next === '>' || next === '>>') {
        const target = tokens[i + 2];
        if (typeof target === 'string') {
          if (part === '1' || part === '') {
            stdout = target;
            appendStdout = next === '>>';
            i += 2;
            continue;
          }
        }
      }

      // 2> file
      if (part === '2' && (next === '>' || next === '>>')) {
        const target = tokens[i + 2];
        if (typeof target === 'string') {
          stderr = target;
          appendStderr = next === '>>';
          i += 2;
          continue;
        }
      }

      // < file
      if (next === '<') {
        const target = tokens[i + 2];
        if (typeof target === 'string') {
          stdin = target;
          i += 2;
          continue;
        }
      }
    }

    // Simple > and >> (without explicit FD)
    if (part === '>' || part === '>>') {
      const target = tokens[i + 1];
      if (typeof target === 'string' && !target.startsWith('-')) {
        stdout = target;
        appendStdout = part === '>>';
        i++;
        continue;
      }
    }

    if (typeof part === 'string') {
      kept.push(part);
    }
  }

  return {
    stdout,
    stderr,
    stdin,
    appendStdout,
    appendStderr,
    commandWithoutRedirects: kept.join(' '),
  };
}

/**
 * Extract redirects from argument tokens.
 */
function extractRedirectsFromArgs(args: string[]): {
  stdin?: string;
  stdout?: string;
  stderr?: string;
  appendStdout?: boolean;
  appendStderr?: boolean;
  remainingArgs: string[];
} {
  const remaining: string[] = [];
  let stdin: string | undefined;
  let stdout: string | undefined;
  let stderr: string | undefined;
  let appendStdout: boolean | undefined;
  let appendStderr: boolean | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === '>' || arg === '>>') {
      if (i + 1 < args.length) {
        stdout = args[i + 1];
        appendStdout = arg === '>>';
        i++;
        continue;
      }
    }

    if (arg === '2>' || arg === '2>>') {
      if (i + 1 < args.length) {
        stderr = args[i + 1];
        appendStderr = arg === '2>>';
        i++;
        continue;
      }
    }

    if (arg === '<') {
      if (i + 1 < args.length) {
        stdin = args[i + 1];
        i++;
        continue;
      }
    }

    remaining.push(arg);
  }

  return { stdin, stdout, stderr, appendStdout, appendStderr, remainingArgs: remaining };
}

// ────────────────────────────────────────────────────────────
// Comment Stripping
// ────────────────────────────────────────────────────────────

/**
 * Strip comments from a command string.
 * Handles both unquoted # comments and preserves # inside quotes.
 *
 * @param command - The command string
 * @returns Command string with comments removed
 */
export function stripComments(command: string): string {
  let result = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && !inSingleQuote) {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      result += ch;
      continue;
    }

    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      result += ch;
      continue;
    }

    // Unquoted # at word boundary starts a comment
    if (ch === '#' && !inSingleQuote && !inDoubleQuote) {
      // Check if # is at a word boundary (preceded by whitespace or start)
      if (i === 0 || /[\s;&|]/.test(command[i - 1]!)) {
        break; // Rest is comment
      }
    }

    result += ch;
  }

  return result;
}
