/**
 * @module core/mcp/McpToolBridge
 * @description Bridges MCP (Kali) tools into the runtime ToolRegistry.
 *
 * ## Purpose
 *
 * LEA has two tool sources:
 * - **Local tools** (bash, task_output, etc.) — registered directly in ToolRegistry
 * - **MCP tools** (nmap, whois, curl, etc.) — exposed by the Kali container via JSON-RPC
 *
 * This bridge makes MCP tools visible in the unified ToolRegistry so that:
 * - `GET /api/tools` (C4) returns both local and MCP tools
 * - Agents can discover available MCP capabilities at runtime
 * - Future work: agents can invoke MCP tools through the standard Tool interface
 *
 * ## Architecture
 *
 * ```
 * KaliMCPClient --listTools()--> McpToolBridge --buildTool()--> ToolRegistry
 *                                     |
 *                              call() delegates to
 *                              kaliMcpClient.callTool()
 * ```
 *
 * ## Naming Convention
 *
 * MCP tools are prefixed with `mcp:` to avoid collisions with local tools:
 * - `mcp:nmap_scan` — Nmap port scanning (from Kali)
 * - `mcp:whois_lookup` — WHOIS lookup (from Kali)
 * - `bash` — local shell (no prefix, already in registry)
 *
 * ## Safety Stance
 *
 * Bridged MCP tools are registered with conservative defaults:
 * - **not read-only** — they execute real commands on Kali
 * - **not concurrency-safe** — network tools shouldn't parallelize on same target
 * - **not destructive** — KaliMCPClient enforces scope validation separately
 * - **enabled only when connected** — `isEnabled()` reflects MCP health
 */

import { z } from 'zod';
import { ToolRegistry, buildTool } from '../runtime/ToolRegistry.js';
import type { ToolUseContext } from '../types/tool-types.js';
import type { KaliMCPClient, MCPTool, ToolExecutionContext } from '../../services/mcp/KaliMCPClient.js';

// ============================================================================
// TYPES
// ============================================================================

/** Configuration for the bridge. */
export interface McpToolBridgeConfig {
  /** Prefix applied to MCP tool names in the registry (default: 'mcp:'). */
  prefix?: string;
  /** Maximum number of MCP tools to bridge (default: 100). */
  maxTools?: number;
  /** Tool names to exclude from bridging (e.g., dangerous shell escapes). */
  excludePatterns?: RegExp[];
  /** Optional resolver for pentest-aware scope context. */
  resolveExecutionContext?: (
    toolName: string,
    args: Record<string, unknown>,
    context: ToolUseContext,
  ) => Promise<ToolExecutionContext | undefined> | ToolExecutionContext | undefined;
}

/** Result of a sync operation. */
export interface SyncResult {
  /** Number of MCP tools successfully registered. */
  registered: number;
  /** Names of tools that were registered. */
  toolNames: string[];
  /** Whether the MCP client was healthy at sync time. */
  mcpHealthy: boolean;
}

// ============================================================================
// BRIDGE IMPLEMENTATION
// ============================================================================

export class McpToolBridge {
  private readonly client: KaliMCPClient;
  private readonly registry: ToolRegistry;
  private readonly config: Required<Omit<McpToolBridgeConfig, 'resolveExecutionContext'>> & Pick<McpToolBridgeConfig, 'resolveExecutionContext'>;

  /** Tracks previously bridged tool names for clean re-sync. */
  private readonly bridgedNames = new Set<string>();

  constructor(client: KaliMCPClient, registry: ToolRegistry, config: McpToolBridgeConfig = {}) {
    this.client = client;
    this.registry = registry;
    this.config = {
      prefix: config.prefix || 'mcp:',
      maxTools: config.maxTools ?? 100,
      excludePatterns: config.excludePatterns ?? [/^shell_exec$/i],
      resolveExecutionContext: config.resolveExecutionContext,
    };
  }

