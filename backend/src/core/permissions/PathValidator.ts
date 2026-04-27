/**
 * @module permissions/PathValidator
 * @description Path validation for the LEA permission system.
 *
 * Prevents path traversal (../), enforces scope constraints (working directories),
 * and detects dangerous file paths.
 *
 * Adapted from Claude Code's pathValidation.ts and filesystem.ts.
 */

import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { FileOperationType, PathCheckResult, ResolvedPathCheckResult } from './types.js';

// Re-export for external use
export type { FileOperationType, PathCheckResult, ResolvedPathCheckResult };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Files that should never be auto-edited (code execution / data exfil risk). */
export const DANGEROUS_FILES: readonly string[] = [
  '.gitconfig',
  '.gitmodules',
  '.bashrc',
  '.bash_profile',
  '.zshrc',
  '.zprofile',
  '.profile',
  '.ssh/authorized_keys',
  '.ssh/config',
  '.ssh/known_hosts',
  'crontab',
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
];

/** Directories that should never be auto-edited. */
export const DANGEROUS_DIRECTORIES: readonly string[] = [
  '.git',
  '.vscode',
  '.idea',
  '.claude',
  '/etc',
  '/boot',
  '/lib',
  '/lib64',
  '/usr/lib',
  '/usr/bin',
  '/sbin',
  '/bin',
];

// ---------------------------------------------------------------------------
// Path traversal detection
// ---------------------------------------------------------------------------

/**
 * Check if a path contains traversal sequences that escape its base directory.
 *
 * @param relativePath - A path relative to some base directory.
 * @returns `true` if the path contains `..` segments that go above the base.
 */
export function containsPathTraversal(relativePath: string): boolean {
  // Normalize the path (resolve . and .. logically)
  const normalized = path.posix.normalize(relativePath);
  // On POSIX, path.posix.normalize resolves .. segments.
  // If the result starts with '..', it escapes the base.
  return normalized.startsWith('..') || normalized === '..';
}

/**
 * Resolve a path and check for traversal attacks.
 *
 * @param rawPath - The raw path to validate.
 * @param baseDir - The directory this path should stay within.
 * @returns The resolved absolute path, or throws if traversal is detected.
 * @throws {Error} If path traversal is detected.
 */
export function resolveAndValidatePath(rawPath: string, baseDir: string): string {
  const expanded = expandTilde(rawPath);
  const absolute = path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(baseDir, expanded);

  // Verify the resolved path is within the base directory
  const relative = path.relative(baseDir, absolute);
  if (containsPathTraversal(relative) || path.isAbsolute(relative)) {
    throw new Error(
      `Path traversal detected: "${rawPath}" resolves outside base "${baseDir}"`,
    );
  }

  return absolute;
}

// ---------------------------------------------------------------------------
// Tilde expansion
// ---------------------------------------------------------------------------

/**
 * Expand leading `~` or `~/` to the user's home directory.
 * NOTE: `~username` expansion is intentionally NOT supported for security.
 */
export function expandTilde(rawPath: string): string {
  if (rawPath === '~' || rawPath.startsWith('~/') || rawPath.startsWith('~\\')) {
    return path.join(process.env.HOME ?? process.env.USERPROFILE ?? '/tmp', rawPath.slice(1));
  }
  return rawPath;
}

// ---------------------------------------------------------------------------
// Dangerous path detection
// ---------------------------------------------------------------------------

/**
 * Check if a file path is dangerous to auto-edit.
 *
 * This includes:
 * - Files in `.git` directories (data exfil risk)
 * - Shell configuration files (code execution risk)
 * - System configuration files
 *
 * @param filePath - The path to check.
 * @param scopeDirs - Optional list of directories to check segments against.
 */
