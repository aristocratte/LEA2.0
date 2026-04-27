'use client';

import React, { createContext, useContext, useCallback, useState, ReactNode } from 'react';
import { usePentestStore } from '@/store/pentest-store';
import { toast } from '@/hooks/use-toast';
import type { StreamMessage } from '@/types';

export interface MessageActionState {
  editingMessageId: string | null;
  editContent: string;
  deletingMessageId: string | null;
  copiedMessageId: string | null;
}

interface MessageActionContextType extends MessageActionState {
  startEdit: (messageId: string, content: string) => void;
  cancelEdit: () => void;
  saveEdit: (messageId: string, newContent: string) => void;
  updateEditContent: (content: string) => void;
  requestDelete: (messageId: string) => void;
  confirmDelete: () => void;
  cancelDelete: () => void;
  markCopied: (messageId: string) => void;
  isEditing: (messageId: string) => boolean;
  isDeleting: (messageId: string) => boolean;
  isCopied: (messageId: string) => boolean;
  handleRegenerate: (messageId: string, messages: StreamMessage[]) => void;
}

const MessageActionContext = createContext<MessageActionContextType | undefined>(undefined);

export function MessageActionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MessageActionState>({
    editingMessageId: null,
    editContent: '',
    deletingMessageId: null,
    copiedMessageId: null,
  });
  const { updateMessage, removeMessage, setMessages } = usePentestStore();

  const startEdit = useCallback((messageId: string, content: string) => {
    setState(prev => ({
      ...prev,
      editingMessageId: messageId,
      editContent: content,
    }));
  }, []);

  const cancelEdit = useCallback(() => {
    setState(prev => ({
      ...prev,
      editingMessageId: null,
      editContent: '',
    }));
  }, []);

  const saveEdit = useCallback((messageId: string, newContent: string) => {
    updateMessage(messageId, { content: newContent });
    toast.success('Message updated');
    setState(prev => ({
      ...prev,
      editingMessageId: null,
      editContent: '',
    }));
  }, [updateMessage]);

  const updateEditContent = useCallback((content: string) => {
    setState(prev => ({
      ...prev,
      editContent: content,
    }));
  }, []);

  const requestDelete = useCallback((messageId: string) => {
    setState(prev => ({
      ...prev,
      deletingMessageId: messageId,
    }));
  }, []);

  const confirmDelete = useCallback(() => {
    if (state.deletingMessageId) {
      removeMessage(state.deletingMessageId);
      toast.success('Message deleted');
    }
    setState(prev => ({
      ...prev,
      deletingMessageId: null,
    }));
  }, [state.deletingMessageId, removeMessage]);

  const cancelDelete = useCallback(() => {
    setState(prev => ({
      ...prev,
      deletingMessageId: null,
    }));
  }, []);

  const markCopied = useCallback((messageId: string) => {
    setState(prev => ({
      ...prev,
      copiedMessageId: messageId,
    }));
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        copiedMessageId: prev.copiedMessageId === messageId ? null : prev.copiedMessageId,
      }));
    }, 2000);
  }, []);

  const handleRegenerate = useCallback((messageId: string, messages: StreamMessage[]) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    const targetMessage = messages[messageIndex];
    
    const targetType = String(targetMessage.type);
    if (targetType !== 'text' && targetType !== 'thinking' && targetType !== 'orchestrator') {
      toast.error('Cannot regenerate this message type');
      return;
    }

    let lastUserMessageIndex = -1;
    for (let i = messageIndex - 1; i >= 0; i--) {
      const messageType = String(messages[i].type);
      if (messageType === 'text' || messageType === 'user') {
        lastUserMessageIndex = i;
        break;
      }
    }

    if (lastUserMessageIndex === -1) {
      toast.error('No user message found to regenerate from');
      return;
    }

    const messagesToKeep = messages.slice(0, lastUserMessageIndex + 1);
    setMessages(messagesToKeep);
    toast.success('Regenerating response...');
  }, [setMessages]);

  const isEditing = useCallback((messageId: string) => {
    return state.editingMessageId === messageId;
  }, [state.editingMessageId]);

  const isDeleting = useCallback((messageId: string) => {
    return state.deletingMessageId === messageId;
  }, [state.deletingMessageId]);

  const isCopied = useCallback((messageId: string) => {
    return state.copiedMessageId === messageId;
  }, [state.copiedMessageId]);

  const value: MessageActionContextType = {
    ...state,
    startEdit,
    cancelEdit,
    saveEdit,
    updateEditContent,
    requestDelete,
    confirmDelete,
    cancelDelete,
    markCopied,
    isEditing,
    isDeleting,
    isCopied,
    handleRegenerate,
  };

  return (
    <MessageActionContext.Provider value={value}>
      {children}
    </MessageActionContext.Provider>
  );
}

export function useMessageActions() {
  const context = useContext(MessageActionContext);
  if (context === undefined) {
    throw new Error('useMessageActions must be used within a MessageActionProvider');
  }
  return context;
}