  /**
   * Synchronize MCP tools into the ToolRegistry.
   *
   * 1. Lists available tools from KaliMCPClient
   * 2. Filters out excluded patterns
   * 3. Adapts each tool to ToolDef format
   * 4. Registers (or re-registers) in ToolRegistry
   *
   * Call this at boot time and again if the MCP tool set changes
   * (e.g., after `kaliMcpClient.clearToolCache()`).
   */
  async syncToRegistry(): Promise<SyncResult> {
    // Check MCP health first
    const healthy = this.client.isConnected() || await this.client.healthCheck().catch(() => false);

    if (!healthy) {
      return { registered: 0, toolNames: [], mcpHealthy: false };
    }

    // List tools from MCP
    let mcpTools: MCPTool[];
    try {
      mcpTools = await this.client.listTools();
    } catch (error: any) {
      console.warn(`[McpToolBridge] Failed to list MCP tools: ${error.message}`);
      return { registered: 0, toolNames: [], mcpHealthy: false };
    }

    // Remove previously bridged tools before re-registering (clean re-sync)
    this.unregisterBridgedTools();

    // Filter and adapt
    const candidates = mcpTools
      .filter((t) => !this.config.excludePatterns.some((p) => p.test(t.name)))
      .slice(0, this.config.maxTools);

    const registeredNames: string[] = [];

    for (const mcpTool of candidates) {
      const registryName = `${this.config.prefix}${mcpTool.name}`;

      try {
        const tool = this.buildBridgedTool(mcpTool, registryName);
        this.registry.register(tool);
        this.bridgedNames.add(registryName);
        registeredNames.push(registryName);
      } catch (error: any) {
        // Skip tools that fail to register (e.g., name collision with non-MCP tool)
        console.warn(`[McpToolBridge] Failed to bridge '${mcpTool.name}': ${error.message}`);
      }
    }

    console.log(
      `[McpToolBridge] Synced ${registeredNames.length}/${candidates.length} MCP tools ` +
      `(total available: ${mcpTools.length}, healthy: ${healthy})`
    );

    return {
      registered: registeredNames.length,
      toolNames: registeredNames,
      mcpHealthy: true,
    };
  }

  /**
   * Get the names of currently bridged MCP tools.
   */
  getBridgedNames(): readonly string[] {
    return [...this.bridgedNames];
  }

  /**
   * Check if a specific MCP tool is currently bridged.
   */
  isBridged(mcpToolName: string): boolean {
    return this.bridgedNames.has(`${this.config.prefix}${mcpToolName}`);
  }

  // ============================================================================
  // PRIVATE — TOOL ADAPTATION
  // ============================================================================

  /**
   * Build a ToolDef from an MCP tool definition, then create a Tool via buildTool().
   *
   * The resulting Tool:
   * - Delegates execution to `kaliMcpClient.callTool()`
   * - Uses a loose Zod schema derived from the MCP tool's inputSchema
   * - Is enabled only when MCP client is connected
   * - Logs MCP tool usage for audit trail
   * - Validates basic sanity (no empty shell commands, etc.)
   */
  private buildBridgedTool(mcpTool: MCPTool, registryName: string) {
    const inputSchema = this.adaptInputSchema(mcpTool.inputSchema);
    const originalName = mcpTool.name;
    const prefixLen = this.config.prefix.length;
    const client = this.client;
    const thisBridge = this;

    return buildTool({
      name: registryName,
      description: `[MCP] ${mcpTool.description}`,
      aliases: [mcpTool.name], // Allow lookup by original MCP name too
      inputSchema,
      maxResultSizeChars: 100_000, // MCP tools can produce large output
      source: 'mcp',

      async call(args: Record<string, unknown>, context: ToolUseContext) {
        const executionContext = await thisBridge.buildExecutionContext(originalName, args ?? {}, context);
        const result = await client.callTool(originalName, args ?? {}, 120000, executionContext);

        // Return clean string data — matching local tool convention so ToolExecutor
        // produces a readable result for the agent (not a JSON-wrapped object).
        // On success: the raw tool output string.
        // On failure: the error message string (ToolExecutor will mark it isError).
        const data: string = result.success
          ? (result.output ?? '[MCP] No output')
          : `[MCP Error] ${result.error ?? 'Unknown error'}`;

        return {
          data,
          metadata: {
            duration: result.duration,
            toolName: result.toolName,
            mcpOriginalName: originalName,
          },
        };
      },

      async checkPermissions(input: Record<string, unknown>, _context: unknown) {
        // Fail-closed when MCP client is disconnected
        if (!client.isConnected()) {
          return {
            behavior: 'deny' as const,
            message: `MCP tool '${originalName}' is unavailable — Kali container not connected`,
          };
        }

        // Log MCP tool usage for audit trail
        const argsSummary = Object.keys(input).length > 0
          ? `${Object.keys(input).join(', ')}`
          : 'no args';

        console.log(`[McpToolBridge] Permission check: ${registryName} (${argsSummary})`);

        // Basic sanity checks for known dangerous patterns
        const strInput = JSON.stringify(input);

        // Block empty command arguments for tools that might execute commands
        if (originalName === 'shell_exec' || originalName === 'bash_command') {
          const cmd = typeof input?.command === 'string' ? input.command : '';
          if (!cmd || cmd.trim().length === 0) {
            console.warn(`[McpToolBridge] Denied ${registryName}: empty command`);
            return {
              behavior: 'deny' as const,
              message: 'Empty command not allowed',
            };
          }

          // Block obvious shell escapes
          const dangerous = ['rm -rf /', 'mkfs', 'dd if=/dev/zero', '> /dev/sda'];
          if (dangerous.some(p => cmd.includes(p))) {
            console.warn(`[McpToolBridge] Denied ${registryName}: dangerous command pattern`);
            return {
              behavior: 'deny' as const,
              message: 'Dangerous command pattern detected',
            };
          }
        }

        // Allow by default - scope validation handled by KaliMCPClient
        // Use 'passthrough' so PermissionEngine can still apply agent-level rules
        return { behavior: 'passthrough' as const };
      },

      isEnabled(): boolean {
        return client.isConnected();
      },

      isReadOnly(): boolean {
        return false; // MCP tools execute real commands on Kali
      },

      isConcurrencySafe(): boolean {
        return false; // Network tools shouldn't parallelize on same target
      },

      isDestructive(): boolean {
        return false; // Scope validation handled by KaliMCPClient
      },

      userFacingName(): string {
        // Strip the mcp: prefix for user-facing display
        return registryName.slice(prefixLen);
      },
    });
  }

