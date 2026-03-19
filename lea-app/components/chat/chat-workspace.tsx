'use client';

import { useState } from 'react';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { ConversationSidebar } from './conversation-sidebar';
import type { MainThreadItem } from '@/hooks/use-swarm-store';

interface ChatWorkspaceProps {
  messages: MainThreadItem[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
}

const mockConversations = [
  {
    id: '1',
    title: 'Pentest 1',
    target: 'example.com',
    status: 'active' as const,
    findingsCount: 5,
    updatedAt: new Date(),
  },
  {
    id: '2',
    title: 'Pentest 2',
    target: 'test.com',
    status: 'completed' as const,
    findingsCount: 12,
    updatedAt: new Date(Date.now() - 86400000),
  },
];

export function ChatWorkspace({ messages, onSendMessage, isLoading }: ChatWorkspaceProps) {
  const [inputValue, setInputValue] = useState('');
  const [activeConversationId, setActiveConversationId] = useState<string>();

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue);
    setInputValue('');
  };

  return (
    <div className="flex h-full bg-[#0a0a0a]">
      <div className="flex-1 flex flex-col min-w-0">
        <MessageList messages={messages} />
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          placeholder="Message Nia to start or manage your pentest..."
          loading={isLoading}
        />
      </div>

      <aside className="hidden lg:block w-[280px] border-l border-white/10 bg-[#1c1c1e]">
        <ConversationSidebar
          conversations={mockConversations}
          activeId={activeConversationId}
          onSelect={setActiveConversationId}
          onNewChat={() => console.log('New chat')}
        />
      </aside>
    </div>
  );
}
