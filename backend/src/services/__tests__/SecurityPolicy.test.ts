import { afterEach, describe, expect, it } from 'vitest';
import { isCorsOriginAllowed, resolveAllowedCorsOrigin } from '../SecurityPolicy.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('SecurityPolicy CORS helpers', () => {
  it('allows default local web origins', () => {
    expect(resolveAllowedCorsOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(resolveAllowedCorsOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
  });

  it('rejects origins outside the allowlist', () => {
    expect(resolveAllowedCorsOrigin('http://evil.test')).toBeNull();
    expect(isCorsOriginAllowed('http://evil.test')).toBe(false);
  });

  it('allows requests without Origin for non-browser clients', () => {
    expect(resolveAllowedCorsOrigin(undefined)).toBeNull();
    expect(isCorsOriginAllowed(undefined)).toBe(true);
  });

  it('honors explicit dev CORS override', () => {
    process.env.LEA_ALLOW_DEV_CORS = 'true';

    expect(resolveAllowedCorsOrigin('http://preview.localhost:4173')).toBe('http://preview.localhost:4173');
  });
});
