'use client';

import { Shield, Globe, Zap, Network } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  onSuggestionClick?: (suggestion: string) => void;
}

const suggestions = [
  {
    icon: Globe,
    title: 'Web App Scan',
    description: 'Scan a web application for vulnerabilities',
    prompt: 'Scan the web application at ',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Zap,
    title: 'API Security',
    description: 'Test REST/GraphQL endpoints',
    prompt: 'Test the API security of ',
    color: 'from-amber-500 to-orange-500',
  },
  {
    icon: Network,
    title: 'Network Recon',
    description: 'Map network infrastructure',
    prompt: 'Perform network reconnaissance on ',
    color: 'from-emerald-500 to-teal-500',
  },
];

export function ChatEmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F5A623] to-[#E09500] flex items-center justify-center mb-6">
        <Shield className="w-8 h-8 text-white" />
      </div>
      
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Start a Security Assessment
      </h2>
      
      <p className="text-sm text-gray-500 max-w-md mb-8">
        Choose a quick-start template or describe your target below.
      </p>
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.title}
            onClick={() => onSuggestionClick?.(suggestion.prompt)}
            className={cn(
              'flex flex-col items-center p-4 rounded-xl border border-gray-200',
              'hover:border-[#F5A623] hover:bg-[#F5A623]/5 transition-all text-left group',
              'focus:outline-none focus:ring-2 focus:ring-[#F5A623]/20'
            )}
          >
            <div className={cn(
              'w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center mb-3',
              suggestion.color
            )}>
              <suggestion.icon className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-medium text-gray-900 text-sm mb-1">
              {suggestion.title}
            </h3>
            <p className="text-xs text-gray-500 text-center">
              {suggestion.description}
            </p>
          </button>
        ))}
      </div>
      
      <p className="text-xs text-gray-400 mt-8">
        ⏎ to send · Shift+⏎ new line
      </p>
    </div>
  );
}