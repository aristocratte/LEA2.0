import net from 'node:net';
import type { ToolSource } from '../types/tool-types.js';

export interface ScopeGuardContext {
  target?: string;
  inScope?: readonly string[];
  outOfScope?: readonly string[];
  pendingScopeDomains?: readonly string[];
  scopeMode?: 'extended';
  allowPrivateTargets?: boolean;
  allowLocalTargets?: boolean;
}

export interface ScopeGuardInput {
  toolName: string;
  toolSource?: ToolSource;
  input: Record<string, unknown>;
  context?: ScopeGuardContext;
  requireScope?: boolean;
}

export type NormalizedScopeTarget =
  | {
      kind: 'domain' | 'ip' | 'localhost';
      canonical: string;
      host: string;
      isPrivate: boolean;
    }
  | {
      kind: 'invalid';
      canonical: string;
      host: string;
      isPrivate: false;
    };

export type ScopeGuardDecision =
  | { allowed: true }
  | {
      allowed: false;
      code:
        | 'missing_scope'
        | 'invalid_target'
        | 'localhost_blocked'
        | 'private_ip_blocked'
        | 'out_of_scope'
        | 'pending_scope';
      reason: string;
      target?: string;
    };

const TARGET_KEYS = ['target', 'host', 'domain', 'url'];
const TARGET_ARRAY_KEYS = ['targets', 'hosts', 'domains', 'urls'];

export function normalizeScopeTarget(raw: unknown): NormalizedScopeTarget {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) {
    return { kind: 'invalid', canonical: '', host: '', isPrivate: false };
  }

  const cidr = value.match(/^((?:\d{1,3}\.){3}\d{1,3})\/([0-9]|[1-2][0-9]|3[0-2])$/);
  if (cidr) {
    const host = cidr[1];
    if (net.isIP(host) === 4) {
      return { kind: 'ip', canonical: `${host}/${cidr[2]}`, host, isPrivate: isPrivateIp(host, 4) };
    }
  }

  const host = extractHost(value);
  if (!host) {
    return { kind: 'invalid', canonical: value, host: '', isPrivate: false };
  }

  if (isLocalhost(host)) {
    return { kind: 'localhost', canonical: host, host, isPrivate: true };
  }

  const ipVersion = net.isIP(host);
  if (ipVersion !== 0) {
    return { kind: 'ip', canonical: host, host, isPrivate: isPrivateIp(host, ipVersion) };
  }

  return { kind: 'domain', canonical: host.replace(/\.$/, ''), host: host.replace(/\.$/, ''), isPrivate: false };
}

export function evaluateToolScope(params: ScopeGuardInput): ScopeGuardDecision {
  const hosts = extractToolTargets(params.toolName, params.input);
  const requireScope = params.requireScope ?? params.toolSource === 'mcp';
  const context = params.context;
  const allowList = buildAllowList(context);
  const denyList = normalizeList(context?.outOfScope);
  const pendingList = normalizeList(context?.pendingScopeDomains);

  if (requireScope && !hasRuntimeScope(context)) {
    return {
      allowed: false,
      code: 'missing_scope',
      reason: `Tool "${params.toolName}" requires a trusted runtime scope before execution`,
    };
  }

  if (!requireScope && !hasRuntimeScope(context)) {
    return { allowed: true };
  }

  if (hosts.length === 0) {
    return { allowed: true };
  }

  for (const rawHost of hosts) {
    const target = normalizeScopeTarget(rawHost);
    if (target.kind === 'invalid') {
      return {
        allowed: false,
        code: 'invalid_target',
        reason: `Tool "${params.toolName}" received an invalid target`,
      };
    }

    if (target.kind === 'localhost' && context?.allowLocalTargets !== true) {
      return {
        allowed: false,
        code: 'localhost_blocked',
        reason: `Host "${target.host}" is localhost and is blocked by runtime scope policy`,
        target: target.host,
      };
    }

    if (target.kind === 'ip' && target.isPrivate && context?.allowPrivateTargets !== true) {
      return {
        allowed: false,
        code: 'private_ip_blocked',
        reason: `Host "${target.host}" is private/reserved and is blocked by runtime scope policy`,
        target: target.host,
      };
    }

    if (matchesAny(target.host, denyList)) {
      return {
        allowed: false,
        code: 'out_of_scope',
        reason: `Host "${target.host}" is explicitly out of scope`,
        target: target.host,
      };
    }

    if (matchesAny(target.host, pendingList)) {
      return {
        allowed: false,
        code: 'pending_scope',
        reason: `Host "${target.host}" is pending user scope decision`,
        target: target.host,
      };
    }

    if (allowList.length > 0 && !matchesAny(target.host, allowList)) {
      return {
        allowed: false,
        code: 'out_of_scope',
        reason: `Host "${target.host}" is outside runtime scope`,
        target: target.host,
      };
    }

    if (requireScope && allowList.length === 0) {
      return {
        allowed: false,
        code: 'missing_scope',
        reason: `Tool "${params.toolName}" requires a non-empty trusted runtime scope`,
        target: target.host,
      };
    }
  }

  return { allowed: true };
}

