import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  providerFindUniqueMock,
  providerFindManyMock,
  providerFindFirstMock,
  providerUpdateMock,
  modelConfigFindManyMock,
  modelConfigUpdateManyMock,
  providerUsageUpsertMock,
  cryptoDecryptMock,
} = vi.hoisted(() => ({
  providerFindUniqueMock: vi.fn(),
  providerFindManyMock: vi.fn(),
  providerFindFirstMock: vi.fn(),
  providerUpdateMock: vi.fn(),
  modelConfigFindManyMock: vi.fn(),
  modelConfigUpdateManyMock: vi.fn(),
  providerUsageUpsertMock: vi.fn(),
  cryptoDecryptMock: vi.fn(() => 'decrypted-api-key'),
}));

vi.mock('@prisma/client', () => {
  class PrismaClient {
    provider = {
      findUnique: providerFindUniqueMock,
      findMany: providerFindManyMock,
      findFirst: providerFindFirstMock,
      update: providerUpdateMock,
    };

    modelConfig = {
      findMany: modelConfigFindManyMock,
      updateMany: modelConfigUpdateManyMock,
    };

    providerUsage = {
      upsert: providerUsageUpsertMock,
    };
  }

  return {
    PrismaClient,
    ProviderType: {
      ANTHROPIC: 'ANTHROPIC',
      ZHIPU: 'ZHIPU',
      OPENAI: 'OPENAI',
      CUSTOM: 'CUSTOM',
      GEMINI: 'GEMINI',
      ANTIGRAVITY: 'ANTIGRAVITY',
      CODEX: 'CODEX',
      OPENCODE: 'OPENCODE',
    },
    HealthStatus: {
      HEALTHY: 'HEALTHY',
      DEGRADED: 'DEGRADED',
      UNHEALTHY: 'UNHEALTHY',
      UNKNOWN: 'UNKNOWN',
    },
  };
});

vi.mock('../CryptoService.js', () => ({
  CryptoService: {
    decrypt: cryptoDecryptMock,
  },
}));

vi.mock('../ai/CodexClient.js', () => ({ CodexClient: class CodexClient {} }));
vi.mock('../ai/OpenCodeClient.js', () => ({ OpenCodeClient: class OpenCodeClient {} }));

import { ProviderManager } from '../ProviderManager.js';

function buildProvider(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-03-19T10:00:00.000Z');
  return {
    id: 'provider-1',
    name: 'zhipu',
    display_name: 'Zhipu AI',
    type: 'ZHIPU',
    api_key_encrypted: 'encrypted',
    api_key_iv: 'iv',
    api_key_auth_tag: 'tag',
    api_key_hash: 'hash',
    base_url: 'https://api.z.ai/api/paas/v4',
    oauth_access_token: null,
    oauth_refresh_token: null,
    oauth_expiry: null,
    is_default: false,
    priority: 1,
    enabled: true,
    health_status: 'HEALTHY',
    last_health_check: null,
    last_error: null,
    created_at: now,
    updated_at: now,
    last_used_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  providerFindUniqueMock.mockReset();
  providerFindManyMock.mockReset();
  providerFindFirstMock.mockReset();
  providerUpdateMock.mockResolvedValue(undefined);
  modelConfigFindManyMock.mockReset();
  modelConfigUpdateManyMock.mockResolvedValue({ count: 1 });
  providerUsageUpsertMock.mockResolvedValue(undefined);
  cryptoDecryptMock.mockReturnValue('decrypted-api-key');
});

describe('ProviderManager', () => {
  it('resolves aliased providers and applies normalized Zhipu models', async () => {
    providerFindUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(buildProvider());
    providerFindManyMock.mockResolvedValue([buildProvider()]);

    const manager = new ProviderManager();
    const provider = await manager.getProvider('zhipu', 'zai/glm-4.7');

    expect(provider?.id).toBe('provider-1');
    expect(provider?.decryptedKey).toBe('decrypted-api-key');
    expect(provider?.defaultModelId).toBe('glm-4.7');
    expect(cryptoDecryptMock).toHaveBeenCalledWith('encrypted', 'iv', 'tag');
  });

  it('selects the default healthy provider before falling back', async () => {
    providerFindFirstMock.mockResolvedValue(buildProvider({ id: 'default-provider', is_default: true, type: 'ANTHROPIC' }));

    const manager = new ProviderManager();
    const provider = await manager.selectProvider('coordination');

    expect(provider?.id).toBe('default-provider');
    expect(providerFindFirstMock).toHaveBeenCalledTimes(1);
  });

  it('records daily usage and model usage counters', async () => {
    const manager = new ProviderManager();

    await manager.recordUsage('provider-1', 1200, 3400, 'glm-4.7');

    expect(providerUsageUpsertMock).toHaveBeenCalledTimes(1);
    expect(providerUpdateMock).toHaveBeenCalledWith({
      where: { id: 'provider-1' },
      data: { last_used_at: expect.any(Date) },
    });
    expect(modelConfigUpdateManyMock).toHaveBeenCalledWith({
      where: { provider_id: 'provider-1', model_id: 'glm-4.7' },
      data: {
        usage_count: { increment: 1 },
        last_used_at: expect.any(Date),
      },
    });
  });
});
