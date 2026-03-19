'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target,
  PauseCircle,
  PlayCircle,
  FileText,
  ShieldAlert,
  Bot,
  HelpCircle,
  Trash2,
} from 'lucide-react';

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  template: string;
  group: 'actions' | 'navigation' | 'info';
}

export interface SlashCommandMenuProps {
  query: string;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // actions group
  { id: 'scan',     label: '/scan',     description: 'Start a targeted scan',        icon: Target,      template: '/scan ',    group: 'actions'    },
  { id: 'pause',    label: '/pause',    description: 'Pause the current swarm',      icon: PauseCircle, template: '/pause',    group: 'actions'    },
  { id: 'resume',   label: '/resume',   description: 'Resume the paused swarm',      icon: PlayCircle,  template: '/resume',   group: 'actions'    },
  { id: 'report',   label: '/report',   description: 'Generate a pentest report',    icon: FileText,    template: '/report',   group: 'actions'    },
  // navigation group
  { id: 'findings', label: '/findings', description: 'Show findings summary',        icon: ShieldAlert, template: '/findings', group: 'navigation' },
  { id: 'agents',   label: '/agents',   description: 'Show active agents status',    icon: Bot,         template: '/agents',   group: 'navigation' },
  // info group
  { id: 'help',     label: '/help',     description: 'List all available commands',  icon: HelpCircle,  template: '/help',     group: 'info'       },
  { id: 'clear',    label: '/clear',    description: 'Clear the chat history',       icon: Trash2,      template: '/clear',    group: 'info'       },
];

function filterCommands(query: string): SlashCommand[] {
  if (!query) return SLASH_COMMANDS;
  const lower = query.toLowerCase();
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(lower) ||
      cmd.description.toLowerCase().includes(lower)
  );
}

export function SlashCommandMenu({
  query,
  selectedIndex,
  onSelect,
  anchorRef: _anchorRef,
}: SlashCommandMenuProps) {
  const filtered = filterCommands(query);

  const groups: Array<'actions' | 'navigation' | 'info'> = ['actions', 'navigation', 'info'];

  // Collect items in order with their flat index tracked
  type RenderedItem =
    | { kind: 'separator'; key: string }
    | { kind: 'item'; command: SlashCommand; flatIndex: number };

  const renderedItems: RenderedItem[] = [];
  let flatIndex = 0;
  let lastGroup: string | null = null;

  for (const group of groups) {
    const groupItems = filtered.filter((cmd) => cmd.group === group);
    if (groupItems.length === 0) continue;

    if (lastGroup !== null) {
      renderedItems.push({ kind: 'separator', key: `sep-${group}` });
    }

    for (const command of groupItems) {
      renderedItems.push({ kind: 'item', command, flatIndex });
      flatIndex++;
    }

    lastGroup = group;
  }

  return (
    <AnimatePresence>
      <motion.div
        key="slash-command-menu"
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="absolute bottom-full left-0 right-0 mb-2 z-50"
      >
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_40px_-4px_rgba(0,0,0,0.18)] overflow-hidden">
          {/* Header */}
          <div className="px-3 pt-2.5 pb-1.5 border-b border-zinc-100">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
              Commands
            </span>
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-[12px] text-zinc-400 text-center">
                No commands match &apos;{query}&apos;
              </div>
            ) : (
              renderedItems.map((item) => {
                if (item.kind === 'separator') {
                  return (
                    <div key={item.key} className="border-t border-zinc-100 mx-3 my-1" />
                  );
                }

                const { command, flatIndex: idx } = item;
                const isSelected = idx === selectedIndex;
                const Icon = command.icon;

                return (
                  <div
                    key={command.id}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                      isSelected ? 'bg-zinc-50' : 'hover:bg-zinc-50'
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelect(command);
                    }}
                  >
                    {/* Icon container */}
                    <div className="h-7 w-7 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-zinc-500" />
                    </div>

                    {/* Text */}
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-semibold text-zinc-800 font-mono">
                        {command.label}
                      </span>
                      <span className="text-[12px] text-zinc-400">
                        {command.description}
                      </span>
                    </div>

                    {/* Keyboard hint */}
                    {isSelected && (
                      <span className="ml-auto text-[10px] text-zinc-300 shrink-0">
                        ↵ select
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
