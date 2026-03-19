'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, Shield, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/layout/theme-toggle';

const tabs = [
  { id: 'pentest', label: 'Pentest', href: '/pentest' },
  { id: 'providers', label: 'Providers', href: '/providers' },
  { id: 'reports', label: 'Reports', href: '/reports' },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 px-3 py-3 md:px-5 md:py-4">
      <div className="lea-panel-strong mx-auto flex h-16 max-w-[1800px] items-center justify-between rounded-[28px] px-4 md:px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <Shield className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/40">LEA Platform</p>
            <span className="text-sm font-semibold tracking-[0.06em] text-white">Pentest Workspace</span>
          </div>
        </div>

        <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 md:flex">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn(
                  'rounded-full px-5 py-2 text-sm transition-all duration-200',
                  isActive
                    ? 'bg-white text-black shadow-[0_10px_30px_-18px_rgba(255,255,255,0.8)]'
                    : 'text-white/52 hover:bg-white/[0.08] hover:text-white'
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/70 lg:flex">
            <Sparkles className="h-3.5 w-3.5 text-sky-200" />
            Minimal control surface
          </div>
          <ThemeToggle />
          <button className="rounded-full border border-white/10 bg-white/[0.04] p-2.5 text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
