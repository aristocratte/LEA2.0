/**
 * LEA Sed Command Parser
 *
 * Parses sed expressions into structured representations for
 * validation and security analysis.
 *
 * Reimplemented from Claude Code's sedEditParser.ts for LEA.
 */

import { tryParseShellCommand } from './shellQuote.js';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

/**
 * A single sed command.
 */
export interface SedCommand {
  /** Command type: s (substitute), d (delete), a (append), i (insert), p (print), etc. */
  command: string;
  /** Address range (e.g., "1,10", "/pattern/", "$") */
  address?: string;
  /** Pattern (for s/pattern/replacement/flags) */
  pattern?: string;
  /** Replacement (for s/pattern/replacement/flags) */
  replacement?: string;
  /** Flags (e.g., "g", "i", "p") */
  flags: string[];
  /** Raw expression text */
  raw: string;
}

/**
 * A parsed sed address.
 */
export interface SedAddress {
  /** Address type */
  type: 'line' | 'last_line' | 'regex' | 'line_range' | 'regex_range';
  /** First address value */
  start?: string | number;
  /** Second address value (for ranges) */
  end?: string | number;
  /** Step value for ranges (0x,2p style) */
  step?: number;
}

// ────────────────────────────────────────────────────────────
// Delimiter Detection
// ────────────────────────────────────────────────────────────

/**
 * Find the delimiter character in a sed expression.
 * The first non-alphanumeric, non-whitespace character after s/d/a/i/etc.
 */
function detectDelimiter(expr: string, start: number): string | null {
  if (start >= expr.length) return null;
  const ch = expr[start]!;
  // Common delimiters
  if ('/|#@!$%^&*~'.includes(ch)) return ch;
  return null;
}

/**
 * Split a delimited string (like s/pattern/replacement/flags).
 * Handles escaped delimiters.
 */
function splitDelimited(expr: string, delimiter: string, start: number): string[] {
  const parts: string[] = [];
  let current = '';
  let i = start;
  let escaped = false;

  while (i < expr.length) {
    const ch = expr[i]!;

    if (escaped) {
      current += ch;
      escaped = false;
      i++;
      continue;
    }

    if (ch === '\\' && i + 1 < expr.length) {
      const next = expr[i + 1]!;
      if (next === delimiter) {
        // Escaped delimiter — include as literal
        current += delimiter;
        i += 2;
        continue;
      }
      // Other escape — keep the backslash
      current += ch;
      i++;
      continue;
    }

    if (ch === delimiter) {
      parts.push(current);
      current = '';
      i++;
      continue;
    }

    // Check for semicolon-delimited multiple commands
    if (ch === ';' && parts.length >= 2) {
      parts.push(current);
      parts.push(expr.slice(i));
      return parts;
    }

    current += ch;
    i++;
  }

  parts.push(current);
  return parts;
}

// ────────────────────────────────────────────────────────────
// Parsing
// ────────────────────────────────────────────────────────────

/**
 * Parse a sed expression string into structured SedCommand objects.
 *
 * @param sedExpr - The sed expression (e.g., "s/old/new/g; d; 1,10p")
 * @returns Array of parsed sed commands
 */
