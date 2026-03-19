import fs from 'fs';
import os from 'os';
import path from 'path';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PrismaClient, ProviderType, Provider as PrismaProvider } from '@prisma/client';
import { CryptoService } from '../services/CryptoService.js';
import { providerManager } from '../services/ProviderManager.js';
import type { FastifyRequestWithParams, FastifyRequestWithProviderUsageQuery } from '../types/fastify.d.js';

const prisma = new PrismaClient();
const ProviderTypeSchema = z.enum(['ANTHROPIC', 'ZHIPU', 'OPENAI', 'CUSTOM', 'GEMINI', 'ANTIGRAVITY', 'CODEX', 'OPENCODE']);

// Validation schemas
const CreateProviderSchema = z.object({
  name: z.string().min(1).max(100),
  type: ProviderTypeSchema,
  display_name: z.string().min(1).max(200),
  api_key: z.string().min(1).optional(),
  base_url: z.string().url().optional().or(z.literal('')).transform(v => v || undefined),
  organization_id: z.string().optional(),
  is_default: z.boolean().default(false),
  priority: z.number().int().min(1).default(1),
  enabled: z.boolean().default(true),
  default_temperature: z.number().min(0).max(2).default(0.7),
  default_max_tokens: z.number().int().min(1).default(4096),
  timeout_ms: z.number().int().min(1000).default(60000),
  retry_count: z.number().int().min(0).max(10).default(3),
});

const UpdateProviderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: ProviderTypeSchema.optional(),
  display_name: z.string().min(1).max(200).optional(),
  api_key: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),
  base_url: z.string().url().optional().or(z.literal('')).transform(v => v || undefined),
  organization_id: z.string().optional(),
  is_default: z.boolean().optional(),
  priority: z.number().int().min(1).optional(),
  enabled: z.boolean().optional(),
});

function toPublicProvider(provider: any): any {
  // oauth_configured = true if any OAuth tokens are present
  const oauthConfigured = !!(provider?.oauth_refresh_token || provider?.oauth_access_token);

  return {
    ...provider,
    api_key_encrypted: undefined,
    api_key_iv: undefined,
    api_key_auth_tag: undefined,
    oauth_access_token: undefined,
    oauth_refresh_token: undefined,
    oauth_configured: oauthConfigured,
  };
}