export function isDangerousFilePath(filePath: string, scopeDirs?: string[]): boolean {
  const absolute = path.resolve(expandTilde(filePath));
  const normalized = absolute.toLowerCase();
  const segments = normalized.split(path.sep);

  // Check for dangerous directory segments
  for (const dir of Array.from(DANGEROUS_DIRECTORIES)) {
    if (segments.includes(dir.toLowerCase())) {
      return true;
    }
  }

  // Check for dangerous file names
  const fileName = path.basename(absolute).toLowerCase();
  for (const dangerous of Array.from(DANGEROUS_FILES)) {
    if (fileName === dangerous.toLowerCase() || normalized.endsWith(dangerous.toLowerCase())) {
      return true;
    }
  }

  // Check scope constraints
  if (scopeDirs && scopeDirs.length > 0) {
    const isWithinScope = scopeDirs.some(scopeDir => {
      const normalizedScope = path.resolve(scopeDir).toLowerCase();
      return normalized.startsWith(normalizedScope + path.sep) || normalized === normalizedScope;
    });
    if (!isWithinScope) {
      return true; // Outside scope = dangerous
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Scope validation
// ---------------------------------------------------------------------------

/**
 * Validate that a path stays within allowed directories.
 *
 * @param filePath - The path to validate.
 * @param allowedDirs - List of directories the path is allowed within.
 * @returns `true` if the path is within at least one allowed directory.
 */
export function isWithinAllowedDirs(filePath: string, allowedDirs: readonly string[]): boolean {
  const absolute = path.resolve(expandTilde(filePath));
  return allowedDirs.some(dir => {
    const normalizedDir = path.resolve(expandTilde(dir));
    return absolute === normalizedDir || absolute.startsWith(normalizedDir + path.sep);
  });
}

// ---------------------------------------------------------------------------
// Dangerous removal paths
// ---------------------------------------------------------------------------

/**
 * Check if a path is dangerous for removal (rm/rmdir) operations.
 * Dangerous removal paths include root, home, system directories.
 */
export function isDangerousRemovalPath(resolvedPath: string): boolean {
  const forward = resolvedPath.replace(/[\\/]+/g, '/');

  if (forward === '*' || forward.endsWith('/*')) return true;
  if (forward === '/') return true;
  if (/^[A-Za-z]:\/?$/.test(forward)) return true; // Windows drive root

  const home = (process.env.HOME ?? '/root').replace(/[\\/]+/g, '/');
  if (forward === home) return true;

  const parentDir = path.dirname(forward);
  if (parentDir === '/') return true; // Direct child of root

  return false;
}

// ---------------------------------------------------------------------------
// Main validation entry point
// ---------------------------------------------------------------------------

/**
 * Validate a file system path for a given operation.
 *
 * @param rawPath - The raw path to validate (may contain ~, globs, etc.).
 * @param cwd - The current working directory.
 * @param allowedDirs - List of directories the path is allowed within.
 * @param operationType - The type of file operation being performed.
 * @returns Validation result with allowed status and optional resolved path.
 */
export function validatePath(
  rawPath: string,
  cwd: string,
  allowedDirs: readonly string[],
  operationType: FileOperationType,
): ResolvedPathCheckResult {
  // Remove surrounding quotes
  const cleanPath = expandTilde(rawPath.replace(/^['"]|['"]$/g, ''));

  // Resolve the absolute path early (needed for ResolvedPathCheckResult)
  const absolutePath = path.isAbsolute(cleanPath)
    ? path.resolve(cleanPath)
    : path.resolve(cwd, cleanPath);
  const isWithinScope = isWithinAllowedDirs(absolutePath, allowedDirs);

  // Block shell expansion syntax in paths
  if (cleanPath.includes('$') || cleanPath.includes('%') || cleanPath.startsWith('=')) {
    return {
      allowed: false,
      resolvedPath: cleanPath,
      absolutePath,
      isWithinScope,
      operation: operationType,
      decisionReason: 'Shell expansion syntax in paths requires manual approval.',
    };
  }

  // Block UNC paths
  if (cleanPath.startsWith('\\\\') || cleanPath.startsWith('//')) {
    return {
      allowed: false,
      resolvedPath: cleanPath,
      absolutePath,
      isWithinScope,
      operation: operationType,
      decisionReason: 'UNC network paths require manual approval.',
    };
  }

  // Block path traversal
  if (cleanPath.includes('..')) {
    if (!isWithinAllowedDirs(absolutePath, allowedDirs)) {
      return {
        allowed: false,
        resolvedPath: absolutePath,
        absolutePath,
        isWithinScope: false,
        operation: operationType,
        decisionReason: 'Path traversal detected: path escapes allowed directories.',
      };
    }
  }

  // Check scope constraints
  if (!isWithinScope) {
    // For read operations, be more permissive (user might want to read /etc/passwd for recon)
    if (operationType === 'read') {
      // Check if it's a dangerous read (like /etc/shadow)
      if (absolutePath.toLowerCase().includes('/etc/shadow')) {
        return {
          allowed: false,
          resolvedPath: absolutePath,
          absolutePath,
          isWithinScope: false,
          operation: operationType,
          decisionReason: 'Sensitive credential files require explicit approval.',
        };
      }
      return {
        allowed: true,
        resolvedPath: absolutePath,
        absolutePath,
        isWithinScope: false,
        operation: operationType,
      };
    }

    return {
      allowed: false,
      resolvedPath: absolutePath,
      absolutePath,
      isWithinScope: false,
      operation: operationType,
      decisionReason: 'Path is outside allowed working directories.',
    };
  }

  // Check for dangerous file operations
  if (operationType === 'write' || operationType === 'create') {
    if (isDangerousFilePath(absolutePath)) {
      return {
        allowed: false,
        resolvedPath: absolutePath,
        absolutePath,
        isWithinScope: true,
        operation: operationType,
        decisionReason: `Path "${absolutePath}" is a sensitive file or directory.`,
      };
    }
  }

  return {
    allowed: true,
    resolvedPath: absolutePath,
    absolutePath,
    isWithinScope: true,
    operation: operationType,
  };
}
