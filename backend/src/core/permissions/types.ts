/**
 * @module permissions/types
 * @description Shared types for the LEA permission system.
 * Adapted from Claude Code's permission architecture, adapted for
 * pentest/EA operations context.
 */

// ---------------------------------------------------------------------------
// Core permission behaviors
// ---------------------------------------------------------------------------

/** The three possible permission outcomes. */
export type PermissionBehavior = 'allow' | 'deny' | 'ask';

/** All supported permission modes. */
export type PermissionMode =
  | 'default'      // Normal mode — ask for anything not explicitly allowed
  | 'acceptEdits'  // Auto-allow file edits in working directory
  | 'bypassPermissions' // Skip all checks (admin-only)
  | 'dontAsk'      // Convert 'ask' → 'deny' (headless / CI)
  | 'plan';        // Plan-only mode

// ---------------------------------------------------------------------------
// Rule sources — where a permission rule originates
// ---------------------------------------------------------------------------

/**
 * Sources for permission rules, ordered from least to most specific.
 * Earlier sources are overridden by later ones.
 */
export type PermissionRuleSource =
  | 'policySettings'   // Organization-managed (read-only)
  | 'flagSettings'     // Feature-flag injected (read-only)
  | 'userSettings'     // ~/.lea/settings.json
  | 'projectSettings'  // .lea/settings.json
  | 'localSettings'    // .claude/settings.local.json (legacy compat)
  | 'cliArg'           // --allowedTools / --deniedTools CLI flags
  | 'command'          // In-session /allow, /deny commands
  | 'session';         // Ephemeral session grants

/** Sources that can be persisted to disk. */
export type EditableSettingSource = Exclude<
  PermissionRuleSource,
  'policySettings' | 'flagSettings' | 'command'
>;

// ---------------------------------------------------------------------------
// Rule value — the content of a permission rule
// ---------------------------------------------------------------------------

/**
 * Represents "Tool" or "Tool(content)" in a permission rule.
 * When `ruleContent` is undefined, the rule matches the entire tool.
 */
export type PermissionRuleValue = {
  readonly toolName: string;
  readonly ruleContent?: string;
};

/**
 * A single permission rule with its source and behavior.
 */
export type PermissionRule = {
  readonly source: PermissionRuleSource;
  readonly ruleBehavior: PermissionBehavior;
  readonly ruleValue: PermissionRuleValue;
};

// ---------------------------------------------------------------------------
// Permission update — mutation operations on rule sets
// ---------------------------------------------------------------------------

export type PermissionUpdateDestination = PermissionRuleSource;

export type PermissionUpdate =
  | {
      readonly type: 'addRules';
      readonly rules: readonly PermissionRuleValue[];
      readonly behavior: PermissionBehavior;
      readonly destination: PermissionUpdateDestination;
    }
  | {
      readonly type: 'replaceRules';
      readonly rules: readonly PermissionRuleValue[];
      readonly behavior: PermissionBehavior;
      readonly destination: PermissionUpdateDestination;
    }
  | {
      readonly type: 'removeRules';
      readonly rules: readonly PermissionRuleValue[];
      readonly behavior: PermissionBehavior;
      readonly destination: PermissionUpdateDestination;
    }
  | {
      readonly type: 'setMode';
      readonly mode: PermissionMode;
      readonly destination: PermissionUpdateDestination;
    }
  | {
      readonly type: 'addDirectories';
      readonly directories: readonly string[];
      readonly destination: PermissionUpdateDestination;
    };

// ---------------------------------------------------------------------------
// Permission context — the runtime state that holds all rules
// ---------------------------------------------------------------------------

/**
 * Mutable permission context that tools and the permission engine consult.
 * Mirrors Claude Code's `ToolPermissionContext` but simplified for LEA.
 */
export type PermissionContext = {
  /** Current permission mode. */
  readonly mode: PermissionMode;
  /** Per-source allow rule strings. */
  readonly alwaysAllowRules: Partial<Record<PermissionRuleSource, readonly string[]>>;
  /** Per-source deny rule strings. */
  readonly alwaysDenyRules: Partial<Record<PermissionRuleSource, readonly string[]>>;
  /** Per-source ask rule strings. */
  readonly alwaysAskRules: Partial<Record<PermissionRuleSource, readonly string[]>>;
  /** Extra working directories the agent may access. */
  readonly additionalWorkingDirectories: ReadonlyMap<string, string>;
  /** Whether to avoid showing permission prompts (headless mode). */
  readonly shouldAvoidPermissionPrompts?: boolean;
  /** Working directory for the agent's tool executions. */
  readonly cwd?: string;
};

