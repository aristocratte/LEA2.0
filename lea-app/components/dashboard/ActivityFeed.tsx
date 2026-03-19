'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Clock, AlertCircle, CheckCircle, Loader2, Target, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import type { ActivityEvent } from '@/types';

interface ActivityFeedProps {
  events: ActivityEvent[];
  isLoading?: boolean;
  className?: string;
}

const EVENT_ICONS: Record<ActivityEvent['type'], typeof Clock> = {
  scan_started: Zap,
  scan_progress: Loader2,
  finding: AlertCircle,
  scan_completed: CheckCircle,
  agent_action: Target,
  error: AlertCircle,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-500 bg-red-50',
  high: 'text-orange-500 bg-orange-50',
  medium: 'text-amber-500 bg-amber-50',
  low: 'text-blue-500 bg-blue-50',
  info: 'text-zinc-500 bg-zinc-50',
};

export function ActivityFeed({ events, isLoading, className }: ActivityFeedProps) {
  if (isLoading) {
    return (
      <div className={cn('bg-white rounded-xl border border-zinc-200 p-4', className)}>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-4 w-4 animate-pulse bg-zinc-200 rounded" />
          <div className="h-4 w-24 animate-pulse bg-zinc-200 rounded" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="h-8 w-8 animate-pulse bg-zinc-200 rounded-full" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-3/4 animate-pulse bg-zinc-200 rounded" />
                <div className="h-3 w-1/2 animate-pulse bg-zinc-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-white rounded-xl border border-zinc-200 p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-900">Activity Feed</h3>
        <span className="text-xs text-zinc-400">{events.length} events</span>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-hide">
        <AnimatePresence initial={false}>
          {events.length === 0 ? (
            <div className="text-center py-8 text-zinc-400 text-sm">
              No recent activity
            </div>
          ) : (
            events.slice(0, 20).map((event, index) => {
              const Icon = EVENT_ICONS[event.type];
              const severityClass = event.severity ? SEVERITY_COLORS[event.severity] : SEVERITY_COLORS.info;

              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2, delay: index * 0.02 }}
                  className="flex items-start gap-3"
                >
                  <div className={cn(
                    'flex items-center justify-center h-8 w-8 rounded-full shrink-0',
                    severityClass,
                    event.type === 'scan_progress' && 'animate-spin'
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-800 leading-snug">
                      {event.title}
                    </p>
                    {event.description && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {event.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-zinc-400">
                        {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                      </span>
                      {event.progress !== undefined && (
                        <span className="text-[11px] text-emerald-500 font-medium">
                          {event.progress}%
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}