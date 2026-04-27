/**
 * LEA Command Registry
 *
 * Registry of known shell commands with their metadata (category,
 * flags, dangerous patterns). Used for semantic analysis and
 * security validation.
 *
 * Pre-registers pentest tool specs for LEA's security testing context.
 */

import type { CommandSpec, SemanticCategory } from './types.js';

// ────────────────────────────────────────────────────────────
// ShellCommandSpec (extended with LEA-specific fields)
// ────────────────────────────────────────────────────────────

/**
 * Extended command specification with LEA-specific fields.
 */
export interface ShellCommandSpec extends CommandSpec {
  /** Whether this is a pentest/security tool */
  isPentestTool?: boolean;
  /** Risk level for this tool */
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  /** Default description for UI display */
  pentestDescription?: string;
}

// ────────────────────────────────────────────────────────────
// CommandRegistry
// ────────────────────────────────────────────────────────────

/**
 * Registry of known shell commands with metadata.
 *
 * Provides command lookup, spec retrieval, and listing. Pre-populated
 * with common pentest tools and standard Unix commands.
 */
export class CommandRegistry {
  private specs = new Map<string, ShellCommandSpec>();
  private aliasMap = new Map<string, string>();

  /**
   * Register a command specification.
   *
   * @param name - The primary command name
   * @param spec - The command specification
   */
  register(name: string, spec: Omit<ShellCommandSpec, 'name'>): void {
    const fullSpec: ShellCommandSpec = { name, ...spec };
    this.specs.set(name, fullSpec);

    // Register aliases
    if (spec.aliases) {
      for (const alias of spec.aliases) {
        this.aliasMap.set(alias, name);
      }
    }
  }

  /**
   * Get a command specification by name or alias.
   *
   * @param name - The command name or alias
   * @returns The command spec, or undefined if not found
   */
  get(name: string): ShellCommandSpec | undefined {
    // Direct lookup
    const spec = this.specs.get(name);
    if (spec) return spec;

    // Alias lookup
    const primary = this.aliasMap.get(name);
    if (primary) return this.specs.get(primary);

    return undefined;
  }

  /**
   * List all registered commands.
   *
   * @returns Array of all registered command specs
   */
  list(): ShellCommandSpec[] {
    return Array.from(this.specs.values());
  }

  /**
   * List commands by category.
   *
   * @param category - The semantic category to filter by
   * @returns Array of commands in the category
   */
  listByCategory(category: SemanticCategory): ShellCommandSpec[] {
    return this.list().filter(spec => spec.category === category);
  }

  /**
   * List all pentest tools.
   */
  listPentestTools(): ShellCommandSpec[] {
    return this.list().filter(spec => spec.isPentestTool);
  }

  /**
   * Check if a command name is known.
   */
  has(name: string): boolean {
    return this.specs.has(name) || this.aliasMap.has(name);
  }

  /**
   * Get the number of registered commands.
   */
  get size(): number {
    return this.specs.size;
  }
}

// ────────────────────────────────────────────────────────────
// Pre-registered Pentest Tool Specs
// ────────────────────────────────────────────────────────────

/**
 * Create a default CommandRegistry pre-populated with common commands
 * and pentest tools.
 */
