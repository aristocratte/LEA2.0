/**
 * LEA Bash Security
 *
 * Security analysis for bash commands: injection detection, compound
 * command safety checks, and redirect validation.
 *
 * Reimplemented from Claude Code's bashSecurity.ts for LEA's pentest environment.
 */

import type {
  SecurityCheckId,
  SecurityCheckResult,
  ValidationContext,
  SemanticAnalysis,
  SemanticCategory,
} from './types.js';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

/** Security context for command validation */
export interface SecurityContext {
  cwd: string;
  baseCommand: string;
  originalCommand: string;
  unquotedContent: string;
  fullyUnquotedContent: string;
  fullyUnquotedPreStrip: string;
  unquotedKeepQuoteChars: string;
  allowedCommands?: string[];
  sandboxed?: boolean;
}

/** Result of command validation */
export interface ValidationResult {
  safe: boolean;
  reason?: string;
  warnings: string[];
  checks: SecurityCheckResult[];
}

/** An injection finding */
export interface InjectionFinding {
  type: SecurityCheckId;
  severity: 'high' | 'medium' | 'low';
  description: string;
  remediation?: string;
}

/** Result of compound command safety check */
export interface SafetyCheck {
  safe: boolean;
  reasons: string[];
}

// ────────────────────────────────────────────────────────────
// Injection Detection Patterns
// ────────────────────────────────────────────────────────────

