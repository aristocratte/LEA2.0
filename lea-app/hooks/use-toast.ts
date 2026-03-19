'use client';

/**
 * Global toast singleton using a module-level event-bus pattern.
 * Works outside React components (Zustand stores, event handlers, etc.).
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
}

export interface ToastOptions {
  duration?: number;
}

export interface ToastHistoryItem extends ToastItem {
  createdAt: number; // timestamp ms when created
  dismissed: boolean; // true once auto-dismissed or manually dismissed
}

// ─── Event bus ───────────────────────────────────────────────────────────────

type Listener = (toasts: ToastItem[]) => void;

let _toasts: ToastItem[] = [];
const _listeners = new Set<Listener>();

let _history: ToastHistoryItem[] = [];
type HistoryListener = (history: ToastHistoryItem[]) => void;
const _historyListeners = new Set<HistoryListener>();

function _notifyHistory(): void {
  _historyListeners.forEach((fn) => fn([..._history]));
}

function _notify(): void {
  _listeners.forEach((fn) => fn([..._toasts]));
}

function _subscribe(fn: Listener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function _getSnapshot(): ToastItem[] {
  return _toasts;
}

// ─── Core add / remove ───────────────────────────────────────────────────────

function _add(type: ToastType, message: string, options?: ToastOptions): string {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const duration =
    options?.duration ?? (type === 'error' ? 6000 : 4000);

  const item: ToastItem = { id, type, message, duration };
  _toasts = [item, ..._toasts].slice(0, 8); // keep at most 8 in memory
  _notify();

  const historyItem: ToastHistoryItem = { ...item, createdAt: Date.now(), dismissed: false };
  _history = [historyItem, ..._history].slice(0, 50);
  _notifyHistory();

  setTimeout(() => _remove(id), duration);

  return id;
}

function _remove(id: string): void {
  _toasts = _toasts.filter((t) => t.id !== id);
  _notify();

  _history = _history.map((h) => h.id === id ? { ...h, dismissed: true } : h);
  _notifyHistory();
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const toast = {
  success(message: string, options?: ToastOptions): string {
    return _add('success', message, options);
  },
  error(message: string, options?: ToastOptions): string {
    return _add('error', message, options);
  },
  warning(message: string, options?: ToastOptions): string {
    return _add('warning', message, options);
  },
  info(message: string, options?: ToastOptions): string {
    return _add('info', message, options);
  },
  dismiss(id: string): void {
    _remove(id);
  },
};

// ─── React hook (for <Toaster />) ────────────────────────────────────────────

import { useEffect, useState } from 'react';

export function useToastHistory(): ToastHistoryItem[] {
  const [history, setHistory] = useState<ToastHistoryItem[]>(() => [..._history]);
  useEffect(() => {
    setHistory([..._history]);
    _historyListeners.add(setHistory);
    return () => { _historyListeners.delete(setHistory); };
  }, []);
  return history;
}

export function useToastStore(): { toasts: ToastItem[]; dismiss: (id: string) => void } {
  const [toasts, setToasts] = useState<ToastItem[]>(_getSnapshot);

  useEffect(() => {
    // Sync with any toasts that arrived before mount
    setToasts(_getSnapshot());
    const unsub = _subscribe(setToasts);
    return unsub;
  }, []);

  return { toasts, dismiss: _remove };
}
