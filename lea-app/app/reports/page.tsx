'use client';

import { FileText } from 'lucide-react';

export default function ReportsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] text-center">
      <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
        <FileText className="w-7 h-7 text-[#48484f]" />
      </div>
      <h2 className="text-lg font-medium text-[#a0a0a8] mb-2">No Reports Yet</h2>
      <p className="text-sm text-[#48484f] max-w-sm">
        Reports will appear here after completing a penetration test. Start a new pentest to generate your first report.
      </p>
    </div>
  );
}
