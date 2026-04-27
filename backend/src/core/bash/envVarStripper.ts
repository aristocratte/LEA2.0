/**
 * LEA Environment Variable Stripper
 *
 * Strips safe environment variable prefixes from commands and detects
 * dangerous env vars that could be used for binary hijacking.
 *
 * Reimplemented from Claude Code's bashPermissions.ts stripSafeWrappers.
 */

import { tryParseShellCommand } from './shellQuote.js';

// ────────────────────────────────────────────────────────────
// Safe Environment Variables
// ────────────────────────────────────────────────────────────

/**
 * Environment variables that are considered safe to pass through.
 * These are standard system variables that don't pose security risks.
 */
export const SAFE_ENV_VARS = new Set([
  'HOME',
  'PATH',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'LC_MESSAGES',
  'LC_COLLATE',
  'LC_NUMERIC',
  'LC_TIME',
  'LC_MONETARY',
  'TERM',
  'SHELL',
  'USER',
  'LOGNAME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'DISPLAY',
  'XAUTHORITY',
  'EDITOR',
  'VISUAL',
  'PAGER',
  'LESS',
  'LESSOPEN',
  'LESSCLOSE',
  'MANPATH',
  'INFOPATH',
  'HOSTNAME',
  'HOSTTYPE',
  'OSTYPE',
  'MACHTYPE',
  'PWD',
  'OLDPWD',
  'SHLVL',
  'TZ',
  'MAIL',
  'MAILPATH',
  'PS1',
  'PS2',
  'PROMPT_COMMAND',
  'HISTSIZE',
  'HISTFILE',
  'HISTCONTROL',
  'INPUTRC',
  'DOTFILES_DIR',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'XDG_STATE_HOME',
  'XDG_RUNTIME_DIR',
  'COLORTERM',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'NVM_DIR',
  'NODE_PATH',
  'NPM_CONFIG_PREFIX',
  'PYTHONPATH',
  'PYTHONIOENCODING',
  'JAVA_HOME',
  'GOPATH',
  'GOROOT',
  'CARGO_HOME',
  'RUSTUP_HOME',
  'DOCKER_HOST',
  'KUBECONFIG',
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
  'GPG_TTY',
  'AGENT_PID',
  'WINDOWID',
  'COLORFGBG',
  'LS_COLORS',
  'LS_OPTIONS',
  'ZSH_VERSION',
  'BASH_VERSION',
  'ZDOTDIR',
  'FZF_DEFAULT_OPTS',
  'FZF_DEFAULT_COMMAND',
  'RIPGREP_CONFIG_PATH',
  'BAT_STYLE',
  'BAT_THEME',
]);

// ────────────────────────────────────────────────────────────
// Dangerous Environment Variables (Binary Hijacking)
// ────────────────────────────────────────────────────────────

/**
 * Environment variables that can be used for binary hijacking or
 * library injection attacks.
 */
export const BINARY_HIJACK_VARS = new Set([
  'LD_PRELOAD',         // Pre-load shared libraries (Linux)
  'LD_LIBRARY_PATH',    // Dynamic library search path (Linux)
  'DYLD_INSERT_LIBRARIES',  // Pre-load dylibs (macOS)
  'DYLD_FRAMEWORK_PATH',    // Framework search path (macOS)
  'DYLD_LIBRARY_PATH',      // Dylib search path (macOS)
  'DYLD_ROOT_PATH',         // Root path for dylibs (macOS)
  'PERL5LIB',           // Perl library path
  'PYTHONSTARTUP',      // Python startup script
  'RUBYLIB',            // Ruby library path
  'NODE_OPTIONS',       // Node.js options (can inject code)
  'CLASSPATH',          // Java classpath
  'GI_TYPELIB_PATH',    // GLib typelib path
  'GIO_MODULE_DIR',     // GIO module directory
  'GST_PLUGIN_PATH',    // GStreamer plugin path
  'QT_PLUGIN_PATH',     // Qt plugin path
  'ASAN_OPTIONS',       // AddressSanitizer options
  'LSAN_OPTIONS',       // LeakSanitizer options
  'MSAN_OPTIONS',       // MemorySanitizer options
  'TSAN_OPTIONS',       // ThreadSanitizer options
  'UBSAN_OPTIONS',      // UndefinedBehaviorSanitizer options
  'MallocNanoZone',     // macOS malloc zone
  'MALLOC_CONF',        // jemalloc configuration
  'SSL_CERT_FILE',      // Custom SSL cert (MITM vector)
  'SSL_CERT_DIR',       // Custom SSL cert directory (MITM vector)
  'CURL_CA_BUNDLE',     // Custom CA bundle for curl (MITM vector)
  'REQUESTS_CA_BUNDLE', // Custom CA bundle for requests (MITM vector)
  'NODE_TLS_REJECT_UNAUTHORIZED', // Disable TLS verification
  'NODE_EXTRA_CA_CERTS',          // Add custom CAs
]);