export function parseSedCommand(sedExpr: string): SedCommand[] {
  const commands: SedCommand[] = [];
  let remaining = sedExpr.trim();

  // Handle multiple commands separated by ; (but not inside patterns)
  while (remaining.length > 0) {
    remaining = remaining.trim();
    if (!remaining) break;

    // Check for address prefix
    let address: string | undefined;
    let cmdStart = 0;

    // Line number address
    const lineAddrMatch = remaining.match(/^(\d+(?:[,$/]\S+)*)\s*([a-zA-Z])/);
    if (lineAddrMatch) {
      address = lineAddrMatch[1];
      cmdStart = lineAddrMatch.index! + lineAddrMatch[0]!.length - 1;
    }

    // Regex address
    const regexAddrMatch = remaining.match(/^(\/[^/]*\/)\s*([a-zA-Z])/);
    if (regexAddrMatch && (!address || regexAddrMatch.index === 0)) {
      address = regexAddrMatch[1];
      cmdStart = regexAddrMatch.index! + regexAddrMatch[0]!.length - 1;
    }

    // No address — command starts immediately
    const cmdChar = remaining[cmdStart] ?? remaining[0];
    if (!cmdChar || !/[a-zA-Z]/.test(cmdChar)) {
      // Can't parse — treat remainder as raw
      commands.push({ command: 'unknown', raw: remaining, flags: [] });
      break;
    }

    const commandType = cmdChar;
    const exprStart = cmdStart + 1;

    if (commandType === 's') {
      // Substitute command: s/pattern/replacement/flags
      const delimiter = detectDelimiter(remaining, exprStart);
      if (delimiter) {
        const parts = splitDelimited(remaining, delimiter, exprStart + 1);
        const pattern = parts[0] ?? '';
        const replacement = parts[1] ?? '';
        const flagsStr = parts[2] ?? '';

        commands.push({
          command: 's',
          address,
          pattern,
          replacement,
          flags: flagsStr.split(''),
          raw: remaining.slice(0, exprStart + 1 + pattern.length + 1 + replacement.length + 1 + flagsStr.length),
        });

        // Move past this command
        const consumed = exprStart + 1 + pattern.length + 1 + replacement.length + 1 + flagsStr.length;
        remaining = remaining.slice(consumed).trim();
        if (remaining.startsWith(';')) remaining = remaining.slice(1).trim();
        continue;
      }
    }

    if (commandType === 'y') {
      // Transliterate: y/source/dest/
      const delimiter = detectDelimiter(remaining, exprStart);
      if (delimiter) {
        const parts = splitDelimited(remaining, delimiter, exprStart + 1);
        commands.push({
          command: 'y',
          address,
          pattern: parts[0],
          replacement: parts[1],
          flags: [],
          raw: remaining,
        });
        remaining = '';
        continue;
      }
    }

    // Simple commands: d, p, a, i, c, q, etc.
    let cmdEnd = remaining.indexOf(';');
    if (cmdEnd === -1) cmdEnd = remaining.length;

    const cmdBody = remaining.slice(exprStart, cmdEnd).trim();
    commands.push({
      command: commandType,
      address,
      raw: remaining.slice(0, cmdEnd),
      flags: [],
      ...(cmdBody ? { pattern: cmdBody } : {}),
    });

    remaining = remaining.slice(cmdEnd).trim();
    if (remaining.startsWith(';')) remaining = remaining.slice(1).trim();
  }

  return commands;
}

/**
 * Parse a sed address string into a structured SedAddress.
 *
 * @param addr - The address string (e.g., "1,10", "/pattern/", "$")
 * @returns Parsed address or null if unparseable
 */
export function parseSedAddress(addr: string): SedAddress | null {
  const trimmed = addr.trim();
  if (!trimmed) return null;

  // Last line
  if (trimmed === '$') {
    return { type: 'last_line' };
  }

  // Line number
  if (/^\d+$/.test(trimmed)) {
    return { type: 'line', start: parseInt(trimmed, 10) };
  }

  // Line range: N,M
  const lineRangeMatch = trimmed.match(/^(\d+),(\d+)$/);
  if (lineRangeMatch) {
    return {
      type: 'line_range',
      start: parseInt(lineRangeMatch[1]!, 10),
      end: parseInt(lineRangeMatch[2]!, 10),
    };
  }

  // Line range with step: N~M
  const stepMatch = trimmed.match(/^(\d+)~(\d+)$/);
  if (stepMatch) {
    return {
      type: 'line_range',
      start: parseInt(stepMatch[1]!, 10),
      step: parseInt(stepMatch[2]!, 10),
    };
  }

  // Regex address: /pattern/
  const regexMatch = trimmed.match(/^\/(.*)\/$/);
  if (regexMatch) {
    return { type: 'regex', start: regexMatch[1] };
  }

  // Regex range: /start/,/end/
  const regexRangeMatch = trimmed.match(/^\/(.*)\/,\/(.*)\/$/);
  if (regexRangeMatch) {
    return {
      type: 'regex_range',
      start: regexRangeMatch[1],
      end: regexRangeMatch[2],
    };
  }

  // Line to regex: N,/pattern/
  const lineToRegex = trimmed.match(/^(\d+),\/(.*)\/$/);
  if (lineToRegex) {
    return {
      type: 'line_range',
      start: parseInt(lineToRegex[1]!, 10),
      end: lineToRegex[2],
    };
  }

  return null;
}

/**
 * Extract file paths from a sed command string.
 *
 * @param command - The full sed command (e.g., "sed -i 's/old/new/g' file1 file2")
 * @returns Array of file path arguments
 */
export function extractSedPaths(command: string): string[] {
  const result = tryParseShellCommand(command);
  if (!result.success) return [];

  const tokens = result.tokens;
  const paths: string[] = [];
  let pastExpression = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (typeof token !== 'string') continue;

    // Skip flags
    if (token.startsWith('-') && token !== '--') continue;

    // The first non-flag string token is the expression
    // Everything after that is a file path
    if (!pastExpression) {
      pastExpression = true;
      continue;
    }

    paths.push(token);
  }

  return paths;
}
