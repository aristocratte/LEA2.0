'use client';

import { usePathname } from 'next/navigation';
import { LeftSidebar } from './left-sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPentestPage = pathname?.startsWith('/pentest');

  return (
    <div className="flex h-screen bg-[#F5F5F5]">
      <LeftSidebar />
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}