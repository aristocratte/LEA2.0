'use client';

import { useCallback } from 'react';
import { usePentestStore } from '@/store/pentest-store';
import { toast } from '@/hooks/use-toast';

export interface MessageActionHandlers {
  handleCopy: (messageId: string, content: string) => Promise<void>;
  handleEdit: (messageId: string, newContent: string) => void;
  handleDelete: (messageId: string) => void;
  handleRegenerate: (messageId: string) => void;
}

export function useMessageActionHandlers(): MessageActionHandlers {
  const { updateMessage, removeMessage, messages } = usePentestStore();

  const handleCopy = useCallback(async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy');
    }
  }, []);

  const handleEdit = useCallback((messageId: string, newContent: string) => {
    updateMessage(messageId, { content: newContent });
    toast.success('Message updated');
  }, [updateMessage]);

  const handleDelete = useCallback((messageId: string) => {
    removeMessage(messageId);
    toast.success('Message deleted');
  }, [removeMessage]);

  const handleRegenerate = useCallback((messageId: string) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    const targetMessage = messages[messageIndex];
    
    if (targetMessage.type !== 'text' && targetMessage.type !== 'thinking') {
      toast.error('Cannot regenerate this message type');
      return;
    }

    let lastUserMessageIndex = -1;
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].type === 'text' && !messages[i].content.startsWith('AI:')) {
        lastUserMessageIndex = i;
        break;
      }
    }

    if (lastUserMessageIndex === -1) {
      toast.error('No user message found to regenerate from');
      return;
    }

    const messagesToKeep = messages.slice(0, lastUserMessageIndex + 1);
    
    const { setMessages } = usePentestStore.getState();
    setMessages(messagesToKeep);

    toast.success('Regenerating response...');

  }, [messages]);

  return {
    handleCopy,
    handleEdit,
    handleDelete,
    handleRegenerate,
  };
}