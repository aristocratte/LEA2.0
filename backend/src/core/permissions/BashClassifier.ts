/**
 * @module permissions/BashClassifier
 * @description Stub for LLM-based command classification.
 *
 * In Claude Code, this uses an LLM to semantically classify bash commands
 * against prompt-style permission rules. For LEA, this is a placeholder
 * interface that can be implemented later with an LLM backend.
 *
 * The interface is intentionally simple: classify a command as allowed,
 * denied, or ask-for-review, with a reason string.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result from the classifier. */
export type ClassifierResult = {
  /** Whether the command matches the classification criteria. */
  readonly matches: boolean;
  /** Human-readable description of what was matched (if any). */
  readonly matchedDescription?: string;
  /** Confidence of the classification. */
  readonly confidence: 'high' | 'medium' | 'low';
  /** Human-readable explanation. */
  readonly reason: string;
};

/** Classifier behavior for a given command. */
export type ClassifierBehavior = 'deny' | 'ask' | 'allow';

/** Configuration for the bash classifier. */
export type BashClassifierConfig = {
  /** Whether the classifier is enabled. @default false */
  readonly enabled?: boolean;
  /** Custom classifier function (replaces default stub). */
  readonly classifierFn?: (
    command: string,
    cwd: string,
    descriptions: string[],
    behavior: ClassifierBehavior,
  ) => Promise<ClassifierResult>;
};

// ---------------------------------------------------------------------------
// Prompt prefix for prompt-style rules
// ---------------------------------------------------------------------------

/** Prefix used for prompt-style permission rules. */
export const PROMPT_PREFIX = 'prompt:';

/**
 * Extract a prompt description from a rule content string.
 * Returns null if the content is not a prompt-style rule.
 */
export function extractPromptDescription(ruleContent: string | undefined): string | null {
  if (!ruleContent?.startsWith(PROMPT_PREFIX)) return null;
  return ruleContent.slice(PROMPT_PREFIX.length).trim() || null;
}

/**
 * Create a prompt-style rule content string.
 */
export function createPromptRuleContent(description: string): string {
  return `${PROMPT_PREFIX} ${description.trim()}`;
}

// ---------------------------------------------------------------------------
// Default stub classifier
// ---------------------------------------------------------------------------

/**
 * Check whether the classifier is enabled.
 * In the default implementation, this always returns false.
 * Set `config.enabled = true` or provide a custom `classifierFn` to enable.
 */
export function isClassifierPermissionsEnabled(): boolean {
  return false;
}

/**
 * Get prompt-based deny descriptions from the permission context.
 * Default implementation returns empty array.
 */
export function getBashPromptDenyDescriptions(_context: unknown): string[] {
  return [];
}

/**
 * Get prompt-based ask descriptions from the permission context.
 * Default implementation returns empty array.
 */
export function getBashPromptAskDescriptions(_context: unknown): string[] {
  return [];
}

/**
 * Get prompt-based allow descriptions from the permission context.
 * Default implementation returns empty array.
 */
export function getBashPromptAllowDescriptions(_context: unknown): string[] {
  return [];
}

/**
 * Classify a bash command against permission descriptions.
 *
 * Default stub always returns "no match" with high confidence.
 * Override with a custom `classifierFn` in the config to enable real classification.
 *
 * @param command - The shell command to classify.
 * @param cwd - Current working directory.
 * @param descriptions - Permission descriptions to match against.
 * @param behavior - What behavior the descriptions represent (deny/ask/allow).
 * @param _signal - AbortSignal for cancellation.
 * @param _isNonInteractive - Whether this is a non-interactive session.
 */
export async function classifyBashCommand(
  command: string,
  cwd: string,
  descriptions: string[],
  behavior: ClassifierBehavior,
  _signal?: AbortSignal,
  _isNonInteractive?: boolean,
): Promise<ClassifierResult> {
  return {
    matches: false,
    confidence: 'high',
    reason: `Classifier is disabled. Command "${command}" not classified.`,
  };
}

/**
 * Generate a generic description for a bash command.
 * Default stub returns the specific description if provided, null otherwise.
 */
export async function generateGenericDescription(
  _command: string,
  specificDescription: string | undefined,
  _signal?: AbortSignal,
): Promise<string | null> {
  return specificDescription ?? null;
}

// ---------------------------------------------------------------------------
// YOLO classifier interface (auto-mode security classification)
// ---------------------------------------------------------------------------

/** Result from the YOLO (auto-mode) classifier. */
export type YoloClassifierResult = {
  /** Whether the action should be blocked. */
  readonly shouldBlock: boolean;
  /** Explanation for the decision. */
  readonly reason: string;
  /** The model used for classification. */
  readonly model?: string;
  /** Whether the classifier was unavailable (API error). */
  readonly unavailable?: boolean;
  /** Whether the transcript was too long for the classifier. */
  readonly transcriptTooLong?: boolean;
  /** Duration of the classification in ms. */
  readonly durationMs?: number;
};

/**
 * Classify an action for auto-mode security.
 * Default stub always allows with high confidence.
 *
 * @param _toolName - The tool being used.
 * @param _input - The tool's input parameters.
 * @param _context - Current permission context.
 * @param _signal - AbortSignal for cancellation.
 */
export async function classifyYoloAction(
  _toolName: string,
  _input: Record<string, unknown>,
  _context?: unknown,
  _signal?: AbortSignal,
): Promise<YoloClassifierResult> {
  return {
    shouldBlock: false,
    reason: 'Classifier stub: all actions allowed.',
    model: 'stub',
  };
}

/**
 * Format an action for classifier input.
 */
export function formatActionForClassifier(
  toolName: string,
  toolInput: Record<string, unknown>,
): { role: 'assistant'; content: Array<{ type: 'tool_use'; name: string; input: unknown }> } {
  return {
    role: 'assistant',
    content: [{ type: 'tool_use', name: toolName, input: toolInput }],
  };
}

// ---------------------------------------------------------------------------
// Auto-mode allowlist
// ---------------------------------------------------------------------------

/** Tools that are safe and don't need classifier checking. */
const SAFE_AUTO_MODE_TOOLS = new Set([
  'FileRead',
  'Grep',
  'Glob',
  'TodoWrite',
  'TaskCreate',
  'TaskList',
  'TaskUpdate',
  'TaskStop',
  'Sleep',
  'AskUser',
]);

/**
 * Check if a tool is on the safe auto-mode allowlist.
 */
export function isAutoModeAllowlistedTool(toolName: string): boolean {
  return SAFE_AUTO_MODE_TOOLS.has(toolName);
}
