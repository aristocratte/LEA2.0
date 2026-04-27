/**
 * @module permissions/PermissionEngine
 * @description Main permission checking engine for LEA.
 *
 * Implements the core permission pipeline:
 * 1. Check deny rules (deny-first)
 * 2. Check tool-level permission implementation
 * 3. Check mode (bypass, acceptEdits, etc.)
 * 4. Check allow rules
 * 5. Default → ask
 *
 * Also supports classifier-based auto-approval integration.
 */

import type {
  PermissionBehavior,
  PermissionContext,
  PermissionDecision,
  PermissionDecisionReason,
  PermissionResult,
  PermissionRule,
  PermissionRuleSource,
  PermissionRuleValue,
  PermissionMode,
  ToolPermissionCheck,
  PermissionUpdate,
} from './types.js';

import {
  PERMISSION_RULE_SOURCES,
  permissionRuleValueFromString,
  permissionRuleSourceDisplayString,
  buildPermissionRule,
} from './PermissionRule.js';

// ---------------------------------------------------------------------------
// Rule collection helpers
// ---------------------------------------------------------------------------

/**
 * Get all allow rules from a permission context.
 */
export function getAllowRules(context: PermissionContext): PermissionRule[] {
  return PERMISSION_RULE_SOURCES.flatMap(source =>
    (context.alwaysAllowRules[source] ?? []).map(ruleString =>
      buildPermissionRule(source, 'allow', ruleString),
    ),
  );
}

/**
 * Get all deny rules from a permission context.
 */
export function getDenyRules(context: PermissionContext): PermissionRule[] {
  return PERMISSION_RULE_SOURCES.flatMap(source =>
    (context.alwaysDenyRules[source] ?? []).map(ruleString =>
      buildPermissionRule(source, 'deny', ruleString),
    ),
  );
}

/**
 * Get all ask rules from a permission context.
 */
export function getAskRules(context: PermissionContext): PermissionRule[] {
  return PERMISSION_RULE_SOURCES.flatMap(source =>
    (context.alwaysAskRules[source] ?? []).map(ruleString =>
      buildPermissionRule(source, 'ask', ruleString),
    ),
  );
}

// ---------------------------------------------------------------------------
// Rule matching
// ---------------------------------------------------------------------------

/**
 * Check if an entire tool matches a rule (no rule content).
 * E.g., rule "Bash" matches tool "Bash" but not "Bash(npm install)".
 */
function toolMatchesRule(toolName: string, rule: PermissionRule): boolean {
  if (rule.ruleValue.ruleContent !== undefined) return false;
  return rule.ruleValue.toolName === toolName;
}

/**
 * Find a tool-wide rule matching the given tool name.
 */
function findToolRule(
  context: PermissionContext,
  toolName: string,
  behavior: PermissionBehavior,
): PermissionRule | null {
  const rules = behavior === 'allow'
    ? getAllowRules(context)
    : behavior === 'deny'
      ? getDenyRules(context)
      : getAskRules(context);

  return rules.find(rule => toolMatchesRule(toolName, rule)) ?? null;
}

/**
 * Build a map of rule content → rule for a specific tool name and behavior.
 */
