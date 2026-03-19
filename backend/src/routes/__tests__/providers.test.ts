import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  providerFindManyMock,
  providerFindUniqueMock,
  providerFindFirstMock,
  providerCreateMock,
  providerUpdateManyMock,
  modelConfigCreateMock,
  encryptMock,
  hashMock,
  maskMock,
} = vi.hoisted(() => ({
  providerFindManyMock: vi.fn(),
  providerFindUniqueMock: vi.fn(),
  providerFindFirstMock: vi.fn(),
  providerCreateMock: vi.fn(),
  providerUpdateManyMock: vi.fn(),
  modelConfigCreateMock: vi.fn(),
  encryptMock: vi.fn(() => ({ encrypted: 'enc', iv: 'iv', authTag: 'tag' })),
  hashMock: vi.fn(() => 'hash'),
  maskMock: vi.fn(() => 'mask'),
}));

vi.mock('@prisma/client', () => {
  class PrismaClient {
    provider = {
      findMany: providerFindManyMock,
      findUnique: providerFindUniqueMock,
      findFirst: providerFindFirstMock,
      create: providerCreateMock,
      updateMany: providerUpdateManyMock,
    };

    modelConfig = {
      create: modelConfigCreateMock,
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
  };
});

vi.mock('../../services/CryptoService.js', () => ({
  CryptoService: {
    encrypt: encryptMock,
    hash: hashMock,
    mask: maskMock,
  },
}));

import { providerRoutes } from '../providers.js';

async function buildApp() {
  const fastify = Fastify({ logger: false });
  await fastify.register(providerRoutes);
  await fastify.ready();
  return fastify;
}

beforeEach(() => {
  vi.clearAllMocks();
  providerUpdateManyMock.mockResolvedValue({ count: 1 });
  modelConfigCreateMock.mockResolvedValue(undefined);
});

describe('providerRoutes', () => {
  it('creates a provider and seeds default models', async () => {
    providerCreateMock.mockResolvedValue({
      id: 'provider-1',
      name: 'zhipu',
      display_name: 'Zhipu',
      type: 'ZHIPU',
      enabled: true,
      is_default: true,
      priority: 1,
      health_status: 'UNKNOWN',
    });

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: {
          name: 'zhipu',
          display_name: 'Zhipu',
          type: 'ZHIPU',
          api_key: 'secret-key',
          is_default: true,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(providerUpdateManyMock).toHaveBeenCalledWith({
        where: { type: 'ZHIPU' },
        data: { is_default: false },
      });
      expect(providerCreateMock).toHaveBeenCalled();
      expect(modelConfigCreateMock).toHaveBeenCalled();
      expect(encryptMock).toHaveBeenCalledWith('secret-key');
      expect(hashMock).toHaveBeenCalledWith('secret-key');
    } finally {
      await app.close();
    }
  });

  it('returns 404 for an unknown provider lookup', async () => {
    providerFindUniqueMock.mockResolvedValue(null);

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/providers/missing-provider',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Provider not found' });
    } finally {
      await app.close();
    }
  });
});
