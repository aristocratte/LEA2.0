'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  Code2,
  FileCode2,
  GitBranch,
  Loader2,
  LockKeyhole,
  PlugZap,
  RefreshCw,
  SearchCode,
  Settings2,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRuntimeExtensions } from '@/hooks/use-runtime-extensions';
import { useSkills } from '@/hooks/use-skills';
import { extensionsApi, type LspDiagnostic, type LspSymbol, type PluginSnapshot } from '@/lib/extensions-api';

type RuntimeTab = 'overview' | 'mcp' | 'hooks' | 'skills' | 'plugins' | 'lsp' | 'settings';
type StatusTone = 'ok' | 'warn' | 'muted' | 'bad';

const TABS: Array<{ id: RuntimeTab; label: string; icon: typeof Activity }> = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'mcp', label: 'MCP', icon: PlugZap },
  { id: 'hooks', label: 'Hooks', icon: GitBranch },
  { id: 'skills', label: 'Skills', icon: Sparkles },
  { id: 'plugins', label: 'Plugins', icon: Boxes },
  { id: 'lsp', label: 'LSP', icon: Code2 },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1',
        tone === 'ok' && 'bg-emerald-50 text-emerald-700 ring-emerald-200',
        tone === 'warn' && 'bg-amber-50 text-amber-700 ring-amber-200',
        tone === 'bad' && 'bg-red-50 text-red-700 ring-red-200',
        tone === 'muted' && 'bg-zinc-100 text-zinc-500 ring-zinc-200',
      )}
    >
      {label}
    </span>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: typeof Activity; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/70 px-4 py-8 text-center">
      <Icon className="mx-auto h-8 w-8 text-zinc-300" />
      <p className="mt-3 text-sm font-semibold text-zinc-700">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">{body}</p>
    </div>
  );
}

function InlineNotice({
  tone,
  title,
  body,
}: {
  tone: 'error' | 'warning' | 'info';
  title: string;
  body: string;
}) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    info: 'border-sky-200 bg-sky-50 text-sky-700',
  }[tone];

  return (
    <div className={cn('rounded-xl border px-3 py-2.5 text-xs leading-relaxed', styles)}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-0.5 opacity-90">{body}</p>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = 'secondary',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all',
        'focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-55',
        variant === 'primary' && 'bg-zinc-900 text-white hover:bg-zinc-700 active:scale-[0.98]',
        variant === 'secondary' && 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 active:scale-[0.98]',
        variant === 'danger' && 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 active:scale-[0.98]',
      )}
    >
      {children}
    </button>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'muted',
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  tone?: StatusTone;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-200/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">{value}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-white">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="truncate text-xs text-zinc-500">{detail}</p>
        <StatusPill
          label={tone === 'ok' ? 'ready' : tone === 'warn' ? 'attention' : tone === 'bad' ? 'blocked' : 'idle'}
          tone={tone}
        />
      </div>
    </div>
  );
}

