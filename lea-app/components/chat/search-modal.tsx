'use client';

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Bot, User, Terminal, ArrowRight, Brain } from 'lucide-react';
import type { ChatMessage } from '@/components/pentest/chat-messages';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  type: 'message' | 'finding' | 'agent';
  title: string;
  preview: string;
  highlight: string;
  meta: string;
  ts: number;
  icon: React.ComponentType<{ className?: string }>;
}

export interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onResultClick?: (result: SearchResult) => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const MAX_RESULTS = 12;
const PREVIEW_RADIUS = 60; // chars on each side of match

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function buildPreview(content: string, query: string): { preview: string; highlight: string } {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIdx = lowerContent.indexOf(lowerQuery);

  if (matchIdx === -1) {
    return {
      preview: content.slice(0, 120),
      highlight: query,
    };
  }

  const start = Math.max(0, matchIdx - PREVIEW_RADIUS);
  const end = Math.min(content.length, matchIdx + query.length + PREVIEW_RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < content.length ? '…' : '';
  const preview = prefix + content.slice(start, end) + suffix;
  const highlight = content.slice(matchIdx, matchIdx + query.length);

  return { preview, highlight };
}

function messageToResult(msg: ChatMessage, query: string): SearchResult | null {
  if (msg.type === 'agent_spawn') return null;

  const lowerQuery = query.toLowerCase();

  let content: string;
  let title: string;
  let meta: string;
  let icon: React.ComponentType<{ className?: string }>;

  switch (msg.type) {
    case 'orchestrator': {
      content = msg.content;
      title = 'Nia';
      meta = `Orchestrator · ${formatRelativeTime(msg.ts)}`;
      icon = Bot;
      break;
    }
    case 'user': {
      content = msg.content;
      title = 'You';
      meta = `User · ${formatRelativeTime(msg.ts)}`;
      icon = User;
      break;
    }
    case 'agent_message': {
      content = msg.content;
      title = msg.agentName;
      meta = `${msg.agentRole} · ${formatRelativeTime(msg.ts)}`;
      icon = Terminal;
      break;
    }
    case 'agent_to_agent': {
      content = msg.content;
      title = `${msg.fromName} → ${msg.toName}`;
      meta = `${msg.fromRole} · ${formatRelativeTime(msg.ts)}`;
      icon = ArrowRight;
      break;
    }
    case 'thinking': {
      content = msg.content;
      title = 'Thinking';
      meta = `Internal · ${formatRelativeTime(msg.ts)}`;
      icon = Brain;
      break;
    }
    default:
      return null;
  }

  if (!content.toLowerCase().includes(lowerQuery)) return null;

  const { preview, highlight } = buildPreview(content, query);

  return {
    id: msg.id,
    type: 'message',
    title,
    preview,
    highlight,
    meta,
    ts: msg.ts,
    icon,
  };
}

// ─── PreviewText — renders preview with the highlight portion marked ───────────

interface PreviewTextProps {
  preview: string;
  highlight: string;
}

function PreviewText({ preview, highlight }: PreviewTextProps) {
  if (!highlight) {
    return <span>{preview}</span>;
  }

  const lowerPreview = preview.toLowerCase();
  const lowerHighlight = highlight.toLowerCase();
  const idx = lowerPreview.indexOf(lowerHighlight);

  if (idx === -1) {
    return <span>{preview}</span>;
  }

  const before = preview.slice(0, idx);
  const match = preview.slice(idx, idx + highlight.length);
  const after = preview.slice(idx + highlight.length);

  return (
    <>
      {before}
      <mark className="bg-amber-100 text-amber-800 rounded-sm px-0.5 not-italic">
        {match}
      </mark>
      {after}
    </>
  );
}

// ─── ResultRow ─────────────────────────────────────────────────────────────────

interface ResultRowProps {
  result: SearchResult;
  selected: boolean;
  onClick: () => void;
  rowRef?: React.Ref<HTMLDivElement>;
}

function ResultRow({ result, selected, onClick, rowRef }: ResultRowProps) {
  const Icon = result.icon;

  return (
    <div
      ref={rowRef}
      onClick={onClick}
      className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
        selected ? 'bg-zinc-50' : 'hover:bg-zinc-50'
      }`}
    >
      <div className="h-7 w-7 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-zinc-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-zinc-800 truncate">{result.title}</div>
        <div className="text-[11px] text-zinc-400 mt-0.5">{result.meta}</div>
        <div className="text-[12px] text-zinc-500 mt-0.5 line-clamp-1">
          <PreviewText preview={result.preview} highlight={result.highlight} />
        </div>
      </div>
    </div>
  );
}

// ─── SearchModal ───────────────────────────────────────────────────────────────

export function SearchModal({ open, onClose, messages, onResultClick }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRowRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      // Small rAF to ensure the element is rendered before focusing
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const results = useMemo<SearchResult[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const matched: SearchResult[] = [];
    for (const msg of messages) {
      if (matched.length >= MAX_RESULTS) break;
      const result = messageToResult(msg, trimmed);
      if (result) matched.push(result);
    }
    return matched;
  }, [query, messages]);

  // Group results by type
  const groups = useMemo(() => {
    const byType = new Map<'message' | 'finding' | 'agent', SearchResult[]>();
    for (const r of results) {
      const arr = byType.get(r.type) ?? [];
      arr.push(r);
      byType.set(r.type, arr);
    }
    const labelMap: Record<string, string> = {
      message: 'Messages',
      finding: 'Findings',
      agent: 'Agents',
    };
    return Array.from(byType.entries()).map(([type, items]) => ({
      label: labelMap[type] ?? type,
      items,
    }));
  }, [results]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onResultClick?.(result);
      onClose();
    },
    [onResultClick, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (results.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const result = results[selectedIndex];
        if (result) handleSelect(result);
      }
    },
    [results, selectedIndex, handleSelect, onClose],
  );

  // Reset selectedIndex when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Build flat list index for each row so we can compute which ref belongs to selectedIndex
  let flatIndex = 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="search-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <div className="fixed left-1/2 top-[20%] -translate-x-1/2 z-[201] w-full max-w-[560px] px-4">
            <motion.div
              key="search-panel"
              initial={{ opacity: 0, scale: 0.97, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl bg-white border border-zinc-200 shadow-[0_24px_80px_-8px_rgba(0,0,0,0.24)] overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Search"
            >
              {/* Search input row */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100">
                <Search className="h-4 w-4 text-zinc-400 shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search messages, findings…"
                  className="flex-1 bg-transparent text-[15px] text-zinc-800 outline-none placeholder:text-zinc-400"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                />
                <kbd className="text-[10px] font-mono bg-zinc-100 text-zinc-400 px-1.5 py-0.5 rounded">
                  Esc
                </kbd>
              </div>

              {/* Body */}
              {query.trim() === '' ? (
                /* Empty query state */
                <div className="px-4 py-8 text-center text-[13px] text-zinc-400">
                  Type to search across messages and findings
                </div>
              ) : results.length === 0 ? (
                /* No results state */
                <div className="px-4 py-8 text-center text-[13px] text-zinc-400">
                  <Search className="h-8 w-8 text-zinc-200 mx-auto mb-2" />
                  No results for &ldquo;{query.trim()}&rdquo;
                </div>
              ) : (
                /* Results list */
                <div ref={listRef} className="max-h-[360px] overflow-y-auto py-2">
                  {groups.map((group) => (
                    <div key={group.label}>
                      <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
                        {group.label}
                      </div>
                      {group.items.map((result) => {
                        const currentIndex = flatIndex;
                        flatIndex += 1;
                        const isSelected = currentIndex === selectedIndex;

                        return (
                          <ResultRow
                            key={result.id}
                            result={result}
                            selected={isSelected}
                            onClick={() => handleSelect(result)}
                            rowRef={isSelected ? selectedRowRef : undefined}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="border-t border-zinc-100 px-4 py-2 flex items-center gap-4 text-[11px] text-zinc-400">
                <span>↑↓ navigate</span>
                <span>↵ select</span>
                <span>esc close</span>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
