'use client';

import { Shield, Plus, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { useState } from 'react';

export function ChatHeader() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-white/10 bg-[#1c1c1e]">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500 text-white">
          <Shield className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-white">LEA Platform</h1>
          <p className="text-xs text-gray-400">AI Pentest Assistant</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Chat</span>
        </button>
        
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="lg:hidden p-2 rounded-lg hover:bg-white/10 text-gray-400"
        >
          {isSidebarOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
        </button>
      </div>
    </header>
  );
}
