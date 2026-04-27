import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  providerFindManyMock,
  providerFindUniqueMock,
  providerFindFirstMock,
  providerCreateMock,
  providerUpdateMock,
  providerUpdateManyMock,
  modelConfigCreateMock,
  encryptMock,
  decryptMock,
  hashMock,
  maskMock,
} = vi.hoisted(() => ({
  providerFindManyMock: vi.fn(),
  providerFindUniqueMock: vi.fn(),
  providerFindFirstMock: vi.fn(),
  providerCreateMock: vi.fn(),
  providerUpdateMock: vi.fn(),
  providerUpdateManyMock: vi.fn(),
  modelConfigCreateMock: vi.fn(),
  encryptMock: vi.fn(() => ({ encrypted: 'enc', iv: 'iv', authTag: 'tag' })),
  decryptMock: vi.fn(() => 'secret-key'),
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
      update: providerUpdateMock,
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
    decrypt: decryptMock,
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
  global.fetch = vi.fn();
  providerUpdateMock.mockResolvedValue({});
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
      expect(providerCreateMock).toHaveBeenCalledWith({
        data: expect.objectContaining({
          base_url: 'https://api.z.ai/api/coding/paas/v4',
        }),
      });
      expect(modelConfigCreateMock).toHaveBeenCalled();
      expect(modelConfigCreateMock).toHaveBeenCalledWith({
        data: expect.objectContaining({
          provider_id: 'provider-1',
          model_id: 'glm-5.1',
          display_name: 'GLM-5.1',
          context_window: 200000,
          max_output_tokens: 131072,
          supports_tools: true,
        }),
      });
      expect(modelConfigCreateMock).toHaveBeenCalledWith({
        data: expect.objectContaining({
          provider_id: 'provider-1',
          model_id: 'glm-5-turbo',
          context_window: 200000,
          max_output_tokens: 131072,
        }),
      });
      expect(modelConfigCreateMock).toHaveBeenCalledWith({
        data: expect.objectContaining({
          provider_id: 'provider-1',
          model_id: 'glm-5v-turbo',
          supports_vision: true,
        }),
      });
      expect(encryptMock).toHaveBeenCalledWith('secret-key');
      expect(hashMock).toHaveBeenCalledWith('secret-key');
    } finally {
      await app.close();
    }
  });

  it('seeds current OpenAI reasoning models by default', async () => {
    providerCreateMock.mockResolvedValue({
      id: 'provider-openai',
      name: 'openai',
      display_name: 'OpenAI',
      type: 'OPENAI',
      enabled: true,
      is_default: false,
      priority: 1,
      health_status: 'UNKNOWN',
    });

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: {
          name: 'openai',
          display_name: 'OpenAI',
          type: 'OPENAI',
          api_key: 'secret-key',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(modelConfigCreateMock).toHaveBeenCalledWith({
        data: expect.objectContaining({
          provider_id: 'provider-openai',
          model_id: 'gpt-5.5',
          display_name: 'GPT-5.5',
          context_window: 1050000,
          max_output_tokens: 128000,
        }),
      });
      expect(modelConfigCreateMock).toHaveBeenCalledWith({
        data: expect.objectContaining({
          provider_id: 'provider-openai',
          model_id: 'gpt-5.4-mini',
          display_name: 'GPT-5.4 Mini',
          context_window: 400000,
          max_output_tokens: 128000,
        }),
      });
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

  it('tests Z.ai providers against the coding plan endpoint by default', async () => {
    providerFindUniqueMock.mockResolvedValue({
      id: 'provider-1',
      name: 'zhipu',
      display_name: 'Zhipu',
      type: 'ZHIPU',
      base_url: null,
      api_key_encrypted: 'enc',
      api_key_iv: 'iv',
      api_key_auth_tag: 'tag',
      oauth_access_token: null,
      oauth_refresh_token: null,
    });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(''),
    });

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/providers/provider-1/test',
      });

      expect(response.statusCode).toBe(200);
      expect((global.fetch as any).mock.calls[0][0]).toBe('https://api.z.ai/api/coding/paas/v4/chat/completions');
      expect(JSON.parse(String((global.fetch as any).mock.calls[0][1].body))).toMatchObject({
        model: 'glm-5.1',
      });
    } finally {
      await app.close();
    }
  });

  it('clears an existing Z.ai base URL back to the Coding Plan default', async () => {
    providerFindUniqueMock.mockResolvedValue({
      id: 'provider-1',
      name: 'zhipu',
      display_name: 'Zhipu',
      type: 'ZHIPU',
      base_url: 'https://api.z.ai/api/paas/v4',
    });
    providerUpdateMock.mockResolvedValue({
      id: 'provider-1',
      name: 'zhipu',
      display_name: 'Zhipu',
      type: 'ZHIPU',
      base_url: 'https://api.z.ai/api/coding/paas/v4',
    });

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/providers/provider-1',
        payload: { base_url: '' },
      });

      expect(response.statusCode).toBe(200);
      expect(providerUpdateMock).toHaveBeenCalledWith({
        where: { id: 'provider-1' },
        data: expect.objectContaining({
          base_url: 'https://api.z.ai/api/coding/paas/v4',
        }),
      });
    } finally {
      await app.close();
    }
  });
});
