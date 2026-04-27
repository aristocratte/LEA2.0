/**
 * LEA Bash Security Types
 *
 * Type definitions for the bash security subsystem.
 * Reimplemented from Claude Code's BashTool for LEA's pentest-focused environment.
 */

// ────────────────────────────────────────────────────────────
// Core Validation Types
// ────────────────────────────────────────────────────────────

export type PermissionBehavior = 'allow' | 'deny' | 'ask' | 'passthrough';

export interface PermissionResult {
  behavior: PermissionBehavior;
  message?: string;
  updatedInput?: Record<string, unknown>;
  decisionReason?: PermissionDecisionReason;
  isBashSecurityCheckForMisparsing?: boolean;
  suggestions?: PermissionSuggestion[];
}

export interface PermissionDecisionReason {
  type: 'rule' | 'other' | 'subcommandResults' | 'classifier';
  rule?: PermissionRule;
  reason?: string;
  reasons?: Map<string, PermissionResult>;
  classifier?: string;
}

export interface PermissionSuggestion {
  type: 'addRules';
  rules: PermissionRuleValue[];
  behavior: PermissionBehavior;
  destination: string;
}

// ────────────────────────────────────────────────────────────
// Permission Rules
// ────────────────────────────────────────────────────────────

export type PermissionRuleValue = {
  tool: string;
  rule: string;
};

export interface PermissionRule {
  id: string;
  content: string;
  behavior: PermissionBehavior;
  destination: string;
}

export type ShellPermissionRule =
  | { type: 'exact'; command: string }
  | { type: 'prefix'; prefix: string }
  | { type: 'wildcard'; pattern: string };

// ────────────────────────────────────────────────────────────
// Parse Types
// ────────────────────────────────────────────────────────────

export type ParseEntry = string | { op: string } | { glob: string; pattern: string } | { comment: string };

export interface ParseResult {
  success: boolean;
  tokens: ParseEntry[];
  error?: string;
}

export interface HeredocInfo {
  delimiter: string;
  quoted: boolean;
  content: string;
  startLine: number;
  endLine: number;
}

export interface HeredocExtractResult {
  processedCommand: string;
  heredocs: Array<{
    placeholder: string;
    heredoc: HeredocInfo;
  }>;
}

// ────────────────────────────────────────────────────────────
// Command Parse Result
// ────────────────────────────────────────────────────────────

export interface CommandParseResult {
  /** The original raw command string */
  raw: string;
  /** Individual subcommands (after splitting on operators) */
  subcommands: string[];
  /** Control operators found: &&, ||, ;, | */
  operators: string[];
  /** Output redirections detected */
  redirections: OutputRedirection[];
  /** Whether parsing fully succeeded */
  parseSuccess: boolean;
}

export interface OutputRedirection {
  target: string;
  operator: '>' | '>>';
  fd?: number;
}

// ────────────────────────────────────────────────────────────
// Bash Validation Result
// ────────────────────────────────────────────────────────────

export interface BashValidationResult {
  /** Whether the command is safe to execute */
  safe: boolean;
  /** If not safe, the reason */
  reason?: string;
  /** Security warnings (non-blocking) */
  warnings: string[];
  /** Detected destructive operations */
  destructiveOps: DestructiveOperation[];
  /** Path constraints that were checked */
  pathChecks: PathCheck[];
}

export interface DestructiveOperation {
  type: 'delete' | 'overwrite' | 'force' | 'recursive' | 'format';
  command: string;
  target: string;
  description: string;
}

export interface PathCheck {
  path: string;
  resolved: string;
  allowed: boolean;
  reason?: string;
}

// ────────────────────────────────────────────────────────────
// Security Check Types
// ────────────────────────────────────────────────────────────

