import { z } from 'zod';
import { buildTool } from '../runtime/ToolRegistry.js';
import type { LspAnalysisService } from './LspAnalysisService.js';

const LspQuerySchema = z.object({
  paths: z.array(z.string().min(1)).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export function createLspDiagnosticsTool(service: LspAnalysisService) {
  return buildTool({
    name: 'lsp:diagnostics',
    aliases: ['lsp_diagnostics'],
    description: 'Read TypeScript/JavaScript diagnostics for files in the current workspace.',
    source: 'lsp',
    inputSchema: LspQuerySchema,
    maxResultSizeChars: 80_000,
    checkPermissions: async () => ({ behavior: 'allow' }),
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    isDestructive: () => false,
    userFacingName: () => 'LSP diagnostics',
    getActivityDescription: () => 'Reading code diagnostics',
    call: async (input) => ({ data: await service.diagnostics(input) }),
  });
}

export function createLspSymbolsTool(service: LspAnalysisService) {
  return buildTool({
    name: 'lsp:symbols',
    aliases: ['lsp_symbols'],
    description: 'List TypeScript/JavaScript symbols for files in the current workspace.',
    source: 'lsp',
    inputSchema: LspQuerySchema,
    maxResultSizeChars: 80_000,
    checkPermissions: async () => ({ behavior: 'allow' }),
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    isDestructive: () => false,
    userFacingName: () => 'LSP symbols',
    getActivityDescription: () => 'Listing code symbols',
    call: async (input) => ({ data: await service.symbols(input) }),
  });
}
