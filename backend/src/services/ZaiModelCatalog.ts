export interface ZaiModelDefinition {
  model_id: string;
  display_name: string;
  context_window: number;
  max_output_tokens: number;
  input_price_per_1k: number;
  output_price_per_1k: number;
  supports_streaming?: boolean;
  supports_vision?: boolean;
  supports_tools?: boolean;
}

export const ZAI_CODING_PLAN_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';
const ZAI_LEGACY_BASE_URLS = new Set([
  'https://api.z.ai/api/paas/v4',
  'https://open.bigmodel.cn/api/paas/v4',
]);

export const ZAI_DEFAULT_MODELS: ZaiModelDefinition[] = [
  { model_id: 'glm-5.1', display_name: 'GLM-5.1', context_window: 200000, max_output_tokens: 131072, input_price_per_1k: 0.0014, output_price_per_1k: 0.0044, supports_tools: true },
  { model_id: 'glm-5-turbo', display_name: 'GLM-5-Turbo', context_window: 200000, max_output_tokens: 131072, input_price_per_1k: 0.0012, output_price_per_1k: 0.004, supports_tools: true },
  { model_id: 'glm-5v-turbo', display_name: 'GLM-5V-Turbo', context_window: 200000, max_output_tokens: 131072, input_price_per_1k: 0.0012, output_price_per_1k: 0.004, supports_tools: true, supports_vision: true },
  { model_id: 'glm-5', display_name: 'GLM-5', context_window: 200000, max_output_tokens: 131072, input_price_per_1k: 0.001, output_price_per_1k: 0.0032, supports_tools: true },
  { model_id: 'glm-4.7', display_name: 'GLM-4.7', context_window: 200000, max_output_tokens: 131072, input_price_per_1k: 0.0006, output_price_per_1k: 0.0022, supports_tools: true },
  { model_id: 'glm-4.7-flashx', display_name: 'GLM-4.7 FlashX', context_window: 200000, max_output_tokens: 131072, input_price_per_1k: 0.00007, output_price_per_1k: 0.0004, supports_tools: true },
  { model_id: 'glm-4.7-flash', display_name: 'GLM-4.7 Flash', context_window: 200000, max_output_tokens: 131072, input_price_per_1k: 0, output_price_per_1k: 0, supports_tools: true },
  { model_id: 'glm-4.6', display_name: 'GLM-4.6', context_window: 200000, max_output_tokens: 131072, input_price_per_1k: 0.0006, output_price_per_1k: 0.0022, supports_tools: true },
  { model_id: 'glm-4.5', display_name: 'GLM-4.5', context_window: 128000, max_output_tokens: 98304, input_price_per_1k: 0.0006, output_price_per_1k: 0.0022, supports_tools: true },
  { model_id: 'glm-4.5-air', display_name: 'GLM-4.5 Air', context_window: 128000, max_output_tokens: 98304, input_price_per_1k: 0.0002, output_price_per_1k: 0.0011, supports_tools: true },
  { model_id: 'glm-4.5-x', display_name: 'GLM-4.5 X', context_window: 128000, max_output_tokens: 98304, input_price_per_1k: 0.0022, output_price_per_1k: 0.0089, supports_tools: true },
  { model_id: 'glm-4.5-airx', display_name: 'GLM-4.5 AirX', context_window: 128000, max_output_tokens: 98304, input_price_per_1k: 0.0011, output_price_per_1k: 0.0045, supports_tools: true },
  { model_id: 'glm-4.5-flash', display_name: 'GLM-4.5 Flash', context_window: 128000, max_output_tokens: 98304, input_price_per_1k: 0, output_price_per_1k: 0, supports_tools: true },
  { model_id: 'glm-4-32b-0414-128k', display_name: 'GLM-4-32B-0414-128K', context_window: 128000, max_output_tokens: 16384, input_price_per_1k: 0.0001, output_price_per_1k: 0.0003, supports_tools: true },
];

export const ZAI_DEPRECATED_MODEL_IDS = [
  'glm-4-plus',
  'glm-4-air',
  'glm-4-flash',
  'glm-4',
] as const;

const ZAI_MODEL_PREFIXES = ['zai/', 'z-ai/'];

export const ZAI_REASONING_MODEL_PRIORITY = [
  'glm-5.1',
  'glm-5-turbo',
  'glm-5v-turbo',
  'glm-5',
  'glm-4.7',
  'glm-4.6',
  'glm-4.5v',
  'glm-4.5',
] as const;

export function normalizeZaiModelId(modelId?: string): string | undefined {
  let normalized = String(modelId || '').trim().toLowerCase();
  if (!normalized) return undefined;

  for (const prefix of ZAI_MODEL_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }

  if (normalized.startsWith('glm-')) {
    return normalized;
  }

  return undefined;
}

export function normalizeZaiBaseUrl(baseUrl?: string | null): string {
  const normalized = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!normalized || ZAI_LEGACY_BASE_URLS.has(normalized)) {
    return ZAI_CODING_PLAN_BASE_URL;
  }
  return normalized;
}

export function rankZaiReasoningModel(modelId: string): number {
  const normalized = normalizeZaiModelId(modelId);
  if (!normalized) return Number.MAX_SAFE_INTEGER;

  for (let i = 0; i < ZAI_REASONING_MODEL_PRIORITY.length; i += 1) {
    const candidate = ZAI_REASONING_MODEL_PRIORITY[i];
    if (normalized === candidate) {
      return i;
    }
  }

  return Number.MAX_SAFE_INTEGER;
}

export function supportsZaiReasoningModel(modelId: string): boolean {
  return rankZaiReasoningModel(modelId) !== Number.MAX_SAFE_INTEGER;
}