export async function providerRoutes(fastify: FastifyInstance) {
  // ========================================
  // GET /api/providers - List all providers
  // ========================================
  fastify.get('/api/providers', async (request, reply) => {
    const providers = await prisma.provider.findMany({
      include: {
        models: { where: { enabled: true } },
        _count: { select: { usage_records: true } },
      },
      orderBy: [{ priority: 'asc' }, { created_at: 'desc' }],
    });

    return providers.map(p => ({
      ...toPublicProvider(p),
      api_key_masked: p.api_key_hash ? CryptoService.mask(p.api_key_hash.substring(0, 12)) : null,
    }));
  });

  // ========================================
  // GET /api/providers/gemini/cli-status
  // ========================================
  fastify.get('/api/providers/gemini/cli-status', async (request, reply) => {
    // 1. Check path (which gemini)
    let cliPath: string | null = null;
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      const { stdout } = await execAsync('which gemini');
      cliPath = stdout.trim();
    } catch {
      // Ignore
    }

    // 2. Check local CLI credentials
    const credPath1 = path.join(os.homedir(), '.gemini', 'credentials.json');
    const credPath2 = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
    let hasFileCreds = false;
    let fileExpiry: string | null = null;
    try {
      if (fs.existsSync(credPath1)) {
        const creds = JSON.parse(fs.readFileSync(credPath1, 'utf-8'));
        hasFileCreds = true;
        fileExpiry = creds.expiry || null;
      } else if (fs.existsSync(credPath2)) {
        const creds = JSON.parse(fs.readFileSync(credPath2, 'utf-8'));
        hasFileCreds = true;
        fileExpiry = creds.expiry_date ? new Date(creds.expiry_date).toISOString() : null;
      }
    } catch {
      // Ignore read errors
    }

    // 3. Check LEA DB-managed OAuth credentials
    const geminiProvider = await prisma.provider.findFirst({
      where: {
        type: 'GEMINI',
        enabled: true,
        OR: [
          { oauth_refresh_token: { not: null } },
          { oauth_access_token: { not: null } },
        ],
      },
      orderBy: [{ is_default: 'desc' }, { priority: 'asc' }, { updated_at: 'desc' }],
    });

    const hasDbOAuth = Boolean(geminiProvider?.oauth_refresh_token || geminiProvider?.oauth_access_token);
    const dbExpiry = geminiProvider?.oauth_expiry ? geminiProvider.oauth_expiry.toISOString() : null;

    return {
      available: hasFileCreds || hasDbOAuth,
      path: cliPath,
      configured: hasFileCreds || hasDbOAuth,
      source: hasFileCreds ? 'cli' : hasDbOAuth ? 'oauth' : 'none',
      expires_at: fileExpiry || dbExpiry,
      cli_credentials_detected: hasFileCreds,
      db_oauth_configured: hasDbOAuth,
    };
  });

  // ========================================
  // POST /api/providers - Create provider
  // ========================================
  fastify.post('/api/providers', async (request, reply) => {
    const data = CreateProviderSchema.parse(request.body);

    // Encrypt API key if provided
    let apiKeyData: {
      api_key_encrypted?: string;
      api_key_iv?: string;
      api_key_auth_tag?: string;
      api_key_hash?: string;
    } = {};
    if (data.api_key) {
      const encrypted = CryptoService.encrypt(data.api_key);
      apiKeyData = {
        api_key_encrypted: encrypted.encrypted,
        api_key_iv: encrypted.iv,
        api_key_auth_tag: encrypted.authTag,
        api_key_hash: CryptoService.hash(data.api_key),
      };
    }

    // If is_default, unset others of same type
    if (data.is_default) {
      await prisma.provider.updateMany({
        where: { type: data.type },
        data: { is_default: false },
      });
    }

    const provider = await prisma.provider.create({
      data: {
        name: data.name,
        type: data.type,
        display_name: data.display_name,
        base_url: data.base_url,
        is_default: data.is_default,
        priority: data.priority,
        enabled: data.enabled,
        health_status: 'UNKNOWN',
        ...apiKeyData,
      },
    });

    // Create default models for this provider type
    await createDefaultModels(provider.id, data.type as ProviderType);

    return reply.code(201).send(toPublicProvider(provider));
  });

  // ========================================
  // GET /api/providers/:id - Get provider
  // ========================================
  fastify.get('/api/providers/:id', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    let provider = await prisma.provider.findUnique({
      where: { id },
      include: {
        models: true,
        usage_records: {
          orderBy: { date: 'desc' },
          take: 30,
        },
      },
    });
    if (!provider) {
      provider = await prisma.provider.findUnique({
        where: { name: id },
        include: {
          models: true,
          usage_records: {
            orderBy: { date: 'desc' },
            take: 30,
          },
        },
      });
    }

    if (!provider) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    return {
      ...toPublicProvider(provider),
      api_key_masked: provider.api_key_hash ? CryptoService.mask(provider.api_key_hash.substring(0, 12)) : null,
    };
  });

  // ========================================
  // PUT /api/providers/:id - Update or create provider (upsert by id or name)
  // ========================================
  fastify.put('/api/providers/:id', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];
    const data = UpdateProviderSchema.parse(request.body);

    // Try to find by id first, then by name
    let existing = await prisma.provider.findUnique({ where: { id } });
    if (!existing) {
      existing = await prisma.provider.findUnique({ where: { name: id } });
    }

    // Handle API key encryption
    let apiKeyData: {
      api_key_encrypted: string;
      api_key_iv: string;
      api_key_auth_tag: string;
      api_key_hash: string;
    } | {} = {};
    if (data.api_key) {
      const encrypted = CryptoService.encrypt(data.api_key);
      apiKeyData = {
        api_key_encrypted: encrypted.encrypted,
        api_key_iv: encrypted.iv,
        api_key_auth_tag: encrypted.authTag,
        api_key_hash: CryptoService.hash(data.api_key),
      };
    }

    if (!existing) {
      // CREATE: provider doesn't exist yet, create it
      const providerType = data.type || id.toUpperCase();
      const parsedType = ProviderTypeSchema.safeParse(providerType);
      const type: ProviderType = parsedType.success ? parsedType.data : 'CUSTOM';
      const name = data.name || id;
      const displayName = data.display_name || name.charAt(0).toUpperCase() + name.slice(1);

      const provider = await prisma.provider.create({
        data: {
          name,
          type,
          display_name: displayName,
          base_url: data.base_url || null,
          is_default: data.is_default ?? false,
          priority: data.priority ?? 1,
          enabled: data.enabled ?? true,
          health_status: 'UNKNOWN',
          ...apiKeyData,
        },
      });

      // Create default models
      await createDefaultModels(provider.id, type as ProviderType);

      return reply.code(201).send(toPublicProvider(provider));
    }

    // UPDATE: provider exists
    if (data.is_default) {
      await prisma.provider.updateMany({
        where: { type: existing.type, id: { not: existing.id } },
        data: { is_default: false },
      });
    }

    const provider = await prisma.provider.update({
      where: { id: existing.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.display_name && { display_name: data.display_name }),
        ...(data.base_url !== undefined && { base_url: data.base_url || null }),
        ...(data.is_default !== undefined && { is_default: data.is_default }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
        ...apiKeyData,
      },
    });

    return toPublicProvider(provider);
  });

  // ========================================
  // DELETE /api/providers/:id
  // ========================================
  fastify.delete('/api/providers/:id', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    let existing = await prisma.provider.findUnique({ where: { id } });
    if (!existing) {
      existing = await prisma.provider.findUnique({ where: { name: id } });
    }
    if (!existing) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    await prisma.provider.delete({ where: { id: existing.id } });
    return reply.code(204).send();
  });

  // ========================================
  // POST /api/providers/:id/test - Test connection
  // ========================================
  fastify.post('/api/providers/:id/test', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    const provider = await prisma.provider.findUnique({ where: { id } });
    if (!provider) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    const hasEncryptedApiKey = Boolean(
      provider.api_key_encrypted && provider.api_key_iv && provider.api_key_auth_tag
    );

    const geminiCliPath1 = path.join(os.homedir(), '.gemini', 'credentials.json');
    const geminiCliPath2 = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
    const hasGeminiCliCreds = provider.type === 'GEMINI' && (
      fs.existsSync(geminiCliPath1) || fs.existsSync(geminiCliPath2)
    );
    const hasGeminiOAuth = provider.type === 'GEMINI' && Boolean(
      provider.oauth_refresh_token || provider.oauth_access_token
    );
    const hasAnthropicOAuth = provider.type === 'ANTHROPIC' && Boolean(
      provider.oauth_access_token
    );
    const hasAntigravityOAuth = provider.type === 'ANTIGRAVITY' && Boolean(
      provider.oauth_refresh_token || provider.oauth_access_token
    );

    const hasAnyAuth = hasEncryptedApiKey
      || (provider.type === 'GEMINI' && (hasGeminiCliCreds || hasGeminiOAuth))
      || hasAnthropicOAuth
      || hasAntigravityOAuth;

    if (!hasAnyAuth) {
      return reply.code(400).send({ error: 'No API key or OAuth credentials configured' });
    }

    // Decrypt key when present
    let apiKey = '';
    if (hasEncryptedApiKey) {
      apiKey = CryptoService.decrypt(
        provider.api_key_encrypted!,
        provider.api_key_iv!,
        provider.api_key_auth_tag!
      );
    }

    // Test connection
    const startTime = Date.now();
    const result = await testProviderConnection(provider.type, apiKey, provider.base_url, provider);
    const latency = Date.now() - startTime;

    // Update health status
    await prisma.provider.update({
      where: { id },
      data: {
        health_status: result.success ? 'HEALTHY' : 'UNHEALTHY',
        last_health_check: new Date(),
        last_error: result.error || null,
      },
    });

    return {
      success: result.success,
      latency,
      error: result.error,
      models_available: result.models,
    };
  });

  // ========================================
  // PATCH /api/providers/:id/default
  // ========================================
  fastify.patch('/api/providers/:id/default', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    const provider = await prisma.provider.findUnique({ where: { id } });
    if (!provider) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    // Unset others
    await prisma.provider.updateMany({
      where: { type: provider.type },
      data: { is_default: false },
    });

    // Set this one
    const updated = await prisma.provider.update({
      where: { id },
      data: { is_default: true },
    });

    return toPublicProvider(updated);
  });

  // ========================================
  // GET /api/providers/:id/usage
  // ========================================
  fastify.get('/api/providers/:id/usage', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithProviderUsageQuery['params'];
    const { days = 30 } = request.query as FastifyRequestWithProviderUsageQuery['query'];

    const stats = await providerManager.getUsageStats(id, parseInt(String(days)));
    return stats;
  });

  // ========================================
  // GET /api/providers/:id/models
  // ========================================
  fastify.get('/api/providers/:id/models', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    const models = await prisma.modelConfig.findMany({
      where: { provider_id: id },
      orderBy: { display_name: 'asc' },
    });

    return models;
  });

  // ========================================
  // POST /api/providers/:id/models - Add a model
  // ========================================
  fastify.post('/api/providers/:id/models', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];
    const body = request.body as { model_id: string; context_window?: number; enabled?: boolean };

    if (!body.model_id?.trim()) {
      return reply.code(400).send({ error: 'model_id is required' });
    }

    // Verify provider exists (by id or name)
    let provider = await prisma.provider.findUnique({ where: { id } });
    if (!provider) {
      provider = await prisma.provider.findUnique({ where: { name: id } });
    }
    if (!provider) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    const model = await prisma.modelConfig.create({
      data: {
        provider_id: provider.id,
        model_id: body.model_id.trim(),
        display_name: body.model_id.trim(),
        enabled: body.enabled ?? true,
        context_window: body.context_window || 128000,
        max_output_tokens: 4096,
        input_price_per_1k: 0,
        output_price_per_1k: 0,
      },
    });

    return reply.code(201).send({ data: model });
  });

  // NOTE: Anthropic OAuth (Claude Code tokens) is blocked for 3rd-party apps since Feb 2026.
  // Use a console API key from console.anthropic.com/settings/keys instead.

  // ========================================
  // POST /api/providers/oauth/gemini
  // ========================================
  fastify.post('/api/providers/oauth/gemini', async (request, reply) => {
    try {
      const { startCallbackServer } = await import('../services/ai/antigravity/callback-server.js');
      const callbackPromise = startCallbackServer();

      const { authorizeGemini, exchangeGemini } = await import('../services/ai/gemini/oauth.js');
      const authData = await authorizeGemini();

      // Exchange the token in background
      setTimeout(async () => {
        try {
          const { code, state } = await callbackPromise;
          const exchangeResult = await exchangeGemini(code, state);

          if (exchangeResult.type !== 'success' || !exchangeResult.refresh) {
            console.error('[Gemini OAuth] Token exchange failed', exchangeResult.error || 'unknown error');
            return;
          }

          const existingGeminiProvider = await prisma.provider.findFirst({
            where: { type: 'GEMINI' },
            orderBy: [{ is_default: 'desc' }, { priority: 'asc' }, { created_at: 'asc' }],
          });

          if (existingGeminiProvider) {
            await prisma.provider.update({
              where: { id: existingGeminiProvider.id },
              data: {
                oauth_access_token: exchangeResult.access,
                oauth_refresh_token: exchangeResult.refresh,
                oauth_expiry: exchangeResult.expires ? new Date(exchangeResult.expires) : null,
                enabled: true,
                health_status: 'HEALTHY',
                last_error: null,
              },
            });
          } else {
            const created = await prisma.provider.create({
              data: {
                name: 'gemini-oauth',
                display_name: `Gemini OAuth${exchangeResult.email ? ` (${exchangeResult.email})` : ''}`,
                type: 'GEMINI' as ProviderType,
                oauth_access_token: exchangeResult.access,
                oauth_refresh_token: exchangeResult.refresh,
                oauth_expiry: exchangeResult.expires ? new Date(exchangeResult.expires) : null,
                enabled: true,
                is_default: false,
                priority: 1,
                health_status: 'HEALTHY',
              },
            });

            await createDefaultModels(created.id, 'GEMINI' as ProviderType);
          }
        } catch (e) {
          console.error('[Gemini OAuth] Workflow failed', e);
        }
      }, 500);

      return reply.code(200).send({
        url: authData.url,
        message: 'Please open the URL to authorize Gemini OAuth.',
      });
    } catch (error) {
      console.error(error);
      return reply.code(500).send({ error: 'Failed to initiate Gemini OAuth flow' });
    }
  });

  // ========================================
  // POST /api/providers/oauth/antigravity
  // ========================================
  fastify.post('/api/providers/oauth/antigravity', async (request, reply) => {
    try {
      const { startCallbackServer } = await import('../services/ai/antigravity/callback-server.js');
      const callbackPromise = startCallbackServer();

      const { authorizeAntigravity, exchangeAntigravity } = await import('../services/ai/antigravity/oauth.js');
      const authData = await authorizeAntigravity();

      // Exchange the token in background
      setTimeout(async () => {
        try {
          const { code, state } = await callbackPromise;
          const exchangeResult = await exchangeAntigravity(code, state);

          if (exchangeResult.type === 'success' && exchangeResult.refresh) {
            await prisma.provider.upsert({
              where: { name: 'antigravity-oauth' },
              update: {
                oauth_access_token: exchangeResult.access,
                oauth_refresh_token: exchangeResult.refresh,
                oauth_expiry: exchangeResult.expires ? new Date(exchangeResult.expires) : new Date(Date.now() + 3600000),
                enabled: true,
                health_status: 'HEALTHY'
              },
              create: {
                name: 'antigravity-oauth',
                display_name: `Google Antigravity (${exchangeResult.email})`,
                type: 'ANTIGRAVITY' as ProviderType,
                oauth_access_token: exchangeResult.access,
                oauth_refresh_token: exchangeResult.refresh,
                oauth_expiry: exchangeResult.expires ? new Date(exchangeResult.expires) : new Date(Date.now() + 3600000),
                enabled: true,
                is_default: false,
                priority: 1,
                health_status: 'HEALTHY'
              }
            });

            const provider = await prisma.provider.findUnique({ where: { name: 'antigravity-oauth' } });
            if (provider) {
              await createDefaultModels(provider.id, 'ANTIGRAVITY' as ProviderType);
            }
          }
        } catch (e) {
          console.error("[Antigravity OAuth] Workflow failed", e);
        }
      }, 500);

      return reply.code(200).send({
        url: authData.url,
        message: "Please open the URL to authorize."
      });
    } catch (error) {
      console.error(error);
      return reply.code(500).send({ error: 'Failed to initiate OAuth flow' });
    }
  });

}

