import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY;
const TEST_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

async function loadCryptoService() {
  vi.resetModules();
  process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
  return import('../CryptoService.js');
}

afterEach(() => {
  process.env.ENCRYPTION_MASTER_KEY = ORIGINAL_MASTER_KEY;
});

describe('CryptoService', () => {
  it('encrypts and decrypts payloads round-trip', async () => {
    const { CryptoService } = await loadCryptoService();

    const encrypted = CryptoService.encrypt('secret-api-key');
    const decrypted = CryptoService.decrypt(encrypted.encrypted, encrypted.iv, encrypted.authTag);

    expect(decrypted).toBe('secret-api-key');
    expect(encrypted.iv).toHaveLength(32);
    expect(encrypted.authTag).toHaveLength(32);
  });

  it('hashes, verifies, and masks values', async () => {
    const { CryptoService } = await loadCryptoService();

    const hash = CryptoService.hash('secret-api-key');

    expect(CryptoService.verify('secret-api-key', hash)).toBe(true);
    expect(CryptoService.verify('other-key', hash)).toBe(false);
    expect(CryptoService.mask('abcdefghijklmnop')).toBe('abcdefgh...mnop');
    expect(CryptoService.mask('short')).toBe('****');
  });

  it('generates a 32-byte hex master key', async () => {
    const { CryptoService } = await loadCryptoService();

    const key = CryptoService.generateMasterKey();

    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });
});
