import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadFlags() {
  vi.resetModules();
  return import('../feature-flags');
}

describe('feature flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('keeps experimental MVP surfaces hidden by default', async () => {
    const flags = await loadFlags();

    expect(flags.ENABLE_EXPERIMENTAL_UI).toBe(false);
    expect(flags.ENABLE_EXPERIMENTAL_RUNTIME_UI).toBe(false);
    expect(flags.ENABLE_ADVANCED_SCAN_CONTROLS).toBe(false);
  });

  it('enables all experimental UI gates from the umbrella flag', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEA_EXPERIMENTAL_UI', 'true');

    const flags = await loadFlags();

    expect(flags.ENABLE_EXPERIMENTAL_UI).toBe(true);
    expect(flags.ENABLE_EXPERIMENTAL_RUNTIME_UI).toBe(true);
    expect(flags.ENABLE_ADVANCED_SCAN_CONTROLS).toBe(true);
  });

  it('allows focused opt-in for runtime and scan controls', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEA_EXPERIMENTAL_RUNTIME_UI', '1');
    vi.stubEnv('NEXT_PUBLIC_LEA_ADVANCED_SCAN_CONTROLS', 'true');

    const flags = await loadFlags();

    expect(flags.ENABLE_EXPERIMENTAL_UI).toBe(false);
    expect(flags.ENABLE_EXPERIMENTAL_RUNTIME_UI).toBe(true);
    expect(flags.ENABLE_ADVANCED_SCAN_CONTROLS).toBe(true);
  });
});

