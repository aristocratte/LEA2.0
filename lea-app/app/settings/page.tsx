'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Key,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Trash2,
  ChevronRight,
  RefreshCw,
  Eye,
  EyeOff,
  Zap,
  Server,
  Cpu,
  Loader2,
  LogIn,
  ExternalLink,
} from 'lucide-react';
import { LeftSidebar } from '@/components/layout/left-sidebar';
import { useProviderStore } from '@/store/provider-store';
import { getDevelopmentApiKey, providersApi } from '@/lib/api';
import {
  SETTINGS_DETAIL_MONO_INPUT_CLASS,
  SETTINGS_MONO_INPUT_CLASS,
  SETTINGS_TEXT_INPUT_CLASS,
  ZAI_CODING_PLAN_BASE_URL,
  defaultProviderBaseUrl,
} from '@/lib/provider-defaults';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import type { Provider, ProviderType } from '@/types';
import { RuntimeExtensionsPanel } from '@/components/settings/RuntimeExtensionsPanel';
import { ENABLE_EXPERIMENTAL_RUNTIME_UI } from '@/lib/feature-flags';

const PROVIDER_META: Record<ProviderType, {
  name: string;
  description: string;
  accent: string;
  icon: string;
  docsUrl: string;
  oauthSupported?: boolean;
  oauthLabel?: string;
  apiKeyLabel?: string;
  apiKeyPlaceholder?: string;
}> = {
  anthropic: {
    name: 'Anthropic',
    description: 'Claude models — API key from console.anthropic.com',
    accent: 'from-orange-500 via-amber-500 to-yellow-500',
    icon: 'A',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyLabel: 'API Key',
    apiKeyPlaceholder: 'sk-ant-api03-...',
  },
  zhipu: {
    name: 'Zhipu AI',
    description: 'GLM-5 / Coding Plan — get your key at Z.ai',
    accent: 'from-blue-600 via-indigo-500 to-violet-500',
    icon: 'Z',
    docsUrl: 'https://z.ai/manage-apikey/apikey-list',
    apiKeyLabel: 'API Key',
    apiKeyPlaceholder: 'your-z.ai-api-key',
  },
  openai: {
    name: 'OpenAI',
    description: 'GPT-5.5 / GPT-5.4 — get your key at platform.openai.com',
    accent: 'from-emerald-500 via-teal-500 to-cyan-500',
    icon: 'O',
    docsUrl: 'https://platform.openai.com/api-keys',
    apiKeyLabel: 'API Key',
    apiKeyPlaceholder: 'sk-...',
  },
  gemini: {
    name: 'Google Gemini',
    description: 'Gemini 2.5 Pro/Flash — connect via Google account',
    accent: 'from-blue-500 via-purple-500 to-pink-500',
    icon: 'G',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    oauthSupported: true,
    oauthLabel: 'Connect with Google',
    apiKeyLabel: 'API Key (alternative)',
    apiKeyPlaceholder: 'AIza...',
  },
  antigravity: {
    name: 'Antigravity',
    description: 'Google Cloud Code Assist — connect via Google account',
    accent: 'from-purple-600 via-fuchsia-500 to-pink-500',
    icon: 'AG',
    docsUrl: '#',
    oauthSupported: true,
    oauthLabel: 'Connect with Google',
  },
  codex: {
    name: 'OpenAI Codex',
    description: 'Codex models — get your key at platform.openai.com',
    accent: 'from-indigo-500 via-purple-500 to-pink-500',
    icon: 'CX',
    docsUrl: 'https://platform.openai.com/api-keys',
    apiKeyLabel: 'API Key',
    apiKeyPlaceholder: 'sk-...',
  },
  opencode: {
    name: 'OpenCode',
    description: 'Open-source model endpoints',
    accent: 'from-green-500 via-emerald-500 to-teal-500',
    icon: 'OC',
    docsUrl: '#',
    apiKeyLabel: 'API Key',
    apiKeyPlaceholder: 'your-opencode-api-key',
  },
  custom: {
    name: 'Custom',
    description: 'Self-hosted or third-party OpenAI-compatible API',
    accent: 'from-gray-600 via-gray-500 to-slate-500',
    icon: 'C',
    docsUrl: '#',
    apiKeyLabel: 'API Key',
    apiKeyPlaceholder: 'your-api-key',
  }
};

