import { PrismaClient, Provider, ProviderType, HealthStatus } from '@prisma/client';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CryptoService } from './CryptoService.js';
import { CodexClient } from './ai/CodexClient.js';
import { OpenCodeClient } from './ai/OpenCodeClient.js';

const prisma = new PrismaClient();

interface ProviderWithKey extends Provider {
  decryptedKey?: string;
  defaultModelId?: string;
}

interface FallbackConfig {
  maxRetries: number;
  retryDelayMs: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 60000,
};

const KIMI_DEFAULT_MODEL_ID = 'kimi-k2.5';
const KIMI_DEFAULT_BASE_URL = 'https://api.moonshot.ai/v1';
const KIMI_PROVIDER_ALIASES = new Set(['kimi', 'kimi-k2.5', 'moonshot']);
const KIMI_PROVIDER_HINTS = ['kimi', 'moonshot', 'litellm'];
const ZHIPU_PROVIDER_ALIASES = new Set(['zhipu', 'zhipu ai']);
const ZHIPU_MODEL_ALIASES: Record<string, string> = {
  'glm-4': 'glm-4',
  'zai/glm-4': 'glm-4',
  'glm-4-plus': 'glm-4-plus',
  'zai/glm-4-plus': 'glm-4-plus',
  'glm-4.7': 'glm-4.7',
  'zai/glm-4.7': 'glm-4.7',
};

// Ordre de fallback par défaut
const FALLBACK_ORDER: Record<string, string[]> = {
  ANTHROPIC: ['ZHIPU', 'OPENAI'],
  ZHIPU: ['ANTHROPIC', 'OPENAI'],
  OPENAI: ['ANTHROPIC', 'ZHIPU'],
  GEMINI: ['ANTIGRAVITY', 'ANTHROPIC', 'OPENAI', 'ZHIPU'],
  ANTIGRAVITY: ['GEMINI', 'ANTHROPIC', 'OPENAI', 'ZHIPU'],
  CUSTOM: ['ANTHROPIC', 'ZHIPU'],
  CODEX: ['ANTHROPIC', 'ZHIPU', 'OPENAI'],
  OPENCODE: ['ANTHROPIC', 'ZHIPU', 'OPENAI', 'CODEX'],
};

interface CircuitBreakerState {
  failures: number;
  lastFailure: Date;
  open: boolean;
}

export class ProviderManager {
  private config: FallbackConfig;
  private circuitBreakers: Map<string, CircuitBreakerState>;

  constructor(config: Partial<FallbackConfig> = {}) {
    this.config = { ...DEFAULT_FALLBACK_CONFIG, ...config };
    this.circuitBreakers = new Map();
  }

  /**
   * Sélectionne le meilleur provider disponible
   */
  async selectProvider(
    taskType: 'coordination' | 'recon' | 'scan' | 'analysis' | 'report',
    preferredType?: ProviderType
  ): Promise<ProviderWithKey | null> {
    // 1. Essayer le provider préféré
    if (preferredType) {
      const provider = await this.getHealthyProvider(preferredType);
      if (provider) return provider;
    }

    // 2. Essayer le provider par défaut
    const defaultProvider = await this.getDefaultProvider();
    if (defaultProvider && this.isHealthy(defaultProvider) && this.hasUsableAuth(defaultProvider)) {
      return this.decryptProviderKey(defaultProvider);
    }

    // 3. Fallback vers les autres providers
    const fallbackTypes = preferredType
      ? FALLBACK_ORDER[preferredType]
      : ['ANTHROPIC', 'ZHIPU', 'OPENAI', 'GEMINI', 'ANTIGRAVITY'];

    for (const type of fallbackTypes) {
      const provider = await this.getHealthyProvider(type as ProviderType);
      if (provider) return provider;
    }

    return null;
  }

  /**
   * Récupère un provider sain d'un type donné
   */
  private async getHealthyProvider(type: ProviderType): Promise<ProviderWithKey | null> {
    const where: any = {
      type,
      enabled: true,
      health_status: { in: ['HEALTHY', 'DEGRADED'] },
    };

    if (type === 'ANTIGRAVITY') {
      where.oauth_refresh_token = { not: null };
    } else if (type !== 'GEMINI') {
      where.api_key_encrypted = { not: null };
    }

    const providers = await prisma.provider.findMany({
      where,
      orderBy: { priority: 'asc' },
    });

    for (const provider of providers) {
      if (!this.hasUsableAuth(provider)) continue;
      if (!this.isCircuitBreakerOpen(provider.id)) {
        return this.decryptProviderKey(provider);
      }
    }

    return null;
  }

