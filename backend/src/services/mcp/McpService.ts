/**
 * @deprecated Legacy MCP service — use KaliMCPClient instead.
 *
 * This file is retained for reference only. All production MCP traffic now goes
 * through `KaliMCPClient` (`./mcp/KaliMCPClient.ts`), which provides:
 * - Real JSON-RPC communication with the LEA Kali container
 * - Scope validation (in-scope / out-of-scope / pending)
 * - Compat-local mode for development without Docker
 *
 * **Do not import this file in new code.** It will be removed in a future release.
 *
 * @see KaliMCPClient
 */

export interface McpConnectionConfig {
  endpoint?: string;
  command?: string;
  args?: string[];
  timeout?: number;
}

export interface McpToolResult {
  success: boolean;
  toolName: string;
  output?: string;
  error?: string;
  duration: number;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema?: any;
}

/**
 * MCP Service - HTTP-based implementation
 * For now, this is a placeholder that can work with or without actual MCP server
 * In production, you would replace this with the actual MCP SDK if needed
 */
export class McpService {
  private isConnected = false;
  private availableTools: Map<string, Tool> = new Map();
  private httpClient: any = null;

  constructor(private config: McpConnectionConfig = {}) {
    // Try to import axios if available
    try {
      if (config.endpoint) {
        this.httpClient = require('axios').create({
          baseURL: config.endpoint,
          timeout: config.timeout || 30000
        });
      }
    } catch (error) {
      console.warn('[MCP] axios not available, will use simulation mode');
    }
  }

  /**
   * Connect to MCP server
   */
  async connect(): Promise<void> {
    try {
      if (this.config.endpoint && this.httpClient) {
        // HTTP connection - try to ping the server
        try {
          const response = await this.httpClient.get('/health');

          if (response.status === 200) {
            this.isConnected = true;
            await this.loadTools();
            console.log('[MCP] Connected via HTTP');
            return;
          }
        } catch (httpError) {
          console.warn('[MCP] HTTP endpoint not reachable, using simulation mode');
        }
      }

      // If we get here, either no endpoint configured or endpoint not reachable
      // Load default tools and run in simulation mode
      this.loadDefaultTools();
      this.isConnected = true;
      console.log('[MCP] Running in simulation mode');
    } catch (error) {
      console.error('[MCP] Connection failed:', error);
      // Still allow operation in degraded mode
      this.loadDefaultTools();
    }
  }

  /**
   * Load available tools from MCP server
   */
  private async loadTools(): Promise<void> {
    if (!this.isConnected || !this.httpClient) {
      this.loadDefaultTools();
      return;
    }

    try {
      const response = await this.httpClient.get('/tools');

      if (response.data && Array.isArray(response.data.tools)) {
        this.availableTools.clear();
        for (const tool of response.data.tools) {
          this.availableTools.set(tool.name, tool);
        }
        console.log(`[MCP] Loaded ${this.availableTools.size} tools from server`);
      } else {
        this.loadDefaultTools();
      }
    } catch (error) {
      console.error('[MCP] Failed to load tools from server:', error);
      this.loadDefaultTools();
    }
  }

  /**
   * Load default tools (fallback when MCP server is not available)
   */
  private loadDefaultTools(): void {
    const defaultTools: Tool[] = [
      { name: 'nmap_scan', description: 'Port scanning with Nmap' },
      { name: 'dns_enum', description: 'DNS enumeration' },
      { name: 'subdomain_search', description: 'Subdomain discovery' },
      { name: 'whois_lookup', description: 'WHOIS lookup' },
      { name: 'nikto_scan', description: 'Web server scanning' },
      { name: 'nuclei_scan', description: 'Template-based scanning' },
      { name: 'sqlmap_scan', description: 'SQL injection detection' },
      { name: 'wappalyzer', description: 'Technology detection' },
      { name: 'security_headers', description: 'Security headers analysis' },
      { name: 'waf_detect', description: 'WAF detection' },
      { name: 'curl', description: 'HTTP requests' },
      { name: 'ping', description: 'ICMP ping' },
      { name: 'ssl_check', description: 'SSL/TLS certificate check' },
      { name: 'rate_limit_check', description: 'Rate limiting detection' }
    ];

    this.availableTools.clear();
    for (const tool of defaultTools) {
      this.availableTools.set(tool.name, tool);
    }

    if (this.availableTools.size > 0) {
      console.log(`[MCP] Loaded ${this.availableTools.size} default tools`);
    }
  }

