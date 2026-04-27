'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  HelpCircle,
  Activity,
  ListTodo,
  Users,
  UsersRound,
  Shield,
  Eye,
  DollarSign,
  Search,
  Pause,
  Play,
  FileText,
  Trash2,
  Bug,
  Terminal,
  Target,
  PauseCircle,
  PlayCircle,
  ShieldAlert,
  Bot,
} from 'lucide-react';
import { commandsApi, type CommandMeta } from '../lib/commands-api';

// ============================================
// TYPES
// ============================================

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  template: string;
  group: 'actions' | 'navigation' | 'info';
}

export interface UseCommandsScope {
  pentestId?: string;
}

// ============================================
// FALLBACK COMMANDS
// ============================================

export const FALLBACK_COMMANDS: SlashCommand[] = [
  // actions group
  { id: 'scan', label: '/scan', description: 'Start a targeted scan', icon: Target, template: '/scan ', group: 'actions' },
  { id: 'pause', label: '/pause', description: 'Pause the current swarm', icon: PauseCircle, template: '/pause', group: 'actions' },
  { id: 'resume', label: '/resume', description: 'Resume the paused swarm', icon: PlayCircle, template: '/resume', group: 'actions' },
  { id: 'report', label: '/report', description: 'Generate a pentest report', icon: FileText, template: '/report', group: 'actions' },
  // navigation group
  { id: 'findings', label: '/findings', description: 'Show findings summary', icon: ShieldAlert, template: '/findings', group: 'navigation' },
  { id: 'agents', label: '/agents', description: 'Show active agents status', icon: Bot, template: '/agents', group: 'navigation' },
  // info group
  { id: 'help', label: '/help', description: 'List all available commands', icon: HelpCircle, template: '/help', group: 'info' },
  { id: 'clear', label: '/clear', description: 'Clear the chat history', icon: Trash2, template: '/clear', group: 'info' },
];

// ============================================
// ICON MAPPING
// ============================================

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  help: HelpCircle,
  status: Activity,
  tasks: ListTodo,
  agents: Users,
  teams: UsersRound,
  permissions: Shield,
  plan: Eye,
  cost: DollarSign,
  scan: Search,
  pause: Pause,
  resume: Play,
  report: FileText,
  clear: Trash2,
  findings: Bug,
};

// ============================================
// HELPERS
// ============================================

function metaToSlashCommand(meta: CommandMeta): SlashCommand {
  return {
    id: meta.name,
    label: `/${meta.name}`,
    description: meta.description,
    icon: iconMap[meta.name] ?? Terminal,
    template: meta.argHints ? `/${meta.name} ` : `/${meta.name}`,
    group: (meta.group as SlashCommand['group']) ?? 'info',
  };
}

// ============================================
// HOOK
// ============================================

export function useCommands(scope?: UseCommandsScope) {
  const [commands, setCommands] = useState<SlashCommand[]>(FALLBACK_COMMANDS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    commandsApi.listCommands()
      .then((metas) => {
        if (metas.length > 0) {
          setCommands(metas.map(metaToSlashCommand));
        }
      })
      .catch(() => {
        // Keep fallback commands when backend is unreachable
      })
      .finally(() => setLoading(false));
  }, []);

  const dispatchCommand = useCallback(async (name: string, args?: string): Promise<string> => {
    const result = await commandsApi.execute(name, args, scope);
    return result.content;
  }, [scope]);

  return { commands, loading, dispatchCommand };
}
