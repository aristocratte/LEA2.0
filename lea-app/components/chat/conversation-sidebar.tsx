'use client';

import { Plus, MessageSquare, Clock, ChevronRight } from 'lucide-react';

interface Conversation {
  id: string;
  title: string;
  target: string;
  status: 'active' | 'paused' | 'completed' | 'config';
  findingsCount: number;
  updatedAt: Date;
}

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
}: ConversationSidebarProps) {
  const today = conversations.filter(c => isToday(c.updatedAt));
  const yesterday = conversations.filter(c => isYesterday(c.updatedAt));
  const older = conversations.filter(c => !isToday(c.updatedAt) && !isYesterday(c.updatedAt));

  return (
    <div className="flex flex-col h-full bg-[#1c1c1e]">
      <div className="p-4 border-b border-white/10">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          New Pentest
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {today.length > 0 && (
          <div>
            <h3 className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Today
            </h3>
            <div className="space-y-1">
              {today.map(conv => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeId}
                  onClick={() => onSelect(conv.id)}
                />
              ))}
            </div>
          </div>
        )}

        {yesterday.length > 0 && (
          <div>
            <h3 className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Yesterday
            </h3>
            <div className="space-y-1">
              {yesterday.map(conv => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeId}
                  onClick={() => onSelect(conv.id)}
                />
              ))}
            </div>
          </div>
        )}

        {older.length > 0 && (
          <div>
            <h3 className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Previous
            </h3>
            <div className="space-y-1">
              {older.map(conv => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeId}
                  onClick={() => onSelect(conv.id)}
                />
              ))}
            </div>
          </div>
        )}

        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageSquare className="w-8 h-8 text-gray-600 mb-2" />
            <p className="text-sm text-gray-400">
              No conversations yet
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}

function ConversationItem({ conversation, isActive, onClick }: ConversationItemProps) {
  const statusColors = {
    active: 'bg-green-500',
    paused: 'bg-orange-500',
    completed: 'bg-gray-500',
    config: 'bg-blue-500',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
        isActive 
          ? "bg-white/10" 
          : "hover:bg-white/5"
      }`}
    >
      <div className="flex-shrink-0 mt-1">
        <div className={`w-2 h-2 rounded-full ${statusColors[conversation.status]}`} />
      </div>
      
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${
          isActive ? "text-white" : "text-gray-400"
        }`}>
          {conversation.target}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-500">
            {conversation.findingsCount} findings
          </span>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTime(conversation.updatedAt)}
          </span>
        </div>
      </div>

      {isActive && (
        <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
      )}
    </button>
  );
}

function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function isYesterday(date: Date): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return date.toDateString() === yesterday.toDateString();
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
