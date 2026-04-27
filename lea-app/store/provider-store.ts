import { create } from 'zustand';
import type { Provider, ModelConfig, ApiProvider } from '@/types';
import { providersApi } from '@/lib/api';

interface ProviderState {
  providers: Provider[];
  selectedProviderId: string | null;

  // Loading & error states
  isLoading: boolean;
  error: string | null;

  // Local state actions (unchanged)
  selectProvider: (id: string) => void;
  toggleProvider: (id: string) => void;
  addModel: (providerId: string, model: ModelConfig) => void;
  removeModel: (providerId: string, modelId: string) => void;
  toggleModel: (providerId: string, modelId: string) => void;
  setDefault: (id: string) => void;

  // API-connected actions
  fetchProviders: () => Promise<void>;
  createProvider: (data: Omit<Provider, 'id' | 'healthStatus'>) => Promise<Provider>;
  updateProvider: (id: string, updates: Partial<Provider>) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  // Local update for optimistic UI updates
  updateProviderLocal: (id: string, updates: Partial<Provider>) => void;
  clearError: () => void;
}

// Convert API response to frontend Provider type
function fromApiProvider(apiProvider: ApiProvider): Provider {
  return {
    id: apiProvider.id || apiProvider.name,
    name: apiProvider.name,
    type: apiProvider.type.toLowerCase() as Provider['type'],
    displayName: apiProvider.display_name || apiProvider.name,
    enabled: apiProvider.enabled ?? true,
    apiKey: '', // Never populate with masked hash - user must enter a new key
    apiKeyConfigured: !!apiProvider.api_key_hash,
    oauthConfigured: !!apiProvider.oauth_configured,
    baseUrl: apiProvider.base_url,
    organizationId: apiProvider.organization_id,
    models: (apiProvider.models || []).map((m): ModelConfig => ({
      id: m.id || m.model_id,
      modelId: m.model_id,
      displayName: m.display_name,
      contextWindow: m.context_window,
      maxOutputTokens: m.max_output_tokens,
      supportsStreaming: m.supports_streaming,
      supportsVision: m.supports_vision,
      supportsTools: m.supports_tools,
      inputPricePer1k: m.input_price_per_1k,
      outputPricePer1k: m.output_price_per_1k,
      enabled: m.enabled ?? true,
      usageCount: m.usage_count,
      lastUsedAt: m.last_used_at,
    })),
    isDefault: apiProvider.is_default ?? false,
    priority: apiProvider.priority,
    healthStatus: (apiProvider.health_status?.toLowerCase() === 'unknown' ? 'unknown' :
      apiProvider.health_status?.toLowerCase() === 'unhealthy' ? 'unhealthy' :
        apiProvider.health_status?.toLowerCase() === 'degraded' ? 'degraded' :
          apiProvider.health_status?.toLowerCase() === 'healthy' ? 'healthy' : 'unknown') as 'healthy' | 'degraded' | 'unhealthy' | 'unknown',
    lastHealthCheck: apiProvider.last_health_check,
    lastError: apiProvider.last_error,
    createdAt: apiProvider.created_at,
    updatedAt: apiProvider.updated_at,
    lastUsedAt: apiProvider.last_used_at,
  };
}

// Convert frontend Provider to API request format
function toApiProvider(provider: Partial<Provider>): Record<string, unknown> {
  return {
    name: provider.name,
    type: provider.type?.toUpperCase(),
    display_name: provider.displayName,
    ...(provider.apiKey ? { api_key: provider.apiKey } : {}),
    base_url: provider.baseUrl,
    enabled: provider.enabled,
    is_default: provider.isDefault,
    models: provider.models?.map((m) => ({
      model_id: m.modelId,
      display_name: m.displayName,
      context_window: m.contextWindow,
      enabled: m.enabled,
    })),
  };
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  selectedProviderId: null,
  isLoading: false,
  error: null,

  selectProvider: (id) => set({ selectedProviderId: id }),

  toggleProvider: (id) => {
    const current = get().providers.find(p => p.id === id);
    if (!current) return;
    set((state) => ({
      providers: state.providers.map((p) =>
        p.id === id ? { ...p, enabled: !p.enabled } : p
      ),
    }));
    // Persist to API (fire and forget)
    providersApi.update(id, { enabled: !current.enabled }).catch(console.error);
  },

  addModel: (providerId, model) =>
    set((state) => ({
      providers: state.providers.map((p) =>
        p.id === providerId
          ? { ...p, models: [...p.models, model] }
          : p
      ),
    })),

  removeModel: (providerId, modelId) =>
    set((state) => ({
      providers: state.providers.map((p) =>
        p.id === providerId
          ? { ...p, models: p.models.filter((m) => m.id !== modelId) }
          : p
      ),
    })),

  toggleModel: (providerId, modelId) =>
    set((state) => ({
      providers: state.providers.map((p) =>
        p.id === providerId
          ? {
            ...p,
            models: p.models.map((m) =>
              m.id === modelId ? { ...m, enabled: !m.enabled } : m
            ),
          }
          : p
      ),
    })),

  setDefault: (id) =>
    set((state) => ({
      providers: state.providers.map((p) => ({
        ...p,
        isDefault: p.id === id,
      })),
    })),

  updateProviderLocal: (id, updates) =>
    set((state) => ({
      providers: state.providers.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),

  clearError: () => set({ error: null }),

  fetchProviders: async () => {
    set({ isLoading: true, error: null });
    try {
      const providers = await providersApi.list();
      const convertedProviders = providers.map(fromApiProvider);
      set({
        providers: convertedProviders,
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch providers',
        isLoading: false,
        providers: [],
      });
    }
  },

  createProvider: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const apiData = toApiProvider(data);
      const response = await providersApi.create(apiData);
      const newProvider = fromApiProvider(response);
      set((state) => ({
        providers: [...state.providers, newProvider],
        isLoading: false,
      }));
      return newProvider;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to create provider',
        isLoading: false,
      });
      throw err;
    }
  },

  updateProvider: async (id, updates) => {
    set({ isLoading: true, error: null });
    try {
      const apiData = toApiProvider(updates);
      await providersApi.update(id, apiData);
      // After successful save, mark key as configured and clear the raw key
      const hasNewKey = !!updates.apiKey && updates.apiKey.length > 5;
      set((state) => ({
        providers: state.providers.map((p) =>
          p.id === id ? {
            ...p,
            ...updates,
            apiKey: '', // Clear raw key after save
            apiKeyConfigured: hasNewKey ? true : p.apiKeyConfigured,
          } : p
        ),
        isLoading: false,
      }));
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to update provider',
        isLoading: false,
      });
      throw err;
    }
  },

  deleteProvider: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await providersApi.delete(id);
      set((state) => ({
        providers: state.providers.filter((p) => p.id !== id),
        selectedProviderId: state.selectedProviderId === id ? null : state.selectedProviderId,
        isLoading: false,
      }));
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to delete provider',
        isLoading: false,
      });
      throw err;
    }
  },
}));