  private async buildExecutionContext(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolUseContext,
  ): Promise<ToolExecutionContext | undefined> {
    const resolved = await this.config.resolveExecutionContext?.(toolName, args, context);
    if (resolved) return resolved;

    const explicit = context.mcpContext;
    if (explicit && typeof explicit === 'object') {
      return explicit as ToolExecutionContext;
    }

    const asStringArray = (value: unknown): string[] | undefined =>
      Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : undefined;
    const pentestId = typeof context.pentestId === 'string' ? context.pentestId : undefined;
    const actor = typeof context.agentId === 'string' ? context.agentId : undefined;
    const target = typeof context.target === 'string' ? context.target : undefined;
    const inScope = asStringArray(context.inScope);
    const outOfScope = asStringArray(context.outOfScope);
    const pendingScopeDomains = asStringArray(context.pendingScopeDomains);

    if (!pentestId && !target && !inScope && !outOfScope && !pendingScopeDomains) {
      return undefined;
    }

    return {
      pentestId,
      actor,
      target,
      inScope,
      outOfScope,
      pendingScopeDomains,
      scopeMode: 'extended',
    };
  }

  /**
   * Adapt MCP JSON Schema input to a Zod schema.
   *
   * Best-effort conversion for metadata display purposes.
   * Actual validation is performed by the MCP server.
   *
   * - JSON Schema with `properties` → `z.object({ ... }).passthrough()`
   * - No schema or empty schema → `z.record(z.unknown())`
   */
  private adaptInputSchema(mcpSchema: Record<string, unknown> | undefined): z.ZodType {
    if (!mcpSchema || typeof mcpSchema !== 'object') {
      return z.record(z.unknown());
    }

    const props = mcpSchema.properties;
    if (!props || typeof props !== 'object' || Array.isArray(props)) {
      return z.record(z.unknown());
    }

    // Build a Zod object with loose property types for metadata visibility
    const shape: Record<string, z.ZodType> = {};
    for (const [key] of Object.entries(props)) {
      shape[key] = z.unknown();
    }

    return z.object(shape).passthrough();
  }

  /**
   * Unregister all previously bridged tools (for clean re-sync).
   */
  private unregisterBridgedTools(): void {
    for (const name of this.bridgedNames) {
      try {
        this.registry.unregister(name);
      } catch {
        // Ignore unregistration errors (tool may not exist)
      }
    }
    this.bridgedNames.clear();
  }
}
