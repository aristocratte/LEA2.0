'use client';

import { Sparkles, Bot, AlertCircle, BrainCircuit } from 'lucide-react';
import type { MainThreadItem } from '@/hooks/use-swarm-store';

interface MessageItemProps {
  item: MainThreadItem;
}

export function MessageItem({ item }: MessageItemProps) {
  switch (item.type) {
    case 'assistant_message':
      return <AssistantMessage item={item} />;
    case 'thinking_summary':
      return <ThinkingMessage item={item} />;
    case 'agent_spawn':
      return <AgentSpawnMessage item={item} />;
    case 'approval_request':
      return <ApprovalMessage item={item} />;
    default:
      return <SystemMessage item={item} />;
  }
}

function AssistantMessage({ item }: { item: MainThreadItem }) {
  return (
    <div className="flex gap-3 group">
      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-1">
        <Sparkles className="w-4 h-4 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-900">LEA</span>
          <span className="text-xs text-gray-400">
            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="text-[15px] leading-relaxed text-gray-800 whitespace-pre-wrap">
          {item.content}
        </div>
      </div>
    </div>
  );
}

function ThinkingMessage({ item }: { item: MainThreadItem }) {
  return (
    <div className="flex gap-3 group">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-1">
        <BrainCircuit className="w-4 h-4 text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Thinking
            </span>
            {item.isStreaming && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            )}
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            {item.content}
          </p>
        </div>
      </div>
    </div>
  );
}

function AgentSpawnMessage({ item }: { item: MainThreadItem }) {
  const agents = item.metadata?.agentList || [];
  
  return (
    <div className="flex gap-3 group">
      <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-1">
        <Bot className="w-4 h-4 text-indigo-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="rounded-xl bg-white border border-gray-200 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Bot className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {item.metadata?.name || 'Agent'}
              </p>
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                {item.metadata?.role || item.agentRole || 'Specialist'}
              </p>
            </div>
          </div>
          
          {item.content && (
            <p className="text-sm text-gray-600 mb-3">
              {item.content}
            </p>
          )}
          
          {agents.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {agents.map((agent: { id: string; name: string; role: string; status: string }) => (
                <span
                  key={agent.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-xs"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-gray-900">{agent.name}</span>
                  <span className="text-gray-400">{agent.role}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ApprovalMessage({ item }: { item: MainThreadItem }) {
  return (
    <div className="flex gap-3 group">
      <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0 mt-1">
        <AlertCircle className="w-4 h-4 text-orange-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="rounded-xl bg-orange-50 border border-orange-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-xs font-medium uppercase tracking-wider">
              Approval Required
            </span>
            <span className="text-xs text-gray-500">
              Risk: {item.metadata?.riskClass || 'unknown'}
            </span>
          </div>
          <p className="text-[15px] text-gray-900 mb-4">
            {item.content}
          </p>
          <div className="flex gap-3">
            <button className="px-4 py-2 rounded-lg bg-[#F5A623] text-white text-sm font-medium hover:opacity-90 transition-opacity">
              Approve
            </button>
            <button className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors">
              Deny
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SystemMessage({ item }: { item: MainThreadItem }) {
  return (
    <div className="flex gap-3 group">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-1">
        <Bot className="w-4 h-4 text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="rounded-xl bg-white border border-gray-200 p-4">
          <p className="text-sm text-gray-700">
            {item.content}
          </p>
        </div>
      </div>
    </div>
  );
}
