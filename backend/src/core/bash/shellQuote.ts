/**
 * LEA Shell Quote Utilities
 *
 * Shell quoting/unquoting utilities. Handles single quotes, double quotes,
 * escape sequences, ANSI-C quoting ($'...'), and nested quoting.
 *
 * Reimplemented from Claude Code's shellQuote.ts and shellQuoting.ts.
 */

import type { ParseEntry, ParseResult } from './types.js';

/**
 * Splits a shell command string into tokens, handling quoting and escapes.
 * This is our own implementation (no shell-quote dependency).
 */
export function tryParseShellCommand(
  command: string,
  envFn?: (varName: string) => string,
): ParseResult {
  try {
    const tokens = parseCommand(command, envFn);
    return { success: true, tokens };
  } catch (err) {
    return {
      success: false,
      tokens: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Core shell command parser — tokenizes respecting quoting rules.
 */
function parseCommand(command: string, envFn?: (varName: string) => string): ParseEntry[] {
  const tokens: ParseEntry[] = [];
  let i = 0;
  const len = command.length;

  while (i < len) {
    // Skip whitespace (not newlines — those become NEW_LINE tokens)
    if (command[i] === ' ' || command[i] === '\t') {
      i++;
      continue;
    }

    // Comment
    if (command[i] === '#' && (tokens.length === 0 ||
        (typeof tokens[tokens.length - 1] === 'string' ? true :
         typeof tokens[tokens.length - 1] === 'object' && tokens[tokens.length - 1] !== null &&
         'op' in (tokens[tokens.length - 1] as object)))) {
      // Check if # is at word start (after whitespace or start)
      const prev = tokens.length > 0 ? tokens[tokens.length - 1] : null;
      if (prev === null || (typeof prev === 'object' && prev !== null && 'op' in prev)) {
        // Consume rest of line as comment
        let end = i;
        while (end < len && command[end] !== '\n') end++;
        tokens.push({ comment: command.slice(i + 1, end) });
        i = end;
        continue;
      }
    }

    // Newline = command separator
    if (command[i] === '\n') {
      // Check for continuation (odd number of preceding backslashes)
      let bsCount = 0;
      let j = i - 1;
      while (j >= 0 && command[j] === '\\') {
        bsCount++;
        j--;
      }
      if (bsCount % 2 === 1) {
        // Line continuation — skip the \n (and the escaping backslash)
        // We handle this at a higher level typically
        i++;
        continue;
      }
      tokens.push({ op: '\n' } as unknown as ParseEntry);
      i++;
      continue;
    }

    // Operators (multi-char first)
    const opMatch = matchOperator(command, i);
    if (opMatch) {
      if (opMatch.op === '<' && i + 1 < len && command[i + 1] === '(') {
        tokens.push({ op: '<(' } as unknown as ParseEntry);
        i += 2;
        continue;
      }
      tokens.push({ op: opMatch.op } as unknown as ParseEntry);
      i += opMatch.len;
      continue;
    }

    // Glob detection (unquoted *?[])
    if ('*?['.includes(command[i]) && (i === 0 || /[\s|&;()<>]/.test(command[i - 1]!))) {
      const start = i;
      while (i < len && !/[\s|&;()<>]/.test(command[i]!)) {
        if (command[i] === "'" || command[i] === '"') {
          const q = command[i]!;
          i++;
          while (i < len && command[i] !== q) i++;
          i++; // skip closing quote
        } else {
          i++;
        }
      }
      tokens.push({ glob: true, pattern: command.slice(start, i) } as unknown as ParseEntry);
      continue;
    }

    // Word (string token)
    const word = parseWord(command, i, envFn);
    tokens.push(word.token);
    i = word.end;
  }

  return tokens;
}

function matchOperator(cmd: string, pos: number): { op: string; len: number } | null {
  const two = cmd.slice(pos, pos + 3);
  if (two === '<<' || two === '>>' || two === '>&' || two === '<>' || two === '>|' || two === '<<-') {
    return { op: two.length > 2 ? two.slice(0, 3) : two, len: two.length };
  }
  const two2 = cmd.slice(pos, pos + 2);
  if (['&&', '||', ';;', '<<', '>>', '>&', '<(', '>)', '>|', '<<<'].includes(two2)) {
    return { op: two2, len: 2 };
  }
  const one = cmd[pos];
  if ('|&;()<>'.includes(one || '')) {
    return { op: one!, len: 1 };
  }
  return null;
}

function parseWord(command: string, start: number, envFn?: (varName: string) => string): { token: string; end: number } {
  let result = '';
  let i = start;
  const len = command.length;

  while (i < len) {
    const ch = command[i];

    // Whitespace or operator terminates the word
    if (/[\s|&;()<>]/.test(ch)) {
      // Check for operators specifically
      if ('|&;()<>'.includes(ch)) break;
      if (ch === ' ' || ch === '\t' || ch === '\n') break;
    }

    // Single-quoted string
    if (ch === "'") {
      i++;
      while (i < len && command[i] !== "'") {
        result += command[i];
        i++;
      }
      if (i < len) i++; // skip closing '
      continue;
    }

    // Double-quoted string
    if (ch === '"') {
      i++;
      while (i < len && command[i] !== '"') {
        if (command[i] === '\\' && i + 1 < len) {
          const next = command[i + 1]!;
          if ('$`"\\'.includes(next) || next === '\n') {
            // Escape sequence
            if (next === '\n') {
              // Line continuation in double quotes
              i += 2;
              continue;
            }
            result += next;
            i += 2;
            continue;
          }
          // Other backslash sequences are literal in double quotes
          result += '\\';
          result += next;
          i += 2;
          continue;
        }
        if (command[i] === '$') {
          // Variable expansion in double quotes
          const varResult = parseVariable(command, i, envFn);
          result += varResult.value;
          i = varResult.end;
          continue;
        }
        // Backtick command substitution in double quotes
        if (command[i] === '`') {
          // Just include the backtick — command substitution expansion
          // is not supported in our parser
          result += command[i];
          i++;
          continue;
        }
        result += command[i];
        i++;
      }
      if (i < len) i++; // skip closing "
      continue;
    }

    // ANSI-C quoting $'...'
    if (ch === '$' && i + 1 < len && command[i + 1] === "'") {
      i += 2;
      while (i < len && command[i] !== "'") {
        if (command[i] === '\\' && i + 1 < len) {
          const next = command[i + 1]!;
          const escapeMap: Record<string, string> = {
            'n': '\n', 't': '\t', 'r': '\r', 'a': '\a',
            'b': '\b', 'f': '\f', 'v': '\v', '\\': '\\',
            "'": "'", '"': '"', '?': '?', '$': '$',
          };
          if (escapeMap[next] !== undefined) {
            result += escapeMap[next];
            i += 2;
            continue;
          }
          // \xHH, \uHHHH, \UHHHHHHHH, \nnn (octal)
          if (next === 'x' || next === 'u' || next === 'U') {
            // Just include literally
            result += '\\' + next;
            i += 2;
            continue;
          }
          if (/[0-7]/.test(next)) {
            // Octal escape
            let octal = '';
            i++;
            while (i < len && /[0-7]/.test(command[i]!) && octal.length < 3) {
              octal += command[i];
              i++;
            }
            const code = parseInt(octal, 8);
            if (!isNaN(code) && code > 0) {
              result += String.fromCodePoint(code);
            }
            continue;
          }
          // Unknown escape — keep as-is
          result += '\\' + next;
          i += 2;
          continue;
        }
        result += command[i];
        i++;
      }
      if (i < len) i++; // skip closing '
      continue;
    }

    // Backslash escape outside quotes
    if (ch === '\\' && i + 1 < len) {
      result += command[i + 1]!;
      i += 2;
      continue;
    }

    // Variable expansion outside quotes
    if (ch === '$') {
      const varResult = parseVariable(command, i, envFn);
      result += varResult.value;
      i = varResult.end;
      continue;
    }

    // Regular character
    result += ch;
    i++;
  }

  return { token: result, end: i };
}

function parseVariable(command: string, pos: number, envFn?: (varName: string) => string): { value: string; end: number } {
  let i = pos + 1; // skip $
  const len = command.length;

  if (i >= len) return { value: '$', end: i };

  // $() command substitution
  if (command[i] === '(') {
    let depth = 1;
    i++;
    let end = i;
    while (end < len && depth > 0) {
      if (command[end] === '(') depth++;
      if (command[end] === ')') depth--;
      end++;
    }
    const sub = command.slice(i, end - 1);
    return { value: envFn ? envFn(sub) : `$(${sub})`, end };
  }

  // ${} parameter expansion
  if (command[i] === '{') {
    let depth = 1;
    i++;
    let end = i;
    while (end < len && depth > 0) {
      if (command[end] === '{') depth++;
      if (command[end] === '}') depth--;
      end++;
    }
    const varName = command.slice(i, end - 1);
    return { value: envFn ? envFn(varName) : `${varName}`, end };
  }

  // $VAR — simple variable name
  if (/[A-Za-z_]/.test(command[i]!)) {
    let end = i;
    while (end < len && /[A-Za-z0-9_]/.test(command[end]!)) end++;
    const varName = command.slice(i, end);
    return { value: envFn ? envFn(varName) : `$${varName}`, end };
  }

  // Special vars: $0-$9, $#, $@, $*, $?, $!, $-
  if (/[0-9#@*?!-]/.test(command[i]!)) {
    return { value: `$${command[i]}`, end: i + 1 };
  }

  return { value: '$', end: i };
}

/**
 * Quote an array of strings for shell usage.
 * Uses single quotes with proper escaping.
 */
export function quote(args: string[]): string {
  return args.map(arg => shellQuoteSingle(arg)).join(' ');
}

/**
 * Single-quote a string for shell usage.
 * Handles embedded single quotes via '"'"' idiom.
 */
export function shellQuoteSingle(s: string): string {
  if (!s) return "''";
  // If string contains no special characters, no quoting needed
  if (/^[a-zA-Z0-9_./:-]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\"'\"'") + "'";
}

/**
 * Double-quote a string for shell usage.
 */
export function shellQuoteDouble(s: string): string {
  return '"' + s.replace(/(["\\$`])/g, '\\$1') + '"';
}

/**
 * Unquote a shell string, resolving single/double quotes and escapes.
 * Does NOT expand variables or command substitutions.
 */
export function unquote(str: string): string {
  let result = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (escaped) {
      escaped = false;
      if (!inSingle) result += ch;
      else result += ch;
      continue;
    }

    if (ch === '\\' && !inSingle) {
      escaped = true;
      continue;
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    result += ch;
  }

  return result;
}

/**
 * Extract content with different quoting levels.
 * Returns both the double-quote-aware content and fully-unquoted content.
 */
export function extractQuotedContent(command: string, isJq = false): {
  withDoubleQuotes: string;
  fullyUnquoted: string;
  unquotedKeepQuoteChars: string;
} {
  let withDoubleQuotes = '';
  let fullyUnquoted = '';
  let unquotedKeepQuoteChars = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (escaped) {
      escaped = false;
      if (!inSingleQuote) withDoubleQuotes += char;
      if (!inSingleQuote && !inDoubleQuote) fullyUnquoted += char;
      if (!inSingleQuote && !inDoubleQuote) unquotedKeepQuoteChars += char;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      escaped = true;
      if (!inSingleQuote) withDoubleQuotes += char;
      if (!inSingleQuote && !inDoubleQuote) fullyUnquoted += char;
      if (!inSingleQuote && !inDoubleQuote) unquotedKeepQuoteChars += char;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      unquotedKeepQuoteChars += char;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      unquotedKeepQuoteChars += char;
      if (!isJq) continue;
    }

    if (!inSingleQuote) withDoubleQuotes += char;
    if (!inSingleQuote && !inDoubleQuote) fullyUnquoted += char;
    if (!inSingleQuote && !inDoubleQuote) unquotedKeepQuoteChars += char;
  }

  return { withDoubleQuotes, fullyUnquoted, unquotedKeepQuoteChars };
}

/**
 * Check for unescaped occurrences of a single character.
 */
export function hasUnescapedChar(content: string, char: string): boolean {
  if (char.length !== 1) throw new Error('hasUnescapedChar only works with single characters');

  let i = 0;
  while (i < content.length) {
    if (content[i] === '\\' && i + 1 < content.length) {
      i += 2;
      continue;
    }
    if (content[i] === char) return true;
    i++;
  }
  return false;
}

/**
 * Check if a string has the shell-quote single-quote backslash bug.
 * Pattern: \' inside single quotes that can confuse parsers.
 */
export function hasShellQuoteSingleQuoteBug(command: string): boolean {
  // Check for \' patterns that are NOT at the start of single-quoted strings
  // and could cause shell-quote to misparse
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (ch === '\\' && !inSingle) {
      if (i + 1 < command.length && command[i + 1] === "'" && !inDouble) {
        // \' outside quotes — check if this is inside what looks like a single-quoted context
        // that shell-quote would misparse
        return true;
      }
      i++; // skip next char
      continue;
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
  }

  return false;
}

/**
 * Check if parsed tokens contain malformed/unbalanced delimiters.
 */
export function hasMalformedTokens(original: string, tokens: ParseEntry[]): boolean {
  // Check for unbalanced quotes in the original
  let inSingle = false;
  let inDouble = false;
  let braceCount = 0;
  let parenCount = 0;

  for (let i = 0; i < original.length; i++) {
    const ch = original[i];
    if (ch === '\\' && !inSingle) { i++; continue; }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (!inSingle && !inDouble) {
      if (ch === '{') braceCount++;
      if (ch === '}') braceCount--;
      if (ch === '(') parenCount++;
      if (ch === ')') parenCount--;
    }
  }

  // Unclosed quotes indicate malformed syntax
  if (inSingle || inDouble) return true;
  // Heavily unbalanced delimiters
  if (Math.abs(braceCount) > 1 || Math.abs(parenCount) > 1) return true;

  return false;
}

/**
 * Re-export ParseEntry type for convenience
 */
export type { ParseEntry };