// Helper: Test provider connection
async function testProviderConnection(
  type: ProviderType,
  apiKey: string,
  baseUrl?: string | null,
  provider?: Pick<PrismaProvider, 'oauth_refresh_token' | 'oauth_access_token' | 'type'>
): Promise<{ success: boolean; error?: string; models?: string[] }> {
  try {
    let endpoint: string;
    let headers: Record<string, string>;
    let body: string | undefined;

    switch (type) {
      case 'ANTHROPIC': {
        // Support both API key and OAuth Bearer token
        const anthropicAuth = provider?.oauth_access_token
          ? `Bearer ${provider.oauth_access_token}`
          : null;
        endpoint = 'https://api.anthropic.com/v1/messages';
        headers = {
          ...(anthropicAuth
            ? { authorization: anthropicAuth }
            : { 'x-api-key': apiKey }),
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        };
        body = JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        });
        break;
      }

      case 'OPENAI':
        endpoint = 'https://api.openai.com/v1/models';
        headers = {
          'authorization': `Bearer ${apiKey}`,
        };
        break;

      case 'ZHIPU':
        endpoint = 'https://api.z.ai/api/paas/v4/chat/completions';
        headers = {
          'authorization': `Bearer ${apiKey}`,
          'content-type': 'application/json',
        };
        body = JSON.stringify({
          model: 'glm-4-flash',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        });
        break;

      case 'GEMINI': {
        // Check if any auth strategy is available: local CLI creds, DB OAuth, or API key
        const geminiCliPath1 = path.join(os.homedir(), '.gemini', 'credentials.json');
        const geminiCliPath2 = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
        const hasCliCreds = fs.existsSync(geminiCliPath1) || fs.existsSync(geminiCliPath2);
        const hasDbOAuth = Boolean(provider?.oauth_refresh_token || provider?.oauth_access_token);
        if (!hasCliCreds && !hasDbOAuth && !apiKey) {
          return {
            success: false,
            error: 'No authentication available. Configure Gemini OAuth/CLI or provide an API key.',
          };
        }
        return {
          success: true,
          models: [
            'gemini-3-pro-preview',
            'gemini-3-flash-preview',
            'gemini-2.5-pro',
            'gemini-2.5-flash',
            'gemini-2.5-flash-lite',
            'gemini-2.0-flash',
          ],
        };
      }

      case 'CODEX':
        endpoint = 'https://api.openai.com/v1/models';
        headers = {
          'authorization': `Bearer ${apiKey}`,
        };
        break;

      case 'OPENCODE': {
        endpoint = (baseUrl || 'https://api.opencode.ai/v1') + '/models';
        headers = {
          'authorization': `Bearer ${apiKey}`,
        };
        break;
      }

      case 'CUSTOM':
        if (!baseUrl) {
          return { success: false, error: 'Base URL required for custom provider' };
        }
        endpoint = `${baseUrl}/models`;
        headers = { 'authorization': `Bearer ${apiKey}` };
        break;

      default:
        return { success: false, error: 'Unsupported provider type' };
    }

    const response = await fetch(endpoint, {
      method: body ? 'POST' : 'GET',
      headers,
      body,
    });

    if (response.ok) {
      return {
        success: true,
        models: ['Available'], // Could parse actual models from response
      };
    }

    const errorText = await response.text();
    return {
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Connection failed',
    };
  }
}

