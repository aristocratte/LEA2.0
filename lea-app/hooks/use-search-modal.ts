'use client';

import { useCallback, useState } from 'react';
import { useKeyboardShortcut } from './use-keyboard-shortcut';

interface UseSearchModalReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export function useSearchModal(): UseSearchModalReturn {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  useKeyboardShortcut({ key: 'k', meta: true, preventDefault: true }, toggle);

  return { isOpen, open, close, toggle };
}