export function createDefaultRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  // ── Pentest Tools ──

  registry.register('nmap', {
    category: 'network',
    network: true,
    isPentestTool: true,
    riskLevel: 'medium',
    pentestDescription: 'Network port scanner and service detection',
    description: 'Network exploration tool and security/port scanner',
    dangerousFlags: ['--script', '--script-args'],
    warningFlags: [
      { flag: '-sS', message: 'SYN scan (requires root)' },
      { flag: '-sU', message: 'UDP scan' },
    ],
  });

  registry.register('sqlmap', {
    category: 'network',
    network: true,
    isPentestTool: true,
    riskLevel: 'high',
    pentestDescription: 'Automated SQL injection tool',
    description: 'Automatic SQL injection and database takeover tool',
    dangerousFlags: ['--batch', '--dump-all', '--os-shell'],
    aliases: ['sqlmap.py'],
  });

  registry.register('nikto', {
    category: 'network',
    network: true,
    isPentestTool: true,
    riskLevel: 'medium',
    pentestDescription: 'Web server vulnerability scanner',
    description: 'Web server scanner for dangerous files and misconfigurations',
    aliases: ['nikto.pl'],
  });

  registry.register('gobuster', {
    category: 'network',
    network: true,
    isPentestTool: true,
    riskLevel: 'medium',
    pentestDescription: 'Directory/file/DNS brute-forcer',
    description: 'Directory/file and DNS brute-forcer',
    aliases: ['gobuster-dir', 'gobuster-dns', 'gobuster-vhost', 'gobuster-s3'],
  });

  registry.register('ffuf', {
    category: 'network',
    network: true,
    isPentestTool: true,
    riskLevel: 'medium',
    pentestDescription: 'Fast web fuzzer',
    description: 'Fast web fuzzer written in Go',
  });

  registry.register('hydra', {
    category: 'network',
    network: true,
    isPentestTool: true,
    riskLevel: 'high',
    pentestDescription: 'Online password brute-force tool',
    description: 'Fast and flexible online password cracking tool',
    dangerousFlags: ['-w', '-L', '-P'],
  });

  registry.register('wpscan', {
    category: 'network',
    network: true,
    isPentestTool: true,
    riskLevel: 'medium',
    pentestDescription: 'WordPress vulnerability scanner',
    description: 'WordPress security scanner',
    aliases: ['wpscan.rb'],
    dangerousFlags: ['--passwords', '--usernames', '--ap', '--u'],
  });

  registry.register('dirb', {
    category: 'network',
    network: true,
    isPentestTool: true,
    riskLevel: 'medium',
    pentestDescription: 'Web content scanner',
    description: 'Web content scanner (directory brute-forcer)',
  });

  registry.register('enum4linux', {
    category: 'network',
    network: true,
    isPentestTool: true,
    riskLevel: 'medium',
    pentestDescription: 'SMB/NetBIOS enumeration tool',
    description: 'Tool for enumerating data from Windows and Samba hosts',
    aliases: ['enum4linux-ng', 'enum4linux.pl'],
  });

  registry.register('smbclient', {
    category: 'network',
    network: true,
    isPentestTool: true,
    riskLevel: 'medium',
    pentestDescription: 'SMB/CIFS client',
    description: 'FTP-like client to access SMB/CIFS resources',
    dangerousFlags: ['-c', '--command'],
  });

  // ── Standard Security Tools ──

  registry.register('curl', {
    category: 'network',
    network: true,
    readOnly: true,
    description: 'Command-line tool for transferring data with URL syntax',
    warningFlags: [
      { flag: '-d', message: 'Sends POST data' },
      { flag: '-X', message: 'Custom request method' },
    ],
  });

  registry.register('wget', {
    category: 'network',
    network: true,
    description: 'Non-interactive network downloader',
    warningFlags: [
      { flag: '--post-data', message: 'Sends POST data' },
      { flag: '-O', message: 'Writes output to file' },
    ],
  });

  registry.register('ssh', {
    category: 'network',
    network: true,
    description: 'Secure shell client',
    destructive: false,
  });

  registry.register('nc', {
    category: 'network',
    network: true,
    aliases: ['ncat', 'netcat'],
    description: 'Networking utility for reading/writing across TCP/UDP',
    riskLevel: 'medium',
  });

  registry.register('openssl', {
    category: 'network',
    readOnly: true,
    description: 'OpenSSL cryptographic toolkit',
  });

  // ── File Commands ──

  registry.register('cat', {
    category: 'read',
    readOnly: true,
    description: 'Concatenate and print files',
    warningFlags: [{ flag: /-o/, message: 'Writes output to file' }],
  });

  registry.register('rm', {
    category: 'destructive',
    destructive: true,
    description: 'Remove files or directories',
    dangerousFlags: ['-rf', '-r', '-f'],
  });

  registry.register('chmod', {
    category: 'admin',
    destructive: true,
    description: 'Change file mode bits',
    warningFlags: [{ flag: /777/, message: 'World-writable permissions' }],
  });

  registry.register('chown', {
    category: 'admin',
    destructive: true,
    description: 'Change file owner and group',
  });

  registry.register('cp', {
    category: 'write',
    description: 'Copy files',
  });

  registry.register('mv', {
    category: 'write',
    destructive: true,
    description: 'Move or rename files',
  });

  registry.register('find', {
    category: 'read',
    readOnly: true,
    description: 'Search for files in a directory hierarchy',
    warningFlags: [
      { flag: '-delete', message: 'Deletes found files' },
      { flag: '-exec', message: 'Executes commands on found files' },
    ],
  });

  registry.register('grep', {
    category: 'read',
    readOnly: true,
    aliases: ['rg', 'ag', 'ack'],
    description: 'Search for patterns in text',
  });

  registry.register('sed', {
    category: 'write',
    description: 'Stream editor for filtering and transforming text',
    warningFlags: [{ flag: '-i', message: 'In-place editing (modifies files)' }],
  });

  registry.register('awk', {
    category: 'read',
    readOnly: true,
    description: 'Pattern scanning and text processing language',
  });

  registry.register('dd', {
    category: 'destructive',
    destructive: true,
    description: 'Convert and copy a file (can destroy data)',
    riskLevel: 'high',
  });

  return registry;
}
