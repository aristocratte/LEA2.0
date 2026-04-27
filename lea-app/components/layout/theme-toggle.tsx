'use client';

import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';

export function ThemeToggle({ className }: { className?: string }): React.ReactElement {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={[
        'rounded-full border border-white/10 bg-white/[0.04] p-2.5 text-white/60',
        'hover:bg-white/[0.08] hover:text-white transition-colors',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      suppressHydrationWarning
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
