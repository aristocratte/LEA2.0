'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useToastStore, type ToastItem, type ToastType } from '@/hooks/use-toast';

// ─── Dot colour map ──────────────────────────────────────────────────────────

const DOT_CLASS: Record<ToastType, string> = {
  success: 'bg-emerald-400',
  error:   'bg-red-400',
  warning: 'bg-amber-400',
  info:    'bg-zinc-500',
};

const PROGRESS_CLASS: Record<ToastType, string> = {
  success: 'bg-emerald-400',
  error:   'bg-red-400',
  warning: 'bg-amber-400',
  info:    'bg-zinc-500',
};

// ─── Single toast card ────────────────────────────────────────────────────────

interface ToastCardProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
}

function ToastCard({ item, onDismiss }: ToastCardProps) {
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;

    // Animate the progress bar from 100% → 0% over duration
    el.style.transition = `width ${item.duration}ms linear`;
    // Kick off on next frame so the transition fires
    const raf = requestAnimationFrame(() => {
      el.style.width = '0%';
    });
    return () => cancelAnimationFrame(raf);
  }, [item.duration]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20, scale: 0.97 }}
      animate={{ opacity: 1, x: 0,  scale: 1    }}
      exit={{    opacity: 0, x: 20, scale: 0.97 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="relative flex items-start gap-3 min-w-[280px] max-w-[400px] rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.24)] overflow-hidden"
      role="alert"
      aria-live="polite"
    >
      {/* Left-edge dot indicator */}
      <span
        className={`mt-[2px] shrink-0 h-2 w-2 rounded-full ${DOT_CLASS[item.type]}`}
        aria-hidden="true"
      />

      {/* Message */}
      <p className="flex-1 text-[13px] leading-snug text-white break-words">
        {item.message}
      </p>

      {/* Dismiss button */}
      <button
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
        className="shrink-0 mt-[1px] text-zinc-400 hover:text-white transition-colors duration-150"
      >
        <X size={14} strokeWidth={2.5} />
      </button>

      {/* Progress bar */}
      <div
        className="absolute bottom-0 left-0 h-[2px] w-full bg-zinc-800"
        aria-hidden="true"
      >
        <div
          ref={progressRef}
          className={`h-full w-full ${PROGRESS_CLASS[item.type]} opacity-70`}
        />
      </div>
    </motion.div>
  );
}

// ─── Toaster container ────────────────────────────────────────────────────────

export function Toaster() {
  const { toasts, dismiss } = useToastStore();

  // Show at most 4 toasts visually (newest first, already ordered by _add)
  const visible = toasts.slice(0, 4);

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col-reverse gap-2 items-end"
      aria-label="Notifications"
    >
      <AnimatePresence mode="sync" initial={false}>
        {visible.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}
