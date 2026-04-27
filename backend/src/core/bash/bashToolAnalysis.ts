/**
 * LEA Bash Tool Analysis — Shared analysis layer
 *
 * Single parse, multiple outputs: one call to `analyzeBashCommand()`
 * produces all the data BashTool's `checkPermissions()`, `isReadOnly()`,
 * and `isDestructive()` need.
 *
 * Uses existing modules: commandSemantics, bashSecurity, commandRegistry,
 * destructiveWarning, parser, shellQuoting.
 */

import type {
  SemanticAnalysis,
  BashValidationResult,
  DestructiveOperation,
  PathCheck,
  PermissionRule,
  BashPermissionContext as CoreBashPermissionContext,
} from './types.js';
import { analyzeSemantics, isDangerousBuiltin } from './commandSemantics.js';
import { BashSecurity } from './bashSecurity.js';
import type { SecurityContext, ValidationResult } from './bashSecurity.js';
import { CommandRegistry, createDefaultRegistry } from './commandRegistry.js';
import type { ShellCommandSpec } from './commandRegistry.js';
import { detectDestructiveCommand } from './destructiveWarning.js';
import type { DestructiveWarning } from './destructiveWarning.js';
import { parseCompoundCommands } from './parser.js';
import type { ParsedCommand } from './parser.js';
import { analyzeQuotes } from './shellQuoting.js';
import type { PermissionContext, PermissionRuleSource } from '../permissions/types.js';
import { stripEnvVarPrefix, isDangerousEnvVar } from './envVarStripper.js';
import { isDangerousRemovalPath, validatePath } from './pathValidation.js';

// ────────────────────────────────────────────────────────────
// Analysis result (single parse, multiple outputs)
// ────────────────────────────────────────────────────────────

export interface BashAnalysisResult {
  /** The raw command string */
  rawCommand: string;
  /** Base command (first word, e.g. "rm" from "rm -rf /tmp") */
  baseCommand: string;
  /** All arguments after the base command */
  arguments: string[];
  /** Semantic analysis (category, destructive, readOnly, etc.) */
  semantic: SemanticAnalysis;
  /** Security validation result */
  security: BashValidationResult;
  /** Destructive warning message if applicable */
  destructiveWarning: string | null;
  /** Path targets found in the command */
  pathTargets: string[];
  /** Whether the command is read-only */
  isReadOnly: boolean;
  /** Whether the command is destructive */
  isDestructive: boolean;
  /** Dangerous env vars found on the command line */
  dangerousEnvVars: string[];
}

// ────────────────────────────────────────────────────────────
// Adapted permission context
// ────────────────────────────────────────────────────────────

export interface BashPermissionContext extends CoreBashPermissionContext {
  additionalWorkingDirectories: string[];
}

/**
 * Adapt the global PermissionContext to a BashPermissionContext.
 * Maps modes and flattens rules from per-source buckets into
 * bash-specific maps.
 */
