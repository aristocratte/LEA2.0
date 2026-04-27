/**
 * LEA Bash Permissions
 *
 * Permission checking for bash commands. Integrates with LEA's
 * PermissionEngine, BashSecurity, and command parser.
 *
 * Reimplemented from Claude Code's bashPermissions.ts for LEA.
 */

import type { BashPermissionContext } from './types.js';
import type { PermissionRule } from './types.js';
import type { PermissionResult } from '../permissions/types.js';
import { BashSecurity } from './bashSecurity.js';
import { parseCompoundCommands } from './parser.js';
import { stripSafeEnvVars, stripEnvVarPrefix, isDangerousEnvVar } from './envVarStripper.js';
import { detectDestructiveCommand } from './destructiveWarning.js';
import { analyzeSemantics, isDangerousBuiltin } from './commandSemantics.js';
import { CommandRegistry } from './commandRegistry.js';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

/**
 * Permission decision for a bash command.
 */
export interface PermissionDecision {
  behavior: 'allow' | 'deny' | 'ask';
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Extended permission context for bash-specific checks.
 */
export interface ExtendedBashPermissionContext extends BashPermissionContext {
  /** Command registry for semantic analysis */
  registry?: CommandRegistry;
  /** Whether sandboxed execution is enabled */
  sandboxed?: boolean;
  /** Commands auto-allowed in sandbox mode */
  sandboxAutoAllowCommands?: string[];
}

// ────────────────────────────────────────────────────────────
// BashPermissions
// ────────────────────────────────────────────────────────────

/**
 * Permission checker for bash commands.
 *
 * Implements a multi-stage permission pipeline:
 * 1. Check for deny rules (deny-first)
 * 2. Sandbox auto-allow (if enabled)
 * 3. Dangerous env var detection
 * 4. Destructive command detection
 * 5. Security validation (injection, etc.)
 * 6. Compound command safety
 * 7. Allow rules
 * 8. Default → ask
 */
export class BashPermissions {
  private security: BashSecurity;
  private registry: CommandRegistry;

  constructor(security?: BashSecurity, registry?: CommandRegistry) {
    this.security = security ?? new BashSecurity();
    this.registry = registry ?? new CommandRegistry();
  }

