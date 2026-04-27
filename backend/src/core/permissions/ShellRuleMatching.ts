/**
 * @module permissions/ShellRuleMatching
 * @description Shell command matching against permission rules.
 *
 * Supports three rule shapes:
 * - **Exact**: "git status" matches only "git status"
 * - **Prefix** (legacy `:*` syntax): "npm:*" matches "npm install", "npm run build"
 * - **Wildcard**: "git * " matches "git add", "git commit" (single `*` = glob)
 *
 * Adapted from Claude Code's shellRuleMatching.ts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Parsed permission rule for shell commands — discriminated union.
 */
export type ShellPermissionRule =
  | { readonly type: 'exact'; readonly command: string }
  | { readonly type: 'prefix'; readonly prefix: string }
  | { readonly type: 'wildcard'; readonly pattern: string };

// ---------------------------------------------------------------------------
// Module-level regex placeholders (compiled once)
// ---------------------------------------------------------------------------

const ESCAPED_STAR_PLACEHOLDER = '\x00ESCAPED_STAR\x00';
const ESCAPED_BACKSLASH_PLACEHOLDER = '\x00ESCAPED_BACKSLASH\x00';
const ESCAPED_STAR_RE = new RegExp(ESCAPED_STAR_PLACEHOLDER, 'g');
const ESCAPED_BACKSLASH_RE = new RegExp(ESCAPED_BACKSLASH_PLACEHOLDER, 'g');

// ---------------------------------------------------------------------------
// Wildcard detection
// ---------------------------------------------------------------------------

/**
 * Check if a pattern contains unescaped wildcards (not legacy `:*` syntax).
 */
export function hasWildcards(pattern: string): boolean {
  // Legacy :* at end is prefix syntax, not wildcard
  if (pattern.endsWith(':*')) return false;

  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] !== '*') continue;
    // Count preceding backslashes
    let backslashCount = 0;
    let j = i - 1;
    while (j >= 0 && pattern[j] === '\\') {
      backslashCount++;
      j--;
    }
    if (backslashCount % 2 === 0) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Extract prefix from legacy `:*` syntax.
 * @example permissionRuleExtractPrefix("npm:*") => "npm"
 */
export function permissionRuleExtractPrefix(permissionRule: string): string | null {
  const match = permissionRule.match(/^(.+):\*$/);
  return match?.[1] ?? null;
}

/**
 * Match a command against a wildcard pattern.
 *
 * Wildcards (`*`) match any sequence of characters.
 * Use `\*` for a literal asterisk, `\\` for a literal backslash.
 *
 * When a pattern ends with ` *` and has a single wildcard, the trailing
 * ` *` is made optional so `"git *"` matches both `"git add"` and bare `"git"`.
 */
export function matchWildcardPattern(
  pattern: string,
  command: string,
  caseInsensitive = false,
): boolean {
  const trimmedPattern = pattern.trim();

  // Process escape sequences: \* and \\
  let processed = '';
  let i = 0;
  while (i < trimmedPattern.length) {
    const char = trimmedPattern[i];
    if (char === '\\' && i + 1 < trimmedPattern.length) {
      const next = trimmedPattern[i + 1];
      if (next === '*') {
        processed += ESCAPED_STAR_PLACEHOLDER;
        i += 2;
        continue;
      } else if (next === '\\') {
        processed += ESCAPED_BACKSLASH_PLACEHOLDER;
        i += 2;
        continue;
      }
    }
    processed += char;
    i++;
  }

  // Escape regex special characters except *
  const escaped = processed.replace(/[.+?^${}()|[\]\\'"]/g, '\\$&');
  const withWildcards = escaped.replace(/\*/g, '.*');

  // Convert placeholders back to escaped regex literals
  let regexPattern = withWildcards
    .replace(ESCAPED_STAR_RE, '\\*')
    .replace(ESCAPED_BACKSLASH_RE, '\\\\');

  // Single trailing wildcard: make space+args optional (aligns with prefix semantics)
  const unescapedStarCount = (processed.match(/\*/g) || []).length;
  if (regexPattern.endsWith(' .*') && unescapedStarCount === 1) {
    regexPattern = regexPattern.slice(0, -3) + '( .*)?';
  }

  const flags = 's' + (caseInsensitive ? 'i' : '');
  const regex = new RegExp(`^${regexPattern}$`, flags);
  return regex.test(command);
}

/**
 * Match a shell command against a parsed permission rule.
 */
export function matchShellCommand(
  rule: ShellPermissionRule,
  command: string,
  caseInsensitive = false,
): boolean {
  switch (rule.type) {
    case 'exact':
      return caseInsensitive
        ? command.toLowerCase() === rule.command.toLowerCase()
        : command === rule.command;
    case 'prefix': {
      const p = caseInsensitive
        ? rule.prefix.toLowerCase()
        : rule.prefix;
      const c = caseInsensitive
        ? command.toLowerCase()
        : command;
      return c === p || c.startsWith(p + ' ');
    }
    case 'wildcard':
      return matchWildcardPattern(rule.pattern, command, caseInsensitive);
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a permission rule string into a structured rule object.
 *
 * @example
 * parsePermissionRule("git status")   // => { type: 'exact', command: 'git status' }
 * parsePermissionRule("npm:*")        // => { type: 'prefix', prefix: 'npm' }
 * parsePermissionRule("git commit *")  // => { type: 'wildcard', pattern: 'git commit *' }
 */
export function parsePermissionRule(permissionRule: string): ShellPermissionRule {
  // Check for legacy :* prefix syntax first
  const prefix = permissionRuleExtractPrefix(permissionRule);
  if (prefix !== null) {
    return { type: 'prefix', prefix };
  }

  // Check for new wildcard syntax
  if (hasWildcards(permissionRule)) {
    return { type: 'wildcard', pattern: permissionRule };
  }

  return { type: 'exact', command: permissionRule };
}

// ---------------------------------------------------------------------------
// Shell command sanitisation
// ---------------------------------------------------------------------------

/**
 * Strips safe wrapper patterns from a shell command to expose the inner
 * command for permission matching.
 *
 * Recognised wrappers:
 * - `env VAR=val command ...`
 * - `command arg1 arg2` (already unwrapped)
 *
 * This is intentionally conservative — only strip env-var prefixes that are
 * clearly safe (no subshell, no code execution).
 */
export function stripSafeWrappers(command: string): string {
  let trimmed = command.trim();

  // Strip leading env assignments: KEY=VALUE KEY2=VALUE2 ...
  // But NOT env assignments that use $(), ``, or quotes that could hide code.
  const envPrefixRegex = /^[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|[^ '"]*)*\s+/;
  while (envPrefixRegex.test(trimmed)) {
    const match = trimmed.match(envPrefixRegex)!;
    const assignPart = match[0]!;
    // Reject if the assignment value contains subshell / command substitution
    if (assignPart.includes('$(') || assignPart.includes('`')) {
      break;
    }
    trimmed = trimmed.slice(assignPart.length);
  }

  return trimmed;
}

/**
 * Extract the base command from a shell command (first word).
 * Useful for matching tool-wide rules like "Bash(nmap)".
 */
export function extractBaseCommand(command: string): string {
  const stripped = stripSafeWrappers(command).trim();
  const parts = stripped.split(/\s+/);
  return parts[0] ?? '';
}
