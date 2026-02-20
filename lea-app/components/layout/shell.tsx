'use client';

import { Header } from './header';

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#131316]">
      <Header />
      <main className="flex-1">{children}</main>
    </div>
  );
}