  /**
   * Check permission for a bash command.
   *
   * @param command - The bash command to check
   * @param context - Permission context
   * @returns Permission decision with behavior and reason
   */
  checkPermission(
    command: string,
    context: ExtendedBashPermissionContext,
  ): PermissionDecision {
    // Strip safe env vars to get the actual command
    const strippedCommand = stripSafeEnvVars(command);
    const { vars } = stripEnvVarPrefix(command);

    // 1. Check for dangerous env vars
    for (const [name, _value] of Array.from(vars)) {
      if (isDangerousEnvVar(name)) {
        return {
          behavior: 'deny',
          reason: `Dangerous environment variable: ${name} (possible binary hijacking)`,
          metadata: { dangerousVar: name, varType: 'hijack' },
        };
      }
    }

    // 2. Check deny rules
    const denyResult = this.checkDenyRules(strippedCommand, context);
    if (denyResult) return denyResult;

    // 3. Sandbox auto-allow
    if (context.sandboxed && context.mode !== 'plan') {
      const baseCommand = strippedCommand.trim().split(/\s/)[0] ?? '';
      const autoAllow = context.sandboxAutoAllowCommands ?? [];
      if (autoAllow.includes(baseCommand) || autoAllow.length === 0) {
        return { behavior: 'allow', reason: 'Auto-allowed in sandbox mode' };
      }
    }

    // 4. Bypass mode
    if (context.mode === 'bypassPermissions') {
      return { behavior: 'allow', reason: 'Bypass permissions mode' };
    }

    // 5. Check allow rules
    const allowResult = this.checkAllowRules(strippedCommand, context);
    if (allowResult) return allowResult;

    // 6. Destructive command detection
    const destructive = detectDestructiveCommand(strippedCommand);
    if (destructive) {
      return {
        behavior: 'ask',
        reason: destructive.warning,
        metadata: { destructive: true, pattern: destructive.pattern },
      };
    }

    // 7. Dangerous builtins
    const baseCmd = strippedCommand.trim().split(/\s/)[0] ?? '';
    if (isDangerousBuiltin(baseCmd)) {
      return {
        behavior: 'ask',
        reason: `Dangerous shell builtin: ${baseCmd}`,
        metadata: { builtin: baseCmd },
      };
    }

    // 8. Security validation
    const securityContext = {
      cwd: context.cwd,
      baseCommand: baseCmd,
      originalCommand: command,
      unquotedContent: strippedCommand,
      fullyUnquotedContent: strippedCommand,
      fullyUnquotedPreStrip: strippedCommand,
      unquotedKeepQuoteChars: strippedCommand,
      sandboxed: context.sandboxed,
    };

    const validation = this.security.validateCommand(strippedCommand, securityContext);
    if (!validation.safe) {
      return {
        behavior: 'deny',
        reason: validation.reason,
        metadata: { securityCheck: true, findings: validation.checks },
      };
    }

    if (validation.warnings.length > 0) {
      // Warnings don't block, but trigger ask
      return {
        behavior: 'ask',
        reason: validation.warnings.join('; '),
        metadata: { warnings: validation.warnings },
      };
    }

    // 9. Compound command safety
    const compound = parseCompoundCommands(strippedCommand);
    if (compound.length > 1) {
      const safety = this.security.checkCompoundCommandSafety(
        compound.map(c => c.command),
      );
      if (!safety.safe) {
        return {
          behavior: 'ask',
          reason: `Compound command safety concerns: ${safety.reasons.join('; ')}`,
          metadata: { compound: true, reasons: safety.reasons },
        };
      }
    }

    // 10. Semantic analysis for read-only auto-allow
    if (context.isReadOnly) {
      const analysis = analyzeSemantics(compound);
      if (analysis.isReadOnly && !analysis.isDestructive && !analysis.isPrivilegeEscalation) {
        return {
          behavior: 'allow',
          reason: 'Read-only command',
          metadata: { readOnly: true },
        };
      }
    }

    // 11. Default → ask
    return {
      behavior: 'ask',
      reason: `Permission required for: ${strippedCommand.slice(0, 100)}`,
    };
  }

  // ──────────────────────────────────────────────────────────
  // Private
  // ──────────────────────────────────────────────────────────

  private checkDenyRules(
    command: string,
    context: BashPermissionContext,
  ): PermissionDecision | null {
    const trimmed = command.trim();

    for (const [ruleContent, rule] of Array.from(context.denyRules)) {
      if (this.matchesRule(trimmed, rule.content)) {
        return {
          behavior: 'deny',
          reason: `Denied by rule: ${rule.content}`,
          metadata: { ruleSource: rule.destination },
        };
      }
    }

    return null;
  }

  private checkAllowRules(
    command: string,
    context: BashPermissionContext,
  ): PermissionDecision | null {
    const trimmed = command.trim();

    for (const [ruleContent, rule] of Array.from(context.allowRules)) {
      if (this.matchesRule(trimmed, rule.content)) {
        return {
          behavior: 'allow',
          reason: `Allowed by rule: ${rule.content}`,
          metadata: { ruleSource: rule.destination },
        };
      }
    }

    return null;
  }

  private matchesRule(command: string, ruleContent: string): boolean {
    return matchesBashRule(command, ruleContent);
  }
}

export function matchesBashRule(command: string, ruleContent: string): boolean {
  const trimmedCommand = command.trim();
  const trimmedRule = ruleContent.trim();

  if (trimmedCommand === trimmedRule) return true;

  if (trimmedRule.endsWith('*') && trimmedCommand.startsWith(trimmedRule.slice(0, -1))) {
    return true;
  }

  if (trimmedRule.includes('*')) {
    const regex = new RegExp(
      '^' + trimmedRule.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
    );
    return regex.test(trimmedCommand);
  }

  return false;
}

export function findMatchingBashRule(
  command: string,
  rules: Map<string, PermissionRule>,
): PermissionRule | null {
  for (const rule of rules.values()) {
    if (matchesBashRule(command, rule.content)) {
      return rule;
    }
  }

  return null;
}
