/**
 * @module core/runtime/ToolRegistry
 * @description Tool registry with factory function for building complete tools.
 *
 * The ToolRegistry manages tool registration, lookup, and lifecycle. It provides
 * the buildTool factory function that creates complete Tool implementations from
 * partial ToolDef definitions.
 *
 * Inspired by claude-code's Tool.ts architecture.
 */

import type {
  Tool,
  ToolDef,
  ToolResult,
  ToolUseContext,
  ToolPermissionResult,
  ToolExecutionError,
  ToolSource,
} from '../types/tool-types.js';
import type {
  PermissionBehavior,
  PermissionContext,
} from '../permissions/types.js';
import { z } from 'zod';

// ============================================================================
// DEFAULT IMPLEMENTATIONS
// ============================================================================

async function defaultCheckPermissions<Input = unknown>(
  _input: Input,
  _context: ToolUseContext,
): Promise<ToolPermissionResult<Input>> {
  return { behavior: 'allow' as PermissionBehavior };
}

function defaultIsEnabled(): boolean {
  return true;
}

function defaultIsReadOnly(_input: unknown): boolean {
  return false;
}

function defaultIsConcurrencySafe(_input: unknown): boolean {
  return false;
}

function defaultIsDestructive(_input: unknown): boolean {
  return false;
}

function defaultUserFacingName(this: Tool<unknown, unknown>, _input: unknown): string {
  return this.name;
}

function defaultGetActivityDescription(_input: unknown): string | null {
  return null;
}

// ============================================================================
// BUILT TOOL IMPLEMENTATION
// ============================================================================

/**
 * A complete Tool implementation built from a ToolDef.
 *
 * This class wraps a partial ToolDef with default implementations for all
 * optional methods, creating a complete Tool that satisfies the interface.
 */
class BuiltTool<Input = unknown, Output = unknown> implements Tool<Input, Output> {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description: string;
  readonly inputSchema: z.ZodType<Input>;
  readonly outputSchema?: z.ZodType<Output>;
  readonly maxResultSizeChars: number;

  private readonly _source: ToolSource;
  private readonly _call: (args: Input, context: ToolUseContext) => Promise<ToolResult<Output>>;
  private readonly _checkPermissions: (input: Input, context: ToolUseContext) => Promise<ToolPermissionResult<Input>>;
  private readonly _isEnabled: () => boolean;
  private readonly _isReadOnly: (input: Input) => boolean;
  private readonly _isConcurrencySafe: (input: Input) => boolean;
  private readonly _isDestructive: (input: Input) => boolean;
  private readonly _userFacingName: (input: Input) => string;
  private readonly _getActivityDescription?: (input: Input) => string | null;

  constructor(def: ToolDef<Input, Output>) {
    this.name = def.name;
    this.aliases = def.aliases;
    this.description = def.description;
    this.inputSchema = def.inputSchema;
    this.outputSchema = def.outputSchema;
    this.maxResultSizeChars = def.maxResultSizeChars;
    this._source = def.source ?? 'local';

    // Core method (required)
    this._call = def.call;

    // Optional methods with defaults - cast to satisfy type constraints
    this._checkPermissions = (def.checkPermissions ?? defaultCheckPermissions) as (
      input: Input,
      context: ToolUseContext,
    ) => Promise<ToolPermissionResult<Input>>;
    this._isEnabled = def.isEnabled ?? defaultIsEnabled;
    this._isReadOnly = def.isReadOnly ?? defaultIsReadOnly;
    this._isConcurrencySafe = def.isConcurrencySafe ?? defaultIsConcurrencySafe;
    this._isDestructive = def.isDestructive ?? defaultIsDestructive;
    this._userFacingName = def.userFacingName ?? defaultUserFacingName.bind(this);
    this._getActivityDescription = def.getActivityDescription ?? defaultGetActivityDescription;
  }

  async call(args: Input, context: ToolUseContext): Promise<ToolResult<Output>> {
    return this._call(args, context);
  }

  async checkPermissions(input: Input, context: ToolUseContext): Promise<ToolPermissionResult<Input>> {
    return this._checkPermissions(input, context);
  }

  isEnabled(): boolean {
    return this._isEnabled();
  }

  isReadOnly(input: Input): boolean {
    return this._isReadOnly(input);
  }

  isConcurrencySafe(input: Input): boolean {
    return this._isConcurrencySafe(input);
  }

  isDestructive(input: Input): boolean {
    return this._isDestructive(input);
  }

