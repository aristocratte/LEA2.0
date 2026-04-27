/**
 * @module core/hooks
 * @description Runtime hook system — event bus for tool/agent lifecycle observation.
 */

export { HookBus } from './HookBus.js';
export type {
  HookEventName,
  HookEventMap,
  HookPayload,
  PreToolPayload,
  PostToolPayload,
  ToolFailurePayload,
  AgentIdlePayload,
  AgentCompletedPayload,
  HookHandler,
} from './types.js';
