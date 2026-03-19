'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface ChatLayoutProps {
  children: ReactNode;
  sidebar?: ReactNode;
  header?: ReactNode;
}

export function ChatLayout({ children, sidebar, header }: ChatLayoutProps) {
  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      {header && (
        <header className="flex h-14 shrink-0 items-center border-b border-divider bg-surface px-4">
          {header}
        </header>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Area */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {children}
        </main>

        {/* Sidebar (Conversation List) */}
        {sidebar && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="hidden shrink-0 border-l border-divider bg-surface lg:block"
          >
            <div className="h-full w-[280px] overflow-hidden">
              {sidebar}
            </div>
          </motion.aside>
        )}
      </div>
    </div>
  );
}

export function ChatContainer({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      {children}
    </div>
  );
}

export function ChatHeader({ 
  title, 
  subtitle,
  actions 
}: { 
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-divider bg-surface/80 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h1 className="text-sm font-semibold text-text-primary">{title}</h1>
          {subtitle && (
            <p className="text-xs text-text-secondary">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
