/**
 * @module permissions/PermissionRule
 * @description Permission rule types, Zod schemas, and rule-value parsing.
 *
 * Rules use the format "Tool" or "Tool(content)". Parentheses in content are
 * escaped: \( → (, \) → ) and \\ → \.
 *
 * Adapted from Claude Code's PermissionRule.ts and permissionRuleParser.ts.
 */

import { z } from 'zod';

// Re-export core types for convenience
export type {
  PermissionBehavior,
  PermissionRule,
  PermissionRuleValue,
  PermissionRuleSource,
} from './types.js';

import type {
  PermissionBehavior,
  PermissionRule,
  PermissionRuleValue,
  PermissionRuleSource,
} from './types.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/** Zod schema for permission behavior enum. */
export const permissionBehaviorSchema = z.enum(['allow', 'deny', 'ask']);

/** Zod schema for a permission rule value (toolName + optional ruleContent). */
export const permissionRuleValueSchema = z.object({
  toolName: z.string(),
  ruleContent: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Escaping / unescaping helpers
// ---------------------------------------------------------------------------

/**
 * Escape special characters in rule content for safe storage.
 *
 * Order matters:
 * 1. Escape existing backslashes first (\ → \\)
 * 2. Then escape parentheses (( → \(, ) → \))
 */
export function escapeRuleContent(content: string): string {
  return content
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Unescape special characters in rule content after parsing.
 * Reverses the escaping done by {@link escapeRuleContent}.
 */
export function unescapeRuleContent(content: string): string {
  return content
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

// ---------------------------------------------------------------------------
// Parsing: string ↔ PermissionRuleValue
// ---------------------------------------------------------------------------

/**
 * Find the index of the first unescaped occurrence of `char`.
 * A character is escaped if preceded by an odd number of backslashes.
 */
function findFirstUnescapedChar(str: string, char: string): number {
  for (let i = 0; i < str.length; i++) {
    if (str[i] === char) {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && str[j] === '\\') {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) return i;
    }
  }
  return -1;
}

/**
 * Find the index of the last unescaped occurrence of `char`.
 */
function findLastUnescapedChar(str: string, char: string): number {
  for (let i = str.length - 1; i >= 0; i--) {
    if (str[i] === char) {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && str[j] === '\\') {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) return i;
    }
  }
  return -1;
}

/**
 * Parse a permission rule string into its components.
 *
 * Format: "ToolName" or "ToolName(content)"
 * Content may contain escaped parentheses: \( and \)
 *
 * @example
 * permissionRuleValueFromString('Bash')          // => { toolName: 'Bash' }
 * permissionRuleValueFromString('Bash(npm)')     // => { toolName: 'Bash', ruleContent: 'npm' }
 * permissionRuleValueFromString('Bash(python -c "print\\(1\\)")')
 *   // => { toolName: 'Bash', ruleContent: 'python -c "print(1)"' }
 */
export function permissionRuleValueFromString(ruleString: string): PermissionRuleValue {
  const openParen = findFirstUnescapedChar(ruleString, '(');
  if (openParen === -1) {
    return { toolName: ruleString };
  }

  const closeParen = findLastUnescapedChar(ruleString, ')');
  if (closeParen === -1 || closeParen <= openParen || closeParen !== ruleString.length - 1) {
    return { toolName: ruleString };
  }

  const toolName = ruleString.substring(0, openParen);
  const rawContent = ruleString.substring(openParen + 1, closeParen);

  if (!toolName || rawContent === '' || rawContent === '*') {
    return { toolName };
  }

  return { toolName, ruleContent: unescapeRuleContent(rawContent) };
}

/**
 * Convert a permission rule value to its string representation.
 * Escapes parentheses in the content to prevent parsing issues.
 *
 * @example
 * permissionRuleValueToString({ toolName: 'Bash' })              // => 'Bash'
 * permissionRuleValueToString({ toolName: 'Bash', ruleContent: 'npm install' })
 *   // => 'Bash(npm install)'
 */
export function permissionRuleValueToString(ruleValue: PermissionRuleValue): string {
  if (!ruleValue.ruleContent) return ruleValue.toolName;
  return `${ruleValue.toolName}(${escapeRuleContent(ruleValue.ruleContent)})`;
}

// ---------------------------------------------------------------------------
// Rule helpers
// ---------------------------------------------------------------------------

/** All permission rule sources in priority order. */
export const PERMISSION_RULE_SOURCES: readonly PermissionRuleSource[] = [
  'policySettings',
  'flagSettings',
  'userSettings',
  'projectSettings',
  'localSettings',
  'cliArg',
  'command',
  'session',
];

/**
 * Build a PermissionRule from a source, behavior, and raw rule string.
 */
export function buildPermissionRule(
  source: PermissionRuleSource,
  behavior: PermissionBehavior,
  ruleString: string,
): PermissionRule {
  return {
    source,
    ruleBehavior: behavior,
    ruleValue: permissionRuleValueFromString(ruleString),
  };
}

/**
 * Check whether two rules are equivalent (ignoring source).
 */
export function rulesEqual(a: PermissionRuleValue, b: PermissionRuleValue): boolean {
  return (
    a.toolName === b.toolName &&
    a.ruleContent === b.ruleContent
  );
}

/**
 * Get a human-readable display string for a rule source.
 */
export function permissionRuleSourceDisplayString(source: PermissionRuleSource): string {
  const map: Record<PermissionRuleSource, string> = {
    policySettings: 'managed policy',
    flagSettings: 'feature flag',
    userSettings: 'user settings',
    projectSettings: 'project settings',
    localSettings: 'local settings',
    cliArg: 'CLI argument',
    command: '/allow command',
    session: 'session',
  };
  return map[source] ?? source;
}
