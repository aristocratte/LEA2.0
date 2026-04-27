/**
 * LEA Sed Validation
 *
 * Validates sed commands for safety: in-place edit detection,
 * target path validation, and scope checking.
 *
 * Reimplemented from Claude Code's sedValidation.ts for LEA.
 */

import type { SedCommand } from './sedParser.js';
import { extractSedPaths } from './sedParser.js';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

/** Context for sed command validation */
export interface SedContext {
  /** Current working directory */
  cwd: string;
  /** Allowed directories for file operations */
  allowedPaths: string[];
  /** Whether in-place edits are permitted */
  allowInPlace?: boolean;
  /** Maximum number of files that can be modified */
  maxTargets?: number;
}

/** Result of sed validation */
export interface SedValidationResult {
  /** Whether the sed command is safe */
  safe: boolean;
  /** Reason if not safe */
  reason?: string;
  /** Warnings (non-blocking) */
  warnings: string[];
}

// ────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────

/**
 * Validate a sed command against the given context.
 *
 * @param sedCmd - The parsed sed command
 * @param context - Validation context
 * @returns Validation result
 */
export function validateSedCommand(sedCmd: SedCommand, context: SedContext): SedValidationResult {
  const warnings: string[] = [];

  // Check for dangerous commands
  if (sedCmd.command === 'q' || sedCmd.command === 'Q') {
    // Quit commands are safe
    return { safe: true, warnings };
  }

  if (sedCmd.command === 'w' || sedCmd.command === 'W') {
    warnings.push('sed write command detected — writes to file');
  }

  if (sedCmd.command === 'r') {
    warnings.push('sed read command detected — reads from file');
  }

  if (sedCmd.command === 'e') {
    // e command executes shell commands — very dangerous
    return {
      safe: false,
      reason: 'sed "e" command executes shell commands (code injection risk)',
      warnings,
    };
  }

  // Check for regex denial of service
  if (sedCmd.pattern) {
    const pattern = sedCmd.pattern;
    // Nested quantifiers can cause catastrophic backtracking
    if (/(?:\([^)]*\)[*+?]\{[^}]*\})/.test(pattern)) {
      warnings.push('Complex regex pattern may cause performance issues');
    }
    // Very long patterns
    if (pattern.length > 1000) {
      warnings.push('Very long regex pattern');
    }
  }

  // Check replacement for backreferences (possible issues)
  if (sedCmd.replacement) {
    const replacement = sedCmd.replacement;
    // \0 or \1-\9 backreferences in replacement
    if (/\\[0-9]/.test(replacement)) {
      // Generally fine, but flag it
    }
    // & in replacement (references full match)
    if (replacement.includes('&')) {
      // Normal usage, no issue
    }
    // \n in replacement (newline injection in some sed implementations)
    if (/\\n/.test(replacement)) {
      warnings.push('Newline in replacement may behave differently across sed implementations');
    }
  }

  return { safe: true, warnings };
}

/**
 * Check if sed flags indicate an in-place edit.
 *
 * @param flags - Array of sed command flags
 * @returns true if the flags indicate in-place editing
 */
export function isInPlaceEdit(flags: string[]): boolean {
  for (const flag of flags) {
    if (flag === '-i' || flag === '--in-place') return true;
    // -i with extension: -i.bak, -i'', -i"SUFFIX"
    if (flag.startsWith('-i')) return true;
  }
  return false;
}

/**
 * Validate sed target files against allowed scope.
 *
 * @param targets - File paths that sed will operate on
 * @param scope - Allowed directories
 * @returns Validation result
 */
export function validateSedTargets(targets: string[], scope: string[]): SedValidationResult {
  const warnings: string[] = [];

  if (targets.length === 0) {
    return {
      safe: true,
      warnings: ['No file targets specified — sed will read from stdin'],
    };
  }

  if (targets.length > 100) {
    warnings.push(`Large number of file targets: ${targets.length}`);
  }

  for (const target of Array.from(targets)) {
    // Check for dangerous path patterns
    if (target.startsWith('/') && !target.startsWith('/tmp') && !target.startsWith('/var/tmp')) {
      // Absolute path outside temp — check against scope
      const inScope = scope.some(allowed => target.startsWith(allowed));
      if (!inScope && scope.length > 0) {
        return {
          safe: false,
          reason: `Target path "${target}" is outside allowed scope`,
          warnings,
        };
      }
    }

    // Check for path traversal
    if (target.includes('..')) {
      warnings.push(`Path traversal detected in target: "${target}"`);
    }

    // Check for glob patterns
    if (/[*?[\]{}]/.test(target)) {
      warnings.push(`Glob pattern in target: "${target}" — may match unexpected files`);
    }

    // Check for binary files
    const extensions = ['.bin', '.exe', '.dll', '.so', '.dylib', '.o', '.a', '.jpg', '.png', '.gif', '.zip', '.gz', '.tar'];
    for (const ext of Array.from(extensions)) {
      if (target.endsWith(ext)) {
        warnings.push(`Target appears to be a binary file: "${target}"`);
        break;
      }
    }
  }

  return { safe: true, warnings };
}
