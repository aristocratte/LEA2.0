/**
 * PreflightService
 *
 * Strict preflight validation with controlled remediation for LEA-managed Kali MCP.
 */

import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { promisify } from 'node:util';
import { kaliMcpClient } from './mcp/KaliMCPClient.js';
import type {
  PreflightCheck,
  PreflightOptions,
  PreflightRemediationAttempt,
  PreflightResult,
} from '../types/preflight.js';

const dnsResolve = promisify(dns.resolve);

interface RunChecksCallbacks {
  onCheckStarted?: (check: PreflightCheck) => void | Promise<void>;
  onCheckCompleted?: (check: PreflightCheck) => void | Promise<void>;
  onRemediation?: (attempt: PreflightRemediationAttempt) => void | Promise<void>;
  onComplete?: (result: PreflightResult) => void | Promise<void>;
}

const REQUIRED_TOOLS_BY_TYPE: Record<string, string[]> = {
  quick: ['nmap_scan', 'dig_lookup', 'whois_lookup', 'curl_request'],
  standard: ['nmap_scan', 'dig_lookup', 'whois_lookup', 'curl_request', 'whatweb_scan', 'waf_detect'],
  comprehensive: ['nmap_scan', 'dig_lookup', 'whois_lookup', 'curl_request', 'whatweb_scan', 'waf_detect'],
  custom: ['nmap_scan', 'dig_lookup', 'whois_lookup', 'curl_request', 'whatweb_scan', 'waf_detect'],
};

const TOOL_INSTALL_MAP: Record<string, { tool: string; package: string }> = {
  nmap_scan: { tool: 'nmap', package: 'nmap' },
  dig_lookup: { tool: 'dig', package: 'dnsutils' },
  whois_lookup: { tool: 'whois', package: 'whois' },
  curl_request: { tool: 'curl', package: 'curl' },
  whatweb_scan: { tool: 'whatweb', package: 'whatweb' },
  waf_detect: { tool: 'wafw00f', package: 'wafw00f' },
};

