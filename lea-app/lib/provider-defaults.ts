export const ZAI_CODING_PLAN_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';

export function defaultProviderBaseUrl(type: string): string {
  return type.toUpperCase() === 'ZHIPU' ? ZAI_CODING_PLAN_BASE_URL : '';
}

const SETTINGS_INPUT_BASE_CLASS = [
  'settings-input',
  'w-full rounded-lg border border-zinc-200 bg-zinc-50',
  'text-sm text-zinc-900 placeholder:text-zinc-400 caret-zinc-900',
  'focus:border-zinc-400 focus:outline-none transition-colors',
].join(' ');

export const SETTINGS_TEXT_INPUT_CLASS = `${SETTINGS_INPUT_BASE_CLASS} px-3 py-2`;
export const SETTINGS_MONO_INPUT_CLASS = `${SETTINGS_INPUT_BASE_CLASS} px-3 py-2 font-mono`;
export const SETTINGS_DETAIL_MONO_INPUT_CLASS = `${SETTINGS_INPUT_BASE_CLASS} px-3 py-2.5 font-mono`;