function hasRuntimeScope(context: ScopeGuardContext | undefined): boolean {
  if (!context) return false;
  return (
    normalizeList(context.inScope).length > 0 ||
    normalizeList(context.outOfScope).length > 0 ||
    normalizeList(context.pendingScopeDomains).length > 0 ||
    normalizeScopeTarget(context.target).kind !== 'invalid'
  );
}

function buildAllowList(context: ScopeGuardContext | undefined): NormalizedScopeTarget[] {
  const explicit = normalizeList(context?.inScope);
  if (explicit.length > 0) return explicit;

  const target = normalizeScopeTarget(context?.target);
  return target.kind === 'invalid' ? [] : [target];
}

function normalizeList(values: readonly string[] | undefined): NormalizedScopeTarget[] {
  return (values ?? [])
    .map((entry) => normalizeScopeTarget(entry))
    .filter((entry): entry is Exclude<NormalizedScopeTarget, { kind: 'invalid' }> => entry.kind !== 'invalid');
}

function extractToolTargets(toolName: string, input: Record<string, unknown>): string[] {
  const targets = new Set<string>();

  for (const key of TARGET_KEYS) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) {
      targets.add(value);
    }
  }

  for (const key of TARGET_ARRAY_KEYS) {
    const value = input[key];
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string' && entry.trim()) {
          targets.add(entry);
        }
      }
    }
  }

  if (toolName.toLowerCase() === 'shell_exec' && typeof input.command === 'string') {
    for (const host of extractHostsFromCommand(input.command)) {
      targets.add(host);
    }
  }

  return [...targets];
}

function extractHost(value: string): string {
  if (value.includes('://')) {
    try {
      return new URL(value).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end > 1 ? value.slice(1, end).toLowerCase() : '';
  }

  return value.split('/')[0].split(':')[0].trim().toLowerCase();
}

function extractHostsFromCommand(command: string): string[] {
  const hosts = new Set<string>();
  for (const match of command.matchAll(/https?:\/\/([^\s/:]+(?:\.[^\s/:]+)+)/gi)) {
    if (match[1]) hosts.add(match[1]);
  }
  for (const match of command.matchAll(/\b([a-z0-9.-]+\.[a-z]{2,}|(?:\d{1,3}\.){3}\d{1,3})\b/gi)) {
    if (match[1]) hosts.add(match[1]);
  }
  return [...hosts];
}

function matchesAny(host: string, patterns: readonly NormalizedScopeTarget[]): boolean {
  return patterns.some((pattern) => targetMatches(host, pattern));
}

function targetMatches(host: string, pattern: NormalizedScopeTarget): boolean {
  const target = normalizeScopeTarget(host);
  if (target.kind === 'invalid' || pattern.kind === 'invalid') return false;

  if (pattern.canonical.includes('/')) {
    return target.kind === 'ip' && cidrMatch(target.host, pattern.canonical);
  }

  if (pattern.kind === 'ip' || pattern.kind === 'localhost') {
    return target.host === pattern.host;
  }

  if (pattern.host.startsWith('*.')) {
    const suffix = pattern.host.slice(2);
    return target.host === suffix || target.host.endsWith(`.${suffix}`);
  }

  return target.host === pattern.host || target.host.endsWith(`.${pattern.host}`);
}

function isLocalhost(host: string): boolean {
  return host === 'localhost' || host === '::1' || host === '127.0.0.1' || host.startsWith('127.');
}

function isPrivateIp(host: string, version: number): boolean {
  if (version === 6) {
    return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
  }

  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 0 ||
    a >= 224
  );
}

function ipToInt(ip: string): number | null {
  if (net.isIP(ip) !== 4) return null;
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return null;
  return ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + parts[3];
}

function cidrMatch(ip: string, cidr: string): boolean {
  const [baseIp, maskRaw] = cidr.split('/');
  const maskBits = Number(maskRaw);
  if (!baseIp || Number.isNaN(maskBits) || maskBits < 0 || maskBits > 32) return false;

  const ipNum = ipToInt(ip);
  const baseNum = ipToInt(baseIp);
  if (ipNum === null || baseNum === null) return false;

  const mask = maskBits === 0 ? 0 : (~((1 << (32 - maskBits)) - 1)) >>> 0;
  return (ipNum & mask) === (baseNum & mask);
}