  /**
   * Get list of available tools
   */
  getAvailableTools(): Tool[] {
    if (this.availableTools.size === 0) {
      this.loadDefaultTools();
    }
    return Array.from(this.availableTools.values());
  }

  /**
   * Get tool by name
   */
  getTool(name: string): Tool | undefined {
    if (this.availableTools.size === 0) {
      this.loadDefaultTools();
    }
    return this.availableTools.get(name);
  }

  /**
   * Check if tool is available
   */
  hasTool(name: string): boolean {
    if (this.availableTools.size === 0) {
      this.loadDefaultTools();
    }
    return this.availableTools.has(name);
  }

  /**
   * Execute a tool via MCP
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown> = {}
  ): Promise<McpToolResult> {
    const startTime = Date.now();

    // Try to execute via HTTP if client is available
    if (this.httpClient && this.isConnected) {
      try {
        const response = await this.httpClient.post(
          `/tools/${toolName}`,
          args,
          { timeout: this.config.timeout || 30000 }
        );

        const duration = Date.now() - startTime;

        if (response.data && response.data.success !== false) {
          return {
            success: true,
            toolName,
            output: response.data.output || response.data.result,
            duration
          };
        }

        // If HTTP call fails, fall back to simulation
      } catch (httpError) {
        console.warn(`[MCP] HTTP execution failed for ${toolName}, using simulation`);
      }
    }

    // Fallback to simulation
    return this.simulateToolExecution(toolName, args, startTime);
  }

  /**
   * Simulate tool execution (fallback when MCP is not available)
   * This provides realistic output for development and testing
   */
  private simulateToolExecution(
    toolName: string,
    args: Record<string, unknown>,
    startTime: number
  ): McpToolResult {
    const duration = Date.now() - startTime;

    console.log(`[MCP] Simulating execution of ${toolName}`);

    // Simulate different tools
    switch (toolName) {
      case 'nmap_scan':
        return {
          success: true,
          toolName,
          output: `Starting Nmap scan for ${args.target}...\n` +
                  `Scanning ports 1-1000...\n` +
                  `\n` +
                  `PORT    STATE SERVICE  VERSION\n` +
                  `22/tcp  open  ssh      OpenSSH 8.2p1 Ubuntu\n` +
                  `80/tcp  open  http     nginx 1.18.0\n` +
                  `443/tcp open  https    nginx 1.18.0\n` +
                  `\n` +
                  `Service detection performed. Please report any incorrect results.\n` +
                  `\n` +
                  `Nmap done at ${new Date().toISOString()}`,
          duration
        };

      case 'dns_enum':
        return {
          success: true,
          toolName,
          output: `DNS enumeration for ${args.target}:\n` +
                  `\n` +
                  `A Records:\n` +
                  `  93.184.216.34\n` +
                  `\n` +
                  `AAAA Records:\n` +
                  `  2606:2800:220:1:248:1893:25c8:1946\n` +
                  `\n` +
                  `MX Records:\n` +
                  `  mail.example.com\n` +
                  `\n` +
                  `NS Records:\n` +
                  `  ns1.example.com\n` +
                  `  ns2.example.com`,
          duration
        };

      case 'wappalyzer':
        return {
          success: true,
          toolName,
          output: JSON.stringify({
            'Nginx': '1.18.0',
            'React': '17.0.2',
            'jQuery': '3.6.0',
            'Bootstrap': '5.1.3',
            'Font Awesome': '5.15.4',
            'Google Analytics': 'UA-12345678-1'
          }, null, 2),
          duration
        };

      case 'security_headers':
        return {
          success: true,
          toolName,
          output: JSON.stringify({
            score: 65,
            missing: [
              'X-Frame-Options',
              'Content-Security-Policy',
              'X-Content-Type-Options'
            ],
            present: [
              'X-XSS-Protection',
              'Strict-Transport-Security'
            ]
          }, null, 2),
          duration
        };

      case 'waf_detect':
        return {
          success: true,
          toolName,
          output: `WAF Detection Results for ${args.target}:\n` +
                  `\n` +
                  `Checking for WAF signatures...\n` +
                  `\n` +
                  `Headers analyzed:\n` +
                  `  Server: nginx\n` +
                  `  X-Backend-Server: localhost\n` +
                  `\n` +
                  `Result: No WAF detected`,
          duration
        };

      case 'ping':
        return {
          success: true,
          toolName,
          output: `PING ${args.target}:\n` +
                  `64 bytes from ${args.target}: icmp_seq=0 ttl=54 time=12.3 ms\n` +
                  `64 bytes from ${args.target}: icmp_seq=1 ttl=54 time=11.8 ms\n` +
                  `64 bytes from ${args.target}: icmp_seq=2 ttl=54 time=12.1 ms\n` +
                  `64 bytes from ${args.target}: icmp_seq=3 ttl=54 time=11.9 ms\n` +
                  `\n` +
                  `--- ${args.target} ping statistics ---\n` +
                  `4 packets transmitted, 4 packets received, 0.0% packet loss\n` +
                  `round-trip min/avg/max/stddev = 11.8/12.0/12.3/0.2 ms`,
          duration
        };

      case 'curl':
        return {
          success: true,
          toolName,
          output: `HTTP/1.1 200 OK\n` +
                  `Content-Type: text/html; charset=UTF-8\n` +
                  `Server: nginx/1.18.0\n` +
                  `Date: ${new Date().toUTCString()}\n` +
                  `Connection: keep-alive\n` +
                  `X-Frame-Options: SAMEORIGIN\n` +
                  `X-XSS-Protection: 1; mode=block`,
          duration
        };

      case 'ssl_check':
        return {
          success: true,
          toolName,
          output: `SSL/TLS Certificate Analysis for ${args.target}:\n` +
                  `\n` +
                  `Issuer: Let's Encrypt Authority X3\n` +
                  `Subject: ${args.target}\n` +
                  `Valid From: 2024-01-15\n` +
                  `Valid To: 2025-01-15\n` +
                  `Protocol: TLSv1.3\n` +
                  `Cipher: TLS_AES_256_GCM_SHA384\n` +
                  `\n` +
                  `Certificate is VALID`,
          duration
        };

      case 'rate_limit_check':
        return {
          success: true,
          toolName,
          output: `Rate Limiting Check for ${args.target}:\n` +
                  `\n` +
                  `Sending 10 test requests...\n` +
                  `\n` +
                  `Request 1: 200 OK (45ms)\n` +
                  `Request 2: 200 OK (43ms)\n` +
                  `Request 3: 200 OK (47ms)\n` +
                  `Request 4: 200 OK (44ms)\n` +
                  `Request 5: 200 OK (46ms)\n` +
                  `Request 6: 200 OK (45ms)\n` +
                  `Request 7: 200 OK (48ms)\n` +
                  `Request 8: 200 OK (44ms)\n` +
                  `Request 9: 200 OK (47ms)\n` +
                  `Request 10: 200 OK (45ms)\n` +
                  `\n` +
                  `Result: No rate limiting detected`,
          duration
        };

      default:
        return {
          success: true,
          toolName,
          output: `[Simulated] Tool ${toolName} executed\n` +
                  `Target: ${args.target || 'not specified'}\n` +
                  `Arguments: ${JSON.stringify(args, null, 2)}\n` +
                  `\n` +
                  `Execution time: ${duration}ms\n` +
                  `Status: Completed successfully`,
          duration
        };
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.availableTools.clear();
    console.log('[MCP] Disconnected');
  }

  /**
   * Check connection status
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }
}

/**
 * MCP Tool Categories for Pentesting
 */
export const MCP_PENTEST_TOOLS = {
  // Reconnaissance
  RECON: [
    'nmap_scan',
    'dns_enum',
    'subdomain_search',
    'whois_lookup'
  ],

  // Vulnerability Scanning
  VULN_SCAN: [
    'nikto_scan',
    'sqlmap_scan',
    'nuclei_scan'
  ],

  // Exploitation
  EXPLOIT: [
    'metasploit_exploit',
    'searchsploit'
  ],

  // Password Attacks
  PASSWORD: [
    'john_hash',
    'hashcat_crack',
    'hydra_brute'
  ],

  // Network Tools
  NETWORK: [
    'netcat_connect',
    'socat_tunnel'
  ],

  // Web Tools
  WEB: [
    'burp_scan',
    'dirbuster_scan',
    'gobuster_scan',
    'ffuf_fuzz',
    'wappalyzer',
    'security_headers',
    'waf_detect'
  ]
};