function ProviderCard({
  provider,
  isSelected,
  onSelect
}: {
  provider: Provider;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const meta = PROVIDER_META[provider.type];
  const statusColor =
    provider.healthStatus === 'healthy' ? 'bg-emerald-500' :
    provider.healthStatus === 'degraded' ? 'bg-amber-500' :
    provider.healthStatus === 'unhealthy' ? 'bg-red-500' :
    'bg-zinc-400';

  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ scale: 1.01, y: -1 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        'relative w-full text-left group rounded-xl border transition-all duration-200 overflow-hidden bg-white',
        isSelected
          ? 'border-zinc-400 shadow-lg shadow-zinc-200'
          : 'border-zinc-200 hover:border-zinc-300 hover:shadow-md'
      )}
    >
      <div className={cn('h-1 w-full bg-gradient-to-r', meta.accent)} />

      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold shadow-md',
              meta.accent
            )}>
              {meta.icon}
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 text-base leading-tight">
                {provider.displayName || meta.name}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn('w-2 h-2 rounded-full', statusColor)} />
                <span className="text-[11px] text-zinc-500 uppercase tracking-wide">
                  {provider.healthStatus}
                </span>
              </div>
            </div>
          </div>

          <div className={cn(
            'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
            provider.enabled
              ? 'border-zinc-900 bg-zinc-900 text-white'
              : 'border-zinc-200 text-zinc-400'
          )}>
            {provider.enabled ? 'Active' : 'Disabled'}
          </div>
        </div>

        <p className="text-sm text-zinc-600 mb-4 leading-relaxed">
          {meta.description}
        </p>

        <div className="flex items-center justify-between pt-4 border-t border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Cpu className="w-3.5 h-3.5" />
              <span className="font-medium">{provider.models.filter(m => m.enabled).length}</span>
              <span>models</span>
            </div>
            {(provider.apiKeyConfigured || provider.oauthConfigured) && (
              <div className="flex items-center gap-1 text-xs text-emerald-600">
                {provider.oauthConfigured ? <LogIn className="w-3 h-3" /> : <Key className="w-3 h-3" />}
                <span className="font-medium">{provider.oauthConfigured ? 'OAuth' : 'Connected'}</span>
              </div>
            )}
          </div>

          <ChevronRight className={cn(
            'w-4 h-4 transition-transform duration-200',
            isSelected ? 'text-zinc-700 translate-x-0.5' : 'text-zinc-300 group-hover:text-zinc-500'
          )} />
        </div>
      </div>
    </motion.button>
  );
}

