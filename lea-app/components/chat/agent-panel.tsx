'use client';

import { Activity, Zap } from 'lucide-react';

export function AgentPanel() {
  return (
    <aside className="w-[280px] h-screen bg-[#FAFAFA] border-l border-gray-100 flex flex-col">
      <div className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-gray-400" />
          <h2 className="font-medium text-gray-900">Activity</h2>
        </div>
        <p className="text-xs text-gray-400">Real-time status</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-sm font-medium text-gray-900">System Ready</span>
          </div>
          <p className="text-xs text-gray-500">
            Waiting for pentest to start. Agents will appear here as they spawn.
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <div className="flex items-center gap-2 text-gray-400">
            <Zap className="w-4 h-4" />
            <span className="text-xs">No active agents</span>
          </div>
        </div>
      </div>

      <div className="p-5 border-t border-gray-100">
        <div className="text-xs text-gray-400 text-center">
          Additional info appears here
        </div>
      </div>
    </aside>
  );
}
