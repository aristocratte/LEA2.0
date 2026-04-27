/**
 * LEA Heredoc Extraction and Restoration
 *
 * Extracts heredoc syntax from shell commands before parsing,
 * replaces with placeholders, and restores after parsing.
 *
 * Reimplemented from Claude Code's heredoc.ts, simplified for LEA.
 */

import { randomBytes } from 'node:crypto';
import type { HeredocExtractResult } from './types.js';

const HEREDOC_PLACEHOLDER_PREFIX = '__HEREDOC_';
const HEREDOC_PLACEHOLDER_SUFFIX = '__';

/**
 * Generates a random hex salt for placeholder uniqueness.
 */
function generatePlaceholderSalt(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Regex pattern for matching heredoc start syntax.
 * Supports: <<WORD, <<'WORD', <<"WORD", <<-WORD
 */
const HEREDOC_START_PATTERN =
  /(?<!<)<<(?!<)(-)?[ \t]*(?:(['"])(\\?\w+)\2|\\?(\w+))/;

/**
 * Internal heredoc info for extraction.
 */
interface HeredocInfo {
  fullText: string;
  delimiter: string;
  operatorStartIndex: number;
  operatorEndIndex: number;
  contentStartIndex: number;
  contentEndIndex: number;
}

/**
 * Extract heredocs from a command string and replace with placeholders.
 *
 * This allows shell parsing without mangling heredoc syntax.
 * After parsing, use `restoreHeredocs()` to replace placeholders.
 *
 * @param command - The shell command string potentially containing heredocs
 * @returns Object containing processed command and heredoc info
 */
export function extractHeredocs(command: string): HeredocExtractResult {
  const heredocs: HeredocExtractResult['heredocs'] = [];

  if (!command.includes('<<')) {
    return { processedCommand: command, heredocs };
  }

  // Security: bail on constructs our parser can't handle
  if (/\$['"]/.test(command)) {
    return { processedCommand: command, heredocs };
  }

  const heredocStartPattern = new RegExp(HEREDOC_START_PATTERN.source, 'g');
  const heredocMatches: HeredocInfo[] = [];
  let match: RegExpExecArray | null;

  // Incremental quote/comment scanner state
  let scanPos = 0;
  let scanInSingleQuote = false;
  let scanInDoubleQuote = false;
  let scanInComment = false;
  let scanDqEscapeNext = false;
  let scanPendingBackslashes = 0;

  const advanceScan = (target: number): void => {
    for (let i = scanPos; i < target; i++) {
      const ch = command[i]!;

      if (ch === '\n') scanInComment = false;

      if (scanInSingleQuote) {
        if (ch === "'") scanInSingleQuote = false;
        continue;
      }

      if (scanInDoubleQuote) {
        if (scanDqEscapeNext) {
          scanDqEscapeNext = false;
          continue;
        }
        if (ch === '\\') {
          scanDqEscapeNext = true;
          continue;
        }
        if (ch === '"') scanInDoubleQuote = false;
        continue;
      }

      if (ch === '\\') {
        scanPendingBackslashes++;
        continue;
      }
      const escaped = scanPendingBackslashes % 2 === 1;
      scanPendingBackslashes = 0;
      if (escaped) continue;

      if (ch === "'") scanInSingleQuote = true;
      else if (ch === '"') scanInDoubleQuote = true;
      else if (!scanInComment && ch === '#') scanInComment = true;
    }
    scanPos = target;
  };

  while ((match = heredocStartPattern.exec(command)) !== null) {
    const startIndex = match.index;
    advanceScan(startIndex);

    if (scanInSingleQuote || scanInDoubleQuote || scanInComment) continue;
    if (scanPendingBackslashes % 2 === 1) continue;

    const fullMatch = match[0]!;
    const isDash = match[1] === '-';
    const delimiter = (match[3] || match[4])!;
    const operatorEndIndex = startIndex + fullMatch.length;

    // Verify closing quote was matched
    const quoteChar = match[2];
    if (quoteChar && command[operatorEndIndex - 1] !== quoteChar) continue;

    // Verify next char is a metacharacter
    if (operatorEndIndex < command.length) {
      const nextChar = command[operatorEndIndex]!;
      if (!/^[ \t\n|&;()<>]$/.test(nextChar)) continue;
    }

    // Find first unquoted newline after operator
    let firstNewlineOffset = -1;
    {
      let inSingle = false;
      let inDouble = false;
      for (let k = operatorEndIndex; k < command.length; k++) {
        const ch = command[k];
        if (inSingle) {
          if (ch === "'") inSingle = false;
          continue;
        }
        if (inDouble) {
          if (ch === '\\') { k++; continue; }
          if (ch === '"') inDouble = false;
          continue;
        }
        if (ch === '\n') {
          firstNewlineOffset = k - operatorEndIndex;
          break;
        }
        if (ch === "'") inSingle = true;
        else if (ch === '"') inDouble = true;
      }
    }

    if (firstNewlineOffset === -1) continue;

    // Check for line continuation
    const sameLineContent = command.slice(operatorEndIndex, operatorEndIndex + firstNewlineOffset);
    let trailingBackslashes = 0;
    for (let j = sameLineContent.length - 1; j >= 0; j--) {
      if (sameLineContent[j] === '\\') trailingBackslashes++;
      else break;
    }
    if (trailingBackslashes % 2 === 1) continue;

    const contentStartIndex = operatorEndIndex + firstNewlineOffset;
    const afterNewline = command.slice(contentStartIndex + 1);
    const contentLines = afterNewline.split('\n');

    // Find closing delimiter
    let closingLineIndex = -1;
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i]!;
      if (isDash) {
        const stripped = line.replace(/^\t*/, '');
        if (stripped === delimiter) { closingLineIndex = i; break; }
      } else {
        if (line === delimiter) { closingLineIndex = i; break; }
      }
    }

    if (closingLineIndex === -1) continue;

    const linesUpToClosing = contentLines.slice(0, closingLineIndex + 1);
    const contentLength = linesUpToClosing.join('\n').length;
    const contentEndIndex = contentStartIndex + 1 + contentLength;

    const operatorText = command.slice(startIndex, operatorEndIndex);
    const contentText = command.slice(contentStartIndex, contentEndIndex);
    const fullText = operatorText + contentText;

    heredocMatches.push({
      fullText,
      delimiter,
      operatorStartIndex: startIndex,
      operatorEndIndex,
      contentStartIndex,
      contentEndIndex,
    });
  }

  if (heredocMatches.length === 0) {
    return { processedCommand: command, heredocs };
  }

  // Filter nested heredocs
  const topLevel = heredocMatches.filter((candidate) => {
    for (const other of Array.from(heredocMatches)) {
      if (candidate === other) continue;
      if (
        candidate.operatorStartIndex > other.contentStartIndex &&
        candidate.operatorStartIndex < other.contentEndIndex
      ) return false;
    }
    return true;
  });

  if (topLevel.length === 0) {
    return { processedCommand: command, heredocs };
  }

  // Sort descending by contentEnd for safe replacement
  topLevel.sort((a, b) => b.contentEndIndex - a.contentEndIndex);

  const salt = generatePlaceholderSalt();
  let processedCommand = command;

  topLevel.forEach((info, index) => {
    const placeholderIndex = topLevel.length - 1 - index;
    const placeholder = `${HEREDOC_PLACEHOLDER_PREFIX}${placeholderIndex}_${salt}${HEREDOC_PLACEHOLDER_SUFFIX}`;

    heredocs.push({
      placeholder,
      heredoc: {
        delimiter: info.delimiter,
        quoted: !!info.delimiter,
        content: command.slice(info.contentStartIndex + 1, info.contentEndIndex - info.delimiter.length - 1),
        startLine: command.slice(0, info.contentStartIndex).split('\n').length,
        endLine: command.slice(0, info.contentEndIndex).split('\n').length,
      },
    });

    processedCommand =
      processedCommand.slice(0, info.operatorStartIndex) +
      placeholder +
      processedCommand.slice(info.operatorEndIndex, info.contentStartIndex) +
      processedCommand.slice(info.contentEndIndex);
  });

  return { processedCommand, heredocs };
}

/**
 * Restore heredoc placeholders back to their original content.
 *
 * @param parts - Array of strings that may contain placeholders
 * @param heredocs - The map from extractHeredocs
 * @returns New array with placeholders replaced
 */
export function restoreHeredocs(
  parts: string[],
  heredocs: HeredocExtractResult['heredocs'],
): string[] {
  if (heredocs.length === 0) return parts;

  return parts.map(part => {
    let result = part;
    for (const entry of Array.from(heredocs)) {
      result = result.split(entry.placeholder).join(entry.placeholder); // Placeholder preserved
    }
    return result;
  });
}
