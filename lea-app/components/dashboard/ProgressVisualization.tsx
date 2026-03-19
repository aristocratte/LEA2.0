'use client';

import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProgressVisualizationProps {
  activeScans: number;
  className?: string;
}

const PHASES = [
  { id: 'discovery', label: 'Discovery', progress: 20 },
  { id: 'recon', label: 'Recon', progress: 40 },
  { id: 'scanning', label: 'Scanning', progress: 30 },
  { id: 'analysis', label: 'Analysis', progress: 50 },
];

const PHASE_COLORS: Record<string, string> = {
  discovery: 'bg-blue-500',
  recon: 'bg-violet-500',
  scanning: 'bg-orange-500',
  analysis: 'bg-emerald-500',
};

export function ProgressVisualization({ activeScans, className }: ProgressVisualizationProps) {
  if (activeScans === 0) {
    return (
      <div className={cn('bg-white rounded-xl border border-zinc-200 p-4', className)}>
        <h3 className="text-sm font-semibold text-zinc-900 mb-4">Active Scans</h3>
        <div className="text-center py-6 text-zinc-400 text-sm">
          No active scans
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-white rounded-xl border border-zinc-200 p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-900">Active Scans</h3>
        <span className="text-xs text-zinc-400">{activeScans} running</span>
      </div>

      <div className="space-y-4">
        {PHASES.map((phase, index) => (
          <motion.div
            key={phase.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-zinc-700">{phase.label}</span>
              <span className="text-xs text-zinc-400">{phase.progress}%</span>
            </div>
            <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${phase.progress}%` }}
                transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                className={cn('h-full rounded-full', PHASE_COLORS[phase.id])}
              />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-100">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>ETA: ~15 minutes remaining</span>
        </div>
      </div>
    </div>
  );
}