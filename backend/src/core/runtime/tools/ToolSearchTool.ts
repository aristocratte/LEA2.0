import { z } from 'zod';
import { buildTool } from '../ToolRegistry.js';
import type { ToolRegistry } from '../ToolRegistry.js';
import type { Tool, ToolSource } from '../../types/tool-types.js';

const ToolSearchInputSchema = z.object({
  q: z.string().optional(),
  source: z.enum(['local', 'mcp', 'skill', 'plugin', 'lsp']).optional(),
  enabled: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type ToolSearchInput = z.infer<typeof ToolSearchInputSchema>;

export interface ToolSearchItem {
  name: string;
  aliases: string[];
  description: string;
  source: ToolSource;
  enabled: boolean;
  readOnly: boolean;
  destructive: boolean;
}

export interface ToolSearchResult {
  query?: string;
  total: number;
  tools: ToolSearchItem[];
}

function safeBoolean(read: () => boolean, fallback = false): boolean {
  try {
    return read();
  } catch {
    return fallback;
  }
}

function toSearchItem(tool: Tool): ToolSearchItem {
  return {
    name: tool.name,
    aliases: [...(tool.aliases ?? [])],
    description: tool.description,
    source: tool.source ?? 'local',
    enabled: safeBoolean(() => tool.isEnabled(), false),
    readOnly: safeBoolean(() => tool.isReadOnly(undefined as never), false),
    destructive: safeBoolean(() => tool.isDestructive?.(undefined as never) ?? false, false),
  };
}

function matchesQuery(item: ToolSearchItem, query: string): boolean {
  const q = query.toLowerCase();
  return (
    item.name.toLowerCase().includes(q) ||
    item.description.toLowerCase().includes(q) ||
    item.aliases.some((alias) => alias.toLowerCase().includes(q))
  );
}

export function createToolSearchTool(registry: ToolRegistry) {
  return buildTool<ToolSearchInput, ToolSearchResult>({
    name: 'tool_search',
    aliases: ['tools.search', 'search_tools'],
    description: 'Search available runtime tools by name, alias, description, source, enabled state, or read-only state.',
    source: 'local',
    inputSchema: ToolSearchInputSchema,
    maxResultSizeChars: 50_000,
    checkPermissions: async () => ({ behavior: 'allow' }),
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    isDestructive: () => false,
    userFacingName: () => 'Search tools',
    getActivityDescription: (input) => input.q ? `Searching tools for "${input.q}"` : 'Listing tools',
    async call(input) {
      const query = input.q?.trim();
      let items = Array.from(registry.getAll().values()).map(toSearchItem);

      if (input.source) {
        items = items.filter((item) => item.source === input.source);
      }
      if (input.enabled !== undefined) {
        items = items.filter((item) => item.enabled === input.enabled);
      }
      if (input.readOnly !== undefined) {
        items = items.filter((item) => item.readOnly === input.readOnly);
      }
      if (query) {
        items = items.filter((item) => matchesQuery(item, query));
      }

      items.sort((a, b) => a.name.localeCompare(b.name));
      const total = items.length;

      return {
        data: {
          query,
          total,
          tools: items.slice(0, input.limit),
        },
      };
    },
  });
}
