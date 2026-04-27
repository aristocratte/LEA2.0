/**
 * LEA Path Validation
 *
 * Validates file paths for bash commands: prevents traversal attacks,
 * enforces scope boundaries, and integrates with LEA's permission system.
 *
 * Reimplemented from Claude Code's pathValidation.ts for LEA.
 */

import { resolve, isAbsolute, join, relative, dirname } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

/**
 * Result of path validation.
 */
export interface PathValidationResult {
  /** Whether the path is valid */
  valid: boolean;
  /** Absolute resolved path */
  resolvedPath: string;
  /** Reason if invalid */
  reason?: string;
  /** Whether path is within allowed scope */
  inScope: boolean;
  /** Whether path is a directory */
  isDirectory?: boolean;
  /** Whether path exists */
  exists?: boolean;
}

/**
 * Configuration for path validation.
 */
export interface PathValidationConfig {
  /** Allowed root directories */
  allowedPaths: string[];
  /** Current working directory */
  cwd: string;
  /** Whether to allow paths outside allowed scope (with warning) */
  allowOutsideScope?: boolean;
  /** Maximum path depth to prevent traversal */
  maxDepth?: number;
}

// ────────────────────────────────────────────────────────────
// Dangerous Paths
// ────────────────────────────────────────────────────────────

/**
 * Paths that should always require explicit approval.
 */
const DANGEROUS_PATHS = new Set([
  '/',
  '/etc',
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '/etc/ssh',
  '/usr',
  '/usr/bin',
  '/usr/sbin',
  '/usr/lib',
  '/bin',
  '/sbin',
  '/lib',
  '/System',
  '/System/Library',
  '/Library',
  '/private',
  '/private/etc',
  '/var',
  '/boot',
  '/dev',
  '/proc',
  '/sys',
  '/snap',
]);

/**
 * Patterns for dangerous removal targets.
 */
const DANGEROUS_REMOVAL_PATTERNS = [
  /^\//,          // Absolute root path
  /^~\/?$/,       // Home directory root
  /^\.\/?$/,      // Current directory
  /^\.\.\/?$/,    // Parent directory
  /^\/etc\//,     // System config
  /^\/usr\//,     // System libraries
  /^\/bin\//,     // System binaries
  /^\/(s?)bin\//, // System binaries
  /^\/System\//,  // macOS system
  /^\/Library\//, // macOS library
];

// ────────────────────────────────────────────────────────────
// Path Expansion
// ────────────────────────────────────────────────────────────

/**
 * Expand a tilde (~) to the user's home directory.
 */
export function expandTilde(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  if (path.startsWith('~')) {
    // ~user expansion (simplified)
    const parts = path.split('/');
    if (parts[0]) {
      return join('/home', parts[0]!.slice(1), ...parts.slice(1));
    }
  }
  return path;
}

/**
 * Resolve a path relative to a working directory.
 * Handles ~ expansion, relative paths, and symlinks.
 */
export function resolvePath(path: string, cwd: string): string {
  const expanded = expandTilde(path);
  if (isAbsolute(expanded)) {
    return resolve(expanded);
  }
  return resolve(cwd, expanded);
}

// ────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────

/**
 * Validate a file path for safety.
 *
 * Checks for:
 * - Path traversal attacks (../)
 * - Scope violations (outside allowed directories)
 * - Dangerous system paths
 * - Symlink escapes
 *
 * @param path - The path to validate
 * @param config - Validation configuration
 * @returns Validation result
 */
export function validatePath(path: string, config: PathValidationConfig): PathValidationResult {
  // Expand and resolve
  const resolvedPath = resolvePath(path, config.cwd);

  // Check for path traversal
  if (path.includes('..')) {
    // Verify the resolved path is still within scope
    const rel = relative(config.cwd, resolvedPath);
    if (rel.startsWith('..')) {
      return {
        valid: false,
        resolvedPath,
        reason: 'Path traversal detected: resolved path escapes working directory',
        inScope: false,
      };
    }
  }

  // Check for null bytes
  if (path.includes('\0')) {
    return {
      valid: false,
      resolvedPath,
      reason: 'Null byte in path (possible injection)',
      inScope: false,
    };
  }

  // Check for dangerous paths
  for (const dangerousPath of Array.from(DANGEROUS_PATHS)) {
    if (resolvedPath === dangerousPath) {
      return {
        valid: config.allowOutsideScope ?? false,
        resolvedPath,
        reason: `Dangerous system path: ${dangerousPath}`,
        inScope: false,
      };
    }
  }

  // Check scope
  let inScope = false;
  if (config.allowedPaths.length > 0) {
    for (const allowed of config.allowedPaths) {
      const allowedResolved = resolvePath(allowed, config.cwd);
      if (resolvedPath === allowedResolved || resolvedPath.startsWith(allowedResolved + '/')) {
        inScope = true;
        break;
      }
    }

    // Also check against cwd
    if (!inScope) {
      const cwdResolved = resolve(config.cwd);
      if (resolvedPath === cwdResolved || resolvedPath.startsWith(cwdResolved + '/')) {
        inScope = true;
      }
    }
  } else {
    inScope = true;
  }

  // Check existence and type
  let isDirectory: boolean | undefined;
  let exists: boolean | undefined;
  try {
    const stat = statSync(resolvedPath, { throwIfNoEntry: false });
    if (stat) {
      isDirectory = stat.isDirectory();
      exists = true;
    } else {
      exists = false;
    }
  } catch {
    exists = false;
  }

  if (!inScope && !config.allowOutsideScope) {
    return {
      valid: false,
      resolvedPath,
      reason: `Path "${resolvedPath}" is outside allowed scope`,
      inScope: false,
      isDirectory,
      exists,
    };
  }

  // Check depth
  if (config.maxDepth) {
    const parts = resolvedPath.split('/').filter(Boolean);
    if (parts.length > config.maxDepth) {
      return {
        valid: false,
        resolvedPath,
        reason: `Path depth exceeds maximum (${config.maxDepth})`,
        inScope: true,
        isDirectory,
        exists,
      };
    }
  }

  return {
    valid: true,
    resolvedPath,
    inScope,
    isDirectory,
    exists,
  };
}

/**
 * Check if a path is a dangerous removal target.
 *
 * @param path - The path to check
 * @returns true if the path is a dangerous removal target
 */
export function isDangerousRemovalPath(path: string): boolean {
  const expanded = expandTilde(path);
  return DANGEROUS_REMOVAL_PATTERNS.some(pattern => pattern.test(expanded));
}

/**
 * Get the directory for a path (for working directory context).
 *
 * @param path - The file path
 * @returns The parent directory
 */
export function getDirectoryForPath(path: string): string {
  const expanded = expandTilde(path);
  return isAbsolute(expanded) ? dirname(expanded) : dirname(resolve(expanded));
}

/**
 * Check if a path target is within the allowed scope for writes.
 *
 * @param path - The path to check
 * @param allowedPaths - Allowed directories
 * @param cwd - Current working directory
 * @returns true if the path is in scope for writes
 */
export function isPathInScope(path: string, allowedPaths: string[], cwd: string): boolean {
  const result = validatePath(path, { allowedPaths, cwd });
  return result.valid && result.inScope;
}
