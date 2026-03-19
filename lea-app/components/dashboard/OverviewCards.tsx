'use client';

import { motion } from 'framer-motion';
import { Activity, Shield, Target, AlertTriangle, TrendingUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardStats } from '@/types';

interface OverviewCardsProps {
  stats: DashboardStats;
  isLoading?: boolean;
}

interface CardConfig {
  key: keyof DashboardStats;
  label: string;
  icon: typeof Activity;
  color: 'emerald' | 'orange' | 'blue' | 'rose';
  max?: number;
  showProgress?: boolean;
  sublabel?: string;
  extraKey?: keyof DashboardStats;
  extraLabel?: string;
  extraSuffix?: string;
}

const CARDS: CardConfig[] = [
  {
    key: 'activeScans',
    label: 'Active Scans',
    icon: Activity,
    color: 'emerald',
    sublabel: 'Running',
    extraKey: 'queuedScans',
    extraLabel: 'Queued',
  },
  {
    key: 'riskScore',
    label: 'Risk Score',
    icon: Shield,
    color: 'orange',
    max: 100,
    showProgress: true,
  },
  {
    key: 'totalAssets',
    label: 'Assets',
    icon: Target,
    color: 'blue',
    extraKey: 'coverage',
    extraLabel: 'Coverage',
    extraSuffix: '%',
  },
  {
    key: 'totalFindings',
    label: 'Findings',
    icon: AlertTriangle,
    color: 'rose',
    extraKey: 'newFindingsToday',
    extraLabel: 'New Today',
  },
];

const COLOR_MAP: Record<string, { bg: string; text: string; gradient: string }> = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', gradient: 'from-emerald-400 to-emerald-500' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-600', gradient: 'from-orange-400 to-orange-500' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', gradient: 'from-blue-400 to-blue-500' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600', gradient: 'from-rose-400 to-rose-500' },
};

export function OverviewCards({ stats, isLoading }: OverviewCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-zinc-200 p-5">
            <div className="flex items-center justify-center h-24">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      {CARDS.map((card, index) => {
        const Icon = card.icon;
        const colors = COLOR_MAP[card.color];
        const value = stats[card.key];
        const extraValue = card.extraKey ? stats[card.extraKey] : undefined;

        return (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
            className="bg-white rounded-xl border border-zinc-200 p-5 hover:border-zinc-300 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                {card.label}
              </span>
              <div className={cn('p-2 rounded-lg', colors.bg)}>
                <Icon className={cn('h-4 w-4', colors.text)} />
              </div>
            </div>

            <div className="flex items-end gap-2">
              <motion.span
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="text-[32px] font-semibold text-zinc-900 leading-none"
              >
                {value}
              </motion.span>
              {card.max && (
                <span className="text-sm text-zinc-400 mb-1">
                  /{card.max}
                </span>
              )}
            </div>

            {card.showProgress && (
              <div className="mt-3 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(value / (card.max || 100)) * 100}%` }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className={cn('h-full rounded-full bg-gradient-to-r', colors.gradient)}
                />
              </div>
            )}

            {extraValue !== undefined && (
              <div className="flex items-center gap-1.5 mt-2">
                <TrendingUp className="h-3 w-3 text-zinc-400" />
                <span className="text-xs text-zinc-500">
                  {extraValue}{card.extraSuffix || ''}{' '}
                  <span className="text-zinc-400">{card.extraLabel}</span>
                </span>
              </div>
            )}

 {!card.showProgress && !extraValue && card.sublabel && (
              <div className="flex items-center gap-1.5 mt-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-zinc-500">{card.sublabel}</span>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}