/**
 * LEA Shell Quoting
 *
 * Advanced quoting utilities: nested quotes, ANSI-C quoting ($'...'),
 * locale quoting ($"..."), and quote-level analysis.
 */

import type { ParseEntry } from './types.js';

/**
 * Result of quote-level analysis.
 */
export interface QuoteAnalysis {
  /** Characters visible with single quotes removed (but double quotes preserved) */
  withDoubleQuotes: string;
  /** Characters visible with ALL quotes removed */
  fullyUnquoted: string;
  /** Like fullyUnquoted but preserves quote delimiters */
  unquotedKeepQuoteChars: string;
  /** Whether the string contains any quoting */
  hasQuoting: boolean;
  /** Nesting depth at the end */
  nestingDepth: number;
}

/**
 * Perform deep quote analysis on a command string.
 */
export function analyzeQuotes(command: string): QuoteAnalysis {
  const { withDoubleQuotes, fullyUnquoted, unquotedKeepQuoteChars } = extractQuotedDeep(command);
  return {
    withDoubleQuotes,
    fullyUnquoted,
    unquotedKeepQuoteChars,
    hasQuoting: fullyUnquoted !== command,
    nestingDepth: getQuoteDepth(command),
  };
}

/**
 * Deep quote extraction — more thorough than the basic version.
 * Handles ANSI-C quoting ($'...') and locale quoting ($"...").
 */
export function extractQuotedDeep(command: string): {
  withDoubleQuotes: string;
  fullyUnquoted: string;
  unquotedKeepQuoteChars: string;
} {
  let withDoubleQuotes = '';
  let fullyUnquoted = '';
  let unquotedKeepQuoteChars = '';
  let i = 0;
  const len = command.length;

  while (i < len) {
    const ch = command[i];

    // ANSI-C quoting: $'...'
    if (ch === '$' && i + 1 < len && command[i + 1] === "'") {
      i += 2;
      while (i < len && command[i] !== "'") {
        if (command[i] === '\\' && i + 1 < len) {
          i += 2; // skip escape sequence entirely
          continue;
        }
        i++;
      }
      if (i < len) i++; // skip closing '
      continue;
    }

    // Locale quoting: $"..."
    if (ch === '$' && i + 1 < len && command[i + 1] === '"') {
      unquotedKeepQuoteChars += '$"';
      i += 2;
      while (i < len && command[i] !== '"') {
        if (command[i] === '\\' && i + 1 < len) {
          withDoubleQuotes += command[i] + command[i + 1];
          i += 2;
          continue;
        }
        withDoubleQuotes += command[i];
        i++;
      }
      if (i < len) {
        unquotedKeepQuoteChars += '"';
        i++; // skip closing "
      }
      continue;
    }

    // Single quotes
    if (ch === "'") {
      unquotedKeepQuoteChars += ch;
      i++;
      while (i < len && command[i] !== "'") {
        i++;
      }
      if (i < len) {
        unquotedKeepQuoteChars += "'";
        i++; // skip closing '
      }
      continue;
    }

    // Double quotes
    if (ch === '"') {
      unquotedKeepQuoteChars += ch;
      withDoubleQuotes += ch;
      i++;
      while (i < len && command[i] !== '"') {
        if (command[i] === '\\' && i + 1 < len) {
          withDoubleQuotes += command[i] + command[i + 1];
          unquotedKeepQuoteChars += command[i] + command[i + 1];
          fullyUnquoted += command[i + 1];
          i += 2;
          continue;
        }
        withDoubleQuotes += command[i];
        unquotedKeepQuoteChars += command[i];
        fullyUnquoted += command[i];
        i++;
      }
      if (i < len) {
        unquotedKeepQuoteChars += '"';
        withDoubleQuotes += '"';
        i++; // skip closing "
      }
      continue;
    }

    // Backslash escape
    if (ch === '\\') {
      if (i + 1 < len) {
        withDoubleQuotes += ch + command[i + 1];
        unquotedKeepQuoteChars += ch + command[i + 1];
        fullyUnquoted += command[i + 1];
        i += 2;
        continue;
      }
    }

    withDoubleQuotes += ch;
    unquotedKeepQuoteChars += ch;
    fullyUnquoted += ch;
    i++;
  }

  return { withDoubleQuotes, fullyUnquoted, unquotedKeepQuoteChars };
}

/**
 * Calculate quote nesting depth.
 */
function getQuoteDepth(command: string): number {
  let depth = 0;
  let maxDepth = 0;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\' && !inSingle) {
      escaped = true;
      continue;
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      if (inSingle) {
        depth++;
        maxDepth = Math.max(maxDepth, depth);
      } else {
        depth--;
      }
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      if (inDouble) {
        depth++;
        maxDepth = Math.max(maxDepth, depth);
      } else {
        depth--;
      }
      continue;
    }
  }

  return maxDepth;
}

/**
 * Check if a character at a position is escaped (odd number of preceding backslashes).
 */
export function isEscapedAtPosition(content: string, pos: number): boolean {
  let backslashCount = 0;
  let i = pos - 1;
  while (i >= 0 && content[i] === '\\') {
    backslashCount++;
    i--;
  }
  return backslashCount % 2 === 1;
}

/**
 * Determine if a string token looks like an environment variable assignment.
 */
export function isEnvVarAssignment(token: ParseEntry): boolean {
  if (typeof token !== 'string') return false;
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}