export function RuntimeExtensionsPanel() {
  const runtime = useRuntimeExtensions();
  const skills = useSkills();
  const [activeTab, setActiveTab] = useState<RuntimeTab>('overview');
  const [lspPath, setLspPath] = useState('src');
  const [lspResult, setLspResult] = useState<{
    diagnostics: LspDiagnostic[];
    symbols: LspSymbol[];
    files: string[];
  } | null>(null);
  const [lspError, setLspError] = useState<string | null>(null);
  const [lspMode, setLspMode] = useState<'diagnostics' | 'symbols' | null>(null);

  const activeHookCount = runtime.hooks?.events.filter((event) => event.hasListeners).length ?? 0;
  const hookCount = runtime.hooks?.events.length ?? 0;
  const pluginCount = runtime.plugins?.plugins.length ?? 0;
  const loadedPlugins = runtime.plugins?.plugins.filter((plugin) => plugin.state === 'loaded').length ?? 0;
  const trustedPlugins = runtime.plugins?.plugins.filter((plugin) => plugin.trust === 'trusted').length ?? 0;
  const erroredPlugins = runtime.plugins?.plugins.filter((plugin) => plugin.state === 'error').length ?? 0;
  const bridgedTools = runtime.mcp?.bridgedTools.length ?? 0;

  const systemReadiness = useMemo(() => {
    const ready = [
      runtime.mcp?.connected || bridgedTools > 0,
      hookCount > 0,
      skills.skills.length > 0,
      pluginCount === 0 || loadedPlugins > 0,
    ].filter(Boolean).length;
    return Math.round((ready / 4) * 100);
  }, [bridgedTools, hookCount, loadedPlugins, pluginCount, runtime.mcp?.connected, skills.skills.length]);

  const runLspDiagnostics = async () => {
    setLspMode('diagnostics');
    setLspError(null);
    try {
      const paths = lspPath.split(',').map((item) => item.trim()).filter(Boolean);
      const result = await extensionsApi.runLspDiagnostics({ paths: paths.length ? paths : undefined, limit: 80 });
      setLspResult({ diagnostics: result.diagnostics, symbols: [], files: result.files });
    } catch (err) {
      setLspError(err instanceof Error ? err.message : 'Failed to run LSP diagnostics');
    } finally {
      setLspMode(null);
    }
  };

  const runLspSymbols = async () => {
    setLspMode('symbols');
    setLspError(null);
    try {
      const paths = lspPath.split(',').map((item) => item.trim()).filter(Boolean);
      const result = await extensionsApi.runLspSymbols({ paths: paths.length ? paths : undefined, limit: 120 });
      setLspResult({ diagnostics: [], symbols: result.symbols, files: result.files });
    } catch (err) {
      setLspError(err instanceof Error ? err.message : 'Failed to run LSP symbols');
    } finally {
      setLspMode(null);
    }
  };

  return (
    <section className="mt-8 overflow-hidden rounded-[28px] border border-zinc-200 bg-[#f7f5ef] shadow-sm">
      <div className="relative border-b border-zinc-200 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_32%),linear-gradient(135deg,#faf9f5,#f0eee8)] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Bloc C control plane</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
              Runtime extensions console
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600">
              MCP, hooks, skills, plugins and LSP are admin/dev runtime surfaces.
              This panel is the operator view for discovery, trust and runtime health outside the default MVP client experience.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ActionButton onClick={() => void runtime.refresh()} disabled={runtime.isLoading}>
              <RefreshCw className={cn('h-3.5 w-3.5', runtime.isLoading && 'animate-spin')} />
              Refresh all
            </ActionButton>
            <div className="rounded-2xl bg-zinc-950 px-4 py-3 text-white shadow-lg shadow-zinc-900/10">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">Readiness</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{systemReadiness}%</p>
            </div>
          </div>
        </div>

        {(runtime.error || runtime.actionError) && (
          <div className="mt-4">
            <InlineNotice
              tone="error"
              title={runtime.error ? 'Runtime status unavailable' : 'Runtime action failed'}
              body={runtime.error ?? runtime.actionError ?? ''}
            />
          </div>
        )}
      </div>

      <div className="border-b border-zinc-200 bg-white/70 px-3 py-2">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all',
                activeTab === id
                  ? 'bg-zinc-950 text-white shadow-sm'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white p-4 sm:p-5">
        {activeTab === 'overview' && (
          <OverviewTab
            activeHookCount={activeHookCount}
            bridgedTools={bridgedTools}
            erroredPlugins={erroredPlugins}
            hookCount={hookCount}
            loadedPlugins={loadedPlugins}
            pluginCount={pluginCount}
            skillCount={skills.skills.length}
            trustedPlugins={trustedPlugins}
            mcpConnected={runtime.mcp?.connected ?? false}
          />
        )}
        {activeTab === 'mcp' && (
          <McpTab runtime={runtime} />
        )}
        {activeTab === 'hooks' && (
          <HooksTab hooks={runtime.hooks} activeHookCount={activeHookCount} />
        )}
        {activeTab === 'skills' && (
          <SkillsTab skillsState={skills} />
        )}
        {activeTab === 'plugins' && (
          <PluginsTab runtime={runtime} />
        )}
        {activeTab === 'lsp' && (
          <LspTab
            lspError={lspError}
            lspMode={lspMode}
            lspPath={lspPath}
            lspResult={lspResult}
            onPathChange={setLspPath}
            onRunDiagnostics={() => void runLspDiagnostics()}
            onRunSymbols={() => void runLspSymbols()}
          />
        )}
        {activeTab === 'settings' && (
          <AdvancedSettingsTab runtime={runtime} skillsDir={skills.snapshot?.skillsDir} />
        )}
      </div>
    </section>
  );
}