export function adaptPermissionContext(context: PermissionContext): BashPermissionContext {
  const modeMap: Record<string, CoreBashPermissionContext['mode']> = {
    default: 'normal',
    plan: 'plan',
    bypassPermissions: 'bypassPermissions',
    acceptEdits: 'normal',
    dontAsk: 'normal',
  };

  const allowRules = new Map<string, PermissionRule>();
  const denyRules = new Map<string, PermissionRule>();
  const askRules = new Map<string, PermissionRule>();

  const sources: PermissionRuleSource[] = [
    'policySettings',
    'flagSettings',
    'userSettings',
    'projectSettings',
    'localSettings',
    'cliArg',
    'command',
    'session',
  ];

  for (const source of sources) {
    const allowList = context.alwaysAllowRules[source];
    if (allowList) {
      for (const rule of allowList) {
        const normalized = normalizeBashRule(rule);
        if (normalized) {
          allowRules.set(normalized, {
            id: `allow-${source}-${normalized}`,
            content: normalized,
            behavior: 'allow',
            destination: source,
          });
        }
      }
    }

    const denyList = context.alwaysDenyRules[source];
    if (denyList) {
      for (const rule of denyList) {
        const normalized = normalizeBashRule(rule);
        if (normalized) {
          denyRules.set(normalized, {
            id: `deny-${source}-${normalized}`,
            content: normalized,
            behavior: 'deny',
            destination: source,
          });
        }
      }
    }

    const askList = context.alwaysAskRules[source];
    if (askList) {
      for (const rule of askList) {
        const normalized = normalizeBashRule(rule);
        if (normalized) {
          askRules.set(normalized, {
            id: `ask-${source}-${normalized}`,
            content: normalized,
            behavior: 'ask',
            destination: source,
          });
        }
      }
    }
  }

  const dirs: string[] = [];
  for (const dir of context.additionalWorkingDirectories.values()) {
    dirs.push(dir);
  }

  return {
    cwd: context.cwd ?? process.cwd(),
    mode: modeMap[context.mode] ?? 'normal',
    allowRules,
    denyRules,
    askRules,
    isReadOnly: false,
    additionalWorkingDirectories: dirs,
  };
}

// ────────────────────────────────────────────────────────────
// Shared singleton instances
// ────────────────────────────────────────────────────────────

/** Lazily-created default registry. Reuse across calls. */
let _registry: CommandRegistry | undefined;
function getDefaultRegistry(): CommandRegistry {
  if (!_registry) {
    _registry = createDefaultRegistry();
  }
  return _registry;
}

/** Lazily-created BashSecurity instance. */
let _security: BashSecurity | undefined;
function getDefaultSecurity(): BashSecurity {
  if (!_security) {
    _security = new BashSecurity();
  }
  return _security;
}

// ────────────────────────────────────────────────────────────
// Main analysis function
// ────────────────────────────────────────────────────────────

/**
 * Analyze a bash command for permissions, semantics, and safety.
 * Single parse producing all outputs needed by BashTool.
 *
 * @param command          The raw command string
 * @param permissionContext Optional adapted permission context
 * @param registry         Optional CommandRegistry (uses default if omitted)
 * @param security         Optional BashSecurity instance (uses default if omitted)
 */
