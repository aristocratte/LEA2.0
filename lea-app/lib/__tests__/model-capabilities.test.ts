import { describe, expect, it } from 'vitest';
import {
  defaultThinkingBudgetForModel,
  modelSupportsReasoningEffort,
  normalizeModelId,
} from '../model-capabilities';

describe('model capabilities', () => {
  it('normalizes Z.ai-prefixed GLM model ids', () => {
    expect(normalizeModelId('zai/glm-5.1')).toBe('glm-5.1');
    expect(normalizeModelId('z-ai/glm-5v-turbo')).toBe('glm-5v-turbo');
  });

  it('detects current GLM reasoning models', () => {
    expect(modelSupportsReasoningEffort('glm-5.1')).toBe(true);
    expect(modelSupportsReasoningEffort('glm-5-turbo')).toBe(true);
    expect(modelSupportsReasoningEffort('glm-5v-turbo')).toBe(true);
  });

  it('does not mark non-reasoning model families as native reasoning models', () => {
    expect(modelSupportsReasoningEffort('glm-4.7-flash')).toBe(false);
    expect(modelSupportsReasoningEffort('gemini-2.0-flash')).toBe(false);
    expect(modelSupportsReasoningEffort('gpt-5.5')).toBe(false);
    expect(modelSupportsReasoningEffort('o3')).toBe(false);
  });

  it('detects Gemini models with native thinking controls', () => {
    expect(modelSupportsReasoningEffort('gemini-2.5-pro')).toBe(true);
    expect(modelSupportsReasoningEffort('gemini-3-flash')).toBe(true);
  });

  it('defaults reasoning-capable models to maximum effort', () => {
    expect(defaultThinkingBudgetForModel('glm-5.1')).toBe('maximum');
    expect(defaultThinkingBudgetForModel('gpt-5.5')).toBe('standard');
    expect(defaultThinkingBudgetForModel('legacy-model')).toBe('standard');
  });
});
