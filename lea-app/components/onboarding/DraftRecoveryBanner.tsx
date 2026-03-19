'use client';

import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DraftRecoveryBannerProps {
  target: string;
  savedAt: number; // ms timestamp
  onRecover: () => void;
  onDiscard: () => void;
}

function formatRelativeTime(savedAt: number): string {
  const diffMs = Date.now() - savedAt;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

export function DraftRecoveryBanner({
  target,
  savedAt,
  onRecover,
  onDiscard,
}: DraftRecoveryBannerProps) {
  const relativeTime = formatRelativeTime(savedAt);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3"
    >
      {/* Icon */}
      <RotateCcw className="h-4 w-4 text-amber-500 shrink-0" />

      {/* Text */}
      <p className="text-[13px] text-amber-800 flex-1 min-w-0">
        <span className="font-medium">Resume where you left off</span>
        {' — '}
        <span className="font-mono text-[12px]">{target}</span>
        <span className="text-amber-600"> · saved {relativeTime}</span>
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onRecover}
          className={cn(
            'px-3 py-1.5 text-[12px] font-medium rounded-lg',
            'bg-amber-500 text-white',
            'hover:bg-amber-600 active:bg-amber-700',
            'transition-colors duration-150',
          )}
        >
          Resume
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className={cn(
            'px-3 py-1.5 text-[12px] font-medium rounded-lg',
            'text-zinc-500',
            'hover:bg-zinc-100 hover:text-zinc-700',
            'transition-colors duration-150',
          )}
        >
          Start fresh
        </button>
      </div>
    </motion.div>
  );
}