export function analyzeBashCommand(
  command: string,
  permissionContext?: BashPermissionContext,
  registry?: CommandRegistry,
  security?: BashSecurity,
): BashAnalysisResult {
  const trimmed = command.trim();
  const reg = registry ?? getDefaultRegistry();
  const sec = security ?? getDefaultSecurity();

  // ── 1. Parse compound commands ──────────────────────────
  const parsed: ParsedCommand[] = parseCompoundCommands(trimmed);
  const primary = parsed[0] ?? null;

  // ── 2. Extract base command + args ──────────────────────
  const baseCommand = primary?.baseCommand ?? extractBaseCommandFallback(trimmed);
  const args: string[] = primary?.args ?? extractArgsFallback(trimmed);

  // ── 3. Semantic analysis via commandSemantics ───────────
  const semantic: SemanticAnalysis = analyzeSemantics(parsed);

  // Enhance with registry spec if available
  const spec: ShellCommandSpec | undefined = reg.get(baseCommand);
  if (spec) {
    enhanceSemanticFromSpec(semantic, spec, args);
  }

  // ── 4. Security validation ──────────────────────────────
  const quoteInfo = analyzeQuotes(trimmed);
  const secContext: SecurityContext = {
    cwd: permissionContext?.cwd ?? process.cwd(),
    baseCommand,
    originalCommand: trimmed,
    unquotedContent: quoteInfo.fullyUnquoted,
    fullyUnquotedContent: quoteInfo.fullyUnquoted,
    fullyUnquotedPreStrip: quoteInfo.fullyUnquoted,
    unquotedKeepQuoteChars: quoteInfo.unquotedKeepQuoteChars,
  };

  const secResult: ValidationResult = sec.validateCommand(trimmed, secContext);
  const securityResult: BashValidationResult = convertSecurityResult(secResult, baseCommand);

  // ── 5. Destructive warning ──────────────────────────────
  const destructiveMatch: DestructiveWarning | null = detectDestructiveCommand(trimmed);
  const destructiveWarning: string | null = destructiveMatch?.warning ?? null;

  // ── 6. Extract path targets ─────────────────────────────
  const pathTargets: string[] = extractPathTargets(baseCommand, args);

  const allowedPaths = Array.from(
    new Set([
      permissionContext?.cwd ?? process.cwd(),
      ...(permissionContext?.additionalWorkingDirectories ?? []),
    ]),
  );

  for (const target of pathTargets) {
    const pathResult = validatePath(target, {
      allowedPaths,
      cwd: permissionContext?.cwd ?? process.cwd(),
    });
    securityResult.pathChecks.push({
      path: target,
      resolved: pathResult.resolvedPath,
      allowed: pathResult.valid && pathResult.inScope,
      reason: pathResult.reason,
    });

    if ((baseCommand === 'rm' || baseCommand === 'rmdir') && isDangerousRemovalPath(target)) {
      securityResult.pathChecks.push({
        path: target,
        resolved: target,
        allowed: false,
        reason: `Dangerous removal target: ${target}`,
      });
    }
  }

  const { vars } = stripEnvVarPrefix(trimmed);
  const dangerousEnvVars = Array.from(vars.keys()).filter((name) => isDangerousEnvVar(name));

  // ── 7. Compute final isReadOnly / isDestructive ─────────
  const isReadOnly = semantic.isReadOnly && !semantic.isDestructive;
  const isDestructive = semantic.isDestructive || destructiveWarning !== null;

  return {
    rawCommand: trimmed,
    baseCommand,
    arguments: args,
    semantic,
    security: securityResult,
    destructiveWarning,
    pathTargets,
    isReadOnly,
    isDestructive,
    dangerousEnvVars,
  };
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Fallback base-command extraction using simple whitespace split.
 */
function extractBaseCommandFallback(command: string): string {
  // Strip env var prefixes like "FOO=bar cmd ..."
  const stripped = command.replace(/^[A-Za-z_][A-Za-z0-9_]*=\S*\s*/, '');
  return stripped.split(/\s+/)[0] ?? '';
}

/**
 * Fallback argument extraction using simple whitespace split.
 */
function extractArgsFallback(command: string): string[] {
  const parts = command.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1) : [];
}

/**
 * Enhance a SemanticAnalysis result using a CommandSpec from the registry.
 * Adds warnings for dangerous/warning flags and refines readOnly/destructive.
 */
function enhanceSemanticFromSpec(
  semantic: SemanticAnalysis,
  spec: ShellCommandSpec,
  args: string[],
): void {
  if ((spec.network || spec.category === 'network') && spec.readOnly !== true) {
    semantic.isReadOnly = false;
  }

  // Apply dangerous flags from spec
  if (spec.dangerousFlags) {
    for (const df of spec.dangerousFlags) {
      if (args.some(a => a === df || a.startsWith(df))) {
        semantic.isDestructive = true;
        semantic.warnings.push(`Flag ${df} makes this command destructive`);
      }
    }
  }

  // Apply warning flags from spec
  if (spec.warningFlags) {
    for (const wf of spec.warningFlags) {
      const matches = args.some(a => {
        if (typeof wf.flag === 'string') return a === wf.flag || a.startsWith(String(wf.flag));
        return wf.flag.test(a);
      });
      if (matches) {
        semantic.warnings.push(wf.message);
      }
    }
  }

  // Apply behavior flags from spec
  if (spec.behaviorFlags) {
    for (const bf of spec.behaviorFlags) {
      const matches = args.some(a => {
        if (typeof bf.flag === 'string') return a === bf.flag || a.startsWith(bf.flag);
        return bf.flag.test(a);
      });
      if (matches && bf.effect) {
        if (bf.effect.readOnly !== undefined) semantic.isReadOnly = bf.effect.readOnly;
        if (bf.effect.destructive !== undefined) semantic.isDestructive = bf.effect.destructive;
        if (bf.effect.network !== undefined) semantic.isNetwork = bf.effect.network;
        if (bf.effect.category) semantic.category = bf.effect.category;
      }
    }
  }
}

