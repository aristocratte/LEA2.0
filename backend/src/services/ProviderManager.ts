import { PrismaClient, Provider, ProviderType, HealthStatus } from '@prisma/client';
import { CryptoService } from './CryptoService.js';

const prisma = new PrismaClient();

interface ProviderWithKey extends Provider {
  decryptedKey?: string;
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

// Ordre de fallback par défaut
const FALLBACK_ORDER: Record<string, string[]> = {
  ANTHROPIC: ['ZHIPU', 'OPENAI'],
  ZHIPU: ['ANTHROPIC', 'OPENAI'],
  OPENAI: ['ANTHROPIC', 'ZHIPU'],
  CUSTOM: ['ANTHROPIC', 'ZHIPU'],
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
    if (defaultProvider && this.isHealthy(defaultProvider)) {
      return this.decryptProviderKey(defaultProvider);
    }

    // 3. Fallback vers les autres providers
    const fallbackTypes = preferredType
      ? FALLBACK_ORDER[preferredType]
      : ['ANTHROPIC', 'ZHIPU', 'OPENAI'];

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
    const providers = await prisma.provider.findMany({
      where: {
        type,
        enabled: true,
        health_status: { in: ['HEALTHY', 'DEGRADED'] },
        api_key_encrypted: { not: null },
      },
      orderBy: { priority: 'asc' },
    });

    for (const provider of providers) {
      if (!this.isCircuitBreakerOpen(provider.id)) {
        return this.decryptProviderKey(provider);
      }
    }

    return null;
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
   * Récupère un provider par ID (avec clé déchiffrée)
   */
  async getProvider(providerId: string): Promise<ProviderWithKey | null> {
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      return null;
    }

    return this.decryptProviderKey(provider);
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