const COMMAND_SUBSTITUTION_PATTERNS: Array<{ pattern: RegExp; id: SecurityCheckId; message: string }> = [
  { pattern: /\$\(/, id: 'COMMAND_SUBSTITUTION', message: '$() command substitution detected' },
  { pattern: /\$\{/, id: 'DANGEROUS_VARIABLES', message: '${} parameter substitution detected' },
  { pattern: /<\(/, id: 'INPUT_REDIRECTION', message: 'Process substitution <() detected' },
  { pattern: />\(/, id: 'OUTPUT_REDIRECTION', message: 'Process substitution >() detected' },
];

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; id: SecurityCheckId; message: string }> = [
  // Backtick command substitution
  { pattern: /`[^`]*`/, id: 'COMMAND_SUBSTITUTION', message: 'Backtick command substitution detected' },
  // Unquoted $IFS manipulation
  { pattern: /\bIFS\s*=/, id: 'IFS_INJECTION', message: 'IFS variable assignment (possible field separator injection)' },
  // /proc access
  { pattern: /\/proc\/\d+/, id: 'PROC_ENVIRON_ACCESS', message: 'Accessing /proc filesystem (possible environment leak)' },
  // Obfuscated flags
  { pattern: /-[a-zA-Z]{10,}/, id: 'OBFUSCATED_FLAGS', message: 'Unusually long flag string (possible obfuscation)' },
  // Unicode whitespace tricks
  { pattern: /[\u00A0\u2000-\u200B\u2028\u2029\uFEFF]/, id: 'UNICODE_WHITESPACE', message: 'Unicode whitespace character detected (possible obfuscation)' },
  // Control characters
  { pattern: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/, id: 'CONTROL_CHARACTERS', message: 'Control character detected (possible obfuscation)' },
  // Shell metacharacters in unquoted context
  { pattern: /[;&|<>](?![|&])/, id: 'SHELL_METACHARACTERS', message: 'Shell metacharacter detected' },
  // Newlines in unquoted context
  { pattern: /\n(?!$)/, id: 'NEWLINES', message: 'Embedded newline detected' },
];

// ────────────────────────────────────────────────────────────
// BashSecurity
// ────────────────────────────────────────────────────────────

/**
 * Security analysis engine for bash commands.
 * Provides injection detection, compound command safety checks,
 * and redirect validation for LEA's pentest environment.
 */
export class BashSecurity {
  /**
   * Validate a command against security checks.
   *
   * @param command - The command to validate
   * @param context - Security context with parsing metadata
   * @returns Validation result with safety status and findings
   */
  validateCommand(command: string, context: SecurityContext): ValidationResult {
    const warnings: string[] = [];
    const checks: SecurityCheckResult[] = [];
    const findings = this.detectInjection(command);

    // Convert findings to checks
    for (const finding of Array.from(findings)) {
      checks.push({
        checkId: finding.type,
        triggered: true,
        message: finding.description,
      });

      if (finding.severity === 'high') {
        return {
          safe: false,
          reason: finding.description,
          warnings,
          checks,
        };
      }

      warnings.push(finding.description);
    }

    // Additional checks on unquoted content
    const incompleteCheck = this.checkIncompleteCommands(context.fullyUnquotedContent);
    checks.push(incompleteCheck);
    if (incompleteCheck.triggered) {
      warnings.push(incompleteCheck.message ?? 'Incomplete command detected');
    }

    return {
      safe: true,
      warnings,
      checks,
    };
  }

  /**
   * Detect injection patterns in a command.
   *
   * @param command - The command to analyze
   * @returns Array of injection findings
   */
  detectInjection(command: string): InjectionFinding[] {
    const findings: InjectionFinding[] = [];

    for (const { pattern, id, message } of COMMAND_SUBSTITUTION_PATTERNS) {
      if (pattern.test(command)) {
        findings.push({
          type: id,
          severity: 'high',
          description: message,
          remediation: 'Quote or escape the substitution to prevent code execution.',
        });
      }
    }

    for (const { pattern, id, message } of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        const severity: InjectionFinding['severity'] =
          id === 'PROC_ENVIRON_ACCESS' || id === 'IFS_INJECTION' ? 'high' : 'medium';
        findings.push({
          type: id,
          severity,
          description: message,
        });
      }
    }

    return findings;
  }

  /**
   * Check if a compound command (pipeline) is safe.
   *
   * @param pipeline - Array of commands in the pipeline
   * @returns Safety check result
   */
  checkCompoundCommandSafety(pipeline: string[]): SafetyCheck {
    const reasons: string[] = [];

    if (pipeline.length > 10) {
      reasons.push('Pipeline has more than 10 stages (possible obfuscation)');
    }

    for (const cmd of Array.from(pipeline)) {
      const trimmed = cmd.trim();

      // Check for nested pipelines
      const pipeCount = (trimmed.match(/\|/g) || []).length;
      if (pipeCount > 0 && trimmed.includes('(')) {
        reasons.push('Nested pipeline in subshell detected');
      }

      // Check for eval/exec/source patterns
      if (/\b(eval|exec|source|\.)\b/.test(trimmed)) {
        reasons.push(`Dangerous builtin "${trimmed.split(/\s/)[0]}" in pipeline`);
      }
    }

    return {
      safe: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Validate a redirect target path.
   *
   * @param path - The redirect target path
   * @returns true if the path is safe for redirection
   */
  validateRedirectTarget(path: string): boolean {
    // Empty path is not valid
    if (!path || path.trim().length === 0) return false;

    // Path containing shell metacharacters is suspicious
    if (/[$`;&|<>]/.test(path)) return false;

    // Path with wildcards could expand unexpectedly
    if (/[*?\[]/.test(path)) return false;

    // Path starting with - could be interpreted as a flag
    if (path.startsWith('-')) return false;

    return true;
  }

  // ──────────────────────────────────────────────────────────
  // Private
  // ──────────────────────────────────────────────────────────

  private checkIncompleteCommands(content: string): SecurityCheckResult {
    // Check for trailing pipe
    if (/\|\s*$/.test(content.trim())) {
      return {
        checkId: 'INCOMPLETE_COMMANDS',
        triggered: true,
        message: 'Command ends with pipe (incomplete pipeline)',
      };
    }

    // Check for trailing &&
    if (/&&\s*$/.test(content.trim())) {
      return {
        checkId: 'INCOMPLETE_COMMANDS',
        triggered: true,
        message: 'Command ends with && (incomplete command chain)',
      };
    }

    // Check for unbalanced quotes
    let inSingle = false;
    let inDouble = false;
    let escaped = false;

    for (const ch of Array.from(content)) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\' && !inSingle) { escaped = true; continue; }
      if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
      if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    }

    if (inSingle || inDouble) {
      return {
        checkId: 'MALFORMED_TOKEN',
        triggered: true,
        message: 'Unbalanced quotes in command',
      };
    }

    return { checkId: 'INCOMPLETE_COMMANDS', triggered: false };
  }
}
