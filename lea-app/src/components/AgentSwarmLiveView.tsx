'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Pause, Play, GitMerge, FileText, RefreshCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getSwarmStreamUrl, pentestsApi } from '@/lib/api';
import type { SwarmAgent, SwarmFinding, SwarmRun } from '@/types';
import { AgentCard } from '@/components/pentest/AgentCard';
import { SwarmFindingsTable } from '@/components/pentest/SwarmFindingsTable';

interface TimelineEvent {
  id: string;
  type: string;
  message: string;
  timestamp: number;
}

interface AgentSwarmLiveViewProps {
  open: boolean;
  pentestId: string | null;
  target?: string;
  onOpenChange: (open: boolean) => void;
}

type RightTab = 'findings' | 'history' | 'pdf';

function statusTone(status?: SwarmRun['status']) {
  if (status === 'RUNNING') return 'text-cyan-200 border-cyan-400/30 bg-cyan-500/10';
  if (status === 'PAUSED') return 'text-amber-200 border-amber-400/30 bg-amber-500/10';
  if (status === 'COMPLETED') return 'text-emerald-200 border-emerald-400/30 bg-emerald-500/10';
  if (status === 'FAILED') return 'text-red-200 border-red-400/30 bg-red-500/10';
  if (status === 'MERGING') return 'text-violet-200 border-violet-400/30 bg-violet-500/10';
  return 'text-zinc-300 border-white/15 bg-white/[0.06]';
}