function ProviderDetail({
  provider,
  onClose
}: {
  provider: Provider;
  onClose: () => void;
}) {
  const {
    updateProviderLocal,
    updateProvider,
    toggleProvider,
    toggleModel,
    removeModel,
    fetchProviders,
  } = useProviderStore();

  const meta = PROVIDER_META[provider.type];
  const providerDefaultBaseUrl = defaultProviderBaseUrl(provider.type);
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'models'>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [isConnectingOAuth, setIsConnectingOAuth] = useState(false);

  // Add Custom Model state
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [newModelId, setNewModelId] = useState('');
  const [newModelContext, setNewModelContext] = useState('128000');
  const [isAddingModel, setIsAddingModel] = useState(false);

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await providersApi.testConnection(provider.id);
      setTestResult(result.success ? 'success' : 'error');
    } catch {
      setTestResult('error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateProvider(provider.id, provider);
      toast.success('Provider saved');
    } catch {
      toast.error('Failed to save provider');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectOAuth = async () => {
    setIsConnectingOAuth(true);
    try {
      const oauthType = provider.type.toUpperCase() as 'ANTHROPIC' | 'GEMINI' | 'ANTIGRAVITY';
      const result = await providersApi.connectOAuth(oauthType);
      // Open the OAuth URL in a popup and detect completion
      const popup = window.open(result.url, '_blank', 'width=600,height=700');
      toast.success('OAuth window opened — authorize then come back here');

      // Poll for popup closure to refresh provider status
      if (popup) {
        const poll = setInterval(() => {
          if (popup.closed) {
            clearInterval(poll);
            fetchProviders();
          }
        }, 500);
      }
    } catch {
      toast.error('Failed to start OAuth flow');
    } finally {
      setIsConnectingOAuth(false);
    }
  };

  const handleAddModel = async () => {
    if (!newModelId.trim()) return;
    setIsAddingModel(true);
    try {
      const API_BASE = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? '443' : '80')}`;
      const apiKey = getDevelopmentApiKey();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      const res = await fetch(`${API_BASE}/api/providers/${provider.id}/models`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model_id: newModelId.trim(),
          context_window: parseInt(newModelContext) || 128000,
          enabled: true,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setAddModelOpen(false);
      setNewModelId('');
      setNewModelContext('128000');
      await fetchProviders();
    } catch (err) {
      console.error('Failed to add model:', err);
    } finally {
      setIsAddingModel(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full flex flex-col bg-white"
    >
      <div className="flex items-center justify-between p-5 border-b border-zinc-200">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-lg shadow-lg',
            meta.accent
          )}>
            {meta.icon}
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900">{provider.displayName || meta.name}</h2>
            <p className="text-sm text-zinc-500">{meta.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleProvider(provider.id)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
              provider.enabled
                ? 'border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800'
                : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'
            )}
          >
            {provider.enabled ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            <XCircle className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
      </div>

      <div className="flex border-b border-zinc-200">
        {(['general', 'models'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-5 py-3 text-sm font-medium capitalize border-b-2 transition-colors -mb-px',
              activeTab === tab
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-400 hover:text-zinc-600'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-5">
        <AnimatePresence mode="wait">
          {activeTab === 'general' ? (
            <motion.div
              key="general"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-lg space-y-5"
            >
              {/* OAuth section — shown for supported providers */}
              {meta.oauthSupported && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">
                        {provider.oauthConfigured ? 'OAuth connected' : 'Connect via OAuth'}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {provider.oauthConfigured
                          ? 'Your account is linked — no API key needed'
                          : 'Use your subscription, no API key required'}
                      </p>
                    </div>
                    <button
                      onClick={handleConnectOAuth}
                      disabled={isConnectingOAuth}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all whitespace-nowrap',
                        provider.oauthConfigured
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-700'
                      )}
                    >
                      {isConnectingOAuth ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : provider.oauthConfigured ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <LogIn className="w-3.5 h-3.5" />
                      )}
                      {provider.oauthConfigured ? 'Reconnect' : (meta.oauthLabel || 'Connect')}
                    </button>
                  </div>
                </div>
              )}

              {/* API Key section */}
              {(!meta.oauthSupported || provider.oauthConfigured === false) && (
                <>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                      <Key className="w-4 h-4 text-zinc-500" />
                      {meta.apiKeyLabel || 'API Key'}
                    </label>
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={provider.apiKey || ''}
                        onChange={(e) => updateProviderLocal(provider.id, { apiKey: e.target.value })}
                        placeholder={provider.apiKeyConfigured ? '••••••••••••••••' : (meta.apiKeyPlaceholder || 'Enter your API key')}
                        className={cn(SETTINGS_DETAIL_MONO_INPUT_CLASS, 'pr-10')}
                      />
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                      >
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Encrypted and stored securely.{' '}
                      {meta.docsUrl !== '#' && (
                        <a href={meta.docsUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 text-blue-600 hover:underline">
                          Get your key
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                      <Server className="w-4 h-4 text-zinc-500" />
                      Base URL <span className="text-zinc-400 font-normal text-xs">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={provider.baseUrl || ''}
                      onChange={(e) => updateProviderLocal(provider.id, { baseUrl: e.target.value })}
                      placeholder={providerDefaultBaseUrl || 'https://api.provider.com/v1'}
                      className={SETTINGS_DETAIL_MONO_INPUT_CLASS}
                    />
                    {providerDefaultBaseUrl && !provider.baseUrl && (
                      <p className="text-xs text-zinc-500">
                        Default endpoint for Coding Plan:{' '}
                        <span className="font-mono text-zinc-700">{providerDefaultBaseUrl}</span>
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* For OAuth providers, also offer API key as alternative */}
              {meta.oauthSupported && (
                <details className="group">
                  <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-700 select-none flex items-center gap-1">
                    <span>Use API key instead</span>
                    <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={provider.apiKey || ''}
                        onChange={(e) => updateProviderLocal(provider.id, { apiKey: e.target.value })}
                        placeholder={provider.apiKeyConfigured ? '••••••••••••••••' : (meta.apiKeyPlaceholder || 'Enter your API key')}
                        className={cn(SETTINGS_DETAIL_MONO_INPUT_CLASS, 'pr-10')}
                      />
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                      >
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {meta.docsUrl !== '#' && (
                      <a href={meta.docsUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        Get your API key
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </details>
              )}

              <div className="pt-4 flex items-center gap-3">
                <button
                  onClick={handleTest}
                  disabled={isTesting}
                  className="flex items-center gap-2 px-4 py-2 border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
                >
                  {isTesting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {isTesting ? 'Testing...' : 'Test Connection'}
                </button>

                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors disabled:opacity-60"
                >
                  {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>

              {testResult && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                    testResult === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  )}
                >
                  {testResult === 'success' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  {testResult === 'success'
                    ? 'Connection successful!'
                    : 'Connection failed. Check your credentials.'}
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="models"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900">Available Models</h3>
                <button
                  onClick={() => setAddModelOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-dashed border-zinc-300 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Custom Model
                </button>
              </div>

              <div className="space-y-2">
                {provider.models.map((model) => (
                  <motion.div
                    key={model.id}
                    layout
                    className={cn(
                      'flex items-center justify-between p-3 border rounded-xl transition-all',
                      model.enabled
                        ? 'border-zinc-300 bg-white'
                        : 'border-zinc-200 bg-zinc-50 opacity-60'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleModel(provider.id, model.id)}
                        className={cn(
                          'w-5 h-5 rounded-md border flex items-center justify-center transition-colors',
                          model.enabled
                            ? 'border-zinc-900 bg-zinc-900'
                            : 'border-zinc-300 hover:border-zinc-400'
                        )}
                      >
                        {model.enabled && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </button>
                      <div>
                        <p className="font-mono text-sm font-medium text-zinc-900">
                          {model.modelId}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {model.contextWindow.toLocaleString()} tokens
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">
                          ${model.inputPricePer1k?.toFixed(2)}/1K input
                        </p>
                        <p className="text-xs text-zinc-500">
                          ${model.outputPricePer1k?.toFixed(2)}/1K output
                        </p>
                      </div>
                      <button
                        onClick={() => removeModel(provider.id, model.id)}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Add Custom Model Modal */}
      {addModelOpen && (
        <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">Add Custom Model</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-600 mb-1 block">Model ID</label>
                <input
                  autoFocus
                  type="text"
                  value={newModelId}
                  onChange={e => setNewModelId(e.target.value)}
                  placeholder="e.g. gpt-4o-2024-11-20"
                  className={SETTINGS_MONO_INPUT_CLASS}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 mb-1 block">Context Window (tokens)</label>
                <input
                  type="number"
                  value={newModelContext}
                  onChange={e => setNewModelContext(e.target.value)}
                  placeholder="128000"
                  className={SETTINGS_MONO_INPUT_CLASS}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setAddModelOpen(false); setNewModelId(''); setNewModelContext('128000'); }}
                className="flex-1 px-4 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddModel}
                disabled={isAddingModel || !newModelId.trim()}
                className="flex-1 px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {isAddingModel ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                Add Model
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function ExperimentalRuntimeNotice() {
  return (
    <section className="mt-8 rounded-3xl border border-dashed border-zinc-200 bg-white px-5 py-5 text-sm text-zinc-600">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
        Experimental runtime hidden
      </p>
      <h2 className="mt-2 text-lg font-semibold text-zinc-950">MVP settings stay focused on providers.</h2>
      <p className="mt-1 max-w-2xl leading-6">
        MCP, hooks, skills, plugins, LSP and raw runtime consoles remain available for admin/dev builds only.
        Set <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-700">NEXT_PUBLIC_LEA_EXPERIMENTAL_RUNTIME_UI=true</code> to expose them locally.
      </p>
    </section>
  );
}

export default function SettingsPage() {
  const { providers, fetchProviders, selectedProviderId, selectProvider } = useProviderStore();
  const [isLoading, setIsLoading] = useState(true);
  const selectedProvider = providers.find(p => p.id === selectedProviderId);

  // Add Provider modal state
  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [newProviderType, setNewProviderType] = useState<'ANTHROPIC' | 'ZHIPU' | 'OPENAI' | 'GEMINI' | 'ANTIGRAVITY' | 'CUSTOM' | 'CODEX' | 'OPENCODE' | 'MISTRAL' | 'DEEPSEEK' | 'OLLAMA'>('ANTHROPIC');
  const [newProviderDisplayName, setNewProviderDisplayName] = useState('Anthropic');
  const [newProviderApiKey, setNewProviderApiKey] = useState('');
  const [newProviderBaseUrl, setNewProviderBaseUrl] = useState('');
  const [isAddingProvider, setIsAddingProvider] = useState(false);

  // Preset configs for common providers (use CUSTOM type with pre-filled base URL)
  const PROVIDER_PRESETS: Record<string, { type: typeof newProviderType; displayName: string; baseUrl?: string }> = {
    ANTHROPIC: { type: 'ANTHROPIC', displayName: 'Anthropic' },
    ZHIPU: { type: 'ZHIPU', displayName: 'Zhipu AI (GLM)', baseUrl: ZAI_CODING_PLAN_BASE_URL },
    OPENAI: { type: 'OPENAI', displayName: 'OpenAI' },
    GEMINI: { type: 'GEMINI', displayName: 'Google Gemini' },
    ANTIGRAVITY: { type: 'ANTIGRAVITY', displayName: 'Google Antigravity' },
    CODEX: { type: 'CODEX', displayName: 'OpenAI Codex' },
    OPENCODE: { type: 'OPENCODE', displayName: 'OpenCode' },
    MISTRAL: { type: 'CUSTOM', displayName: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1' },
    DEEPSEEK: { type: 'CUSTOM', displayName: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
    OLLAMA: { type: 'CUSTOM', displayName: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1' },
    CUSTOM: { type: 'CUSTOM', displayName: 'Custom' },
  };

  const displayNameForType = (type: string) => {
    return PROVIDER_PRESETS[type]?.displayName ?? type;
  };

  const handleAddProvider = async () => {
    if (!newProviderDisplayName.trim()) return;
    setIsAddingProvider(true);
    try {
      // For preset providers (Mistral, DeepSeek, Ollama), use CUSTOM type with pre-filled base URL
      const preset = PROVIDER_PRESETS[newProviderType] || { type: newProviderType, displayName: newProviderDisplayName };
      const effectiveBaseUrl = newProviderBaseUrl || preset.baseUrl || undefined;

      await providersApi.create({
        name: newProviderDisplayName.toLowerCase().replace(/\s+/g, '-'),
        type: preset.type,
        display_name: newProviderDisplayName,
        api_key: newProviderApiKey || undefined,
        base_url: effectiveBaseUrl,
        enabled: true,
      });
      setAddProviderOpen(false);
      setNewProviderType('ANTHROPIC');
      setNewProviderDisplayName('Anthropic');
      setNewProviderApiKey('');
      setNewProviderBaseUrl('');
      await fetchProviders();
    } catch (err) {
      console.error('Failed to add provider:', err);
    } finally {
      setIsAddingProvider(false);
    }
  };

  useEffect(() => {
    fetchProviders().then(() => setIsLoading(false));
  }, [fetchProviders]);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50">
      <LeftSidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex gap-6">
              <div className={cn(
                'transition-all duration-300',
                selectedProvider ? 'w-1/2' : 'w-full'
              )}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider">
                    AI Providers
                  </h2>
                  <button
                    onClick={() => setAddProviderOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Provider
                  </button>
                </div>

                {isLoading ? (
                  <div className="grid grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-40 bg-zinc-100 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : (
                  providers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
                        <Server className="w-6 h-6 text-zinc-400" />
                      </div>
                      <h3 className="text-sm font-semibold text-zinc-700 mb-1">No providers configured</h3>
                      <p className="text-xs text-zinc-400 max-w-xs">Add an AI provider to start running pentests. Click &quot;Add Provider&quot; above.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {providers.map((provider) => (
                        <ProviderCard
                          key={provider.id}
                          provider={provider}
                          isSelected={selectedProviderId === provider.id}
                          onSelect={() => selectProvider(provider.id)}
                        />
                      ))}
                    </div>
                  )
                )}
              </div>

              <AnimatePresence>
                {selectedProvider && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: '50%', opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="h-full border border-zinc-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                      <ProviderDetail
                        provider={selectedProvider}
                        onClose={() => selectProvider('')}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {ENABLE_EXPERIMENTAL_RUNTIME_UI ? (
              <RuntimeExtensionsPanel />
            ) : (
              <ExperimentalRuntimeNotice />
            )}
          </div>
        </div>
      </main>

      {/* Add Provider Modal */}
      {addProviderOpen && (
        <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-base font-semibold text-zinc-900 mb-5">Add Provider</h2>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm text-zinc-600">Provider</label>
                <select
                  value={newProviderType}
                  onChange={(e) => {
                    const key = e.target.value as typeof newProviderType;
                    const preset = PROVIDER_PRESETS[key];
                    setNewProviderType(key);
                    setNewProviderDisplayName(preset?.displayName || displayNameForType(key));
                    setNewProviderBaseUrl(preset?.baseUrl || '');
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 bg-white text-sm text-zinc-900 focus:outline-none focus:border-zinc-400"
                >
                  <optgroup label="Hosted APIs">
                    <option value="ANTHROPIC">Anthropic (Claude)</option>
                    <option value="OPENAI">OpenAI (GPT / o-series)</option>
                    <option value="GEMINI">Google Gemini</option>
                    <option value="ANTIGRAVITY">Google Antigravity</option>
                    <option value="ZHIPU">Zhipu AI (GLM)</option>
                    <option value="MISTRAL">Mistral AI</option>
                    <option value="DEEPSEEK">DeepSeek</option>
                    <option value="CODEX">OpenAI Codex</option>
                    <option value="OPENCODE">OpenCode</option>
                  </optgroup>
                  <optgroup label="Local / Custom">
                    <option value="OLLAMA">Ollama (local)</option>
                    <option value="CUSTOM">Custom endpoint</option>
                  </optgroup>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-zinc-600">Display Name</label>
                <input
                  type="text"
                  value={newProviderDisplayName}
                  onChange={(e) => setNewProviderDisplayName(e.target.value)}
                  placeholder="e.g. My Anthropic Provider"
                  className={SETTINGS_TEXT_INPUT_CLASS}
                />
              </div>

              {newProviderType !== 'OLLAMA' && (
                <div className="space-y-1.5">
                  <label className="text-sm text-zinc-600">API Key</label>
                  <input
                    type="password"
                    value={newProviderApiKey}
                    onChange={(e) => setNewProviderApiKey(e.target.value)}
                    placeholder="Enter your API key"
                    className={SETTINGS_MONO_INPUT_CLASS}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm text-zinc-600">
                  Base URL{' '}
                  {newProviderType !== 'OLLAMA' && newProviderType !== 'CUSTOM' && (
                    <span className="text-zinc-400 font-normal">(optional)</span>
                  )}
                </label>
                <input
                  type="text"
                  value={newProviderBaseUrl}
                  onChange={(e) => setNewProviderBaseUrl(e.target.value)}
                  placeholder={
                    newProviderType === 'OLLAMA' ? 'http://localhost:11434/v1' :
                    newProviderType === 'ZHIPU' ? ZAI_CODING_PLAN_BASE_URL :
                    newProviderType === 'MISTRAL' ? 'https://api.mistral.ai/v1' :
                    newProviderType === 'DEEPSEEK' ? 'https://api.deepseek.com/v1' :
                    'Leave empty to use the default endpoint'
                  }
                  className={SETTINGS_MONO_INPUT_CLASS}
                />
                {newProviderType === 'OLLAMA' && (
                  <p className="text-xs text-zinc-500">No API key needed — Ollama runs locally</p>
                )}
                {newProviderType === 'ZHIPU' && (
                  <p className="text-xs text-zinc-500">
                    Coding Plan default outside China: <span className="font-mono">{ZAI_CODING_PLAN_BASE_URL}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setAddProviderOpen(false)}
                disabled={isAddingProvider}
                className="flex-1 px-4 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddProvider}
                disabled={isAddingProvider || !newProviderDisplayName.trim()}
                className="flex-1 px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isAddingProvider ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Provider'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
