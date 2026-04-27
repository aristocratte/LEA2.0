import { describe, expect, it } from 'vitest';
import {
  SETTINGS_MONO_INPUT_CLASS,
  ZAI_CODING_PLAN_BASE_URL,
  defaultProviderBaseUrl,
} from '../provider-defaults';

describe('provider defaults', () => {
  it('uses the Z.ai coding plan endpoint for ZHIPU providers', () => {
    expect(ZAI_CODING_PLAN_BASE_URL).toBe('https://api.z.ai/api/coding/paas/v4');
    expect(defaultProviderBaseUrl('ZHIPU')).toBe(ZAI_CODING_PLAN_BASE_URL);
    expect(defaultProviderBaseUrl('zhipu')).toBe(ZAI_CODING_PLAN_BASE_URL);
  });

  it('keeps settings inputs readable on light provider forms', () => {
    expect(SETTINGS_MONO_INPUT_CLASS).toContain('text-zinc-900');
    expect(SETTINGS_MONO_INPUT_CLASS).toContain('settings-input');
  });
});
