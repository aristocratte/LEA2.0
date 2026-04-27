import type { ThinkingBudget } from '@/store/pentest-creation-store';

const ZAI_MODEL_PREFIXES = ['zai/', 'z-ai/'];

const ZAI_REASONING_MODELS = [
  'glm-5.1',
  'glm-5-turbo',
  'glm-5v-turbo',
  'glm-5',
  'glm-4.7',
  'glm-4.6',
  'glm-4.5v',
  'glm-4.5',
];

const GEMINI_REASONING_PREFIXES = [
  'gemini-3',
  'gemini-2.5',
];

export function normalizeModelId(modelId?: string | null): string {
  let normalized = String(modelId || '').trim().toLowerCase();
  for (const prefix of ZAI_MODEL_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }
  return normalized;
}

export function modelSupportsReasoningEffort(modelId?: string | null): boolean {
  const normalized = normalizeModelId(modelId);
  if (!normalized) return false;

  if (ZAI_REASONING_MODELS.includes(normalized)) {
    return true;
  }

  return (
    normalized.includes('thinking') ||
    GEMINI_REASONING_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

export function defaultThinkingBudgetForModel(modelId?: string | null): ThinkingBudget {
  return modelSupportsReasoningEffort(modelId) ? 'maximum' : 'standard';
}
