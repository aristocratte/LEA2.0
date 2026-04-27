/**
 * Exit code semantics for bash commands.
 *
 * Many commands use exit codes to convey information beyond success/failure.
 * This module provides command-specific interpretations of exit codes.
 *
 * Inspired by claude-code's commandSemantics.ts.
 */

export interface ExitCodeInterpretation {
  /** Whether this exit code represents an actual error */
  isError: boolean;
  /** Human-readable description of what the exit code means */
  message?: string;
  /** Whether this is a semantic "success" (e.g., grep found no matches) */
  isSemanticSuccess?: boolean;
}

export type ExitCodeSemanticFn = (
  exitCode: number,
  stdout: string,
  stderr: string,
) => ExitCodeInterpretation;

// --- Default: only 0 is success ---
const DEFAULT_SEMANTIC: ExitCodeSemanticFn = (exitCode) => ({
  isError: exitCode !== 0,
  message: exitCode !== 0 ? `Command failed with exit code ${exitCode}` : undefined,
});

// --- Command-specific semantics ---
const COMMAND_SEMANTICS = new Map<string, ExitCodeSemanticFn>([
  // grep: 0=matches found, 1=no matches, 2+=error
  ['grep', (exitCode) => ({
    isError: exitCode >= 2,
    message: exitCode === 1 ? 'No matches found' : undefined,
    isSemanticSuccess: exitCode <= 1,
  })],

  // ripgrep: same as grep
  ['rg', (exitCode) => ({
    isError: exitCode >= 2,
    message: exitCode === 1 ? 'No matches found' : undefined,
    isSemanticSuccess: exitCode <= 1,
  })],

  // find: 0=success, 1=partial (some dirs inaccessible), 2+=error
  ['find', (exitCode) => ({
    isError: exitCode >= 2,
    message: exitCode === 1 ? 'Some directories were inaccessible' : undefined,
    isSemanticSuccess: exitCode <= 1,
  })],

  // diff: 0=no differences, 1=differences found, 2+=error
  ['diff', (exitCode) => ({
    isError: exitCode >= 2,
    message: exitCode === 1 ? 'Files differ' : undefined,
    isSemanticSuccess: exitCode <= 1,
  })],

  // test/[: 0=true, 1=false, 2+=error
  ['test', (exitCode) => ({
    isError: exitCode >= 2,
    message: exitCode === 1 ? 'Condition is false' : undefined,
    isSemanticSuccess: exitCode <= 1,
  })],

  // [ is alias for test
  ['[', (exitCode) => ({
    isError: exitCode >= 2,
    message: exitCode === 1 ? 'Condition is false' : undefined,
    isSemanticSuccess: exitCode <= 1,
  })],

  // git: various codes
  ['git', (exitCode, _stdout, stderr) => {
    // git merge: 1=conflicts
    if (exitCode === 1 && stderr.includes('CONFLICT')) {
      return { isError: true, message: 'Merge conflicts detected' };
    }
    return { isError: exitCode !== 0 };
  }],

  // curl: various codes
  ['curl', (exitCode) => {
    // Common curl exit codes
    const messages: Record<number, string> = {
      6: 'Could not resolve host',
      7: 'Failed to connect to host',
      22: 'HTTP error (4xx/5xx)',
      28: 'Operation timed out',
      35: 'SSL connect error',
      60: 'SSL certificate problem',
    };
    return {
      isError: exitCode !== 0,
      message: messages[exitCode],
    };
  }],

  // wget: similar to curl
  ['wget', (exitCode) => ({
    isError: exitCode !== 0,
    message: exitCode === 4 ? 'Network failure' : exitCode === 8 ? 'Server error' : undefined,
  })],

  // ssh: various codes
  ['ssh', (exitCode) => ({
    isError: exitCode !== 0,
    message: exitCode === 255 ? 'SSH connection failed' : undefined,
  })],

  // nmap: 0=success, various others
  ['nmap', (exitCode) => ({
    isError: exitCode !== 0,
    message: 'Nmap scan reported issues',
  })],

  // timeout: 124=timed out, 125=wrong, 126=not executable, 127=not found
  ['timeout', (exitCode) => ({
    isError: exitCode !== 0 && exitCode !== 124,
    message: exitCode === 124 ? 'Command timed out' : undefined,
    isSemanticSuccess: exitCode === 124, // timeout itself is not necessarily an error
  })],

  // which/whereis: 1=not found
  ['which', (exitCode) => ({
    isError: exitCode !== 0,
    message: exitCode === 1 ? 'Command not found in PATH' : undefined,
  })],

  ['whereis', (exitCode) => ({
    isError: exitCode !== 0,
  })],

  // ping: 0=reachable, 1=unreachable, 2+=error
  ['ping', (exitCode) => ({
    isError: exitCode >= 2,
    message: exitCode === 1 ? 'Host unreachable' : undefined,
    isSemanticSuccess: exitCode <= 1,
  })],
]);

/**
 * Get the exit code interpretation for a command.
 * Falls back to default semantics if the command has no specific handler.
 */
export function interpretExitCode(
  command: string,
  exitCode: number,
  stdout: string = '',
  stderr: string = '',
): ExitCodeInterpretation {
  const semantic = COMMAND_SEMANTICS.get(command);
  if (semantic) {
    return semantic(exitCode, stdout, stderr);
  }
  return DEFAULT_SEMANTIC(exitCode, stdout, stderr);
}

/**
 * Determine the status string for a completed command.
 */
export function getCommandStatus(
  command: string,
  exitCode: number,
  stdout: string = '',
  stderr: string = '',
): 'completed' | 'failed' | 'completed_with_warning' {
  const interpretation = interpretExitCode(command, exitCode, stdout, stderr);

  if (interpretation.isError) {
    // If it's a semantic success despite being an error, treat as warning
    if (interpretation.isSemanticSuccess) {
      return 'completed_with_warning';
    }
    return 'failed';
  }

  // Not an error — if exit code is non-zero but isSemanticSuccess, it's a warning
  if (exitCode !== 0 && interpretation.isSemanticSuccess) {
    return 'completed_with_warning';
  }

  return 'completed';
}

/**
 * Get all commands that have specific exit code semantics.
 */
export function getSupportedCommands(): string[] {
  return Array.from(COMMAND_SEMANTICS.keys());
}