  private hasGeminiCliCredentials(): boolean {
    try {
      const cred1 = path.join(os.homedir(), '.gemini', 'credentials.json');
      const cred2 = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
      return fs.existsSync(cred1) || fs.existsSync(cred2);
    } catch {
      return false;
    }
  }

  private hasUsableAuth(provider: Provider): boolean {
    if (provider.type === 'GEMINI') {
      return (
        Boolean(provider.api_key_encrypted) ||
        Boolean(provider.oauth_refresh_token || provider.oauth_access_token) ||
        this.hasGeminiCliCredentials()
      );
    }
    if (provider.type === 'ANTIGRAVITY') {
      return Boolean(provider.oauth_refresh_token);
    }
    return Boolean(provider.api_key_encrypted && provider.api_key_iv && provider.api_key_auth_tag);
  }

  /**
   * Récupère le provider par défaut
   */
  async getDefaultProvider(): Promise<Provider | null> {
    return prisma.provider.findFirst({
      where: {
        is_default: true,
        enabled: true,
      },
    });
  }

  /**
   * Récupère un provider par ID ou alias (avec clé déchiffrée)
   */
  async getProvider(providerId: string, modelId?: string): Promise<ProviderWithKey | null> {
    const providerById = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (providerById) {
      const decrypted = this.decryptProviderKey(providerById);
      return this.applyProviderDefaults(decrypted, providerId, modelId);
    }

    const providerByAlias = await this.resolveProviderByAlias(providerId);
    if (!providerByAlias) {
      return null;
    }

    const decrypted = this.decryptProviderKey(providerByAlias);
    return this.applyProviderDefaults(decrypted, providerId, modelId);
  }

  private normalizeProviderLookup(input: string): string {
    return String(input || '').trim().toLowerCase();
  }

  private isKimiLookup(input: string): boolean {
    return KIMI_PROVIDER_ALIASES.has(this.normalizeProviderLookup(input));
  }

  private isLikelyKimiProvider(provider: Provider): boolean {
    if (provider.type !== 'OPENAI' && provider.type !== 'CUSTOM') {
      return false;
    }

    const haystack = `${provider.name} ${provider.display_name} ${provider.base_url || ''}`.toLowerCase();
    return KIMI_PROVIDER_HINTS.some((hint) => haystack.includes(hint));
  }

  private isZhipuLookup(input: string): boolean {
    return ZHIPU_PROVIDER_ALIASES.has(this.normalizeProviderLookup(input));
  }

  private normalizeZhipuModelId(modelId?: string): string | undefined {
    const normalized = String(modelId || '').trim().toLowerCase();
    if (!normalized) return undefined;
    return ZHIPU_MODEL_ALIASES[normalized];
  }

  private async resolveProviderByAlias(providerLookup: string): Promise<Provider | null> {
    const normalizedLookup = this.normalizeProviderLookup(providerLookup);
    if (!normalizedLookup) return null;

    const providerByName = await prisma.provider.findUnique({
      where: { name: normalizedLookup },
    });
    if (providerByName) return providerByName;

    const providers = await prisma.provider.findMany({
      where: { enabled: true },
      orderBy: [{ is_default: 'desc' }, { priority: 'asc' }, { created_at: 'asc' }],
    });

    const byDisplayName = providers.find(
      (provider) => this.normalizeProviderLookup(provider.display_name) === normalizedLookup
    );
    if (byDisplayName) return byDisplayName;

    if (this.isKimiLookup(normalizedLookup)) {
      return providers.find((provider) => this.isLikelyKimiProvider(provider)) || null;
    }

    return null;
  }

  private applyProviderDefaults(
    provider: ProviderWithKey,
    lookupKey: string,
    modelId?: string
  ): ProviderWithKey {
    const zhipuModelId = this.normalizeZhipuModelId(modelId);
    if (zhipuModelId && (provider.type === 'ZHIPU' || this.isZhipuLookup(lookupKey))) {
      return {
        ...provider,
        defaultModelId: zhipuModelId,
      };
    }

    if (!this.isKimiLookup(lookupKey) && !this.isLikelyKimiProvider(provider)) {
      return provider;
    }

    return {
      ...provider,
      base_url: provider.base_url || KIMI_DEFAULT_BASE_URL,
      defaultModelId: KIMI_DEFAULT_MODEL_ID,
    };
  }