export function getRuleByContentsForToolName(
  context: PermissionContext,
  toolName: string,
  behavior: PermissionBehavior,
): Map<string, PermissionRule> {
  const rules = behavior === 'allow'
    ? getAllowRules(context)
    : behavior === 'deny'
      ? getDenyRules(context)
      : getAskRules(context);

  const map = new Map<string, PermissionRule>();
  for (const rule of rules) {
    if (
      rule.ruleValue.toolName === toolName &&
      rule.ruleValue.ruleContent !== undefined &&
      rule.ruleBehavior === behavior
    ) {
      map.set(rule.ruleValue.ruleContent, rule);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Permission request messages
// ---------------------------------------------------------------------------

/**
 * Create a human-readable permission request message.
 */
export function createPermissionRequestMessage(
  toolName: string,
  decisionReason?: PermissionDecisionReason,
): string {
  if (decisionReason) {
    switch (decisionReason.type) {
      case 'classifier':
        return `Classifier '${decisionReason.classifier}' requires approval: ${decisionReason.reason}`;
      case 'hook': {
        const hookMsg = decisionReason.reason
          ? `Hook '${decisionReason.hookName}' blocked: ${decisionReason.reason}`
          : `Hook '${decisionReason.hookName}' requires approval for ${toolName}`;
        return hookMsg;
      }
      case 'rule': {
        const sourceStr = permissionRuleSourceDisplayString(decisionReason.rule.source);
        return `Permission rule from ${sourceStr} requires approval for ${toolName}`;
      }
      case 'safetyCheck':
      case 'other':
        return decisionReason.reason;
      case 'workingDir':
        return decisionReason.reason;
      case 'mode':
        return `Current mode (${decisionReason.mode}) requires approval for ${toolName}`;
      case 'subcommandResults': {
        const needsApproval: string[] = [];
        for (const [cmd, result] of Array.from(decisionReason.reasons)) {
          if (result.behavior === 'ask' || result.behavior === 'passthrough') {
            needsApproval.push(cmd);
          }
        }
        if (needsApproval.length > 0) {
          return `This ${toolName} command contains multiple operations requiring approval: ${needsApproval.join(', ')}`;
        }
        return `This ${toolName} command contains operations requiring approval`;
      }
    }
  }

  return `LEA requested permissions to use ${toolName}, but it hasn't been granted yet.`;
}

// ---------------------------------------------------------------------------
// Rule-based permission check (subset used by bypassPermissions)
// ---------------------------------------------------------------------------

/**
 * Check only the rule-based steps of the permission pipeline.
 * This is the subset that bypassPermissions mode respects.
 * Returns null if no rule-based objection was found.
 */
export async function checkRuleBasedPermissions(
  tool: ToolPermissionCheck,
  input: Record<string, unknown>,
  context: PermissionContext,
): Promise<PermissionResult | null> {
  // 1a. Tool is denied by rule
  const denyRule = findToolRule(context, tool.name, 'deny');
  if (denyRule) {
    return {
      behavior: 'deny',
      decisionReason: { type: 'rule', rule: denyRule },
      message: `Permission to use ${tool.name} has been denied.`,
    };
  }

  // 1b. Tool has an ask rule
  const askRule = findToolRule(context, tool.name, 'ask');
  if (askRule) {
    return {
      behavior: 'ask',
      decisionReason: { type: 'rule', rule: askRule },
      message: createPermissionRequestMessage(tool.name),
    };
  }

  // 1c. Ask tool's own checkPermissions implementation
  let toolPermissionResult: PermissionResult = {
    behavior: 'passthrough',
    message: createPermissionRequestMessage(tool.name),
  };
  try {
    const parsedInput = tool.inputSchema.parse(input);
    toolPermissionResult = await tool.checkPermissions(parsedInput, context);
  } catch {
    // If parsing or check fails, fall through
  }

  // 1d. Tool implementation denied
  if (toolPermissionResult.behavior === 'deny') {
    return toolPermissionResult;
  }

  // 1e. Content-specific ask rules from tool.checkPermissions
  if (
    toolPermissionResult.behavior === 'ask' &&
    toolPermissionResult.decisionReason?.type === 'rule'
  ) {
    return toolPermissionResult;
  }

  // 1f. Safety checks are bypass-immune
  if (
    toolPermissionResult.behavior === 'ask' &&
    toolPermissionResult.decisionReason?.type === 'safetyCheck'
  ) {
    return toolPermissionResult;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main permission check
// ---------------------------------------------------------------------------

export type PermissionCheckOptions = {
  /** Optional classifier function for auto-approval in auto mode. */
  classifier?: (toolName: string, input: Record<string, unknown>, context: PermissionContext) =>
    Promise<{ allow: boolean; reason: string } | null>;
  /** Optional hook that runs before auto-deny in headless mode. */
  headlessHook?: (toolName: string, input: Record<string, unknown>) =>
    Promise<PermissionDecision | null>;
};

/**
 * Main permission check function.
 *
 * Implements the full Claude Code-style permission pipeline:
 * 1. Deny rules (always first)
 * 2. Ask rules
 * 3. Tool-specific checkPermissions
 * 4. Mode-based decisions (bypass, acceptEdits, dontAsk, auto)
 * 5. Allow rules
 * 6. Default → ask
 *
 * @param tool - The tool requesting permission.
 * @param input - The tool's input parameters.
 * @param context - The current permission context.
 * @param options - Optional classifier and hook functions.
 * @returns A permission decision.
 */
export async function hasPermissionsToUseTool(
  tool: ToolPermissionCheck,
  input: Record<string, unknown>,
  context: PermissionContext,
  options?: PermissionCheckOptions,
): Promise<PermissionDecision> {
  // 1a. Tool is denied
  const denyRule = findToolRule(context, tool.name, 'deny');
  if (denyRule) {
    return {
      behavior: 'deny',
      decisionReason: { type: 'rule', rule: denyRule },
      message: `Permission to use ${tool.name} has been denied.`,
    };
  }

  // 1b. Tool has an ask rule
  const askRule = findToolRule(context, tool.name, 'ask');
  if (askRule) {
    return {
      behavior: 'ask',
      decisionReason: { type: 'rule', rule: askRule },
      message: createPermissionRequestMessage(tool.name),
    };
  }

  // 1c. Tool-specific permission check
  let toolPermissionResult: PermissionResult = {
    behavior: 'passthrough',
    message: createPermissionRequestMessage(tool.name),
  };
  try {
    const parsedInput = tool.inputSchema.parse(input);
    toolPermissionResult = await tool.checkPermissions(parsedInput, context);
  } catch {
    // Fall through on error
  }

  // 1d. Tool denied
  if (toolPermissionResult.behavior === 'deny') {
    return toolPermissionResult;
  }

  // 1e. Tool requires user interaction even in bypass mode
  if (
    tool.requiresUserInteraction?.() &&
    toolPermissionResult.behavior === 'ask'
  ) {
    return toolPermissionResult;
  }

  // 1f. Content-specific ask rules (bypass-immune)
  if (
    toolPermissionResult.behavior === 'ask' &&
    toolPermissionResult.decisionReason?.type === 'rule'
  ) {
    return toolPermissionResult;
  }

  // 1g. Safety checks (bypass-immune)
  if (
    toolPermissionResult.behavior === 'ask' &&
    toolPermissionResult.decisionReason?.type === 'safetyCheck'
  ) {
    return toolPermissionResult;
  }

  // 2a. Mode: bypassPermissions
  if (context.mode === 'bypassPermissions') {
    return {
      behavior: 'allow',
      updatedInput: getUpdatedInput(toolPermissionResult, input),
      decisionReason: { type: 'mode', mode: 'bypassPermissions' },
    };
  }

  // 2b. Entire tool is allowed by rule
  const alwaysAllowedRule = findToolRule(context, tool.name, 'allow');
  if (alwaysAllowedRule) {
    return {
      behavior: 'allow',
      updatedInput: getUpdatedInput(toolPermissionResult, input),
      decisionReason: { type: 'rule', rule: alwaysAllowedRule },
    };
  }

  // 2c. Plan mode: if tool returned passthrough, check isReadOnly
  // Read-only tools are auto-allowed in plan mode; mutating tools require approval.
  if (
    context.mode === 'plan' &&
    toolPermissionResult.behavior === 'passthrough' &&
    tool.isReadOnly
  ) {
    const isReadOnly = tool.isReadOnly(input);
    if (isReadOnly) {
      return {
        behavior: 'allow',
        updatedInput: getUpdatedInput(toolPermissionResult, input),
        decisionReason: {
          type: 'mode',
          mode: 'plan',
        },
      };
    }
    // Non-read-only tool in plan mode — requires approval
    return {
      behavior: 'ask',
      decisionReason: { type: 'mode', mode: 'plan' },
      message: createPermissionRequestMessage(
        tool.name,
        { type: 'mode', mode: 'plan' },
      ),
    };
  }

  // 3. Convert passthrough to ask
  const result: PermissionDecision =
    toolPermissionResult.behavior === 'passthrough'
      ? {
          behavior: 'ask',
          message: createPermissionRequestMessage(
            tool.name,
            toolPermissionResult.decisionReason,
          ),
          suggestions: toolPermissionResult.suggestions,
        }
      : toolPermissionResult;

  // Mode-based transformations
  if (result.behavior === 'ask') {
    // dontAsk: convert ask → deny
    if (context.mode === 'dontAsk') {
      return {
        behavior: 'deny',
        decisionReason: { type: 'mode', mode: 'dontAsk' },
        message: `Permission to use ${tool.name} was denied (dontAsk mode).`,
      };
    }

    // auto: use classifier if available
    if (context.mode === 'default' && options?.classifier) {
      try {
        const classifierResult = await options.classifier(tool.name, input, context);
        if (classifierResult) {
          return classifierResult.allow
            ? {
                behavior: 'allow',
                updatedInput: input,
                decisionReason: {
                  type: 'classifier',
                  classifier: 'auto-mode',
                  reason: classifierResult.reason,
                },
              }
            : {
                behavior: 'deny',
                decisionReason: {
                  type: 'classifier',
                  classifier: 'auto-mode',
                  reason: classifierResult.reason,
                },
                message: `Classifier blocked: ${classifierResult.reason}`,
              };
        }
      } catch {
        // Classifier failed — fall through to ask/headless
      }
    }

    // Headless: auto-deny (unless hook overrides)
    if (context.shouldAvoidPermissionPrompts) {
      if (options?.headlessHook) {
        const hookDecision = await options.headlessHook(tool.name, input);
        if (hookDecision) return hookDecision;
      }
      return {
        behavior: 'deny',
        decisionReason: {
          type: 'other',
          reason: 'Permission prompts are not available in headless mode.',
        },
        message: `Permission to use ${tool.name} denied (headless mode).`,
      };
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract updatedInput from a permission result, falling back to the original.
 */
function getUpdatedInput(
  result: PermissionResult,
  fallback: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (result.behavior === 'allow' || result.behavior === 'ask') {
    return result.updatedInput ?? fallback;
  }
  return fallback;
}

/**
 * Check if a specific agent type is denied via Agent(agentType) syntax.
 */
export function getDenyRuleForAgent(
  context: PermissionContext,
  agentToolName: string,
  agentType: string,
): PermissionRule | null {
  return getDenyRules(context).find(
    rule =>
      rule.ruleValue.toolName === agentToolName &&
      rule.ruleValue.ruleContent === agentType,
  ) ?? null;
}

/**
 * Filter agents to exclude those that are denied via Agent(agentType) syntax.
 */
export function filterDeniedAgents<T extends { agentType: string }>(
  agents: T[],
  context: PermissionContext,
  agentToolName: string,
): T[] {
  const deniedTypes = new Set<string>();
  for (const rule of getDenyRules(context)) {
    if (
      rule.ruleValue.toolName === agentToolName &&
      rule.ruleValue.ruleContent !== undefined
    ) {
      deniedTypes.add(rule.ruleValue.ruleContent);
    }
  }
  return agents.filter(agent => !deniedTypes.has(agent.agentType));
}

// ---------------------------------------------------------------------------
// Permission context manipulation
// ---------------------------------------------------------------------------

/**
 * Apply permission updates to a permission context, returning a new context.
 */
export function applyPermissionUpdates(
  context: PermissionContext,
  updates: readonly PermissionUpdate[],
): PermissionContext {
  let result = { ...context };

  for (const update of Array.from(updates)) {
    switch (update.type) {
      case 'addRules':
      case 'replaceRules': {
        const dest = update.destination;
        const behavior = update.behavior;
        const ruleStrings = update.rules.map(r =>
          `${r.toolName}${r.ruleContent ? `(${r.ruleContent})` : ''}`,
        );

        const storeMap: Record<PermissionBehavior, keyof PermissionContext> = {
          allow: 'alwaysAllowRules',
          deny: 'alwaysDenyRules',
          ask: 'alwaysAskRules',
        };
        const storeKey = storeMap[behavior];
        const currentRules = { ...(result[storeKey] as Record<string, string[]> | undefined) };

        if (update.type === 'replaceRules') {
          currentRules[dest] = ruleStrings;
        } else {
          const existing = new Set(currentRules[dest] ?? []);
          for (const rs of Array.from(ruleStrings)) existing.add(rs);
          currentRules[dest] = Array.from(existing);
        }

        result = { ...result, [storeKey]: currentRules };
        break;
      }
      case 'removeRules': {
        const dest = update.destination;
        const behavior = update.behavior;
        const removeSet = new Set(
          update.rules.map(r =>
            `${r.toolName}${r.ruleContent ? `(${r.ruleContent})` : ''}`,
          ),
        );

        const storeMap: Record<PermissionBehavior, keyof PermissionContext> = {
          allow: 'alwaysAllowRules',
          deny: 'alwaysDenyRules',
          ask: 'alwaysAskRules',
        };
        const storeKey = storeMap[behavior];
        const currentRules = { ...(result[storeKey] as Record<string, string[]> | undefined) };
        const existing = currentRules[dest] ?? [];
        currentRules[dest] = existing.filter(rs => !removeSet.has(rs));
        result = { ...result, [storeKey]: currentRules };
        break;
      }
      case 'setMode':
        result = { ...result, mode: update.mode };
        break;
      case 'addDirectories': {
        const dirs = new Map(result.additionalWorkingDirectories);
        for (const dir of update.directories) {
          if (!dirs.has(dir)) dirs.set(dir, dir);
        }
        result = { ...result, additionalWorkingDirectories: dirs };
        break;
      }
    }
  }

  return result;
}