  userFacingName(input: Input): string {
    return this._userFacingName(input);
  }

  getActivityDescription(input: Input): string | null {
    return this._getActivityDescription?.(input) ?? null;
  }

  get source(): ToolSource {
    return this._source;
  }
}

// ============================================================================
// TOOL REGISTRY
// ============================================================================

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private readonly aliases = new Map<string, string>();

  register<Input = unknown, Output = unknown>(def: ToolDef<Input, Output>): void {
    const candidate = def as unknown as Tool;
    if (
      typeof candidate.call === 'function' &&
      typeof candidate.isEnabled === 'function' &&
      typeof candidate.isReadOnly === 'function' &&
      !Object.prototype.hasOwnProperty.call(def as unknown as object, 'isEnabled')
    ) {
      return this.registerTool(candidate);
    }

    const canonicalName = def.name;
    this.validateRegistration(canonicalName, def.aliases);

    const tool = new BuiltTool<Input, Output>(def);
    this.tools.set(canonicalName, tool);
    for (const alias of def.aliases ?? []) {
      this.aliases.set(alias, canonicalName);
    }
  }

  registerTool<Input = unknown, Output = unknown>(tool: Tool<Input, Output>): void {
    const canonicalName = tool.name;
    this.validateRegistration(canonicalName, tool.aliases);

    this.tools.set(canonicalName, tool);
    for (const alias of tool.aliases ?? []) {
      this.aliases.set(alias, canonicalName);
    }
  }

  private validateRegistration(canonicalName: string, aliases: readonly string[] | undefined): void {
    if (this.tools.has(canonicalName)) {
      throw new Error(`Tool "${canonicalName}" is already registered`);
    }
    if (this.aliases.has(canonicalName)) {
      throw new Error(`Tool "${canonicalName}" conflicts with existing alias`);
    }

    const seenAliases = new Set<string>();
    for (const alias of aliases ?? []) {
      if (seenAliases.has(alias)) {
        throw new Error(`Alias "${alias}" is duplicated`);
      }
      if (this.tools.has(alias)) {
        throw new Error(`Alias "${alias}" conflicts with existing tool name`);
      }
      if (this.aliases.has(alias)) {
        throw new Error(`Alias "${alias}" conflicts with existing alias`);
      }
      seenAliases.add(alias);
    }
  }

  unregister(name: string): boolean {
    const canonicalName = this.resolveAlias(name);
    if (!canonicalName) return false;

    const aliasesToDelete: string[] = [];
    this.aliases.forEach((target, alias) => {
      if (target === canonicalName) aliasesToDelete.push(alias);
    });
    for (const alias of aliasesToDelete) {
      this.aliases.delete(alias);
    }

    return this.tools.delete(canonicalName);
  }

  get(name: string): Tool | undefined {
    const canonicalName = this.resolveAlias(name);
    return canonicalName ? this.tools.get(canonicalName) : undefined;
  }

  has(name: string): boolean {
    return this.resolveAlias(name) !== undefined;
  }

  getAll(): ReadonlyMap<string, Tool> {
    return this.tools;
  }

  getEnabled(): Tool[] {
    return Array.from(this.tools.values()).filter((tool) => tool.isEnabled());
  }

  resolveAlias(name: string): string | undefined {
    if (this.tools.has(name)) return name;
    return this.aliases.get(name);
  }

  clear(): void {
    this.tools.clear();
    this.aliases.clear();
  }

  get size(): number {
    return this.tools.size;
  }
}

// ============================================================================
// TOOL BUILDER FACTORY
// ============================================================================

export function buildTool<Input = unknown, Output = unknown>(
  def: ToolDef<Input, Output>,
): Tool<Input, Output> {
  return new BuiltTool<Input, Output>(def);
}

// ============================================================================
// CREATE TOOL EXECUTION ERROR
// ============================================================================

export function createToolExecutionError(
  toolName: string,
  input: unknown,
  cause: Error,
  recoverable = false,
  suggestions?: readonly string[],
): ToolExecutionError {
  const baseError = new Error(`Tool "${toolName}" execution failed: ${cause.message}`);
  const error: ToolExecutionError = {
    name: 'ToolExecutionError',
    message: baseError.message,
    stack: baseError.stack,
    toolName,
    input,
    cause,
    recoverable,
    suggestions,
  } as ToolExecutionError;
  Object.setPrototypeOf(error, Error.prototype);
  Object.freeze(error);
  return error;
}

export default ToolRegistry;
