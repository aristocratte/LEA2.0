/**
 * @module permissions/DangerousPatterns
 * @description Dangerous command detection patterns for the LEA permission system.
 *
 * Adapted for pentest/EA context: destructive system commands are blocked,
 * but common security tools (nmap, sqlmap, nikto, etc.) are allowed.
 */

// ---------------------------------------------------------------------------
// Destructive / system-destroying commands — always dangerous
// ---------------------------------------------------------------------------

/**
 * Shell command prefixes that represent irrecoverable system destruction.
 * These are blocked regardless of context.
 */
export const DANGEROUS_SYSTEM_COMMANDS: readonly string[] = [
  // Full disk destruction
  'dd if=/dev/zero',
  'dd if=/dev/random',
  'mkfs',
  'mkfs.',
  'format',
  // Kernel / bootloader
  'grub-install',
  'update-grub',
  'efibootmgr',
  // System-level destruction
  'rm -rf /',
  'rm -rf /*',
  'rm -rf ~',
  'rm -rf ~/',
  'chmod -R 777 /',
  'chown -R',
  // Firmware / hardware
  'flashrom',
  'biosdevname',
];

/**
 * Code-execution entry points that can run arbitrary code.
 * These are flagged for classifier review in auto mode, but NOT auto-denied.
 */
export const CODE_EXEC_ENTRY_POINTS: readonly string[] = [
  'python',
  'python3',
  'python2',
  'node',
  'deno',
  'tsx',
  'ruby',
  'perl',
  'php',
  'lua',
  'npx',
  'bunx',
  'npm run',
  'yarn run',
  'pnpm run',
  'bun run',
  'bash',
  'sh',
  'zsh',
  'fish',
  'eval',
  'exec',
  'sudo',
  'ssh',
];

/**
 * Commands that are ALWAYS considered safe in LEA's pentest context.
 * These are security tools the agent is expected to use.
 */
export const SAFE_PENTEST_COMMANDS: readonly string[] = [
  'nmap',
  'sqlmap',
  'nikto',
  'dirb',
  'dirbuster',
  'gobuster',
  'ffuf',
  'wfuzz',
  'hydra',
  'john',
  'hashcat',
  'aircrack-ng',
  'bettercap',
  'responder',
  'impacket-',
  'netexec',
  'crackmapexec',
  'enum4linux',
  'smbclient',
  'rpcclient',
  'ldapsearch',
  'dig',
  'nslookup',
  'host',
  'whois',
  'subfinder',
  'amass',
  'httpx',
  'nuclei',
  'naabu',
  'katana',
  'uncover',
  'theHarvester',
  'wpscan',
  'joomscan',
  'droopescan',
  'wafw00f',
  'whatweb',
  'sslyze',
  'testssl',
  'enum4linux-ng',
  'linpeas',
  'linenum',
  'linuxprivchecker',
  'winpeas',
  'lse',
  'pspy',
  'lsof',
  'netstat',
  'ss',
  'ip',
  'tcpdump',
  'tshark',
  'wireshark',
  'curl',
  'wget',
  'jq',
  'grep',
  'find',
  'which',
  'file',
  'strings',
  'xxd',
  'base64',
  'openssl',
  'gpg',
  'ssh-keygen',
  'ssh-copy-id',
  'scp',
  'rsync',
  'git',
  'git clone',
  'git log',
  'git diff',
  'git show',
];

/**
 * Commands that elevate privileges or modify security posture.
 * Require explicit approval in all modes.
 */
export const PRIVILEGE_ESCALATION_COMMANDS: readonly string[] = [
  'sudo',
  'su ',
  'doas',
  'pkexec',
  'run0',
  'chroot',
  'unshare',
  'nsenter',
  'setarch',
  'setpriv',
  'newgrp',
];

/**
 * Check if a command matches a destructive system command pattern.
 *
 * @param command - The full shell command to check.
 * @returns `true` if the command matches a known destructive pattern.
 */
export function isDangerousSystemCommand(command: string): boolean {
  const base = command.trim();
  return DANGEROUS_SYSTEM_COMMANDS.some(pattern => base.includes(pattern));
}

/**
 * Check if a command matches a code-execution entry point.
 * This doesn't mean the command is blocked — it means it needs classifier review.
 */
export function isCodeExecEntryPoint(command: string): boolean {
  const base = command.trim();
  return CODE_EXEC_ENTRY_POINTS.some(pattern => {
    return base === pattern || base.startsWith(pattern + ' ') || base.startsWith(pattern + ':');
  });
}

/**
 * Check if a command is a known-safe pentest tool.
 */
export function isSafePentestCommand(command: string): boolean {
  const base = command.trim();
  return SAFE_PENTEST_COMMANDS.some(pattern => {
    return base === pattern || base.startsWith(pattern + ' ');
  });
}

/**
 * Check if a command involves privilege escalation.
 */
export function isPrivilegeEscalation(command: string): boolean {
  const base = command.trim();
  return PRIVILEGE_ESCALATION_COMMANDS.some(pattern => {
    return base.startsWith(pattern) && base.length > pattern.length;
  });
}

/**
 * Classify the risk of a shell command.
 */
export type CommandRiskLevel = 'safe' | 'moderate' | 'dangerous' | 'destructive';

export function classifyCommandRisk(command: string): {
  level: CommandRiskLevel;
  reason: string;
} {
  if (isDangerousSystemCommand(command)) {
    return { level: 'destructive', reason: 'Matches a known destructive system command pattern.' };
  }

  if (isPrivilegeEscalation(command)) {
    return { level: 'dangerous', reason: 'Command involves privilege escalation.' };
  }

  // rm -rf on non-root paths is dangerous but not system-destructive
  if (/rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--force|--recursive)/.test(command)) {
    if (!command.includes('/home/') && !command.includes('/tmp/') && !command.includes('/var/')) {
      return { level: 'dangerous', reason: 'Recursive force delete on potentially sensitive path.' };
    }
  }

  if (isCodeExecEntryPoint(command) && !isSafePentestCommand(command)) {
    return { level: 'moderate', reason: 'Command executes arbitrary code via an interpreter.' };
  }

  return { level: 'safe', reason: 'Command does not match any dangerous patterns.' };
}