// Helper: Create default models for provider type
async function createDefaultModels(providerId: string, type: ProviderType): Promise<void> {
  const defaultModels: Record<string, Array<{
    model_id: string;
    display_name: string;
    context_window: number;
    max_output_tokens: number;
    input_price_per_1k: number;
    output_price_per_1k: number;
  }>> = {
    ANTHROPIC: [
      { model_id: 'claude-opus-4-6', display_name: 'Claude Opus 4.6', context_window: 200000, max_output_tokens: 32000, input_price_per_1k: 0.015, output_price_per_1k: 0.075 },
      { model_id: 'claude-sonnet-4-5-20250929', display_name: 'Claude Sonnet 4.5', context_window: 200000, max_output_tokens: 16000, input_price_per_1k: 0.003, output_price_per_1k: 0.015 },
      { model_id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6', context_window: 200000, max_output_tokens: 16000, input_price_per_1k: 0.003, output_price_per_1k: 0.015 },
      { model_id: 'claude-haiku-4-5-20251001', display_name: 'Claude Haiku 4.5', context_window: 200000, max_output_tokens: 8192, input_price_per_1k: 0.0008, output_price_per_1k: 0.004 },
    ],
    ZHIPU: [
      { model_id: 'glm-4.7', display_name: 'GLM-4.7 (flagship, thinking)', context_window: 200000, max_output_tokens: 8192, input_price_per_1k: 0.0005, output_price_per_1k: 0.0015 },
      { model_id: 'glm-5', display_name: 'GLM-5 (agents/coding)', context_window: 128000, max_output_tokens: 8192, input_price_per_1k: 0.0008, output_price_per_1k: 0.002 },
      { model_id: 'glm-4-plus', display_name: 'GLM-4 Plus', context_window: 128000, max_output_tokens: 4096, input_price_per_1k: 0.0007, output_price_per_1k: 0.002 },
      { model_id: 'glm-4-air', display_name: 'GLM-4 Air (fast)', context_window: 128000, max_output_tokens: 4096, input_price_per_1k: 0.0001, output_price_per_1k: 0.0003 },
      { model_id: 'glm-4-flash', display_name: 'GLM-4 Flash (free tier)', context_window: 128000, max_output_tokens: 4096, input_price_per_1k: 0, output_price_per_1k: 0 },
    ],
    OPENAI: [
      { model_id: 'gpt-4o', display_name: 'GPT-4o', context_window: 128000, max_output_tokens: 16384, input_price_per_1k: 0.0025, output_price_per_1k: 0.01 },
      { model_id: 'gpt-4o-mini', display_name: 'GPT-4o Mini', context_window: 128000, max_output_tokens: 16384, input_price_per_1k: 0.00015, output_price_per_1k: 0.0006 },
      { model_id: 'o3', display_name: 'o3 (reasoning)', context_window: 200000, max_output_tokens: 100000, input_price_per_1k: 0.01, output_price_per_1k: 0.04 },
      { model_id: 'o4-mini', display_name: 'o4-mini (reasoning)', context_window: 200000, max_output_tokens: 100000, input_price_per_1k: 0.0011, output_price_per_1k: 0.0044 },
    ],
    GEMINI: [
      { model_id: 'gemini-2.5-pro', display_name: 'Gemini 2.5 Pro', context_window: 1048576, max_output_tokens: 65536, input_price_per_1k: 0.00125, output_price_per_1k: 0.01 },
      { model_id: 'gemini-2.5-flash', display_name: 'Gemini 2.5 Flash', context_window: 1048576, max_output_tokens: 65536, input_price_per_1k: 0.0001, output_price_per_1k: 0.0004 },
      { model_id: 'gemini-2.5-flash-lite', display_name: 'Gemini 2.5 Flash Lite', context_window: 1048576, max_output_tokens: 32768, input_price_per_1k: 0.000075, output_price_per_1k: 0.0003 },
      { model_id: 'gemini-2.0-flash', display_name: 'Gemini 2.0 Flash', context_window: 1048576, max_output_tokens: 8192, input_price_per_1k: 0.0001, output_price_per_1k: 0.0004 },
    ],
    ANTIGRAVITY: [
      { model_id: 'antigravity-gemini-3-pro', display_name: 'Gemini 3 Pro (Antigravity)', context_window: 1048576, max_output_tokens: 65535, input_price_per_1k: 0, output_price_per_1k: 0 },
      { model_id: 'antigravity-gemini-3-flash', display_name: 'Gemini 3 Flash (Antigravity)', context_window: 1048576, max_output_tokens: 65535, input_price_per_1k: 0, output_price_per_1k: 0 },
      { model_id: 'antigravity-claude-opus-4-6-thinking', display_name: 'Claude Opus 4.6 (Antigravity)', context_window: 200000, max_output_tokens: 64000, input_price_per_1k: 0, output_price_per_1k: 0 },
      { model_id: 'antigravity-claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6 (Antigravity)', context_window: 200000, max_output_tokens: 64000, input_price_per_1k: 0, output_price_per_1k: 0 },
    ],
    CODEX: [
      { model_id: 'codex-latest', display_name: 'Codex Latest', context_window: 128000, max_output_tokens: 4096, input_price_per_1k: 0.003, output_price_per_1k: 0.012 },
      { model_id: 'codex-mini-latest', display_name: 'Codex Mini Latest', context_window: 128000, max_output_tokens: 4096, input_price_per_1k: 0.0015, output_price_per_1k: 0.006 },
    ],
    OPENCODE: [
      { model_id: 'opencode-go', display_name: 'OpenCode Go', context_window: 128000, max_output_tokens: 4096, input_price_per_1k: 0, output_price_per_1k: 0 },
      { model_id: 'opencode-glm-5', display_name: 'OpenCode GLM-5', context_window: 1000000, max_output_tokens: 4096, input_price_per_1k: 0, output_price_per_1k: 0 },
      { model_id: 'opencode-kimi', display_name: 'OpenCode Kimi', context_window: 200000, max_output_tokens: 4096, input_price_per_1k: 0, output_price_per_1k: 0 },
    ],
    CUSTOM: [],
  };

  const models = defaultModels[type] || [];

  for (const model of models) {
    await prisma.modelConfig.create({
      data: {
        provider_id: providerId,
        model_id: model.model_id,
        display_name: model.display_name,
        context_window: model.context_window,
        max_output_tokens: model.max_output_tokens,
        input_price_per_1k: model.input_price_per_1k,
        output_price_per_1k: model.output_price_per_1k,
      },
    });
  }
}
