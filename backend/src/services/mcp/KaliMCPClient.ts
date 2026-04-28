/**
 * KaliMCPClient - Strict HTTP JSON-RPC client for LEA-managed Kali MCP service.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import net from 'node:net';
import { evaluateToolScope } from '../../core/runtime/ScopeGuard.js';

const execFileAsync = promisify(execFile);

export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface ToolExecutionContext {
  pentestId?: string;
  actor?: string;
  target?: string;
  inScope?: string[];
  outOfScope?: string[];
  pendingScopeDomains?: string[];
  scopeMode?: 'extended';
  allowPrivateTargets?: boolean;
  allowLocalTargets?: boolean;
}

export interface MCPToolResult {
  success: boolean;
  toolName: string;
  output?: string;
  error?: string;
  duration: number;
  meta?: Record<string, unknown>;
}

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface CompatToolDef {
  name: string;
  description: string;
  command: string;
  inputSchema: Record<string, unknown>;
}

const COMPAT_TOOLS: CompatToolDef[] = [
  {
    name: 'nmap_scan',
    description: 'Run Nmap scan against target host',
    command: 'nmap',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        ports: { type: 'string' },
        flags: { type: 'string' },
      },
      required: ['target'],
    },
  },
  {
    name: 'dig_lookup',
    description: 'Run DNS lookup',
    command: 'dig',
    inputSchema: {
      type: 'object',
      properties: { target: { type: 'string' }, record_type: { type: 'string' } },
      required: ['target'],
    },
  },
  {
    name: 'whois_lookup',
    description: 'Run whois lookup',
    command: 'whois',
    inputSchema: {
      type: 'object',
      properties: { target: { type: 'string' } },
      required: ['target'],
    },
  },
  {
    name: 'curl_request',
    description: 'Run curl request',
    command: 'curl',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' }, flags: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'http_request',
    description: 'Structured HTTP request without shell flags/pipes',
    command: 'curl',
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string' },
        url: { type: 'string' },
        headers: { type: 'object', additionalProperties: { type: 'string' } },
        body: { type: 'string' },
        follow_redirects: { type: 'boolean' },
        timeout: { type: 'number' },
        response_extract: {
          type: 'string',
          enum: ['status', 'headers', 'body', 'all'],
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'whatweb_scan',
    description: 'Run whatweb scan',
    command: 'whatweb',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'waf_detect',
    description: 'Run WAF detection',
    command: 'wafw00f',
    inputSchema: {
      type: 'object',
      properties: { target: { type: 'string' } },
      required: ['target'],
    },
  },
];

const SHELL_NETWORK_HINT = /\b(curl|wget|httpx|nmap|masscan|rustscan|dig|whois|host|nslookup|ping|traceroute|whatweb|wafw00f|ffuf|gobuster|feroxbuster|nikto|sqlmap|netcat|nc|ssh|ftp|telnet)\b/i;
const ACTIVE_SHELL_NETWORK_COMMAND = /\b(nmap|masscan|rustscan|ffuf|gobuster|feroxbuster|nikto|sqlmap|wpscan|hydra|medusa|snmpwalk|onesixtyone|netcat|nc|ping|traceroute|telnet|ssh|ftp|mysql|psql|redis-cli|ldapsearch|enum4linux|smbclient|rpcclient|httpx|whatweb|wafw00f)\b/i;
const PASSIVE_OSINT_HOSTS = [
  'crt.sh',
  'certspotter.com',
  'securitytrails.com',
  'urlscan.io',
  'otx.alienvault.com',
  'virustotal.com',
  'censys.io',
  'shodan.io',
  'dnsdumpster.com',
  'rapiddns.io',
  'web.archive.org',
  'archive.org',
];

export class KaliMCPClient {
  private endpoint: string;
  private timeoutMs: number;
  private requestId: number = 0;
  private connected: boolean = false;
  private mode: 'jsonrpc' | 'compat-local' | null = null;
  private cachedTools: MCPTool[] | null = null;
  private allowCompatLocal: boolean;

  constructor(endpoint?: string, timeoutMs?: number) {
    const configuredEndpoint = endpoint || process.env.MCP_KALI_ENDPOINT || 'http://localhost:3002/mcp';
    this.endpoint = configuredEndpoint.endsWith('/mcp') ? configuredEndpoint : `${configuredEndpoint.replace(/\/$/, '')}/mcp`;
    this.timeoutMs = timeoutMs || Number(process.env.MCP_TIMEOUT || 30000);
    this.allowCompatLocal = process.env.MCP_DEBUG_COMPAT_LOCAL === 'true';
  }

  private splitFlags(flags?: string): string[] {
    if (!flags) return [];
    return flags.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  }

  private shellEscape(value: string): string {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
  }

  private hasDisallowedShellSyntax(value?: string): boolean {
    if (!value) return false;
    const raw = String(value);
    return /[|><]/.test(raw);
  }

  private stripHeaderValues(command: string): string {
    if (!command) return '';
    return command
      .replace(/(?:^|\s)(?:-H|--header)\s+(['"]).*?\1/gi, ' ')
      .replace(/(?:^|\s)(?:-H|--header)\s+\S+/gi, ' ');
  }

  private isIp(value: string): boolean {
    return net.isIP(value) !== 0;
  }

  private toHost(value: string): string {
    const trimmed = String(value || '').trim().toLowerCase();
    if (!trimmed) return '';

    if (trimmed.includes('://')) {
      try {
        const u = new URL(trimmed);
        return u.hostname.toLowerCase();
      } catch {
        return '';
      }
    }

    return trimmed.split('/')[0].split(':')[0].trim();
  }

  private ipToInt(ip: string): number | null {
    if (!this.isIp(ip) || ip.includes(':')) return null;
    const parts = ip.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
    return ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + parts[3];
  }

  private cidrMatch(ip: string, cidr: string): boolean {
    const [baseIp, maskRaw] = cidr.split('/');
    const maskBits = Number(maskRaw);
    if (!baseIp || Number.isNaN(maskBits) || maskBits < 0 || maskBits > 32) return false;

    const ipNum = this.ipToInt(ip);
    const baseNum = this.ipToInt(baseIp);
    if (ipNum === null || baseNum === null) return false;

    const mask = maskBits === 0 ? 0 : (~((1 << (32 - maskBits)) - 1)) >>> 0;
    return (ipNum & mask) === (baseNum & mask);
  }

  private domainMatch(host: string, pattern: string): boolean {
    const normalizedHost = this.toHost(host);
    const normalizedPattern = this.toHost(pattern);
    if (!normalizedHost || !normalizedPattern) return false;

    if (normalizedPattern.startsWith('*.')) {
      const suffix = normalizedPattern.slice(2);
      return normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`);
    }

    if (normalizedHost === normalizedPattern) return true;
    return normalizedHost.endsWith(`.${normalizedPattern}`);
  }

  private isHostInList(host: string, candidates: string[]): boolean {
    const normalizedHost = this.toHost(host);
    if (!normalizedHost) return false;

    return candidates.some((candidate) => {
      const normalizedCandidate = this.toHost(candidate);
      if (!normalizedCandidate) return false;

      if (normalizedCandidate.includes('/')) {
        return this.cidrMatch(normalizedHost, normalizedCandidate);
      }

      if (this.isIp(normalizedCandidate)) {
        return normalizedHost === normalizedCandidate;
      }

      return this.domainMatch(normalizedHost, normalizedCandidate);
    });
  }

  private isPassiveOsintHost(host: string): boolean {
    return PASSIVE_OSINT_HOSTS.some((pattern) => this.domainMatch(host, pattern));
  }

  private extractShellScopeTargets(command: string): { contactedHosts: string[]; referencedHosts: string[]; passiveCommand: boolean } {
    const commandForParsing = this.stripHeaderValues(command);
    if (!SHELL_NETWORK_HINT.test(commandForParsing)) {
      return { contactedHosts: [], referencedHosts: [], passiveCommand: true };
    }

    const contacted = new Set<string>();
    const referenced = new Set<string>();

    const urlMatches = commandForParsing.matchAll(/https?:\/\/([^\s/:]+(?:\.[^\s/:]+)+)/gi);
    for (const match of urlMatches) {
      if (match[1]) {
        const host = this.toHost(match[1]);
        if (host) {
          contacted.add(host);
          referenced.add(host);
        }
      }
    }

    const rawMatches = commandForParsing.matchAll(/\b([a-z0-9.-]+\.[a-z]{2,}|(?:\d{1,3}\.){3}\d{1,3})\b/gi);
    for (const match of rawMatches) {
      if (match[1]) {
        const host = this.toHost(match[1]);
        if (host) referenced.add(host);
      }
    }

    return {
      contactedHosts: [...contacted],
      referencedHosts: [...referenced],
      passiveCommand: !ACTIVE_SHELL_NETWORK_COMMAND.test(commandForParsing),
    };
  }

  private checkShellScope(command: string, allowList: string[], denyList: string[], pendingScopeDomains: string[]): { allowed: boolean; reason?: string } {
    const scopeTargets = this.extractShellScopeTargets(command);
    const observedHosts = [...new Set([...scopeTargets.contactedHosts, ...scopeTargets.referencedHosts])];

    for (const host of observedHosts) {
      if (this.isHostInList(host, denyList)) {
        return { allowed: false, reason: `Host '${host}' is out of scope` };
      }
    }

    if (allowList.length === 0) {
      return { allowed: true };
    }

    const hostsForAllowCheck = scopeTargets.passiveCommand
      ? scopeTargets.contactedHosts.filter((host) => !this.isPassiveOsintHost(host))
      : observedHosts;

    for (const host of hostsForAllowCheck) {
      if (!this.isHostInList(host, allowList)) {
        if (this.isHostInList(host, pendingScopeDomains)) {
          return { allowed: false, reason: `Host '${host}' is pending user scope decision` };
        }
        return { allowed: false, reason: `Host '${host}' is outside extended scope` };
      }
    }

    return { allowed: true };
  }

  private extractCandidateHosts(toolName: string, args: Record<string, unknown>): string[] {
    const hosts: string[] = [];

    const maybeTarget = this.toHost(String(args.target || args.domain || args.host || ''));
    const maybeUrl = this.toHost(String(args.url || ''));

    if (maybeTarget) hosts.push(maybeTarget);
    if (maybeUrl) hosts.push(maybeUrl);

    return [...new Set(hosts.filter(Boolean))];
  }

  private checkScope(toolName: string, args: Record<string, unknown>, context?: ToolExecutionContext): { allowed: boolean; reason?: string } {
    const decision = evaluateToolScope({
      toolName,
      toolSource: 'mcp',
      input: args,
      context,
      requireScope: false,
    });

    return decision.allowed ? { allowed: true } : { allowed: false, reason: decision.reason };
  }

  private extractOutput(result: any): string {
    if (result?.content) {
      if (Array.isArray(result.content)) {
        return result.content
          .map((chunk: any) => {
            if (typeof chunk?.text === 'string') return chunk.text;
            if (typeof chunk?.content === 'string') return chunk.content;
            return JSON.stringify(chunk);
          })
          .join('\n');
      }

      if (typeof result.content === 'string') {
        return result.content;
      }

      return JSON.stringify(result.content);
    }

    if (typeof result === 'string') {
      return result;
    }

    return JSON.stringify(result ?? {});
  }

  private async sendRequest(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs: number = this.timeoutMs
  ): Promise<any> {
    const body: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      ...(params ? { params } : {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`MCP HTTP ${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as JSONRPCResponse;

      if (payload.error) {
        throw new Error(`MCP error ${payload.error.code}: ${payload.error.message}`);
      }

      return payload.result;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`MCP request timeout after ${timeoutMs}ms (${method})`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async localHasCommand(command: string): Promise<boolean> {
    try {
      await execFileAsync('sh', ['-lc', `command -v ${command} >/dev/null 2>&1`], { timeout: 8000 });
      return true;
    } catch {
      return false;
    }
  }

  private async localExec(command: string, timeoutMs: number): Promise<string> {
    const { stdout, stderr } = await execFileAsync('sh', ['-lc', command], {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });

    return [stdout, stderr].filter(Boolean).join('\n').trim();
  }

  private async compatListTools(): Promise<MCPTool[]> {
    const tools: MCPTool[] = [];

    for (const tool of COMPAT_TOOLS) {
      if (await this.localHasCommand(tool.command)) {
        tools.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }

    if (tools.find((t) => t.name === 'dig_lookup')) {
      tools.push({ name: 'dig', description: 'Alias for dig_lookup' });
    }
    if (tools.find((t) => t.name === 'whois_lookup')) {
      tools.push({ name: 'whois', description: 'Alias for whois_lookup' });
    }
    if (tools.find((t) => t.name === 'curl_request')) {
      tools.push({ name: 'curl', description: 'Alias for curl_request' });
    }
    if (tools.find((t) => t.name === 'whatweb_scan')) {
      tools.push({ name: 'whatweb', description: 'Alias for whatweb_scan' });
    }

    tools.push({
      name: 'shell_exec',
      description: 'Execute local shell command (compat mode)',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          timeout: { type: 'number' },
        },
        required: ['command'],
      },
    });

    return tools;
  }

  private async compatCallTool(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number
  ): Promise<{ content: Array<{ text: string }>; isError: boolean; meta?: Record<string, unknown> }> {
    const normalized = toolName.toLowerCase();
    let command = '';

    if (normalized === 'nmap_scan') {
      const target = String(args.target || '').trim();
      if (!target) throw new Error('nmap_scan requires target');
      const flags = this.splitFlags(String(args.flags || '-sV -T4')).join(' ');
      const ports = String(args.ports || '').trim();
      command = `nmap ${flags}${ports ? ` -p ${ports}` : ''} ${target}`.trim();
    } else if (normalized === 'dig_lookup' || normalized === 'dig') {
      const target = String(args.target || args.domain || '').trim();
      if (!target) throw new Error('dig_lookup requires target');
      const rt = String(args.record_type || 'A');
      command = `dig ${target} ${rt} +short`;
    } else if (normalized === 'whois_lookup' || normalized === 'whois') {
      const target = String(args.target || args.domain || '').trim();
      if (!target) throw new Error('whois_lookup requires target');
      command = `whois ${target}`;
    } else if (normalized === 'curl_request' || normalized === 'curl') {
      const url = String(args.url || '').trim();
      if (!url) throw new Error('curl_request requires url');
      const rawFlags = String(args.flags || '-I -s --connect-timeout 10');
      if (this.hasDisallowedShellSyntax(rawFlags)) {
        throw new Error('curl_request no longer supports pipes/redirections in flags. Use http_request instead.');
      }
      const flags = this.splitFlags(rawFlags).join(' ');
      command = `curl ${flags} ${url}`.trim();
    } else if (normalized === 'http_request') {
      const url = String(args.url || '').trim();
      if (!url) throw new Error('http_request requires url');
      const method = String(args.method || 'GET').trim().toUpperCase();
      const allowedMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
      const safeMethod = allowedMethods.has(method) ? method : 'GET';
      const followRedirects = args.follow_redirects === true;
      const timeoutSecRaw = Number(args.timeout);
      const timeoutSec = Number.isFinite(timeoutSecRaw) && timeoutSecRaw > 0
        ? Math.max(1, Math.min(120, Math.floor(timeoutSecRaw)))
        : 15;
      const extract = String(args.response_extract || 'all').toLowerCase();
      const headers = (args.headers && typeof args.headers === 'object' ? args.headers : {}) as Record<string, unknown>;
      const body = typeof args.body === 'string' ? args.body : undefined;

      const headerParts = Object.entries(headers)
        .filter(([key]) => key && String(key).trim().length > 0)
        .map(([key, value]) => `-H ${this.shellEscape(`${String(key).trim()}: ${String(value ?? '')}`)}`);
      const bodyPart = body !== undefined ? ` --data-binary ${this.shellEscape(body)}` : '';
      const redirectPart = followRedirects ? ' -L' : '';
      const base = `curl -sS --max-time ${timeoutSec}${redirectPart} -X ${safeMethod} ${headerParts.join(' ')}${bodyPart} ${this.shellEscape(url)}`.trim();

      if (extract === 'status') {
        command = `${base} -o /dev/null -w '%{http_code}'`;
      } else if (extract === 'headers') {
        command = `${base} -D - -o /dev/null`;
      } else if (extract === 'body') {
        command = base;
      } else {
        command = `${base} -i`;
      }
    } else if (normalized === 'whatweb_scan' || normalized === 'whatweb') {
      const url = String(args.url || '').trim();
      if (!url) throw new Error('whatweb_scan requires url');
      command = `whatweb ${url}`;
    } else if (normalized === 'waf_detect') {
      const target = String(args.target || args.url || '').trim();
      if (!target) throw new Error('waf_detect requires target');
      command = `wafw00f ${target}`;
    } else if (normalized === 'shell_exec') {
      const cmd = String(args.command || '').trim();
      if (!cmd) throw new Error('shell_exec requires command');
      command = cmd;
    } else {
      throw new Error(`Unsupported compat tool: ${toolName}`);
    }

    try {
      const output = await this.localExec(command, timeoutMs);
      return {
        content: [{ text: output || '[No output]' }],
        isError: false,
      };
    } catch (error: any) {
      return {
        content: [{ text: error.message }],
        isError: true,
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.sendRequest('ping', undefined, Math.min(this.timeoutMs, 10000));
      this.connected = true;
      this.mode = 'jsonrpc';
      return true;
    } catch (error: any) {
      if (this.allowCompatLocal) {
        this.connected = true;
        this.mode = 'compat-local';
        return true;
      }
      this.connected = false;
      this.mode = null;
      return false;
    }
  }

  async listTools(): Promise<MCPTool[]> {
    if (this.cachedTools) {
      return this.cachedTools;
    }

    if (this.mode === 'compat-local') {
      const tools = await this.compatListTools();
      this.cachedTools = tools;
      return tools;
    }

    const result = await this.sendRequest('tools/list', undefined, 15000);

    const tools: MCPTool[] = (result?.tools || []).map((tool: any) => ({
      name: String(tool.name),
      description: String(tool.description || ''),
      inputSchema: tool.inputSchema || tool.input_schema || undefined,
    }));

    this.cachedTools = tools;
    this.connected = true;
    this.mode = 'jsonrpc';
    return tools;
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown> = {},
    timeoutMs: number = 120000,
    context?: ToolExecutionContext
  ): Promise<MCPToolResult> {
    const start = Date.now();
    const normalizedTool = toolName.toLowerCase();

    try {
      if ((normalizedTool === 'curl_request' || normalizedTool === 'curl') && this.hasDisallowedShellSyntax(String(args.flags || ''))) {
        return {
          success: false,
          toolName,
          error: 'curl_request no longer accepts pipes/redirections in flags. Use http_request (method/url/headers/body) instead.',
          duration: Date.now() - start,
          meta: {
            blockedByPolicy: true,
            recommendedTool: 'http_request',
          },
        };
      }

      const scope = this.checkScope(toolName, args, context);
      if (!scope.allowed) {
        return {
          success: false,
          toolName,
          error: scope.reason || 'Scope validation failed',
          duration: Date.now() - start,
          meta: { blockedByScope: true },
        };
      }

      let result: any;
      if (this.mode === 'compat-local') {
        result = await this.compatCallTool(toolName, args, timeoutMs);
      } else {
        const contextPayload = context
          ? {
              pentest_id: context.pentestId,
              actor: context.actor,
              target: context.target,
              in_scope: context.inScope,
              out_scope: context.outOfScope,
              pending_scope: context.pendingScopeDomains,
              scope_mode: context.scopeMode || 'extended',
            }
          : undefined;

        result = await this.sendRequest(
          'tools/call',
          {
            name: toolName,
            arguments: {
              ...args,
              ...(contextPayload ? { __context: contextPayload } : {}),
            },
          },
          timeoutMs
        );
      }

      const output = this.extractOutput(result);
      const isError = result?.isError === true;

      return {
        success: !isError,
        toolName,
        output: isError ? undefined : output,
        error: isError ? output : undefined,
        duration: Date.now() - start,
        meta: result?.meta,
      };
    } catch (error: any) {
      return {
        success: false,
        toolName,
        error: error.message,
        duration: Date.now() - start,
      };
    }
  }

  async getToolsForAI(): Promise<Array<{ name: string; description: string; input_schema: Record<string, unknown> }>> {
    const tools = await this.listTools();

    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema || {
        type: 'object',
        properties: {},
      },
    }));
  }

  clearToolCache(): void {
    this.cachedTools = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getMode(): 'jsonrpc' | 'compat-local' | null {
    return this.mode;
  }

  getContainerName(): string {
    return 'lea-kali-mcp';
  }

  getEndpoint(): string {
    return this.endpoint;
  }
}

export const kaliMcpClient = new KaliMCPClient();