  /**
   * Vérifie la santé d'un provider
   */
  isHealthy(provider: Provider): boolean {
    if (!provider.enabled) return false;
    if (provider.health_status === 'UNHEALTHY') return false;
    if (this.isCircuitBreakerOpen(provider.id)) return false;
    return true;
  }

  /**
   * Déchiffre la clé API d'un provider
   */
  private decryptProviderKey(provider: Provider): ProviderWithKey {
    if (!provider.api_key_encrypted || !provider.api_key_iv || !provider.api_key_auth_tag) {
      return provider;
    }

    const decryptedKey = CryptoService.decrypt(
      provider.api_key_encrypted,
      provider.api_key_iv,
      provider.api_key_auth_tag
    );

    return { ...provider, decryptedKey };
  }

  /**
   * Enregistre un échec (pour circuit breaker)
   */
  recordFailure(providerId: string): void {
    const breaker = this.circuitBreakers.get(providerId) || {
      failures: 0,
      lastFailure: new Date(),
      open: false,
    };

    breaker.failures++;
    breaker.lastFailure = new Date();

    if (breaker.failures >= this.config.circuitBreakerThreshold) {
      breaker.open = true;
      console.warn(`[ProviderManager] Circuit breaker OPEN for provider ${providerId}`);
    }

    this.circuitBreakers.set(providerId, breaker);
  }

  /**
   * Enregistre un succès (reset circuit breaker)
   */
  recordSuccess(providerId: string): void {
    this.circuitBreakers.delete(providerId);
  }

  /**
   * Vérifie si le circuit breaker est ouvert
   */
  private isCircuitBreakerOpen(providerId: string): boolean {
    const breaker = this.circuitBreakers.get(providerId);
    if (!breaker || !breaker.open) return false;

    // Vérifier si le délai de reset est passé
    const resetTime = new Date(breaker.lastFailure.getTime() + this.config.circuitBreakerResetMs);
    if (new Date() > resetTime) {
      // Half-open: on réessaie
      breaker.open = false;
      breaker.failures = 0;
      return false;
    }

    return true;
  }

  /**
   * Met à jour le statut de santé d'un provider
   */
  async updateHealth(
    providerId: string,
    status: HealthStatus,
    error?: string
  ): Promise<void> {
    await prisma.provider.update({
      where: { id: providerId },
      data: {
        health_status: status,
        last_health_check: new Date(),
        last_error: error || null,
      },
    });
  }

  /**
   * Enregistre l'usage d'un provider
   */
  async recordUsage(
    providerId: string,
    tokensInput: number,
    tokensOutput: number,
    modelId?: string
  ): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.providerUsage.upsert({
      where: {
        provider_id_date: {
          provider_id: providerId,
          date: today,
        },
      },
      update: {
        tokens_input: { increment: tokensInput },
        tokens_output: { increment: tokensOutput },
        requests_count: { increment: 1 },
      },
      create: {
        provider_id: providerId,
        date: today,
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        requests_count: 1,
      },
    });

    // Update provider last_used_at
    await prisma.provider.update({
      where: { id: providerId },
      data: { last_used_at: new Date() },
    });

    // Update model usage if specified
    if (modelId) {
      await prisma.modelConfig.updateMany({
        where: { provider_id: providerId, model_id: modelId },
        data: {
          usage_count: { increment: 1 },
          last_used_at: new Date(),
        },
      });
    }
  }

  /**
   * Récupère les statistiques d'usage
   */
  async getUsageStats(providerId: string, days: number = 30): Promise<{
    totalTokens: number;
    totalRequests: number;
    totalCost: number;
    daily: any[];
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const usage = await prisma.providerUsage.findMany({
      where: {
        provider_id: providerId,
        date: { gte: since },
      },
      orderBy: { date: 'asc' },
    });

    return {
      totalTokens: usage.reduce((sum, u) => sum + u.tokens_input + u.tokens_output, 0),
      totalRequests: usage.reduce((sum, u) => sum + u.requests_count, 0),
      totalCost: usage.reduce((sum, u) => sum + u.cost_estimate_usd, 0),
      daily: usage,
    };
  }
}

// Singleton
export const providerManager = new ProviderManager();