// ---------------------------------------------------------------------------
// Permission decisions — what the engine returns
// ---------------------------------------------------------------------------

/**
 * Discriminated union describing WHY a decision was made.
 */
export type PermissionDecisionReason =
  | { readonly type: 'rule'; readonly rule: PermissionRule }
  | { readonly type: 'mode'; readonly mode: PermissionMode }
  | { readonly type: 'hook'; readonly hookName: string; readonly reason?: string }
  | { readonly type: 'classifier'; readonly classifier: string; readonly reason: string }
  | { readonly type: 'safetyCheck'; readonly reason: string; readonly classifierApprovable?: boolean }
  | { readonly type: 'subcommandResults'; readonly reasons: ReadonlyMap<string, PermissionResult> }
  | { readonly type: 'workingDir'; readonly reason: string }
  | { readonly type: 'other'; readonly reason: string };

/** A positive permission decision. */
export type PermissionAllowDecision = {
  readonly behavior: 'allow';
  readonly updatedInput?: Record<string, unknown>;
  readonly userModified?: boolean;
  readonly decisionReason?: PermissionDecisionReason;
  readonly acceptFeedback?: string;
};

/** A negative permission decision. */
export type PermissionDenyDecision = {
  readonly behavior: 'deny';
  readonly message: string;
  readonly decisionReason?: PermissionDecisionReason;
};

/** An undecided permission decision — needs user input. */
export type PermissionAskDecision = {
  readonly behavior: 'ask';
  readonly message: string;
  readonly updatedInput?: Record<string, unknown>;
  readonly suggestions?: readonly PermissionUpdate[];
  readonly decisionReason?: PermissionDecisionReason;
  readonly metadata?: PermissionMetadata;
};

/** Union of all permission decisions. */
export type PermissionDecision =
  | PermissionAllowDecision
  | PermissionAskDecision
  | PermissionDenyDecision;

/**
 * Raw result from a tool's `checkPermissions()` implementation.
 * `passthrough` means "I have no opinion, ask the engine."
 */
export type PermissionResult =
  | PermissionDecision
  | {
      readonly behavior: 'passthrough';
      readonly message?: string;
      readonly suggestions?: readonly PermissionUpdate[];
      readonly decisionReason?: PermissionDecisionReason;
    };

/** Optional metadata attached to permission decisions. */
export type PermissionMetadata = {
  readonly riskLevel?: string;
  readonly classifierConfidence?: string;
  readonly denialCount?: number;
};

// ---------------------------------------------------------------------------
// Tool permission check interface
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Path validation types
// ---------------------------------------------------------------------------

/** Types of file operations that need permission checks. */
export type FileOperationType = 'read' | 'write' | 'create' | 'delete' | 'execute' | 'stat';

/** Result of a path permission check. */
export interface PathCheckResult {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly resolvedPath?: string;
  readonly isTraversing?: boolean;
}

/** Extended path check result with resolved path info. */
export interface ResolvedPathCheckResult extends PathCheckResult {
  readonly absolutePath: string;
  readonly isWithinScope: boolean;
  readonly operation: FileOperationType;
  readonly decisionReason?: string;
}

// ---------------------------------------------------------------------------
// Tool permission interface
// ---------------------------------------------------------------------------

/**
 * Interface that tools implement to plug into the permission system.
 */
export type ToolPermissionCheck = {
  readonly name: string;
  readonly inputSchema: { parse(input: unknown): Record<string, unknown> };
  checkPermissions(
    input: Record<string, unknown>,
    context: PermissionContext,
  ): Promise<PermissionResult>;
  requiresUserInteraction?(): boolean;
  /** Returns true if the tool operation has no mutating side effects. */
  isReadOnly?(input: Record<string, unknown>): boolean;
  getPath?(input: Record<string, unknown>): string | undefined;
};