function OverviewTab({
  activeHookCount,
  bridgedTools,
  erroredPlugins,
  hookCount,
  loadedPlugins,
  mcpConnected,
  pluginCount,
  skillCount,
  trustedPlugins,
}: {
  activeHookCount: number;
  bridgedTools: number;
  erroredPlugins: number;
  hookCount: number;
  loadedPlugins: number;
  mcpConnected: boolean;
  pluginCount: number;
  skillCount: number;
  trustedPlugins: number;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={PlugZap}
          label="MCP bridge"
          value={String(bridgedTools)}
          detail={mcpConnected ? 'Kali endpoint reachable' : 'Container offline or not configured'}
          tone={mcpConnected || bridgedTools > 0 ? 'ok' : 'warn'}
        />
        <MetricCard
          icon={GitBranch}
          label="Hook events"
          value={`${activeHookCount}/${hookCount}`}
          detail="Observation bus, isolated handlers"
          tone={hookCount > 0 ? 'ok' : 'muted'}
        />
        <MetricCard
          icon={Sparkles}
          label="Skills"
          value={String(skillCount)}
          detail="Declarative workflows exposed as tools"
          tone={skillCount > 0 ? 'ok' : 'muted'}
        />
        <MetricCard
          icon={Boxes}
          label="Plugins"
          value={`${loadedPlugins}/${pluginCount}`}
          detail={`${trustedPlugins} trusted · ${erroredPlugins} errors`}
          tone={erroredPlugins > 0 ? 'bad' : pluginCount > 0 ? 'ok' : 'muted'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm font-semibold text-zinc-900">What is now first-class</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              ['Tool discovery', 'GET /api/tools + tool_search tool'],
              ['Tool execution', 'POST /api/tools/:name/invoke with 403 permission denials'],
              ['MCP bridge', 'mcp:* tools in the unified registry'],
              ['LSP-lite', 'diagnostics and symbols available from Settings and tools'],
              ['Skills', 'Reusable workflows loaded from disk'],
              ['Plugins', 'Manifest-only, trusted before registering tools'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
                <p className="text-xs font-semibold text-zinc-800">{title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-zinc-950 p-4 text-white">
          <LockKeyhole className="h-5 w-5 text-amber-300" />
          <p className="mt-3 text-sm font-semibold">Commercial guardrail posture</p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-300">
            Runtime extension actions are explicit, auditable and API-key protected. Plugin code is not executed:
            manifests can only contribute declarative skill tools after trust.
          </p>
        </div>
      </div>
    </div>
  );
}

function McpTab({ runtime }: { runtime: ReturnType<typeof useRuntimeExtensions> }) {
  const bridgedTools = runtime.mcp?.bridgedTools ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">MCP server</p>
            <p className="mt-1 text-xs text-zinc-500">Kali MCP is exposed through the ToolRegistry bridge.</p>
          </div>
          <StatusPill label={runtime.mcp?.connected ? 'connected' : 'offline'} tone={runtime.mcp?.connected ? 'ok' : 'warn'} />
        </div>

        <dl className="mt-4 space-y-2 text-xs">
          <RuntimePair label="Mode" value={runtime.mcp?.mode ?? 'unknown'} />
          <RuntimePair label="Endpoint" value={runtime.mcp?.endpoint || 'not loaded'} />
          <RuntimePair label="Container" value={runtime.mcp?.containerName || 'not configured'} />
          <RuntimePair label="Bridged tools" value={String(bridgedTools.length)} />
        </dl>

        <div className="mt-4">
          <ActionButton onClick={() => void runtime.syncMcp()} disabled={runtime.isSyncingMcp} variant="primary">
            {runtime.isSyncingMcp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync MCP tools
          </ActionButton>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            Sync requires API auth and refreshes the dynamic MCP bridge without restarting the frontend.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <p className="text-sm font-semibold text-zinc-900">Bridged tools</p>
        {bridgedTools.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={PlugZap}
              title="No MCP tools bridged"
              body="Start the Kali MCP container or run a sync once the endpoint is reachable."
            />
          </div>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {bridgedTools.map((tool) => (
              <div key={tool} className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
                <p className="font-mono text-xs font-semibold text-amber-800">{tool}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HooksTab({
  activeHookCount,
  hooks,
}: {
  activeHookCount: number;
  hooks: ReturnType<typeof useRuntimeExtensions>['hooks'];
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-900">Hook bus</p>
            <p className="mt-1 text-xs text-zinc-500">
              Hooks are observation-only today: handlers cannot block or mutate tool execution.
            </p>
          </div>
          <StatusPill label={`${activeHookCount} active listeners`} tone={activeHookCount > 0 ? 'ok' : 'muted'} />
        </div>
      </div>

      {!hooks ? (
        <EmptyState icon={GitBranch} title="Hook metadata unavailable" body="The backend did not return HookBus status." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200">
          <div className="grid grid-cols-[1fr_110px_110px] bg-zinc-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            <span>Event</span>
            <span>Listeners</span>
            <span>Status</span>
          </div>
          {hooks.events.map((event) => (
            <div key={event.name} className="grid grid-cols-[1fr_110px_110px] items-center border-t border-zinc-100 px-3 py-2 text-xs">
              <span className="font-mono font-semibold text-zinc-800">{event.name}</span>
              <span className="tabular-nums text-zinc-500">{event.listenerCount}</span>
              <StatusPill label={event.hasListeners ? 'active' : 'idle'} tone={event.hasListeners ? 'ok' : 'muted'} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkillsTab({ skillsState }: { skillsState: ReturnType<typeof useSkills> }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">Skills loader</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Declarative JSON workflows become `skill:*` tools and can chain local, MCP, LSP or plugin tools.
            </p>
          </div>
          <StatusPill label={`${skillsState.skills.length} loaded`} tone={skillsState.skills.length > 0 ? 'ok' : 'muted'} />
        </div>

        <dl className="mt-4 space-y-2 text-xs">
          <RuntimePair label="Directory" value={skillsState.snapshot?.skillsDir ?? 'not loaded'} />
          <RuntimePair label="Registered" value={String(skillsState.snapshot?.registered ?? 0)} />
          <RuntimePair label="Skipped" value={String(skillsState.snapshot?.skipped ?? 0)} />
        </dl>

        <div className="mt-4">
          <ActionButton onClick={() => void skillsState.reload()} disabled={skillsState.isReloading} variant="primary">
            {skillsState.isReloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Reload skills
          </ActionButton>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <p className="text-sm font-semibold text-zinc-900">Skill browser</p>
        {skillsState.error ? (
          <div className="mt-3">
            <InlineNotice tone="error" title="Skills unavailable" body={skillsState.error} />
          </div>
        ) : skillsState.skills.length === 0 ? (
          <div className="mt-3">
            <EmptyState icon={Sparkles} title="No skills loaded" body="Add JSON skills in the configured directory, then reload." />
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            {skillsState.skills.map((skill) => (
              <div key={skill.id} className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-emerald-800">{skill.toolName}</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-600">{skill.description}</p>
                  </div>
                  <StatusPill label={`${skill.steps.length} steps`} tone="ok" />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {skill.steps.map((step) => (
                    <span key={step.id} className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 ring-1 ring-emerald-100">
                      {step.tool}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PluginsTab({ runtime }: { runtime: ReturnType<typeof useRuntimeExtensions> }) {
  const plugins = runtime.plugins?.plugins ?? [];
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-900">Plugin trust model</p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
              Plugins are local manifests. LEA registers their declarative skills only after trust, and never executes arbitrary plugin code.
            </p>
          </div>
          <ActionButton onClick={() => void runtime.reloadPlugins()} disabled={runtime.isReloadingPlugins} variant="primary">
            {runtime.isReloadingPlugins ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Reload plugins
          </ActionButton>
        </div>
        <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
          <RuntimePair label="Directory" value={runtime.plugins?.pluginsDir ?? 'not loaded'} />
          <RuntimePair label="Trust store" value={runtime.plugins?.trustStorePath ?? 'not loaded'} />
        </dl>
      </div>

      {runtime.plugins?.errors?.map((message, index) => (
        <InlineNotice key={`${message}-${index}`} tone="warning" title="Plugin scan issue" body={message} />
      ))}

      {plugins.length === 0 ? (
        <EmptyState icon={Boxes} title="No plugins discovered" body="Drop a folder with lea-plugin.json into the configured plugin directory." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {plugins.map((plugin) => (
            <PluginCard
              key={`${plugin.id}-${plugin.digest}`}
              plugin={plugin}
              pending={runtime.pendingPluginId === plugin.id}
              onDeny={() => void runtime.denyPlugin(plugin.id)}
              onTrust={() => void runtime.trustPlugin(plugin.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PluginCard({
  onDeny,
  onTrust,
  pending,
  plugin,
}: {
  onDeny: () => void;
  onTrust: () => void;
  pending: boolean;
  plugin: PluginSnapshot;
}) {
  const stateTone: StatusTone =
    plugin.state === 'loaded' ? 'ok' :
      plugin.state === 'error' ? 'bad' :
        plugin.trust === 'denied' ? 'bad' :
          plugin.trust === 'trusted' ? 'warn' :
            'muted';

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900">{plugin.name}</p>
          <p className="mt-0.5 font-mono text-[11px] text-zinc-400">{plugin.id}@{plugin.version}</p>
        </div>
        <StatusPill label={plugin.state} tone={stateTone} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-zinc-600">{plugin.description}</p>
      <dl className="mt-3 space-y-1.5 text-[11px]">
        <RuntimePair label="Digest" value={plugin.digest.slice(0, 14)} />
        <RuntimePair label="Skills" value={plugin.skills.length > 0 ? plugin.skills.join(', ') : 'none'} />
        <RuntimePair label="Tools" value={plugin.registeredTools.length > 0 ? plugin.registeredTools.join(', ') : 'none'} />
      </dl>
      {plugin.errors.length > 0 && (
        <div className="mt-3 space-y-2">
          {plugin.errors.map((message, index) => (
            <InlineNotice key={`${message}-${index}`} tone="warning" title="Plugin validation issue" body={message} />
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton onClick={onTrust} disabled={pending || plugin.state === 'loaded'} variant="primary">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          Trust
        </ActionButton>
        <ActionButton onClick={onDeny} disabled={pending || plugin.trust === 'denied'} variant="danger">
          <XCircle className="h-3.5 w-3.5" />
          Deny
        </ActionButton>
      </div>
    </article>
  );
}

function LspTab({
  lspError,
  lspMode,
  lspPath,
  lspResult,
  onPathChange,
  onRunDiagnostics,
  onRunSymbols,
}: {
  lspError: string | null;
  lspMode: 'diagnostics' | 'symbols' | null;
  lspPath: string;
  lspResult: { diagnostics: LspDiagnostic[]; symbols: LspSymbol[]; files: string[] } | null;
  onPathChange: (value: string) => void;
  onRunDiagnostics: () => void;
  onRunSymbols: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-sm font-semibold text-zinc-900">LSP-lite probes</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          Query TypeScript/JavaScript diagnostics or symbols through the backend LSP service.
        </p>
        <label className="mt-4 block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
          Paths
        </label>
        <input
          value={lspPath}
          onChange={(event) => onPathChange(event.target.value)}
          className="mt-1 h-9 w-full rounded-xl border border-zinc-200 bg-white px-3 font-mono text-xs text-zinc-700 outline-none focus:border-zinc-400"
          placeholder="src, src/core/lsp"
        />
        <p className="mt-1 text-[11px] text-zinc-400">Comma-separated paths scoped to the backend LSP root.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton onClick={onRunDiagnostics} disabled={lspMode !== null} variant="primary">
            {lspMode === 'diagnostics' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SearchCode className="h-3.5 w-3.5" />}
            Run diagnostics
          </ActionButton>
          <ActionButton onClick={onRunSymbols} disabled={lspMode !== null}>
            {lspMode === 'symbols' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCode2 className="h-3.5 w-3.5" />}
            List symbols
          </ActionButton>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <p className="text-sm font-semibold text-zinc-900">LSP result</p>
        {lspError && <div className="mt-3"><InlineNotice tone="error" title="LSP query failed" body={lspError} /></div>}
        {!lspError && !lspResult && (
          <div className="mt-3">
            <EmptyState icon={Code2} title="No LSP query yet" body="Run diagnostics or list symbols to inspect the code intelligence layer." />
          </div>
        )}
        {lspResult && (
          <div className="mt-3 space-y-3">
            <div className="rounded-xl bg-zinc-50 p-3 text-xs text-zinc-500">
              Scanned {lspResult.files.length} file{lspResult.files.length !== 1 ? 's' : ''}
            </div>
            {lspResult.diagnostics.length > 0 && (
              <div className="space-y-2">
                {lspResult.diagnostics.map((diagnostic) => (
                  <div key={`${diagnostic.file}:${diagnostic.line}:${diagnostic.column}:${diagnostic.code}`} className="rounded-xl border border-red-100 bg-red-50 p-3">
                    <p className="font-mono text-[11px] font-semibold text-red-700">
                      {diagnostic.file}:{diagnostic.line}:{diagnostic.column}
                    </p>
                    <p className="mt-1 text-xs text-red-700">{diagnostic.message}</p>
                  </div>
                ))}
              </div>
            )}
            {lspResult.symbols.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {lspResult.symbols.slice(0, 30).map((symbol) => (
                  <div key={`${symbol.file}:${symbol.line}:${symbol.name}`} className="rounded-xl border border-violet-100 bg-violet-50 p-3">
                    <p className="font-mono text-xs font-semibold text-violet-800">{symbol.name}</p>
                    <p className="mt-1 text-[11px] text-violet-600">{symbol.kind} · {symbol.file}:{symbol.line}</p>
                  </div>
                ))}
              </div>
            )}
            {lspResult.diagnostics.length === 0 && lspResult.symbols.length === 0 && (
              <InlineNotice tone="info" title="No entries returned" body="The selected path produced no diagnostics or symbols." />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AdvancedSettingsTab({
  runtime,
  skillsDir,
}: {
  runtime: ReturnType<typeof useRuntimeExtensions>;
  skillsDir?: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-sm font-semibold text-zinc-900">Runtime directories</p>
        <dl className="mt-4 space-y-2 text-xs">
          <RuntimePair label="Skills" value={skillsDir ?? 'not loaded'} />
          <RuntimePair label="Plugins" value={runtime.plugins?.pluginsDir ?? 'not loaded'} />
          <RuntimePair label="Plugin trust" value={runtime.plugins?.trustStorePath ?? 'not loaded'} />
        </dl>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-zinc-950 p-4 text-white">
        <LockKeyhole className="h-5 w-5 text-amber-300" />
        <p className="mt-3 text-sm font-semibold">Protected operations</p>
        <div className="mt-3 space-y-2 text-xs leading-relaxed text-zinc-300">
          <p>Mutating actions require authenticated API access; local development can use `NEXT_PUBLIC_LEA_DEV_API_KEY` with `LEA_API_KEY`.</p>
          <p>Tool invoke is gated by `LEA_ENABLE_TOOL_INVOKE_API`, allowlist and denylist policy.</p>
          <p>MCP shell execution remains excluded from the bridge by default.</p>
        </div>
      </div>
    </div>
  );
}

function RuntimePair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200">
      <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-[11px] text-zinc-700">{value}</dd>
    </div>
  );
}