export class PreflightService {
  private async dnsLookupAll(hostname: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      dns.lookup(hostname, { all: true }, (error, addresses) => {
        if (error) {
          reject(error);
          return;
        }
        const ips = (addresses || []).map((entry) => entry.address).filter(Boolean);
        resolve([...new Set(ips)]);
      });
    });
  }

  private async dnsResolveWithServers(hostname: string, servers: string[]): Promise<string[]> {
    const resolver = new dns.promises.Resolver();
    resolver.setServers(servers);
    const results = await resolver.resolve4(hostname);
    return [...new Set(results.filter(Boolean))];
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private normalizeHost(target: string): string {
    const cleaned = String(target || '').trim();
    if (!cleaned) return '';

    if (cleaned.includes('://')) {
      try {
        return new URL(cleaned).hostname;
      } catch {
        return '';
      }
    }

    return cleaned.split('/')[0].split(':')[0];
  }

  private normalizeUrl(target: string): string {
    const cleaned = String(target || '').trim();
    if (!cleaned) return '';
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      return cleaned;
    }
    return `https://${cleaned}`;
  }

  private buildToolContext(options: PreflightOptions) {
    return {
      pentestId: options.pentestId,
      actor: 'preflight',
      target: this.normalizeHost(options.target),
      inScope: options.inScope || [],
      outOfScope: options.outOfScope || [],
      scopeMode: 'extended' as const,
    };
  }

  private mapToolAlias(toolName: string): string[] {
    const name = toolName.toLowerCase();
    const aliases = [name];

    if (name === 'dig_lookup') aliases.push('dig');
    if (name === 'whois_lookup') aliases.push('whois');
    if (name === 'curl_request') aliases.push('curl');
    if (name === 'whatweb_scan') aliases.push('whatweb');

    return aliases;
  }

  private hasTool(toolNames: string[], expectedName: string): boolean {
    const expected = this.mapToolAlias(expectedName);
    return toolNames.some((tool) => expected.includes(tool.toLowerCase()));
  }

  async runChecks(options: PreflightOptions, callbacks: RunChecksCallbacks = {}): Promise<PreflightResult> {
    const runStartedAt = Date.now();

    // Preflight is strictly for execution prerequisites, not reconnaissance.
    const checks: PreflightCheck[] = [
      { id: 'dns', name: 'DNS Resolution', status: 'pending', severity: 'blocking' },
      { id: 'mcp', name: 'MCP JSON-RPC Available', status: 'pending', severity: 'blocking' },
      { id: 'tools', name: 'Required Pentest Tools', status: 'pending', severity: 'blocking' },
      { id: 'workspace', name: 'Kali Workspace Access', status: 'pending', severity: 'blocking' },
      { id: 'http', name: 'HTTP/HTTPS Reachable', status: 'pending', severity: 'warning' },
    ];

    const remediationAttempts: PreflightRemediationAttempt[] = [];
    let workspace = '';

    const executeCheck = async (check: PreflightCheck): Promise<void> => {
      check.status = 'running';
      await callbacks.onCheckStarted?.({ ...check });

      const startedAt = Date.now();
      try {
        const result = await this.runCheck(check.id, options, remediationAttempts, callbacks);
        check.status = result.status;
        check.output = result.output;
        check.metadata = result.metadata;
        check.duration_ms = Date.now() - startedAt;

        if (check.id === 'workspace' && result.metadata?.workspace) {
          workspace = String(result.metadata.workspace);
        }
      } catch (error: any) {
        check.status = 'error';
        check.output = [error.message || 'Unexpected preflight error'];
        check.duration_ms = Date.now() - startedAt;
      }

      await callbacks.onCheckCompleted?.({ ...check });
    };

    const blockingChecks = checks.filter((check) => check.severity === 'blocking');
    const informationalChecks = checks.filter((check) => check.severity !== 'blocking');

    // Keep blocking checks sequential to preserve deterministic remediation order.
    for (const check of blockingChecks) {
      await executeCheck(check);
    }

    // Run non-blocking checks in parallel to reduce preflight total duration.
    await Promise.all(informationalChecks.map((check) => executeCheck(check)));

    const blockingFailures = checks.filter((c) => c.severity === 'blocking' && c.status === 'error');
    const warnings = checks.filter((c) => c.status === 'warning');
    const passed = checks.filter((c) => c.status === 'success').length;
    const failed = checks.filter((c) => c.status === 'error').length;

    const result: PreflightResult = {
      success: blockingFailures.length === 0,
      checks,
      blockingFailures,
      warnings,
      remediationAttempts,
      workspace: workspace || undefined,
      summary: {
        total: checks.length,
        passed,
        failed,
        warnings: warnings.length,
        duration: Date.now() - runStartedAt,
      },
      timestamp: new Date().toISOString(),
    };

    await callbacks.onComplete?.(result);
    return result;
  }

  private async runCheck(
    checkId: string,
    options: PreflightOptions,
    remediationAttempts: PreflightRemediationAttempt[],
    callbacks: RunChecksCallbacks
  ): Promise<{ status: 'success' | 'warning' | 'error'; output?: string[]; metadata?: Record<string, any> }> {
    switch (checkId) {
      case 'dns':
        return this.withTimeout(this.checkDNS(options.target), 12000, 'DNS check');
      case 'mcp':
        return this.withTimeout(this.checkMCP(), 15000, 'MCP check');
      case 'tools':
        return this.withTimeout(this.checkTools(options, remediationAttempts, callbacks), 240000, 'Tools check');
      case 'workspace':
        return this.withTimeout(this.checkWorkspace(options), 45000, 'Workspace check');
      case 'http':
        return this.withTimeout(this.checkHTTP(options.target), 25000, 'HTTP check');
      case 'ports':
        return this.withTimeout(this.checkPorts(options), 50000, 'Ports check');
      case 'waf':
        return this.withTimeout(this.checkWAF(options), 70000, 'WAF check');
      case 'tech':
        return this.withTimeout(this.checkTechStack(options), 70000, 'Tech stack check');
      case 'headers':
        return this.withTimeout(this.checkSecurityHeaders(options), 35000, 'Security headers check');
      default:
        return { status: 'error', output: ['Unknown preflight check'] };
    }
  }

  private async checkDNS(target: string): Promise<{ status: 'success' | 'error'; output: string[]; metadata?: Record<string, any> }> {
    const output: string[] = [];
    const hostname = this.normalizeHost(target);

    if (!hostname) {
      return {
        status: 'error',
        output: ['[✗] Invalid target: unable to parse host'],
      };
    }

    if (net.isIP(hostname)) {
      output.push(`[✓] Target is a valid IP: ${hostname}`);
      return {
        status: 'success',
        output,
        metadata: { addresses: [hostname], ip: true },
      };
    }

    output.push(`[+] Resolving ${hostname}...`);

    let primaryError = '';
    try {
      const addresses = await dnsResolve(hostname);
      output.push(`[✓] Resolved to: ${addresses.join(', ')}`);
      return {
        status: 'success',
        output,
        metadata: { addresses, resolver: 'default' },
      };
    } catch (error: any) {
      primaryError = String(error?.message || error);
      output.push(`[!] Primary resolver failed: ${primaryError}`);
    }

    try {
      const lookupAddresses = await this.dnsLookupAll(hostname);
      if (lookupAddresses.length > 0) {
        output.push(`[✓] Resolved via system lookup: ${lookupAddresses.join(', ')}`);
        return {
          status: 'success',
          output,
          metadata: {
            addresses: lookupAddresses,
            resolver: 'system_lookup',
            primaryError,
          },
        };
      }
    } catch (lookupError: any) {
      output.push(`[!] System lookup fallback failed: ${lookupError?.message || lookupError}`);
    }

    const fallbackResolvers = [
      { label: 'Cloudflare', servers: ['1.1.1.1', '1.0.0.1'] },
      { label: 'Google', servers: ['8.8.8.8', '8.8.4.4'] },
    ];

    for (const fallback of fallbackResolvers) {
      try {
        const addresses = await this.withTimeout(
          this.dnsResolveWithServers(hostname, fallback.servers),
          2500,
          `${fallback.label} DNS fallback`
        );
        if (addresses.length > 0) {
          output.push(`[✓] Resolved via ${fallback.label} fallback: ${addresses.join(', ')}`);
          return {
            status: 'success',
            output,
            metadata: {
              addresses,
              resolver: `fallback_${fallback.label.toLowerCase()}`,
              primaryError,
            },
          };
        }
      } catch (fallbackError: any) {
        output.push(`[!] ${fallback.label} fallback failed: ${fallbackError?.message || fallbackError}`);
      }
    }

    output.push(`[✗] DNS resolution failed after all fallbacks for ${hostname}`);
    output.push('[?] Check target spelling, container DNS/network, or try an IP target');
    return {
      status: 'error',
      output,
      metadata: { hostname, primaryError },
    };
  }

  private async checkMCP(): Promise<{ status: 'success' | 'error'; output: string[]; metadata?: Record<string, any> }> {
    const output: string[] = [];
    output.push('[+] Checking LEA Kali MCP JSON-RPC endpoint...');

    const healthy = await kaliMcpClient.healthCheck();
    const mode = kaliMcpClient.getMode();

    if (!healthy) {
      output.push('[✗] Kali MCP is not reachable');
      output.push(`[?] Endpoint: ${kaliMcpClient.getEndpoint()}`);
      return { status: 'error', output, metadata: { healthy: false, mode } };
    }

    if (mode !== 'jsonrpc') {
      output.push('[✗] Kali MCP is running in debug compatibility mode, strict mode requires JSON-RPC');
      output.push('[?] Disable MCP_DEBUG_COMPAT_LOCAL and ensure lea-kali-mcp is healthy');
      return { status: 'error', output, metadata: { healthy: true, mode } };
    }

    output.push('[✓] Kali MCP JSON-RPC endpoint is healthy');
    output.push(`[✓] Endpoint: ${kaliMcpClient.getEndpoint()}`);
    return { status: 'success', output, metadata: { healthy: true, mode } };
  }

  private async checkTools(
    options: PreflightOptions,
    remediationAttempts: PreflightRemediationAttempt[],
    callbacks: RunChecksCallbacks
  ): Promise<{ status: 'success' | 'error'; output: string[]; metadata?: Record<string, any> }> {
    const output: string[] = [];
    output.push('[+] Checking required pentest tools...');

    const profile = options.pentestType || 'quick';
    const requiredTools = REQUIRED_TOOLS_BY_TYPE[profile] || REQUIRED_TOOLS_BY_TYPE.quick;

    kaliMcpClient.clearToolCache();
    const tools = await kaliMcpClient.listTools();
    const toolNames = tools.map((tool) => tool.name.toLowerCase());

    let missing = requiredTools.filter((name) => !this.hasTool(toolNames, name));

    if (missing.length > 0) {
      output.push(`[!] Missing required tools: ${missing.join(', ')}`);
      output.push('[+] Attempting automatic remediation...');

      for (const missingTool of missing) {
        const install = TOOL_INSTALL_MAP[missingTool];
        const attempt: PreflightRemediationAttempt = {
          checkId: 'tools',
          tool: missingTool,
          attempted: true,
          success: false,
          message: '',
          timestamp: new Date().toISOString(),
        };

        if (!install) {
          attempt.message = `No installation mapping configured for ${missingTool}`;
          remediationAttempts.push(attempt);
          await callbacks.onRemediation?.(attempt);
          continue;
        }

        const result = await kaliMcpClient.callTool(
          'ensure_tool',
          {
            tool: install.tool,
            package: install.package,
            manager: 'auto',
          },
          600000,
          this.buildToolContext(options)
        );

        attempt.success = result.success;
        attempt.message = result.success
          ? `Installed ${install.package} (${install.tool})`
          : `Install failed for ${install.package}: ${result.error}`;

        remediationAttempts.push(attempt);
        await callbacks.onRemediation?.(attempt);
      }

      kaliMcpClient.clearToolCache();
      const postInstallTools = await kaliMcpClient.listTools();
      const postNames = postInstallTools.map((tool) => tool.name.toLowerCase());
      missing = requiredTools.filter((name) => !this.hasTool(postNames, name));
    }

    if (missing.length > 0) {
      output.push(`[✗] Required tools still missing after remediation: ${missing.join(', ')}`);
      return {
        status: 'error',
        output,
        metadata: {
          profile,
          missing,
          requiredTools,
        },
      };
    }

    output.push(`[✓] Required tools are available for profile: ${profile}`);
    for (const required of requiredTools) {
      output.push(`    [✓] ${required}`);
    }

    return {
      status: 'success',
      output,
      metadata: {
        profile,
        requiredTools,
      },
    };
  }

  private async checkWorkspace(options: PreflightOptions): Promise<{ status: 'success' | 'error'; output: string[]; metadata?: Record<string, any> }> {
    const output: string[] = [];
    const pentestId = options.pentestId || `preflight-${Date.now()}`;

    output.push('[+] Initializing Kali workspace...');
    const workspaceInit = await kaliMcpClient.callTool(
      'workspace_init',
      { pentest_id: pentestId },
      30000,
      this.buildToolContext(options)
    );

    if (!workspaceInit.success) {
      output.push(`[✗] workspace_init failed: ${workspaceInit.error}`);
      return { status: 'error', output };
    }

    const workspacePath = workspaceInit.output?.trim().split('\n').pop() || '';
    output.push(`[✓] Workspace initialized: ${workspacePath}`);

    const listResult = await kaliMcpClient.callTool(
      'workspace_list',
      { pentest_id: pentestId },
      30000,
      this.buildToolContext(options)
    );

    if (!listResult.success) {
      output.push(`[✗] workspace_list failed: ${listResult.error}`);
      return { status: 'error', output };
    }

    output.push('[✓] Workspace read access verified');

    const writeResult = await kaliMcpClient.callTool(
      'shell_exec',
      {
        pentest_id: pentestId,
        cwd: workspacePath,
        command: 'echo preflight_ok > .lea-preflight && cat .lea-preflight',
        timeout: 20,
      },
      30000,
      this.buildToolContext(options)
    );

    if (!writeResult.success) {
      output.push(`[✗] Workspace write test failed: ${writeResult.error}`);
      return { status: 'error', output };
    }

    output.push('[✓] Workspace write access verified');

    return {
      status: 'success',
      output,
      metadata: {
        workspace: workspacePath,
      },
    };
  }

  private async checkHTTP(target: string): Promise<{ status: 'success' | 'warning'; output: string[]; metadata?: Record<string, any> }> {
    const output: string[] = [];
    const metadata: Record<string, any> = {};

    const httpsUrl = this.normalizeUrl(target);
    const httpUrl = httpsUrl.replace(/^https:/, 'http:');

    output.push(`[+] Testing HTTPS: ${httpsUrl}`);
    output.push(`[+] Testing HTTP: ${httpUrl}`);

    const [httpsResult, httpResult] = await Promise.allSettled([
      this.fetchURL(httpsUrl, 6000),
      this.fetchURL(httpUrl, 6000),
    ]);

    if (httpsResult.status === 'fulfilled') {
      output.push(`[✓] HTTPS reachable: ${httpsResult.value.status} ${httpsResult.value.statusMessage}`);
      metadata.https = { success: true, status: httpsResult.value.status };
    } else {
      const error = httpsResult.reason instanceof Error ? httpsResult.reason.message : String(httpsResult.reason);
      output.push(`[!] HTTPS failed: ${error}`);
      metadata.https = { success: false, error };
    }

    if (httpResult.status === 'fulfilled') {
      output.push(`[✓] HTTP reachable: ${httpResult.value.status} ${httpResult.value.statusMessage}`);
      metadata.http = { success: true, status: httpResult.value.status };
    } else {
      const error = httpResult.reason instanceof Error ? httpResult.reason.message : String(httpResult.reason);
      output.push(`[!] HTTP failed: ${error}`);
      metadata.http = { success: false, error };
    }

    const hasSuccess = Boolean(metadata.http?.success || metadata.https?.success);
    return {
      status: hasSuccess ? 'success' : 'warning',
      output,
      metadata,
    };
  }

  private async checkPorts(options: PreflightOptions): Promise<{ status: 'success' | 'warning'; output: string[]; metadata?: Record<string, any> }> {
    const output: string[] = [];
    const target = this.normalizeHost(options.target);
    const commonPorts = '21,22,25,53,80,110,143,443,465,587,993,995,1433,1521,2049,2375,2376,3000,3001,3306,3389,5432,5601,5900,6379,6443,8000,8080,8443,9000,9200,27017';

    output.push(`[+] Scanning common ports on ${target}...`);

    const result = await kaliMcpClient.callTool(
      'nmap_scan',
      {
        target,
        ports: commonPorts,
        flags: '-sT -T4 --open --max-retries 1 --host-timeout 30s',
      },
      45000,
      this.buildToolContext(options)
    );

    if (!result.success) {
      output.push(`[!] Port scan failed: ${result.error}`);
      return { status: 'warning', output };
    }

    const openCount = (result.output?.match(/\bopen\b/g) || []).length;
    output.push(`[✓] Port scan completed (${openCount} open ports detected)`);
    if (result.output) {
      output.push('');
      output.push(result.output.substring(0, 1500));
    }

    return {
      status: 'success',
      output,
      metadata: { openCount },
    };
  }

  private async checkWAF(options: PreflightOptions): Promise<{ status: 'success' | 'warning'; output: string[]; metadata?: Record<string, any> }> {
    const output: string[] = [];
    const target = this.normalizeHost(options.target);

    output.push('[+] Detecting WAF...');

    const result = await kaliMcpClient.callTool(
      'waf_detect',
      { target },
      60000,
      this.buildToolContext(options)
    );

    if (!result.success) {
      output.push(`[!] WAF detection failed: ${result.error}`);
      return { status: 'warning', output };
    }

    const text = result.output || '';
    const hasWaf = /waf|firewall/i.test(text);
    output.push(hasWaf ? '[✓] WAF detected' : '[✓] No clear WAF detected');
    if (text) {
      output.push('');
      output.push(text.substring(0, 1000));
    }

    return {
      status: 'success',
      output,
      metadata: { wafDetected: hasWaf },
    };
  }

  private async checkTechStack(options: PreflightOptions): Promise<{ status: 'success' | 'warning'; output: string[]; metadata?: Record<string, any> }> {
    const output: string[] = [];
    const url = this.normalizeUrl(options.target);

    output.push('[+] Detecting technology stack...');

    const result = await kaliMcpClient.callTool(
      'whatweb_scan',
      { url },
      60000,
      this.buildToolContext(options)
    );

    if (!result.success) {
      output.push(`[!] Technology detection failed: ${result.error}`);
      return { status: 'warning', output };
    }

    output.push('[✓] Technology scan completed');
    if (result.output) {
      output.push('');
      output.push(result.output.substring(0, 1500));
    }

    return {
      status: 'success',
      output,
      metadata: { raw: result.output || '' },
    };
  }

  private async checkSecurityHeaders(options: PreflightOptions): Promise<{ status: 'success' | 'warning'; output: string[]; metadata?: Record<string, any> }> {
    const output: string[] = [];
    const url = this.normalizeUrl(options.target);

    output.push('[+] Checking security headers...');

    const result = await kaliMcpClient.callTool(
      'curl_request',
      {
        url,
        flags: '-I -s --connect-timeout 10',
      },
      30000,
      this.buildToolContext(options)
    );

    if (!result.success || !result.output) {
      output.push(`[!] Header check failed: ${result.error || 'No output'}`);
      return { status: 'warning', output };
    }

    const lower = result.output.toLowerCase();
    const required = [
      'strict-transport-security',
      'content-security-policy',
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection',
      'referrer-policy',
      'permissions-policy',
    ];

    const missing: string[] = [];
    for (const header of required) {
      if (!lower.includes(header)) {
        missing.push(header);
      }
    }

    const score = Math.round(((required.length - missing.length) / required.length) * 100);
    output.push(`[✓] Header score: ${score}%`);
    if (missing.length > 0) {
      output.push(`[!] Missing: ${missing.join(', ')}`);
    }

    return {
      status: score >= 50 ? 'success' : 'warning',
      output,
      metadata: { score, missing },
    };
  }

  private async fetchURL(url: string, timeout: number): Promise<{ status: number; statusMessage: string }> {
    return new Promise((resolve, reject) => {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { timeout }, (res) => {
        resolve({
          status: res.statusCode || 0,
          statusMessage: res.statusMessage || '',
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
  }
}
