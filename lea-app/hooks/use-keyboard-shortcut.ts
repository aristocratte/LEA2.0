'use client';

import { useCallback, useEffect, useRef } from 'react';

interface ShortcutOptions {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  preventDefault?: boolean;
  enabled?: boolean;
}

export function useKeyboardShortcut(
  options: ShortcutOptions,
  callback: () => void,
): void {
  const {
    key,
    meta = false,
    ctrl = false,
    shift = false,
    alt = false,
    preventDefault = false,
    enabled = true,
  } = options;

  // Store the latest callback in a ref so the effect doesn't re-register on every render
  const callbackRef = useRef<() => void>(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key.toLowerCase()) return;
      if (meta && !(event.metaKey || event.ctrlKey)) return;
      if (ctrl && !event.ctrlKey) return;
      if (shift && !event.shiftKey) return;
      if (alt && !event.altKey) return;

      if (preventDefault) event.preventDefault();
      callbackRef.current();
    },
    [key, meta, ctrl, shift, alt, preventDefault],
  );

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);
}