export type SecurityCheckId =
  | 'INCOMPLETE_COMMANDS'
  | 'JQ_SYSTEM_FUNCTION'
  | 'OBFUSCATED_FLAGS'
  | 'SHELL_METACHARACTERS'
  | 'DANGEROUS_VARIABLES'
  | 'NEWLINES'
  | 'COMMAND_SUBSTITUTION'
  | 'INPUT_REDIRECTION'
  | 'OUTPUT_REDIRECTION'
  | 'IFS_INJECTION'
  | 'PROC_ENVIRON_ACCESS'
  | 'MALFORMED_TOKEN'
  | 'BACKSLASH_ESCAPED_WHITESPACE'
  | 'BRACE_EXPANSION'
  | 'CONTROL_CHARACTERS'
  | 'UNICODE_WHITESPACE'
  | 'MID_WORD_HASH'
  | 'ZSH_DANGEROUS_COMMANDS'
  | 'BACKSLASH_ESCAPED_OPERATORS'
  | 'COMMENT_QUOTE_DESYNC'
  | 'QUOTED_NEWLINE';

export interface SecurityCheckResult {
  checkId: SecurityCheckId;
  triggered: boolean;
  message?: string;
}

// ────────────────────────────────────────────────────────────
// Command Semantics
// ────────────────────────────────────────────────────────────

export type SemanticCategory =
  | 'read'
  | 'write'
  | 'execute'
  | 'network'
  | 'admin'
  | 'dangerous'
  | 'info'
  | 'destructive';

export interface SemanticAnalysis {
  baseCommand: string;
  category: SemanticCategory;
  isReadOnly: boolean;
  isNetwork: boolean;
  isDestructive: boolean;
  isPrivilegeEscalation: boolean;
  warnings: string[];
}

// ────────────────────────────────────────────────────────────
// Command Registry / Specs
// ────────────────────────────────────────────────────────────

export interface CommandSpec {
  /** Binary name */
  name: string;
  /** Aliases */
  aliases?: string[];
  /** Semantic category */
  category: SemanticCategory;
  /** Whether this command is read-only by default */
  readOnly?: boolean;
  /** Whether this command makes network connections */
  network?: boolean;
  /** Whether this command is destructive */
  destructive?: boolean;
  /** Flags that change the command's behavior */
  behaviorFlags?: Array<{
    flag: string | RegExp;
    effect: Partial<{
      readOnly: boolean;
      network: boolean;
      destructive: boolean;
      category: SemanticCategory;
    }>;
  }>;
  /** Flags that are always dangerous and require confirmation */
  dangerousFlags?: string[];
  /** Flags that should trigger warnings */
  warningFlags?: Array<{
    flag: string | RegExp;
    message: string;
  }>;
  /** Path arguments that need validation (by index or regex) */
  pathArguments?: Array<{
    position: number;
    validateWrite?: boolean;
  }>;
  /** Description */
  description?: string;
}

// ────────────────────────────────────────────────────────────
// Validation Context (for security checks)
// ────────────────────────────────────────────────────────────

export interface ValidationContext {
  originalCommand: string;
  baseCommand: string;
  unquotedContent: string;
  fullyUnquotedContent: string;
  fullyUnquotedPreStrip: string;
  unquotedKeepQuoteChars: string;
}

// ────────────────────────────────────────────────────────────
// Permission Context
// ────────────────────────────────────────────────────────────

export interface BashPermissionContext {
  cwd: string;
  mode: 'plan' | 'normal' | 'auto' | 'bypassPermissions';
  allowRules: Map<string, PermissionRule>;
  denyRules: Map<string, PermissionRule>;
  askRules: Map<string, PermissionRule>;
  isReadOnly?: boolean;
}

// ────────────────────────────────────────────────────────────
// Sandbox
// ────────────────────────────────────────────────────────────

export interface SandboxConfig {
  enabled: boolean;
  autoAllowBashIfSandboxed: boolean;
  excludedCommands?: string[];
  allowedPaths?: string[];
  tempDir?: string;
}

// ────────────────────────────────────────────────────────────
// Prefix Extraction
// ────────────────────────────────────────────────────────────

export interface CommandPrefixResult {
  commandPrefix: string | null;
  subcommandPrefixes?: Map<string, string>;
}
