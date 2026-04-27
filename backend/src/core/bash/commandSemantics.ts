/**
 * LEA Command Semantics
 *
 * Analyzes command semantics to determine read/write/network/destructive
 * behavior. Used by the security system to make informed permission decisions.
 *
 * Reimplemented from Claude Code's commandSemantics.ts for LEA.
 */

import type { SemanticCategory, SemanticAnalysis, CommandSpec } from './types.js';
import type { ParsedCommand } from './parser.js';

// ────────────────────────────────────────────────────────────
// Category Classification
// ────────────────────────────────────────────────────────────

/** Commands that are always read-only */
const READ_ONLY_COMMANDS = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'grep', 'rg', 'ag', 'ack',
  'find', 'locate', 'which', 'whereis', 'type', 'file', 'stat',
  'ls', 'll', 'la', 'tree', 'wc', 'sort', 'uniq', 'cut', 'paste',
  'column', 'tr', 'fmt', 'fold', 'nl', 'rev', 'tac', 'pr',
  'diff', 'cmp', 'comm', 'md5sum', 'sha1sum', 'sha256sum', 'sha512sum',
  'base64', 'xxd', 'hexdump', 'od', 'strings', 'strings',
  'echo', 'printf', 'date', 'cal', 'uptime', 'whoami', 'id',
  'uname', 'hostname', 'env', 'printenv', 'export', 'set',
  'docker', 'docker-compose', 'kubectl', 'helm', 'terraform',
  'aws', 'az', 'gcloud', 'oci',
  'dig', 'nslookup', 'host', 'whois', 'ping', 'traceroute',
  'ip', 'ifconfig', 'ss', 'netstat', 'nmap',
  'curl', 'wget', 'httpie', 'http',
  'jq', 'yq', 'xmllint', 'xsltproc',
  'python', 'python3', 'node', 'ruby', 'perl', 'php',
  'openssl', 'gpg', 'ssh-keygen',
]);

/** Commands that are always destructive */
const DESTRUCTIVE_COMMANDS = new Set([
  'rm', 'rmdir', 'shred', 'truncate', 'srm',
  'mkfs', 'mke2fs', 'mkfs.ext4', 'mkfs.xfs', 'mkswap',
  'dd',
  'format',
  'diskutil', 'eraseDisk', 'partitionDisk',
]);

/** Commands that perform network operations */
const NETWORK_COMMANDS = new Set([
  'curl', 'wget', 'httpie', 'http', 'fetch', 'aria2c',
  'nc', 'ncat', 'netcat', 'socat', 'ncat',
  'ssh', 'scp', 'sftp', 'rsync', 'rclone',
  'telnet', 'ftp', 'lftp', 'tftp',
  'ping', 'traceroute', 'tracepath', 'mtr',
  'dig', 'nslookup', 'host', 'whois', 'dnslookup',
  'nmap', 'masscan', 'nikto', 'gobuster', 'ffuf', 'dirb', 'dirbuster',
  'sqlmap', 'hydra', 'wpscan', 'enum4linux', 'smbclient',
  'python', 'python3', 'node', 'ruby', 'perl', 'php',
  'docker', 'kubectl', 'aws', 'az', 'gcloud',
]);

/** Commands that escalate privileges */
const PRIVILEGE_ESCALATION_COMMANDS = new Set([
  'sudo', 'su', 'doas', 'run0', 'pkexec',
  'chroot', 'unshare', 'nsenter',
]);

// ────────────────────────────────────────────────────────────
// Semantic Analysis
// ────────────────────────────────────────────────────────────

/**
 * Analyze the semantics of a list of parsed commands.
 *
 * @param commands - Array of parsed commands
 * @returns Semantic analysis with category, safety flags, and warnings
 */
export function analyzeSemantics(commands: ParsedCommand[]): SemanticAnalysis {
  if (commands.length === 0) {
    return {
      baseCommand: '',
      category: 'info',
      isReadOnly: true,
      isNetwork: false,
      isDestructive: false,
      isPrivilegeEscalation: false,
      warnings: [],
    };
  }

  const primary = commands[0]!;
  const baseCommand = primary.baseCommand;
  const warnings: string[] = [];

  // Determine category
  let category: SemanticCategory = 'execute';
  let isReadOnly = false;
  let isNetwork = false;
  let isDestructive = false;
  let isPrivilegeEscalation = false;

  // Check primary command
  if (READ_ONLY_COMMANDS.has(baseCommand)) {
    category = 'read';
    isReadOnly = true;
  }
  if (DESTRUCTIVE_COMMANDS.has(baseCommand)) {
    category = 'destructive';
    isDestructive = true;
    warnings.push(`Destructive command: ${baseCommand}`);
  }
  if (NETWORK_COMMANDS.has(baseCommand)) {
    category = isDestructive ? category : 'network';
    isNetwork = true;
  }
  if (PRIVILEGE_ESCALATION_COMMANDS.has(baseCommand)) {
    category = isDestructive ? category : 'admin';
    isPrivilegeEscalation = true;
    warnings.push(`Privilege escalation: ${baseCommand}`);
  }

  // Check flags that change semantics
  for (const cmd of commands) {
    if (isDangerousBuiltin(cmd.baseCommand)) {
      isDestructive = true;
      category = 'dangerous';
      warnings.push(`Dangerous builtin: ${cmd.baseCommand}`);
    }
  }

  // Check write operations from flags
  const allArgs = commands.flatMap(c => c.args);
  if (allArgs.includes('-i') && baseCommand === 'sed') {
    isReadOnly = false;
    category = 'write';
  }
  if (allArgs.includes('--write') || allArgs.includes('-w')) {
    isReadOnly = false;
    category = 'write';
  }
  if (allArgs.includes('-o') && baseCommand === 'cat') {
    isReadOnly = false;
    category = 'write';
  }

  return {
    baseCommand,
    category,
    isReadOnly,
    isNetwork,
    isDestructive,
    isPrivilegeEscalation,
    warnings,
  };
}

// ────────────────────────────────────────────────────────────
// Builtin Detection
// ────────────────────────────────────────────────────────────

/**
 * Check if a command is a dangerous shell builtin.
 *
 * @param cmd - The base command name
 * @returns true if the command is a dangerous builtin
 */
export function isDangerousBuiltin(cmd: string): boolean {
  const dangerousBuiltins = new Set([
    'eval', 'exec', 'source', '.', 'builtin', 'command',
    'trap', 'kill', 'killall',
    'set', 'unset', 'export', 'shift',
    'read', 'mapfile', 'readarray',
  ]);

  return dangerousBuiltins.has(cmd);
}

/**
 * Check if a command is an exec call.
 * exec replaces the current shell process.
 *
 * @param cmd - The base command name
 * @returns true if this is an exec call
 */
export function isExecCall(cmd: string): boolean {
  return cmd === 'exec';
}

/**
 * Check if a command is an eval call.
 * eval executes arbitrary strings as shell commands.
 *
 * @param cmd - The base command name
 * @returns true if this is an eval call
 */
export function isEvalCall(cmd: string): boolean {
  return cmd === 'eval';
}

/**
 * Check if a command is a source/include directive.
 * source (or .) executes commands from a file.
 *
 * @param cmd - The base command name
 * @returns true if this is a source/include call
 */
export function isSourceInclude(cmd: string): boolean {
  return cmd === 'source' || cmd === '.';
}