/**
 * Variables that modify PATH in ways that could hijack binaries.
 */
export const PATH_MODIFICATION_VARS = new Set([
  'PATH',
  'PYTHONPATH',
  'PERL5LIB',
  'RUBYLIB',
  'NODE_PATH',
  'CLASSPATH',
  'LD_LIBRARY_PATH',
  'DYLD_LIBRARY_PATH',
  'PKG_CONFIG_PATH',
  'CMAKE_PREFIX_PATH',
]);

// ────────────────────────────────────────────────────────────
// Stripping Functions
// ────────────────────────────────────────────────────────────

/**
 * Strip safe environment variable prefixes from a command string.
 *
 * Removes `VAR=value command` prefixes where VAR is in SAFE_ENV_VARS.
 * Leaves dangerous vars intact so they can be flagged by security checks.
 *
 * @param command - The command string with possible env var prefixes
 * @returns Command string with safe env var prefixes removed
 */
export function stripSafeEnvVars(command: string): string {
  const result = tryParseShellCommand(command);
  if (!result.success) return command;

  const tokens = result.tokens;
  if (tokens.length === 0) return command;

  let startIndex = 0;

  // Walk through tokens looking for VAR=value patterns at the start
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (typeof token !== 'string') break;

    const eqIndex = token.indexOf('=');
    if (eqIndex === -1) break;

    const varName = token.slice(0, eqIndex);
    if (!SAFE_ENV_VARS.has(varName)) break;

    startIndex = i + 1;
  }

  if (startIndex === 0) return command;

  // Reconstruct without the safe prefixes
  const remaining = tokens
    .slice(startIndex)
    .filter((t): t is string => typeof t === 'string')
    .join(' ');

  return remaining || command;
}

/**
 * Strip all leading environment variable prefixes from a command.
 *
 * @param command - The command string
 * @returns Object with extracted variables and remaining command
 */
export function stripEnvVarPrefix(command: string): {
  vars: Map<string, string>;
  remainingCommand: string;
} {
  const vars = new Map<string, string>();
  const result = tryParseShellCommand(command);
  if (!result.success) return { vars, remainingCommand: command };

  const tokens = result.tokens;
  let startIndex = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (typeof token !== 'string') break;

    const eqIndex = token.indexOf('=');
    if (eqIndex === -1 || eqIndex === 0) break;

    const varName = token.slice(0, eqIndex);
    const varValue = token.slice(eqIndex + 1);

    // Skip if the name doesn't look like a valid variable
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(varName)) break;

    vars.set(varName, varValue);
    startIndex = i + 1;
  }

  const remaining = tokens
    .slice(startIndex)
    .filter((t): t is string => typeof t === 'string')
    .join(' ');

  return {
    vars,
    remainingCommand: remaining || command,
  };
}

/**
 * Check if an environment variable name is dangerous.
 *
 * @param name - The environment variable name
 * @returns true if the variable is dangerous (hijacking / injection)
 */
export function isDangerousEnvVar(name: string): boolean {
  // Check exact match against hijack vars
  if (BINARY_HIJACK_VARS.has(name)) return true;

  // Check for DYLD_* patterns (macOS dynamic linker)
  if (name.startsWith('DYLD_')) return true;

  // Check for LD_* patterns (Linux dynamic linker)
  if (name.startsWith('LD_')) return true;

  // Check for variables that commonly disable security features
  const dangerousPrefixes = [
    'GNOME_KEYRING_',
    'KDEHOME_',
    'DBUS_',
    'XAUTHORITY_OVERRIDE',
    'DISPLAY_OVERRIDE',
    '__PYVENV_',
  ];
  for (const prefix of Array.from(dangerousPrefixes)) {
    if (name.startsWith(prefix)) return true;
  }

  return false;
}

/**
 * Check if an env var assignment modifies PATH in a dangerous way.
 *
 * @param name - The variable name
 * @param value - The variable value
 * @returns true if this is a dangerous PATH modification
 */
export function isDangerousPathModification(name: string, value: string): boolean {
  if (name !== 'PATH') return false;

  // Check for PATH starting with a relative or writable directory
  const dirs = value.split(':');
  for (const dir of dirs) {
    const trimmed = dir.trim();
    if (!trimmed) continue;

    // Relative paths could inject binaries
    if (!trimmed.startsWith('/') && !trimmed.startsWith('$')) {
      return true;
    }

    // /tmp or /var/tmp in PATH is suspicious
    if (trimmed.startsWith('/tmp') || trimmed.startsWith('/var/tmp')) {
      return true;
    }

    // Dot at the end or start (current directory in PATH)
    if (trimmed === '.' || trimmed === '..') {
      return true;
    }
  }

  return false;
}
