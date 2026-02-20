'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'pentest', label: 'Pentest', href: '/pentest' },
  { id: 'providers', label: 'Providers', href: '/providers' },
  { id: 'reports', label: 'Reports', href: '/reports' },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="h-14 border-b border-white/[0.09] bg-[#131316]/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="flex items-center justify-between h-full px-6">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">L</span>
          </div>
          <span className="text-sm font-semibold tracking-wide">LEA</span>
        </div>

        {/* Navigation tabs */}
        <nav className="flex items-center gap-1 bg-white/[0.05] rounded-full p-1">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn(
                  'px-5 py-1.5 text-sm rounded-full transition-all duration-200',
                  isActive
                    ? 'bg-white/[0.16] text-white font-medium'
                    : 'text-[#85858f] hover:text-white hover:bg-white/[0.07]'
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* Settings */}
        <button className="p-2 rounded-full hover:bg-white/[0.07] text-[#85858f] hover:text-white transition-colors">
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
