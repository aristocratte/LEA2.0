'use client';

import { ErrorBoundary } from '@/components/error-boundary';
import { NetworkStatus } from '@/components/network-status';
import { Toaster } from '@/components/ui/toaster';
import { useTheme } from '@/hooks/use-theme';

export function Shell({ children }: { children: React.ReactNode }) {
  useTheme(); // initializes dark/light class on <html>

  return (
    <ErrorBoundary>
      <NetworkStatus />
      <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
        {children}
      </div>
      <Toaster />
    </ErrorBoundary>
  );
}
