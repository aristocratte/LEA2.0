'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Globe,
  Zap,
  Network,
  HelpCircle,
  ShieldAlert,
  AlertTriangle,
  Bot,
  PauseCircle,
  PlayCircle,
  FileText,
  BookOpen,
  Wrench,
} from 'lucide-react';

export interface QuickAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  prompt: string;
  variant?: 'default' | 'warning' | 'danger';
}

export interface QuickActionsBarProps {
  visible: boolean;
  liveMode: boolean;
  runStatus?: string;
  hasFindings: boolean;
  onAction: (prompt: string) => void;
}

const DEMO_ACTIONS: QuickAction[] = [
  { id: 'webapp',  label: 'Web App Scan',     icon: Globe,       prompt: 'Scan the web application at ' },
  { id: 'api',     label: 'API Security',     icon: Zap,         prompt: 'Test the API security of ' },
  { id: 'network', label: 'Network Recon',    icon: Network,     prompt: 'Perform network reconnaissance on ' },
  { id: 'explain', label: 'Explain findings', icon: HelpCircle,  prompt: 'Explain the current findings in detail' },
];

const RUNNING_ACTIONS: QuickAction[] = [
  { id: 'findings', label: 'Summarize findings', icon: ShieldAlert,    prompt: 'Summarize all findings discovered so far' },
  { id: 'focus',    label: 'Focus on critical',  icon: AlertTriangle,  prompt: 'Focus agents on the critical vulnerability' },
  { id: 'status',   label: 'Agent status',        icon: Bot,            prompt: 'What are the agents currently doing?' },
  { id: 'pause',    label: 'Pause scan',          icon: PauseCircle,   prompt: '/pause', variant: 'warning' },
];

const PAUSED_ACTIONS: QuickAction[] = [
  { id: 'resume',   label: 'Resume scan',     icon: PlayCircle,   prompt: '/resume' },
  { id: 'findings', label: 'Review findings', icon: ShieldAlert,  prompt: 'Review and prioritize all findings' },
  { id: 'report',   label: 'Generate report', icon: FileText,     prompt: '/report' },
];

const COMPLETED_ACTIONS: QuickAction[] = [
  { id: 'report',    label: 'Generate report',   icon: FileText,  prompt: '/report' },
  { id: 'summary',   label: 'Executive summary', icon: BookOpen,  prompt: 'Write an executive summary of this pentest' },
  { id: 'remediate', label: 'Remediation plan',  icon: Wrench,    prompt: 'Create a prioritized remediation plan' },
];

function getActions(liveMode: boolean, runStatus?: string): QuickAction[] {
  if (!liveMode) return DEMO_ACTIONS;
  if (runStatus === 'RUNNING') return RUNNING_ACTIONS;
  if (runStatus === 'PAUSED') return PAUSED_ACTIONS;
  if (runStatus === 'COMPLETED') return COMPLETED_ACTIONS;
  return DEMO_ACTIONS;
}

const variantClasses: Record<NonNullable<QuickAction['variant']>, string> = {
  default: 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 hover:text-zinc-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
  danger:  'border-red-200 bg-red-50 text-red-600 hover:bg-red-100',
};

function ActionChip({
  action,
  index,
  onAction,
}: {
  action: QuickAction;
  index: number;
  onAction: (prompt: string) => void;
}) {
  const Icon = action.icon;
  const variant = action.variant ?? 'default';

  return (
    <motion.button
      key={action.id}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15, delay: index * 0.04 }}
      type="button"
      onClick={() => onAction(action.prompt)}
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5',
        'text-[12px] font-medium transition-all duration-150 cursor-pointer select-none',
        variantClasses[variant],
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {action.label}
    </motion.button>
  );
}

export function QuickActionsBar({
  visible,
  liveMode,
  runStatus,
  hasFindings,
  onAction,
}: QuickActionsBarProps) {
  const actions = getActions(liveMode, runStatus);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.15 }}
          className="overflow-hidden"
        >
          <div className="flex flex-wrap gap-2 px-1 py-2">
            {actions.map((action, index) => (
              <ActionChip
                key={action.id}
                action={action}
                index={index}
                onAction={onAction}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