export function AgentSwarmLiveView({ open, pentestId, target, onOpenChange }: AgentSwarmLiveViewProps) {
  const [run, setRun] = useState<SwarmRun | null>(null);
  const [history, setHistory] = useState<SwarmRun[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [rightTab, setRightTab] = useState<RightTab>('findings');
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const lastEventIdRef = useRef<number>(0);

  const sortedAgents = useMemo(
    () => [...(run?.agents || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [run?.agents]
  );

  const pushTimeline = useCallback((type: string, message: string) => {
    setTimeline((prev) => {
      const next: TimelineEvent = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type,
        message,
        timestamp: Date.now(),
      };
      return [next, ...prev].slice(0, 250);
    });
  }, []);

  const refreshState = useCallback(async () => {
    if (!pentestId) return;
    try {
      const [stateRes, historyRes] = await Promise.all([
        pentestsApi.getSwarmState(pentestId).catch(() => null),
        pentestsApi.getSwarmHistory(pentestId).catch(() => null),
      ]);
      if (stateRes?.data) setRun(stateRes.data);
      if (historyRes?.data) setHistory(historyRes.data);
    } catch (refreshError) {
      console.warn('[SwarmLiveView] Refresh state failed', refreshError);
    }
  }, [pentestId]);

  useEffect(() => {
    if (!open || !pentestId) return;

    setIsLoading(true);
    setError(null);

    refreshState()
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load swarm state');
      })
      .finally(() => setIsLoading(false));
  }, [open, pentestId, refreshState]);

  useEffect(() => {
    if (!open || !pentestId) return;

    const streamUrl = getSwarmStreamUrl(pentestId, lastEventIdRef.current || undefined);
    const eventSource = new EventSource(streamUrl, { withCredentials: true });
    eventSourceRef.current = eventSource;

    const parseEvent = (eventType: string, rawData: string) => {
      try {
        const parsed = JSON.parse(rawData || '{}');
        if (typeof parsed?.last_event_id === 'number') {
          lastEventIdRef.current = Math.max(lastEventIdRef.current, parsed.last_event_id);
        }

        if (eventType === 'swarm_started') {
          pushTimeline('swarm_started', 'Swarm run started');
          if (parsed?.swarmRunId) {
            setRun((prev) => prev || {
              id: parsed.swarmRunId,
              pentestId,
              target: target || 'target',
              task: parsed.task,
              status: 'RUNNING',
              maxAgents: parsed.maxAgents || 8,
              maxConcurrentAgents: parsed.maxConcurrentAgents || 5,
              forceMerged: false,
              agents: [],
              findings: [],
              startedAt: new Date().toISOString(),
            });
          }
          return;
        }

        if (eventType === 'agent_spawned') {
          const incoming = parsed?.agent as SwarmAgent | undefined;
          if (!incoming) return;
          pushTimeline('agent_spawned', `${incoming.name} (${incoming.role}) spawned`);
          setRun((prev) => {
            if (!prev) return prev;
            const map = new Map(prev.agents.map((agent) => [agent.id, agent]));
            map.set(incoming.id, incoming);
            return { ...prev, agents: Array.from(map.values()) };
          });
          return;
        }

        if (eventType === 'agent_status') {
          const incoming = parsed?.agent as SwarmAgent | undefined;
          if (!incoming) return;
          if (incoming.status === 'THINKING') {
            pushTimeline('agent_status', `${incoming.name} is thinking...`);
          } else if (incoming.status === 'RUNNING_TOOL') {
            pushTimeline('agent_status', `${incoming.name} is running ${incoming.toolName || 'a tool'}`);
          }
          setRun((prev) => {
            if (!prev) return prev;
            const map = new Map(prev.agents.map((agent) => [agent.id, agent]));
            map.set(incoming.id, incoming);
            return { ...prev, agents: Array.from(map.values()) };
          });
          return;
        }

        if (eventType === 'finding_created' || eventType === 'finding_updated') {
          const incoming = parsed?.finding as SwarmFinding | undefined;
          if (!incoming) return;
          pushTimeline(eventType, `${incoming.severity.toUpperCase()} - ${incoming.title}`);
          setRun((prev) => {
            if (!prev) return prev;
            const map = new Map(prev.findings.map((finding) => [finding.id, finding]));
            map.set(incoming.id, incoming);
            return { ...prev, findings: Array.from(map.values()) };
          });
          return;
        }

        if (eventType === 'swarm_paused') {
          pushTimeline('swarm_paused', 'Swarm paused');
          setRun((prev) => (prev ? { ...prev, status: 'PAUSED' } : prev));
          return;
        }

        if (eventType === 'swarm_resumed') {
          pushTimeline('swarm_resumed', 'Swarm resumed');
          setRun((prev) => (prev ? { ...prev, status: 'RUNNING' } : prev));
          return;
        }

        if (eventType === 'swarm_merged') {
          pushTimeline('swarm_merged', 'Merging findings...');
          setRun((prev) => (prev ? { ...prev, status: 'MERGING' } : prev));
          return;
        }

        if (eventType === 'swarm_completed') {
          pushTimeline('swarm_completed', `Swarm completed with ${parsed?.findingsCount || 0} findings`);
          setRun((prev) => prev ? {
            ...prev,
            status: (parsed?.status || 'COMPLETED') as SwarmRun['status'],
            sysReptorProjectId: parsed?.sysReptorProjectId || prev.sysReptorProjectId,
            endedAt: new Date().toISOString(),
          } : prev);

          if (parsed?.sysReptorProjectId) {
            setToast(`Projet SysReptor cree avec ${parsed?.findingsCount || 0} findings`);
          }

          void refreshState();
          return;
        }

        if (eventType === 'swarm_failed') {
          pushTimeline('swarm_failed', parsed?.error ? `Swarm failed: ${parsed.error}` : 'Swarm failed');
          setRun((prev) => prev ? { ...prev, status: 'FAILED', endedAt: new Date().toISOString() } : prev);
        }
      } catch (parseError) {
        console.warn('[SwarmLiveView] Event parse error', parseError);
      }
    };

    const eventTypes = [
      'swarm_connected',
      'swarm_started',
      'agent_spawned',
      'agent_status',
      'finding_created',
      'finding_updated',
      'swarm_paused',
      'swarm_resumed',
      'swarm_merged',
      'swarm_completed',
      'swarm_failed',
    ];

    eventTypes.forEach((type) => {
      eventSource.addEventListener(type, (event: MessageEvent) => parseEvent(type, event.data));
    });

    eventSource.onerror = () => {
      pushTimeline('error', 'SSE connection lost. Retrying...');
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [open, pentestId, pushTimeline, refreshState, target]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const updateFinding = (finding: SwarmFinding) => {
    const nextTitle = window.prompt('Edit finding title before push', finding.title);
    if (!nextTitle || nextTitle.trim() === finding.title) return;

    setRun((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        findings: prev.findings.map((item) =>
          item.id === finding.id ? { ...item, title: nextTitle.trim(), updatedAt: new Date().toISOString() } : item
        ),
      };
    });
    pushTimeline('finding_updated', `Edited finding: ${nextTitle.trim()}`);
  };

  const runAction = async (action: 'pause' | 'resume' | 'force-merge') => {
    if (!pentestId) return;

    setActionLoading(action);
    setError(null);
    try {
      if (action === 'pause') {
        const response = await pentestsApi.pauseSwarm(pentestId);
        setRun(response.data);
      } else if (action === 'resume') {
        const response = await pentestsApi.resumeSwarm(pentestId);
        setRun(response.data);
      } else {
        const response = await pentestsApi.forceMergeSwarm(pentestId);
        setRun(response.data);
      }
      await refreshState();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Unable to ${action} swarm`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        data-testid="agent-swarm-live-view"
        className="w-[96vw] max-w-[96vw] h-[92vh] p-0 border-white/10 bg-[#0b0f16] text-white overflow-hidden"
      >
        <DialogTitle className="sr-only">Agent Swarm Live View</DialogTitle>
        <DialogDescription className="sr-only">
          Real-time swarm orchestration with agent status, event timeline and findings panel.
        </DialogDescription>
        <div className="h-full flex flex-col">
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Agent Swarm Live View</p>
              <p className="text-xs text-zinc-400 truncate">
                {target || run?.target || 'Target'}
                {run?.id ? ` - run ${run.id.slice(0, 8)}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs', statusTone(run?.status))}>
                {run?.status || 'IDLE'}
              </span>
              <button
                onClick={() => void refreshState()}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs hover:bg-white/[0.08]"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                Refresh
              </button>
              {run?.status === 'RUNNING' && (
                <button
                  onClick={() => void runAction('pause')}
                  disabled={actionLoading !== null}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pause Swarm
                </button>
              )}
              {run?.status === 'PAUSED' && (
                <button
                  onClick={() => void runAction('resume')}
                  disabled={actionLoading !== null}
                  className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  Resume Swarm
                </button>
              )}
              {(run?.status === 'RUNNING' || run?.status === 'PAUSED') && (
                <button
                  onClick={() => void runAction('force-merge')}
                  disabled={actionLoading !== null}
                  className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
                >
                  <GitMerge className="w-3.5 h-3.5" />
                  Force Merge
                </button>
              )}
            </div>
          </div>

          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-5 mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100"
            >
              {toast}
            </motion.div>
          )}

          {error && (
            <div className="mx-5 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="flex-1 grid grid-cols-12 gap-0 min-h-0 mt-3">
            <section className="col-span-3 border-r border-white/10 px-4 pb-4 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wider text-zinc-400">Agents</p>
                <span className="text-[11px] text-zinc-500">{sortedAgents.length}</span>
              </div>
              <div className="space-y-2">
                {sortedAgents.length === 0 && (
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-zinc-500">
                    {isLoading ? 'Loading swarm agents...' : 'No agent activity yet'}
                  </div>
                )}
                {sortedAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </section>

            <section className="col-span-5 border-r border-white/10 px-4 pb-4 overflow-y-auto">
              <p className="text-xs uppercase tracking-wider text-zinc-400 mb-2">Live Timeline</p>
              <div className="space-y-2">
                {timeline.length === 0 && (
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-zinc-500">
                    Waiting for swarm events...
                  </div>
                )}
                {timeline.map((event) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-cyan-300/90">
                        {event.type.replaceAll('_', ' ')}
                      </span>
                      <span className="text-[10px] text-zinc-500">{new Date(event.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-xs text-zinc-200 mt-1">{event.message}</p>
                  </motion.div>
                ))}
              </div>
            </section>

            <section className="col-span-4 px-4 pb-4 overflow-y-auto">
              <div className="flex items-center gap-2 mb-3">
                {([
                  { id: 'findings', label: 'Findings live' },
                  { id: 'history', label: 'Swarm History' },
                  { id: 'pdf', label: 'PDF Preview' },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setRightTab(tab.id)}
                    className={cn(
                      'px-2.5 py-1.5 text-xs rounded-full border transition-colors',
                      rightTab === tab.id
                        ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100'
                        : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {rightTab === 'findings' && (
                <SwarmFindingsTable findings={run?.findings || []} onEditFinding={updateFinding} />
              )}

              {rightTab === 'history' && (
                <div className="space-y-2">
                  {history.length === 0 && (
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-zinc-500">
                      No run history yet.
                    </div>
                  )}
                  {history.map((entry) => (
                    <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-white">{entry.id.slice(0, 8)} - {entry.status}</p>
                        <p className="text-[10px] text-zinc-500">{new Date(entry.startedAt).toLocaleString()}</p>
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-400">
                        Agents: {entry.agents.length} - Findings: {entry.findings.length}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {rightTab === 'pdf' && (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                  <div className="flex items-center gap-2 text-zinc-200">
                    <FileText className="w-4 h-4 text-cyan-300" />
                    <p className="text-sm font-medium">SysReptor PDF Preview</p>
                  </div>
                  <p className="text-xs text-zinc-400">
                    {run?.sysReptorProjectId
                      ? `Project linked: ${run.sysReptorProjectId}`
                      : 'No SysReptor project linked yet. Preview becomes available after merge/push.'}
                  </p>
                  <div className="rounded-lg border border-white/10 bg-[#0f131c] p-3 min-h-40 text-xs text-zinc-300">
                    <p className="font-medium mb-2">Executive snapshot</p>
                    <ul className="space-y-1 text-zinc-400">
                      <li>- Target: {target || run?.target || '-'}</li>
                      <li>- Findings: {(run?.findings || []).length}</li>
                      <li>- Agents: {(run?.agents || []).length}</li>
                      <li>- Status: {run?.status || '-'}</li>
                    </ul>
                  </div>
                  <button
                    disabled={!run?.sysReptorProjectId}
                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    Preview ready (download wiring pending)
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
