/**
 * @module core/commands/command-context
 * @description Server-side command context builder.
 *
 * Provides the ServiceMap interface and a builder function for constructing
 * CommandContext instances with access to backend services via the index
 * signature on CommandContext.
 */

import type { CommandContext } from '../types/command-types.js';

// ============================================================================
// SERVICE MAP
// ============================================================================

/**
 * Map of backend services accessible to commands via CommandContext.
 *
 * Services are accessed through the `[key: string]: unknown` index signature
 * on CommandContext. Using `any` here since the index signature erases types.
 */
export interface ServiceMap {
  commandRegistry: any;
  swarmOrchestrator: any;
  persistentTaskManager: any;
  teamManager: any;
  runtimeTaskManager: any;
  permissionRequestStore: any;
  planModeManager: any;
  hookBus: any;
  prisma: any;
  sseManager: any;
  swarmState: any;
  costTracker: any;
  sessionStats: any;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build a CommandContext for server-side command execution.
 *
 * Spreads all services into the context so commands can access them
 * via `context.serviceName`.
 *
 * @param sessionId - The session identifier.
 * @param args - The raw arguments string.
 * @param services - Map of backend services to inject.
 * @returns A complete CommandContext with services attached.
 */
export function buildServerCommandContext(
  sessionId: string,
  args: string,
  services: ServiceMap,
): CommandContext {
  return {
    sessionId,
    args,
    toolUseContext: {} as any,
    tools: new Map() as any,
    ...services,
  };
}
