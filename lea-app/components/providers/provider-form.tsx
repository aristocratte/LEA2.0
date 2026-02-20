'use client';

import { useState, useEffect } from 'react';
import { useProviderStore } from '@/store/provider-store';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
    Eye,
    EyeOff,
    Trash2,
    Link2,
    Plus,
    ChevronDown,
    ChevronRight,
    Sparkles,
    Loader2,
    AlertCircle,
    RefreshCw,
} from 'lucide-react';

const providerIcons: Record<string, { icon: string; color: string }> = {
    anthropic: { icon: 'A', color: 'from-orange-500 to-orange-600' },
    zhipu: { icon: 'Z', color: 'from-blue-500 to-blue-600' },
    openai: { icon: 'O', color: 'from-green-500 to-green-600' },
    gemini: { icon: 'G', color: 'from-blue-400 to-indigo-500' },
    antigravity: { icon: 'AG', color: 'from-purple-500 to-pink-500' },
    custom: { icon: 'C', color: 'from-gray-500 to-gray-600' },
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
    const [geminiCliStatus, setGeminiCliStatus] = useState<{ available: boolean; expires_at?: string | null } | null>(null);
    const [geminiCliLoading, setGeminiCliLoading] = useState(false);

    const selectedProvider = providers.find((p) => p.id === selectedProviderId);

    // Fetch providers on mount
    useEffect(() => {
        fetchProviders();
    }, [fetchProviders]);

    // Track if user has made local edits (to avoid auto-saving unmodified data)
    const [isDirty, setIsDirty] = useState(false);

    // Reset dirty flag when switching provider
    useEffect(() => {
        setIsDirty(false);
    }, [selectedProviderId]);

    // Auto-save on provider change with debounce (only if user modified something)
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
                // Error is already handled in the store
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
                // Error is already handled in the store
            }
        }
    };

    const handleRefresh = () => {
        clearError();
        fetchProviders();
    };

    return (
        <div className="flex h-[calc(100vh-56px)]">
            {/* Sidebar - Provider list */}
            <div className="w-[240px] border-r border-white/[0.09] p-4 flex flex-col">
                <div className="flex items-center justify-between mb-4 px-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-[#5c5c66]">
                        Provider
                    </h2>
                    <button
                        onClick={handleRefresh}
                        className="p-1 text-[#5c5c66] hover:text-white transition-colors"
                        disabled={isLoading}
                    >
                        <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
                    </button>
                </div>

                {/* Error alert */}
                {error && (
                    <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                            <p className="text-[10px] text-red-400">{error}</p>
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
                                        ? 'bg-white/[0.09] text-white border border-white/[0.14]'
                                        : 'text-[#b0b0b8] hover:text-white hover:bg-white/[0.05]'
                                )}
                            >
                                <div className={cn('w-6 h-6 rounded-md bg-gradient-to-br flex items-center justify-center text-[10px] font-bold text-white', pi.color)}>
                                    {pi.icon}
                                </div>
                                <span className="flex-1 text-left truncate">{provider.displayName}</span>
                                <div
                                    className={cn(
                                        'w-2 h-2 rounded-full flex-shrink-0',
                                        provider.enabled && provider.healthStatus === 'healthy' && 'bg-green-400',
                                        provider.enabled && provider.healthStatus === 'degraded' && 'bg-yellow-400',
                                        provider.enabled && provider.healthStatus === 'unhealthy' && 'bg-red-400',
                                        (!provider.enabled || provider.healthStatus === 'unknown') && 'bg-[#5c5c66]'
                                    )}
                                />
                            </button>
                        );
                    })}
                </div>

                {/* Add provider button */}
                <button className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm text-cyan-400 hover:text-cyan-300 hover:bg-white/[0.05] transition-colors border border-dashed border-white/[0.11]">
                    <Plus className="w-3.5 h-3.5" />
                    Add Provider
                </button>
            </div>

            {/* Main - Provider config */}
            {selectedProvider ? (
                <div className="flex-1 p-8 overflow-y-auto">
                    <div className="max-w-lg">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl font-semibold">{selectedProvider.displayName}</h1>
                                {selectedProvider.enabled && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                        Enabled
                                    </span>
                                )}
                                {/* Save status indicator */}
                                {(isSaving || saveSuccess) && (
                                    <span className={cn(
                                        'px-2 py-0.5 rounded-full text-[10px] font-medium border flex items-center gap-1.5',
                                        saveSuccess
                                            ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                            : 'bg-white/[0.05] text-[#85858f] border-white/[0.11]'
                                    )}>
                                        {isSaving ? (
                                            <>
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            'Saved'
                                        )}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <Switch
                                    checked={selectedProvider.enabled}
                                    onCheckedChange={() => toggleProvider(selectedProvider.id)}
                                    className="data-[state=checked]:bg-cyan-500"
                                />
                                <button
                                    onClick={() => handleDeleteProvider(selectedProvider.id)}
                                    className="p-2 text-[#5c5c66] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {/* API Base URL */}
                            <div className="space-y-2">
                                <Label className="text-sm text-[#b0b0b8]">API Base URL</Label>
                                <Input
                                    value={selectedProvider.baseUrl || ''}
                                    onChange={(e) => {
                                        updateProviderLocal(selectedProvider.id, { baseUrl: e.target.value });
                                        setIsDirty(true);
                                    }}
                                    placeholder="Leave empty to use the default API endpoint"
                                    className="bg-white/[0.05] border-white/[0.11] text-white placeholder:text-[#5c5c66] focus-visible:ring-purple-500/30 font-mono text-sm"
                                />
                                {!selectedProvider.baseUrl && (
                                    <p className="text-[10px] text-[#5c5c66]">
                                        Leave empty to use the default API endpoint
                                    </p>
                                )}
                            </div>

                            {/* Gemini CLI Status */}
                            {selectedProvider?.type === 'gemini' && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm text-[#b0b0b8]">Gemini CLI Authentication</Label>
                                        <button
                                            onClick={fetchGeminiCliStatus}
                                            disabled={geminiCliLoading}
                                            className="flex items-center gap-1.5 text-xs text-[#85858f] hover:text-[#b0b0b8] transition-colors"
                                        >
                                            <RefreshCw className={cn('w-3 h-3', geminiCliLoading && 'animate-spin')} />
                                            Refresh
                                        </button>
                                    </div>
                                    <div className={cn(
                                        'flex items-start gap-3 px-4 py-3 rounded-xl border',
                                        geminiCliStatus?.available
                                            ? 'bg-green-500/[0.06] border-green-500/20'
                                            : 'bg-yellow-500/[0.06] border-yellow-500/20'
                                    )}>
                                        <div className={cn(
                                            'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                                            geminiCliStatus?.available ? 'bg-green-400' : 'bg-yellow-400'
                                        )} />
                                        <div className="flex-1 min-w-0">
                                            {geminiCliStatus === null || geminiCliLoading ? (
                                                <p className="text-xs text-[#85858f]">Checking OAuth status...</p>
                                            ) : geminiCliStatus.available ? (
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-xs font-medium text-green-400">Gemini CLI Connected (OAuth)</p>
                                                        {geminiCliStatus.expires_at && (
                                                            <p className="text-[10px] text-[#85858f] mt-0.5">
                                                                Token expires: {new Date(geminiCliStatus.expires_at).toLocaleString()}
                                                            </p>
                                                        )}
                                                    </div>
                                                    {selectedProvider.apiKey && (
                                                        <button
                                                            onClick={() => {
                                                                updateProviderLocal(selectedProvider.id, { apiKey: '' });
                                                                setIsDirty(true);
                                                            }}
                                                            className="px-2 py-1 text-[10px] font-medium rounded bg-white/[0.1] hover:bg-white/[0.15] text-white transition-colors"
                                                        >
                                                            Use CLI OAuth
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="text-xs font-medium text-yellow-400">CLI OAuth not detected</p>
                                                    <p className="text-[10px] text-[#85858f] mt-0.5 leading-relaxed">
                                                        Run <code className="font-mono bg-white/[0.07] px-1 rounded">gemini auth login</code> on your host machine to authorize with your Google account.
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Antigravity OAuth */}
                            {selectedProvider?.type === 'antigravity' && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm text-[#b0b0b8]">Google Code Assist Identity</Label>
                                    </div>
                                    <div className={cn(
                                        'flex items-start gap-3 px-4 py-3 rounded-xl border',
                                        selectedProvider.apiKeyConfigured
                                            ? 'bg-purple-500/[0.06] border-purple-500/20'
                                            : 'bg-white/[0.04] border-white/[0.09]'
                                    )}>
                                        <div className={cn(
                                            'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                                            selectedProvider.apiKeyConfigured ? 'bg-purple-400' : 'bg-[#5c5c66]'
                                        )} />
                                        <div className="flex-1 min-w-0">
                                            {selectedProvider.apiKeyConfigured ? (
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-xs font-medium text-purple-400">Authenticated with Google</p>
                                                        <p className="text-[10px] text-[#85858f] mt-0.5">
                                                            OAuth token is stored securely in the database.
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                const res = await fetch('/api/providers/oauth/antigravity', { method: 'POST' });
                                                                const data = await res.json();
                                                                if (data.url) window.open(data.url, '_blank');
                                                            } catch (e) {
                                                                console.error(e);
                                                            }
                                                        }}
                                                        className="px-2 py-1 text-[10px] font-medium rounded bg-white/[0.1] hover:bg-white/[0.15] text-white transition-colors"
                                                    >
                                                        Reconnect
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-xs font-medium text-[#b0b0b8]">Not Authenticated</p>
                                                        <p className="text-[10px] text-[#85858f] mt-0.5 leading-relaxed">
                                                            Connect your Google account to access Antigravity Code Assist models.
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                const res = await fetch('/api/providers/oauth/antigravity', { method: 'POST' });
                                                                const data = await res.json();
                                                                if (data.url) window.open(data.url, '_blank');
                                                            } catch (e) {
                                                                console.error(e);
                                                            }
                                                        }}
                                                        className="px-2 py-1 text-[10px] font-medium rounded bg-purple-500 hover:bg-purple-600 text-white transition-colors"
                                                    >
                                                        Connect
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* API Key */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Label className="text-sm text-[#b0b0b8]">
                                        {selectedProvider?.type === 'gemini' ? 'API Key (optional fallback)' : selectedProvider?.type === 'antigravity' ? 'API Key (Not Used)' : 'API Key'}
                                    </Label>
                                    {selectedProvider.apiKeyConfigured && !selectedProvider.apiKey && (
                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-500/10 text-green-400 border border-green-500/20">
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
                                        className="bg-white/[0.05] border-white/[0.11] text-white placeholder:text-[#5c5c66] focus-visible:ring-purple-500/30 font-mono text-sm pr-10"
                                    />
                                    <button
                                        onClick={() => setShowApiKey(!showApiKey)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#85858f] hover:text-white transition-colors"
                                    >
                                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Models */}
                            <div className="space-y-3">
                                <Label className="text-sm text-[#b0b0b8]">Models</Label>
                                <div className="space-y-1">
                                    {selectedProvider.models.map((model) => (
                                        <div
                                            key={model.id}
                                            className={cn(
                                                'flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors',
                                                model.enabled
                                                    ? 'bg-white/[0.04] border-white/[0.11]'
                                                    : 'bg-transparent border-white/[0.04] opacity-50'
                                            )}
                                        >
                                            <button
                                                onClick={() => toggleModel(selectedProvider.id, model.id)}
                                                className={cn(
                                                    'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
                                                    model.enabled
                                                        ? 'border-cyan-400 bg-cyan-400'
                                                        : 'border-[#5c5c66]'
                                                )}
                                            >
                                                {model.enabled && (
                                                    <div className="w-1.5 h-1.5 rounded-full bg-black" />
                                                )}
                                            </button>
                                            <span className="flex-1 text-sm font-mono">
                                                {model.modelId}
                                            </span>
                                            <button className="p-1 text-[#5c5c66] hover:text-[#b0b0b8] transition-colors">
                                                <Link2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => removeModel(selectedProvider.id, model.id)}
                                                className="p-1 text-[#5c5c66] hover:text-red-400 transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button className="flex items-center gap-2 px-4 py-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                                    <Plus className="w-3.5 h-3.5" />
                                    Add Model
                                </button>
                            </div>

                            {/* Models Mapping (collapsible) */}
                            <div className="border-t border-white/[0.09] pt-4">
                                <button
                                    onClick={() => setMappingOpen(!mappingOpen)}
                                    className="flex items-center gap-2 text-sm text-[#85858f] hover:text-[#b0b0b8] transition-colors"
                                >
                                    {mappingOpen ? (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                    ) : (
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    )}
                                    <Sparkles className="w-3.5 h-3.5" />
                                    Models Mapping
                                </button>
                                {mappingOpen && (
                                    <div className="mt-3 p-4 rounded-xl bg-white/[0.04] border border-white/[0.09]">
                                        <p className="text-xs text-[#5c5c66]">
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
                <div className="flex-1 flex items-center justify-center">
                    {isLoading ? (
                        <div className="flex flex-col items-center gap-3 text-[#85858f]">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <p className="text-sm">Loading providers...</p>
                        </div>
                    ) : (
                        <div className="text-center text-[#85858f]">
                            <p className="text-sm mb-2">No provider selected</p>
                            <p className="text-xs">Select a provider from the sidebar or add a new one</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