/**
 * Convert a BashSecurity ValidationResult into the BashValidationResult
 * type from types.ts.
 */
function convertSecurityResult(
  result: ValidationResult,
  baseCommand: string,
): BashValidationResult {
  const destructiveOps: DestructiveOperation[] = [];
  const pathChecks: PathCheck[] = [];

  // If the base command is a known destructive command, add a destructive op
  if (result.safe) {
    // Not destructive per se, no-op
  } else {
    // Map high-severity injection findings to destructive ops
    for (const check of result.checks) {
      if (check.triggered && check.checkId === 'COMMAND_SUBSTITUTION') {
        destructiveOps.push({
          type: 'overwrite',
          command: baseCommand,
          target: 'unknown',
          description: check.message ?? 'Command substitution detected',
        });
      }
    }
  }

  return {
    safe: result.safe,
    reason: result.reason,
    warnings: result.warnings,
    destructiveOps,
    pathChecks,
  };
}

/**
 * Extract filesystem path targets from command arguments.
 * Skips flags, env vars, and URLs.
 */
function extractPathTargets(baseCommand: string, args: string[]): string[] {
  const pathCommands = new Set([
    'rm', 'rmdir', 'cp', 'mv', 'cat', 'ls', 'mkdir', 'touch',
    'chmod', 'chown', 'chgrp', 'ln', 'find', 'grep', 'sed',
    'awk', 'head', 'tail', 'wc', 'sort', 'diff', 'tar', 'gzip',
    'gunzip', 'zip', 'unzip', 'curl', 'wget', 'nano', 'vim', 'vi',
    'nmap', 'nikto', 'sqlmap', 'gobuster', 'ffuf', 'hydra',
    'rg', 'ag', 'ack', 'less', 'more', 'dd', 'shred', 'truncate',
  ]);

  if (!pathCommands.has(baseCommand)) return [];

  if (baseCommand === 'grep' || baseCommand === 'rg' || baseCommand === 'ag' || baseCommand === 'ack') {
    return extractPatternCommandPaths(args);
  }

  if (baseCommand === 'find') {
    return extractFindPaths(args);
  }

  const paths: string[] = [];
  for (const arg of args) {
    // Skip flags
    if (arg.startsWith('-')) continue;
    // Skip env vars
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(arg)) continue;
    // Skip URLs
    if (arg.startsWith('http://') || arg.startsWith('https://')) continue;
    paths.push(arg);
  }
  return paths;
}

function extractPatternCommandPaths(args: string[]): string[] {
  const paths: string[] = [];
  let patternSeen = false;

  for (const arg of args) {
    if (arg.startsWith('-')) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(arg)) continue;
    if (arg.startsWith('http://') || arg.startsWith('https://')) continue;

    if (!patternSeen) {
      patternSeen = true;
      continue;
    }

    paths.push(arg);
  }

  return paths;
}

function extractFindPaths(args: string[]): string[] {
  const paths: string[] = [];

  for (const arg of args) {
    if (arg.startsWith('-')) break;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(arg)) continue;
    paths.push(arg);
  }

  return paths.length > 0 ? paths : ['.'];
}

function normalizeBashRule(rule: string): string | null {
  const trimmed = rule.trim();
  const bashMatch = /^bash\((.*)\)$/i.exec(trimmed);
  if (bashMatch) {
    return bashMatch[1]?.trim() || null;
  }
  return null;
}
