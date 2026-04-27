'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BellOff } from 'lucide-react';
import { useToastHistory } from '@/hooks/use-toast';
import type { ToastHistoryItem } from '@/hooks/use-toast';

export interface NotificationCenterProps {
  className?: string;
}

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const DOT_COLORS: Record<ToastHistoryItem['type'], string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-zinc-400',
};

export function NotificationCenter({ className }: NotificationCenterProps) {
  const history = useToastHistory();
  const [open, setOpen] = useState(false);
  const [lastOpenedAt, setLastOpenedAt] = useState<number>(() => Date.now());

  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const unreadCount = history.filter((item) => item.createdAt > lastOpenedAt).length;
  const unreadLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  function handleOpen() {
    if (!open) {
      setLastOpenedAt(Date.now());
    }
    setOpen((prev) => !prev);
  }

  function handleMarkAllRead() {
    setLastOpenedAt(Date.now());
  }

  // Recalculate unread count relative to lastOpenedAt
  const currentUnread = history.filter((item) => item.createdAt > lastOpenedAt).length;
  const badgeCount = currentUnread > 9 ? '9+' : currentUnread > 0 ? String(currentUnread) : null;

  return (
    <div ref={containerRef} className={`relative${className ? ` ${className}` : ''}`}>
      {/* Bell button */}
      <button
        type="button"
        onClick={handleOpen}
        className="relative rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {badgeCount !== null && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center pointer-events-none">
            {badgeCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-full mt-2 w-[320px] z-50 rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_40px_-4px_rgba(0,0,0,0.16)] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
              <span className="text-[13px] font-semibold text-zinc-800">Notifications</span>
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                Mark all as read
              </button>
            </div>

            {/* List */}
            <div className="max-h-[360px] overflow-y-auto">
              {history.length === 0 ? (
                <div className="px-4 py-8 text-center text-[13px] text-zinc-400">
                  <BellOff className="h-6 w-6 text-zinc-200 mx-auto mb-2" />
                  No notifications yet
                </div>
              ) : (
                history.slice(0, 50).map((item) => {
                  const isUnread = item.createdAt > lastOpenedAt;
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 px-4 py-3 border-b border-zinc-50 last:border-0"
                    >
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${DOT_COLORS[item.type]}`}
                      />
                      <span
                        className={`text-[13px] text-zinc-700 leading-snug flex-1${isUnread ? ' font-medium' : ''}`}
                      >
                        {item.message}
                      </span>
                      <span className="text-[11px] text-zinc-400 shrink-0">
                        {relTime(item.createdAt)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {history.length > 0 && (
              <div className="px-4 py-2 border-t border-zinc-100 text-[11px] text-zinc-400 text-center">
                Showing last 50 notifications
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
