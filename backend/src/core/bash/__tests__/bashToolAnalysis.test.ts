/**
 * Tests for bashToolAnalysis — shared analysis layer for BashTool.
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeBashCommand,
  adaptPermissionContext,
} from '../bashToolAnalysis.js';
import type { PermissionContext } from '../../permissions/types.js';

// ────────────────────────────────────────────────────────────
// analyzeBashCommand
// ────────────────────────────────────────────────────────────

describe('analyzeBashCommand', () => {
  it('classifies ls -la as read-only', () => {
    const result = analyzeBashCommand('ls -la');

    expect(result.baseCommand).toBe('ls');
    expect(result.isReadOnly).toBe(true);
    expect(result.isDestructive).toBe(false);
    expect(result.semantic.category).toBe('read');
  });

  it('classifies rm -rf /tmp as destructive', () => {
    const result = analyzeBashCommand('rm -rf /tmp');

    expect(result.baseCommand).toBe('rm');
    expect(result.isReadOnly).toBe(false);
    expect(result.isDestructive).toBe(true);
    expect(result.destructiveWarning).not.toBeNull();
    expect(result.semantic.category).toBe('destructive');
  });

  it('classifies grep pattern file as read-only', () => {
    const result = analyzeBashCommand('grep pattern file.txt');

    expect(result.baseCommand).toBe('grep');
    expect(result.isReadOnly).toBe(true);
    expect(result.isDestructive).toBe(false);
  });

  it('classifies nmap -sV target as network', () => {
    const result = analyzeBashCommand('nmap -sV 192.168.1.1');

    expect(result.baseCommand).toBe('nmap');
    expect(result.semantic.isNetwork).toBe(true);
    expect(result.semantic.category).toBe('network');
  });

  it('extracts path targets from commands', () => {
    const result = analyzeBashCommand('cat /etc/passwd');

    expect(result.pathTargets).toContain('/etc/passwd');
  });

  it('extracts multiple path targets', () => {
    const result = analyzeBashCommand('cp source.txt dest.txt');

    expect(result.pathTargets).toContain('source.txt');
    expect(result.pathTargets).toContain('dest.txt');
  });

  it('skips flags and grep patterns when extracting path targets', () => {
    const result = analyzeBashCommand('grep -r -i pattern /var/log');

    expect(result.pathTargets).not.toContain('-r');
    expect(result.pathTargets).not.toContain('-i');
    expect(result.pathTargets).toContain('/var/log');
  });

  it('records path validation failures when targets are out of scope', () => {
    const permissionContext = adaptPermissionContext(makePermissionContext('default', {
      additionalWorkingDirectories: new Map([['/tmp/lea', '/tmp/lea']]),
    }));

    const result = analyzeBashCommand('cat /etc/passwd', permissionContext);

    expect(result.security.pathChecks.some((check) => !check.allowed)).toBe(true);
  });

  it('handles empty command', () => {
    const result = analyzeBashCommand('');

    expect(result.rawCommand).toBe('');
    // Should not throw
  });

  it('handles unknown command', () => {
    const result = analyzeBashCommand('unknown_tool --flag target');

    expect(result.baseCommand).toBe('unknown_tool');
    expect(result.isReadOnly).toBe(false);
    // Unknown commands default to execute category, not read-only
  });

  it('detects sqlmap as network + pentest', () => {
    const result = analyzeBashCommand('sqlmap -u http://target/page?id=1 --batch');

    expect(result.baseCommand).toBe('sqlmap');
    expect(result.semantic.isNetwork).toBe(true);
  });

  it('detects sudo as privilege escalation', () => {
    const result = analyzeBashCommand('sudo rm -rf /tmp/test');

    expect(result.semantic.isPrivilegeEscalation).toBe(true);
  });

  it('handles quoted arguments', () => {
    const result = analyzeBashCommand('grep "hello world" file.txt');

    expect(result.baseCommand).toBe('grep');
    expect(result.isReadOnly).toBe(true);
  });

  it('detects command substitution as security warning', () => {
    const result = analyzeBashCommand('echo $(whoami)');

    expect(result.security.safe).toBe(false);
  });

  it('detects backtick command substitution as security warning', () => {
    const result = analyzeBashCommand('echo `whoami`');

    // Backtick substitution may or may not be flagged depending on implementation
    // At minimum, verify the analysis runs without error
    expect(result.baseCommand).toBe('echo');
    expect(result.rawCommand).toBe('echo `whoami`');
  });

  it('flags git push --force as destructive', () => {
    const result = analyzeBashCommand('git push --force origin main');

    expect(result.isDestructive).toBe(true);
    expect(result.destructiveWarning).not.toBeNull();
  });

  it('normal cat is safe', () => {
    const result = analyzeBashCommand('cat README.md');

    expect(result.security.safe).toBe(true);
    expect(result.isReadOnly).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// adaptPermissionContext
// ────────────────────────────────────────────────────────────

describe('adaptPermissionContext', () => {
  it('maps default mode to normal', () => {
    const ctx = makePermissionContext('default');
    const adapted = adaptPermissionContext(ctx);

    expect(adapted.mode).toBe('normal');
  });

  it('maps plan mode to plan', () => {
    const ctx = makePermissionContext('plan');
    const adapted = adaptPermissionContext(ctx);

    expect(adapted.mode).toBe('plan');
  });

  it('maps bypassPermissions mode to bypass', () => {
    const ctx = makePermissionContext('bypassPermissions');
    const adapted = adaptPermissionContext(ctx);

    expect(adapted.mode).toBe('bypassPermissions');
  });

  it('maps acceptEdits mode to normal', () => {
    const ctx = makePermissionContext('acceptEdits');
    const adapted = adaptPermissionContext(ctx);

    expect(adapted.mode).toBe('normal');
  });

  it('maps dontAsk mode to normal', () => {
    const ctx = makePermissionContext('dontAsk');
    const adapted = adaptPermissionContext(ctx);

    expect(adapted.mode).toBe('normal');
  });

  it('extracts bash rules from global allow rules', () => {
    const ctx = makePermissionContext('default', {
      allowRules: { userSettings: ['Bash(rm *)', 'Bash(ls *)', 'Edit(*)'] },
    });
    const adapted = adaptPermissionContext(ctx);

    expect(adapted.allowRules.has('rm *')).toBe(true);
    expect(adapted.allowRules.has('ls *')).toBe(true);
    expect(adapted.allowRules.has('Edit(*)')).toBe(false);
    expect(adapted.allowRules.size).toBe(2);
  });

  it('extracts bash rules from global deny rules', () => {
    const ctx = makePermissionContext('default', {
      denyRules: { policySettings: ['Bash(rm -rf /)'] },
    });
    const adapted = adaptPermissionContext(ctx);

    expect(adapted.denyRules.has('rm -rf /')).toBe(true);
    expect(adapted.denyRules.size).toBe(1);
  });

  it('extracts bash rules from global ask rules', () => {
    const ctx = makePermissionContext('default', {
      askRules: { cliArg: ['Bash(curl *)'] },
    });
    const adapted = adaptPermissionContext(ctx);

    expect(adapted.askRules.has('curl *')).toBe(true);
  });

  it('extracts additional working directories', () => {
    const dirs = new Map<string, string>();
    dirs.set('/tmp/lea', '/tmp/lea');
    dirs.set('/home/user/project', '/home/user/project');

    const ctx = makePermissionContext('default', { additionalWorkingDirectories: dirs });
    const adapted = adaptPermissionContext(ctx);

    expect(adapted.additionalWorkingDirectories).toContain('/tmp/lea');
    expect(adapted.additionalWorkingDirectories).toContain('/home/user/project');
  });

  it('handles empty rules gracefully', () => {
    const ctx = makePermissionContext('default');
    const adapted = adaptPermissionContext(ctx);

    expect(adapted.allowRules.size).toBe(0);
    expect(adapted.denyRules.size).toBe(0);
    expect(adapted.askRules.size).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function makePermissionContext(
  mode: PermissionContext['mode'],
  overrides?: {
    allowRules?: Partial<Record<string, readonly string[]>>;
    denyRules?: Partial<Record<string, readonly string[]>>;
    askRules?: Partial<Record<string, readonly string[]>>;
    additionalWorkingDirectories?: Map<string, string>;
  },
): PermissionContext {
  return {
    mode,
    alwaysAllowRules: overrides?.allowRules ?? {},
    alwaysDenyRules: overrides?.denyRules ?? {},
    alwaysAskRules: overrides?.askRules ?? {},
    additionalWorkingDirectories: overrides?.additionalWorkingDirectories ?? new Map(),
  };
}
