/**
 * LEA Destructive Command Warning
 *
 * Detects potentially destructive bash commands and returns warnings.
 * Purely informational — doesn't affect permission logic directly.
 *
 * Reimplemented from Claude Code's destructiveCommandWarning.ts for LEA.
 */

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

/**
 * A destructive command warning.
 */
export interface DestructiveWarning {
  /** Human-readable warning message */
  warning: string;
  /** The regex pattern that matched */
  pattern: string;
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * A destructive pattern definition.
 */
type DestructivePattern = {
  pattern: RegExp;
  warning: string;
  severity: DestructiveWarning['severity'];
};

// ────────────────────────────────────────────────────────────
// Patterns
// ────────────────────────────────────────────────────────────

/**
 * Compiled destructive command patterns.
 */
const DESTRUCTIVE_PATTERNS: DestructivePattern[] = [
  // ── File Deletion ──
  {
    pattern: /(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*[rR][a-zA-Z]*f|(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*f[a-zA-Z]*[rR]/,
    warning: 'May recursively force-remove files',
    severity: 'high',
  },
  {
    pattern: /(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*[rR]/,
    warning: 'May recursively remove files',
    severity: 'medium',
  },
  {
    pattern: /(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*f/,
    warning: 'May force-remove files',
    severity: 'medium',
  },
  {
    pattern: /(^|[;&|\n]\s*)rm\s+-rf\s+\/(?![a-zA-Z])/,
    warning: 'CRITICAL: Attempts to force-remove from root filesystem',
    severity: 'critical',
  },
  {
    pattern: /(^|[;&|\n]\s*)shred\b/,
    warning: 'Securely deletes files (data cannot be recovered)',
    severity: 'high',
  },
  {
    pattern: /(^|[;&|\n]\s*)truncate\s+-s\s+0/,
    warning: 'Truncates file(s) to zero bytes',
    severity: 'medium',
  },

  // ── Disk/Filesystem ──
  {
    pattern: /\bdd\s+(if=|of=)/,
    warning: 'Direct disk I/O — may destroy partition data',
    severity: 'critical',
  },
  {
    pattern: /\bmkfs\b/,
    warning: 'Creates a filesystem — destroys existing data on partition',
    severity: 'critical',
  },
  {
    pattern: /\b(mke2fs|mkfs\.ext[234]|mkfs\.xfs|mkfs\.btrfs|mkswap)\b/,
    warning: 'Creates filesystem — destroys existing data',
    severity: 'critical',
  },
  {
    pattern: /\b(format)\b/,
    warning: 'May format a disk or partition',
    severity: 'critical',
  },
  {
    pattern: /\b(diskutil\s+(eraseDisk|partitionDisk|secureErase))\b/,
    warning: 'macOS disk utility — destroys partition data',
    severity: 'critical',
  },

  // ── Permissions ──
  {
    pattern: /\bchmod\s+(-R\s+)?777\b/,
    warning: 'Sets world-writable permissions (security risk)',
    severity: 'medium',
  },
  {
    pattern: /\bchmod\s+(-R\s+)?[0-7]{3,4}\s+\//,
    warning: 'Recursively changes permissions on system directories',
    severity: 'medium',
  },
  {
    pattern: /\bchown\s+(-R\s+)?/,
    warning: 'Changes file ownership',
    severity: 'low',
  },

  // ── Git ──
  {
    pattern: /\bgit\s+reset\s+--hard\b/,
    warning: 'May discard uncommitted changes',
    severity: 'medium',
  },
  {
    pattern: /\bgit\s+push\b[^;&|\n]*[ \t](--force|--force-with-lease|-f)\b/,
    warning: 'May overwrite remote history',
    severity: 'medium',
  },
  {
    pattern: /\bgit\s+clean\b(?![^;&|\n]*(?:-[a-zA-Z]*n|--dry-run))[^;&|\n]*-[a-zA-Z]*f/,
    warning: 'May permanently delete untracked files',
    severity: 'high',
  },
  {
    pattern: /\bgit\s+branch\s+(-D[ \t]|--delete\s+--force|--force\s+--delete)\b/,
    warning: 'May force-delete a branch',
    severity: 'medium',
  },
  {
    pattern: /\bgit\s+checkout\s+(--\s+)?\.[ \t]*($|[;&|\n])/,
    warning: 'May discard all working tree changes',
    severity: 'medium',
  },
  {
    pattern: /\bgit\s+restore\s+(--\s+)?\.[ \t]*($|[;&|\n])/,
    warning: 'May discard all working tree changes',
    severity: 'medium',
  },
  {
    pattern: /\bgit\s+stash[ \t]+(drop|clear)\b/,
    warning: 'May permanently remove stashed changes',
    severity: 'medium',
  },
  {
    pattern: /\bgit\s+(commit|push|merge)\b[^;&|\n]*--no-verify\b/,
    warning: 'May skip safety hooks',
    severity: 'low',
  },
  {
    pattern: /\bgit\s+commit\b[^;&|\n]*--amend\b/,
    warning: 'May rewrite the last commit',
    severity: 'medium',
  },

  // ── Fork Bomb ──
  {
    pattern: /:\(\)\{\s*:\|:&\s*\};:/,
    warning: 'Fork bomb detected — may exhaust system resources',
    severity: 'critical',
  },

  // ── Database ──
  {
    pattern: /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i,
    warning: 'May drop or truncate database objects',
    severity: 'critical',
  },
  {
    pattern: /\bDELETE\s+FROM\s+\w+[ \t]*(;|"|'|\n|$)/i,
    warning: 'May delete all rows from a database table',
    severity: 'high',
  },

  // ── Infrastructure ──
  {
    pattern: /\bkubectl\s+delete\b/,
    warning: 'May delete Kubernetes resources',
    severity: 'high',
  },
  {
    pattern: /\bterraform\s+destroy\b/,
    warning: 'May destroy Terraform infrastructure',
    severity: 'critical',
  },
  {
    pattern: /\bdocker\s+(rm|rmi|system\s+prune)\b/,
    warning: 'Removes Docker resources',
    severity: 'medium',
  },

  // ── Kernel/System ──
  {
    pattern: /\bshutdown\b/,
    warning: 'Shuts down the system',
    severity: 'critical',
  },
  {
    pattern: /\breboot\b/,
    warning: 'Reboots the system',
    severity: 'high',
  },
  {
    pattern: /\b(halt|poweroff)\b/,
    warning: 'Powers off the system',
    severity: 'critical',
  },
  {
    pattern: /\bkill\s+-9\s+1\b/,
    warning: 'Kills init process (system crash)',
    severity: 'critical',
  },
];

// ────────────────────────────────────────────────────────────
// Detection
// ────────────────────────────────────────────────────────────

/**
 * Detect destructive patterns in a bash command.
 *
 * @param command - The bash command string
 * @returns Warning if a destructive pattern is found, null otherwise
 */
export function detectDestructiveCommand(command: string): DestructiveWarning | null {
  for (const { pattern, warning, severity } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(command)) {
      return {
        warning,
        pattern: pattern.toString(),
        severity,
      };
    }
  }
  return null;
}

/**
 * Check if a specific command with arguments is destructive.
 *
 * @param cmd - The base command name
 * @param args - Command arguments
 * @returns true if the command+args is destructive
 */
export function isDestructive(cmd: string, args: string[]): boolean {
  const fullCommand = cmd + ' ' + args.join(' ');
  return detectDestructiveCommand(fullCommand) !== null;
}

/**
 * Get all destructive warnings for a command (there may be multiple matches).
 *
 * @param command - The bash command string
 * @returns Array of all matching destructive warnings
 */
export function getAllDestructiveWarnings(command: string): DestructiveWarning[] {
  const warnings: DestructiveWarning[] = [];

  for (const { pattern, warning, severity } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(command)) {
      warnings.push({
        warning,
        pattern: pattern.toString(),
        severity,
      });
    }
  }

  return warnings;
}
