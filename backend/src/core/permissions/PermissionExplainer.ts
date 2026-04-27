/**
 * PermissionExplainer — Human-readable explanations for permission decisions.
 * Adapted from Claude Code's permissionExplainer pattern.
 */

import type { PermissionBehavior } from './types.js';

export interface ExplanationContext {
  toolName: string;
  input?: string;
  command?: string;
  filePath?: string;
  matchedRule?: string;
  classifierReason?: string;
  denyReason?: string;
}

/**
 * Generate a human-readable explanation for a permission decision.
 */
export function explainDecision(
  behavior: PermissionBehavior,
  context: ExplanationContext
): string {
  switch (behavior) {
    case 'allow':
      return explainAllow(context);
    case 'deny':
      return explainDeny(context);
    case 'ask':
      return explainAsk(context);
    default:
      return `Permission decision: ${behavior}`;
  }
}

function explainAllow(ctx: ExplanationContext): string {
  if (ctx.matchedRule) {
    return `✅ Allowed: matches permission rule "${ctx.matchedRule}"`;
  }

  if (ctx.classifierReason) {
    return `✅ Auto-approved: ${ctx.classifierReason}`;
  }

  if (ctx.command) {
    const readCmds = ['cat', 'head', 'tail', 'less', 'more', 'grep', 'find', 'ls', 'wc'];
    const baseCmd = ctx.command.trim().split(/\s+/)[0];
    if (readCmds.includes(baseCmd)) {
      return `✅ Allowed: read-only command (${baseCmd})`;
    }
    return `✅ Allowed: command "${ctx.command.slice(0, 80)}${ctx.command.length > 80 ? '…' : ''}"`;
  }

  if (ctx.filePath) {
    return `✅ Allowed: file access to "${ctx.filePath}"`;
  }

  return `✅ Allowed: tool "${ctx.toolName}"`;
}

function explainDeny(ctx: ExplanationContext): string {
  if (ctx.denyReason) {
    return `⛔ Denied: ${ctx.denyReason}`;
  }

  if (ctx.matchedRule) {
    return `⛔ Denied: matches deny rule "${ctx.matchedRule}"`;
  }

  if (ctx.command) {
    return `⛔ Denied: command "${ctx.command.slice(0, 80)}${ctx.command.length > 80 ? '…' : ''}" is not permitted`;
  }

  if (ctx.filePath) {
    return `⛔ Denied: access to "${ctx.filePath}" is not permitted`;
  }

  return `⛔ Denied: tool "${ctx.toolName}" is not permitted`;
}

function explainAsk(ctx: ExplanationContext): string {
  const parts: string[] = [];

  parts.push(`⚠️ Requires approval for "${ctx.toolName}"`);

  if (ctx.command) {
    parts.push(`\nCommand: ${ctx.command.slice(0, 120)}${ctx.command.length > 120 ? '…' : ''}`);

    // Add risk indicators
    const risk = assessRisk(ctx.command);
    if (risk.level !== 'low') {
      parts.push(`\nRisk: ${risk.level.toUpperCase()} — ${risk.reason}`);
    }
  }

  if (ctx.filePath) {
    parts.push(`\nFile: ${ctx.filePath}`);
  }

  return parts.join('');
}

interface RiskAssessment {
  level: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
}

/**
 * Assess the risk level of a command for user-facing display.
 */
export function assessRisk(command: string): RiskAssessment {
  const trimmed = command.trim().toLowerCase();

  // Critical: destructive irreversible
  if (/\brm\s+(-[rfRF]+\s+)?\/\b/.test(trimmed)) {
    return { level: 'critical', reason: 'Deletes files from filesystem root' };
  }
  if (/\bmkfs\b/.test(trimmed) || /\bformat\b/.test(trimmed)) {
    return { level: 'critical', reason: 'Formats a filesystem' };
  }
  if (/\bdd\s+(if=|of=)\/dev\//.test(trimmed)) {
    return { level: 'critical', reason: 'Direct disk write — potential data destruction' };
  }
  if (/\bchmod\s+(-R\s+)?777\b/.test(trimmed)) {
    return { level: 'critical', reason: 'Sets world-writable permissions recursively' };
  }
  if (/\bshred\b/.test(trimmed)) {
    return { level: 'critical', reason: 'Securely deletes files (irreversible)' };
  }

  // High: potentially dangerous
  if (/\brm\s+(-[rfRF]+\s+)/.test(trimmed) && !/\brm\s+(-[rfRF]+\s+)\//.test(trimmed)) {
    return { level: 'high', reason: 'Recursive force delete' };
  }
  if (/\b(sudo\s+)?(iptables|nft|firewalld)\b/.test(trimmed)) {
    return { level: 'high', reason: 'Modifies firewall rules' };
  }
  if (/\buseradd\b|\buserdel\b|\busermod\b|\bgroupadd\b/.test(trimmed)) {
    return { level: 'high', reason: 'Modifies system users/groups' };
  }
  if (/\b(sudo\s+)?systemctl\s+(stop|disable|mask)\b/.test(trimmed)) {
    return { level: 'high', reason: 'Stops or disables a system service' };
  }
  if (/\b(sudo\s+)?crontab\b/.test(trimmed)) {
    return { level: 'high', reason: 'Modifies cron jobs' };
  }
  if (/\bcurl\b.*\|\s*bash\b/.test(trimmed) || /\bwget\b.*\|\s*sh\b/.test(trimmed)) {
    return { level: 'high', reason: 'Pipes remote download directly to shell' };
  }
  if (/\beval\b/.test(trimmed)) {
    return { level: 'high', reason: 'Uses eval — arbitrary code execution risk' };
  }

  // Medium: network or privilege escalation
  if (/\bsudo\b/.test(trimmed)) {
    return { level: 'medium', reason: 'Runs with elevated privileges' };
  }
  if (/\b(apt|yum|dnf|pip|npm)\s+install\b/.test(trimmed)) {
    return { level: 'medium', reason: 'Installs packages' };
  }
  if (/\b(curl|wget)\b/.test(trimmed) && /\|\s*(sh|bash|zsh)\b/.test(trimmed)) {
    return { level: 'medium', reason: 'Downloads and executes remote script' };
  }
  if (/\bgit\s+push\b/.test(trimmed) && /\b--force\b/.test(trimmed)) {
    return { level: 'medium', reason: 'Force pushes to git repository' };
  }

  // Low: read-only or safe operations
  return { level: 'low', reason: 'Standard operation' };
}

/**
 * Format a command for safe display (truncate + escape).
 */
export function formatCommandForDisplay(command: string, maxLen = 200): string {
  if (command.length <= maxLen) return command;
  return `${command.slice(0, maxLen - 3)}…`;
}
