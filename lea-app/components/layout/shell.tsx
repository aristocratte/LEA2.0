'use client';

import { usePathname } from 'next/navigation';
import { Header } from './header';
import { ErrorBoundary } from '@/components/error-boundary';
import { NetworkStatus } from '@/components/network-status';
import { Toaster } from '@/components/ui/toaster';
import { useTheme } from '@/hooks/use-theme';

export function Shell({ children }: { children: React.ReactNode }) {
  useTheme(); // initializes dark/light class on <html>
  const pathname = usePathname();
  const hasOwnLayout = pathname.startsWith('/pentest') || pathname.startsWith('/settings');

  if (hasOwnLayout) {
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

  return (
    <ErrorBoundary>
      <NetworkStatus />
      <div className="relative min-h-screen overflow-hidden text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.16),transparent_24%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.10),transparent_24%),radial-gradient(circle_at_bottom,rgba(15,23,42,0.55),transparent_40%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
        <Header />
        <main className="relative z-10 flex-1">{children}</main>
      </div>
      <Toaster />
    </ErrorBoundary>
  );
}
