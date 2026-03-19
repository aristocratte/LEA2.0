'use client';

import { useState, useEffect } from 'react';
import { useProviderStore } from '@/store/provider-store';
import { providersApi } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
    Eye,
    EyeOff,
    Trash2,
    Plus,
    ChevronDown,
    ChevronRight,
    Loader2,
    AlertCircle,
    RefreshCw,
    Settings,
    Check,
    XCircle,
    Wifi,
} from 'lucide-react';
import { LeftSidebar } from '@/components/layout/left-sidebar';

const providerIcons: Record<string, { icon: string; color: string }> = {
    anthropic: { icon: 'A', color: 'from-orange-500 to-orange-600' },
    zhipu: { icon: 'Z', color: 'from-blue-500 to-blue-600' },
    openai: { icon: 'O', color: 'from-green-500 to-green-600' },
    gemini: { icon: 'G', color: 'from-blue-400 to-indigo-500' },
    antigravity: { icon: 'AG', color: 'from-purple-500 to-pink-500' },
    custom: { icon: 'C', color: 'from-gray-500 to-gray-600' },
    codex: { icon: 'CX', color: 'from-indigo-500 to-blue-600' },
    opencode: { icon: 'OC', color: 'from-emerald-500 to-green-600' },
};

export function ProviderForm() {
    const {
        providers,
        selectedProviderId,
        selectProvider,
        updateProviderLocal,
        updateProvider: updateProviderApi,
        deleteProvider: deleteProviderApi,
        toggleProvider,
        removeModel,
        toggleModel,
        fetchProviders,
        isLoading,
        error,
        clearError,
    } = useProviderStore();

    const [showApiKey, setShowApiKey] = useState(false);
    const [mappingOpen, setMappingOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<string | 'ok' | null>(null);

    // Add Provider modal state
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [newProviderType, setNewProviderType] = useState<'ANTHROPIC' | 'ZHIPU' | 'OPENAI' | 'GEMINI' | 'CUSTOM' | 'CODEX' | 'OPENCODE'>('ANTHROPIC');
    const [newProviderName, setNewProviderName] = useState('');
    const [newProviderDisplayName, setNewProviderDisplayName] = useState('Anthropic');
    const [newProviderApiKey, setNewProviderApiKey] = useState('');
    const [newProviderBaseUrl, setNewProviderBaseUrl] = useState('');
    const [newProviderIsAdding, setNewProviderIsAdding] = useState(false);
    const [geminiCliStatus, setGeminiCliStatus] = useState<{ available: boolean; expires_at?: string | null; source?: 'cli' | 'oauth' | 'none'; db_oauth_configured?: boolean; cli_credentials_detected?: boolean } | null>(null);
    const [geminiCliLoading, setGeminiCliLoading] = useState(false);
    const [geminiOauthLoading, setGeminiOauthLoading] = useState(false);

    const selectedProvider = providers.find((p) => p.id === selectedProviderId);

    useEffect(() => {
        fetchProviders();
    }, [fetchProviders]);

    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        setIsDirty(false);
        setTestResult(null);
    }, [selectedProviderId]);

    useEffect(() => {
        if (!selectedProvider || !isDirty) return;

        const timeoutId = setTimeout(async () => {
            try {
                setIsSaving(true);
                await updateProviderApi(selectedProvider.id, selectedProvider);
                setSaveSuccess(true);
                setIsDirty(false);
                setTimeout(() => setSaveSuccess(false), 2000);
            } catch (err) {
            } finally {
                setIsSaving(false);
            }
        }, 1500);

        return () => clearTimeout(timeoutId);
    }, [selectedProvider, isDirty, updateProviderApi]);

    const fetchGeminiCliStatus = async () => {
        setGeminiCliLoading(true);
        try {
            const res = await fetch('/api/providers/gemini/cli-status');
            if (res.ok) {
                setGeminiCliStatus(await res.json());
            }
        } catch {
            setGeminiCliStatus({ available: false });
        } finally {
            setGeminiCliLoading(false);
        }
    };

    const connectGeminiOAuth = async () => {
        setGeminiOauthLoading(true);
        try {
            const res = await fetch('/api/providers/oauth/gemini', { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to initiate Gemini OAuth flow');
            }
            if (data?.url) {
                window.open(data.url, '_blank');
            }
            setTimeout(() => {
                fetchGeminiCliStatus();
                fetchProviders();
            }, 1500);
        } catch (e) {
            console.error(e);
        } finally {
            setGeminiOauthLoading(false);
        }
    };

    useEffect(() => {
        if (selectedProvider?.type === 'gemini') {
            fetchGeminiCliStatus();
        }
    }, [selectedProvider?.id, selectedProvider?.type]);

    const handleDeleteProvider = async (id: string) => {
        if (confirm('Are you sure you want to delete this provider?')) {
            try {
                await deleteProviderApi(id);
            } catch (err) {
            }
        }
    };

    const handleRefresh = () => {
        clearError();
        fetchProviders();
    };

    const displayNameForType = (type: string) => {
        const map: Record<string, string> = {
            ANTHROPIC: 'Anthropic',
            ZHIPU: 'Zhipu AI',
            OPENAI: 'OpenAI',
            GEMINI: 'Gemini',
            CODEX: 'OpenAI Codex',
            OPENCODE: 'OpenCode Go',
            CUSTOM: 'Custom',
        };
        return map[type] ?? type;
    };

    const handleTestConnection = async () => {
        if (!selectedProvider) return;
        setIsTesting(true);
        setTestResult(null);
        try {
            const data = await providersApi.testConnection(selectedProvider.id);
            setTestResult(data.success ? 'ok' : (data.error || 'Failed'));
        } catch {
            setTestResult('Network error');
        } finally {
            setIsTesting(false);
        }
    };

    const handleAddProvider = async () => {
        if (!newProviderType || !newProviderDisplayName) return;
        setNewProviderIsAdding(true);
        try {
            await providersApi.create({
                name: newProviderName || newProviderDisplayName.toLowerCase().replace(/\s+/g, '-'),
                type: newProviderType,
                display_name: newProviderDisplayName,
                api_key: newProviderApiKey || undefined,
                base_url: newProviderBaseUrl || undefined,
                enabled: true,
            });
            setAddModalOpen(false);
            // Reset form
            setNewProviderType('ANTHROPIC');
            setNewProviderDisplayName('Anthropic');
            setNewProviderApiKey('');
            setNewProviderBaseUrl('');
            // Refresh providers list
            fetchProviders();
        } catch (err) {
            console.error('Failed to add provider:', err);
        } finally {
            setNewProviderIsAdding(false);
        }
    };

    return (
        <div className="flex h-screen bg-[#F5F5F5]">
            <LeftSidebar />
            
            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar - Provider list */}
                <div className="w-[260px] bg-white border-r border-gray-200 p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-4 px-2">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Providers
                        </h2>
                        <button
                            onClick={handleRefresh}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                            disabled={isLoading}
                        >
                            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
                        </button>
                    </div>

                    {error && (
                        <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                                <p className="text-[10px] text-red-600">{error}</p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-1 overflow-y-auto flex-1">
                        {providers.map((provider) => {
                            const pi = providerIcons[provider.type] || providerIcons.custom;
                            const isSelected = provider.id === selectedProviderId;
                            return (
                                <button
                                    key={provider.id}
                                    onClick={() => selectProvider(provider.id)}
                                    className={cn(
                                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200',
                                        isSelected
                                            ? 'bg-gray-100 text-gray-900 border border-gray-200'
                                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                    )}
                                >
                                    <div className={cn('w-6 h-6 rounded-md bg-gradient-to-br flex items-center justify-center text-[10px] font-bold text-white', pi.color)}>
                                        {pi.icon}
                                    </div>
                                    <span className="flex-1 text-left truncate">{provider.displayName}</span>
                                    <div
                                        className={cn(
                                            'w-2 h-2 rounded-full flex-shrink-0',
                                            provider.enabled && provider.healthStatus === 'healthy' && 'bg-green-500',
                                            provider.enabled && provider.healthStatus === 'degraded' && 'bg-yellow-500',
                                            provider.enabled && provider.healthStatus === 'unhealthy' && 'bg-red-500',
                                            (!provider.enabled || provider.healthStatus === 'unknown') && 'bg-gray-300'
                                        )}
                                    />
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={() => setAddModalOpen(true)}
                        className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors border border-dashed border-gray-300"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add Provider
                    </button>
                </div>

                {/* Main - Provider config */}
                {selectedProvider ? (
                    <div className="flex-1 p-8 overflow-y-auto bg-[#F5F5F5]">
                        <div className="max-w-lg">
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-3">
                                    <h1 className="text-xl font-semibold text-gray-900">{selectedProvider.displayName}</h1>
                                    {selectedProvider.enabled && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 border border-green-200">
                                            Enabled
                                        </span>
                                    )}
                                    {(isSaving || saveSuccess) && (
                                        <span className={cn(
                                            'px-2 py-0.5 rounded-full text-[10px] font-medium border flex items-center gap-1.5',
                                            saveSuccess
                                                ? 'bg-green-100 text-green-700 border-green-200'
                                                : 'bg-gray-100 text-gray-500 border-gray-200'
                                        )}>
                                            {isSaving ? (
                                                <>
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    Saving...
                                                </>
                                            ) : (
                                                <>
                                                    <Check className="w-3 h-3" />
                                                    Saved
                                                </>
                                            )}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    <Switch
                                        checked={selectedProvider.enabled}
                                        onCheckedChange={() => toggleProvider(selectedProvider.id)}
                                        className="data-[state=checked]:bg-[#F5A623]"
                                    />
                                    <button
                                        onClick={() => handleDeleteProvider(selectedProvider.id)}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <Label className="text-sm text-gray-600">API Base URL</Label>
                                    <Input
                                        value={selectedProvider.baseUrl || ''}
                                        onChange={(e) => {
                                            updateProviderLocal(selectedProvider.id, { baseUrl: e.target.value });
                                            setIsDirty(true);
                                        }}
                                        placeholder="Leave empty to use the default API endpoint"
                                        className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-[#F5A623] focus:ring-[#F5A623]/20 font-mono text-sm"
                                    />
                                </div>

                                {selectedProvider?.type === 'gemini' && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-sm text-gray-600">Gemini Authentication</Label>
                                            <button
                                                onClick={fetchGeminiCliStatus}
                                                disabled={geminiCliLoading}
                                                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                                            >
                                                <RefreshCw className={cn('w-3 h-3', geminiCliLoading && 'animate-spin')} />
                                                Refresh
                                            </button>
                                        </div>
                                        <div className={cn(
                                            'flex items-start gap-3 px-4 py-3 rounded-xl border',
                                            geminiCliStatus?.available
                                                ? 'bg-green-50 border-green-200'
                                                : 'bg-yellow-50 border-yellow-200'
                                        )}>
                                            <div className={cn(
                                                'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                                                geminiCliStatus?.available ? 'bg-green-500' : 'bg-yellow-500'
                                            )} />
                                            <div className="flex-1 min-w-0">
                                                {geminiCliStatus === null || geminiCliLoading ? (
                                                    <p className="text-xs text-gray-500">Checking Gemini auth status...</p>
                                                ) : geminiCliStatus.available ? (
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <p className="text-xs font-medium text-green-700">
                                                                {geminiCliStatus.source === 'oauth'
                                                                    ? 'Gemini OAuth Connected'
                                                                    : 'Gemini CLI Connected'}
                                                            </p>
                                                            {geminiCliStatus.expires_at && (
                                                                <p className="text-[10px] text-gray-500 mt-0.5">
                                                                    Token expires: {new Date(geminiCliStatus.expires_at).toLocaleString()}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={connectGeminiOAuth}
                                                            disabled={geminiOauthLoading}
                                                            className="px-2 py-1 text-[10px] font-medium rounded bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white transition-colors"
                                                        >
                                                            {geminiOauthLoading ? 'Connecting…' : (geminiCliStatus.source === 'oauth' ? 'Reconnect OAuth' : 'Use OAuth')}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <p className="text-xs font-medium text-yellow-700">No Gemini auth detected</p>
                                                            <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">
                                                                Connect with Google OAuth (recommended) or run <code className="font-mono bg-gray-100 px-1 rounded">gemini auth login</code> on host.
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={connectGeminiOAuth}
                                                            disabled={geminiOauthLoading}
                                                            className="px-2 py-1 text-[10px] font-medium rounded bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white transition-colors"
                                                        >
                                                            {geminiOauthLoading ? 'Connecting…' : 'Connect OAuth'}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Label className="text-sm text-gray-600">
                                            {selectedProvider?.type === 'gemini' ? 'API Key (optional fallback)' : selectedProvider?.type === 'antigravity' ? 'API Key (Not Used)' : 'API Key'}
                                        </Label>
                                        {selectedProvider.apiKeyConfigured && !selectedProvider.apiKey && (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-100 text-green-700 border border-green-200">
                                                Configured
                                            </span>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <Input
                                            type={showApiKey ? 'text' : 'password'}
                                            value={selectedProvider.apiKey || ''}
                                            onChange={(e) => {
                                                updateProviderLocal(selectedProvider.id, { apiKey: e.target.value });
                                                setIsDirty(true);
                                            }}
                                            placeholder={
                                                selectedProvider?.type === 'gemini'
                                                    ? 'Optional — leave empty to use Gemini CLI credentials'
                                                    : (selectedProvider.apiKeyConfigured ? 'Key saved — enter new key to replace' : 'Enter your API key')
                                            }
                                            className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-[#F5A623] focus:ring-[#F5A623]/20 font-mono text-sm pr-10"
                                        />
                                        <button
                                            onClick={() => setShowApiKey(!showApiKey)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                        >
                                            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={handleTestConnection}
                                        disabled={isTesting}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
                                    >
                                        {isTesting ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Testing...
                                            </>
                                        ) : (
                                            <>
                                                <Wifi className="w-4 h-4" />
                                                Test Connection
                                            </>
                                        )}
                                    </button>
                                    {testResult !== null && (
                                        testResult === 'ok' ? (
                                            <span className="flex items-center gap-1.5 text-sm text-green-700">
                                                <Check className="w-4 h-4 text-green-500" />
                                                Connection OK
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1.5 text-sm text-red-600">
                                                <XCircle className="w-4 h-4 text-red-500" />
                                                {testResult}
                                            </span>
                                        )
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <Label className="text-sm text-gray-600">Models</Label>
                                    <div className="space-y-1">
                                        {selectedProvider.models.map((model) => (
                                            <div
                                                key={model.id}
                                                className={cn(
                                                    'flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors bg-white',
                                                    model.enabled
                                                        ? 'border-gray-200'
                                                        : 'border-gray-100 opacity-50'
                                                )}
                                            >
                                                <button
                                                    onClick={() => toggleModel(selectedProvider.id, model.id)}
                                                    className={cn(
                                                        'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
                                                        model.enabled
                                                            ? 'border-[#F5A623] bg-[#F5A623]'
                                                            : 'border-gray-300'
                                                    )}
                                                >
                                                    {model.enabled && (
                                                        <Check className="w-3 h-3 text-white" />
                                                    )}
                                                </button>
                                                <span className="flex-1 text-sm font-mono text-gray-700">
                                                    {model.modelId}
                                                </span>
                                                <button
                                                    onClick={() => removeModel(selectedProvider.id, model.id)}
                                                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <button className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 transition-colors">
                                        <Plus className="w-3.5 h-3.5" />
                                        Add Model
                                    </button>
                                </div>

                                <div className="border-t border-gray-200 pt-4">
                                    <button
                                        onClick={() => setMappingOpen(!mappingOpen)}
                                        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                                    >
                                        {mappingOpen ? (
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        ) : (
                                            <ChevronRight className="w-3.5 h-3.5" />
                                        )}
                                        <Settings className="w-3.5 h-3.5" />
                                        Models Mapping
                                    </button>
                                    {mappingOpen && (
                                        <div className="mt-3 p-4 rounded-xl bg-gray-50 border border-gray-200">
                                            <p className="text-xs text-gray-500">
                                                Configure model aliases and routing rules for this provider.
                                                This feature will be available in a future update.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center bg-[#F5F5F5]">
                        {isLoading ? (
                            <div className="flex flex-col items-center gap-3 text-gray-400">
                                <Loader2 className="w-6 h-6 animate-spin" />
                                <p className="text-sm">Loading providers...</p>
                            </div>
                        ) : (
                            <div className="text-center text-gray-400">
                                <p className="text-sm mb-2">No provider selected</p>
                                <p className="text-xs">Select a provider from the sidebar or add a new one</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Add Provider Modal */}
            {addModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-md mx-4">
                        <h2 className="text-base font-semibold text-gray-900 mb-5">Add Provider</h2>

                        <div className="space-y-4">
                            {/* Type */}
                            <div className="space-y-1.5">
                                <label className="text-sm text-gray-600">Type</label>
                                <select
                                    value={newProviderType}
                                    onChange={(e) => {
                                        const t = e.target.value as typeof newProviderType;
                                        setNewProviderType(t);
                                        setNewProviderDisplayName(displayNameForType(t));
                                    }}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/20"
                                >
                                    <option value="ANTHROPIC">ANTHROPIC</option>
                                    <option value="ZHIPU">ZHIPU</option>
                                    <option value="OPENAI">OPENAI</option>
                                    <option value="GEMINI">GEMINI</option>
                                    <option value="CODEX">CODEX</option>
                                    <option value="OPENCODE">OPENCODE</option>
                                    <option value="CUSTOM">CUSTOM</option>
                                </select>
                            </div>

                            {/* Display Name */}
                            <div className="space-y-1.5">
                                <label className="text-sm text-gray-600">Display Name</label>
                                <input
                                    type="text"
                                    value={newProviderDisplayName}
                                    onChange={(e) => setNewProviderDisplayName(e.target.value)}
                                    placeholder="e.g. My Anthropic Provider"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/20"
                                />
                            </div>

                            {/* API Key */}
                            <div className="space-y-1.5">
                                <label className="text-sm text-gray-600">API Key</label>
                                <input
                                    type="password"
                                    value={newProviderApiKey}
                                    onChange={(e) => setNewProviderApiKey(e.target.value)}
                                    placeholder="Enter your API key"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/20 font-mono"
                                />
                            </div>

                            {/* Base URL */}
                            <div className="space-y-1.5">
                                <label className="text-sm text-gray-600">Base URL <span className="text-gray-400 font-normal">(optional)</span></label>
                                <input
                                    type="text"
                                    value={newProviderBaseUrl}
                                    onChange={(e) => setNewProviderBaseUrl(e.target.value)}
                                    placeholder="Leave empty to use the default endpoint"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/20 font-mono"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setAddModalOpen(false)}
                                disabled={newProviderIsAdding}
                                className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddProvider}
                                disabled={newProviderIsAdding || !newProviderDisplayName.trim()}
                                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-white bg-[#F5A623] hover:bg-[#E8962A] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {newProviderIsAdding ? (
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