'use client';

import { useState, useCallback } from 'react';
import { Copy, RefreshCw, Pencil, Trash2, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MessageActionType = 'user' | 'assistant' | 'agent';

interface MessageActionsProps {
  messageId: string;
  messageContent: string;
  messageType: MessageActionType;
  isStreaming?: boolean;
  onCopy?: (messageId: string, content: string) => void;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete?: (messageId: string) => void;
}

export function MessageActions({
  messageId,
  messageContent,
  messageType,
  isStreaming = false,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(messageContent);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleCopy = useCallback(async () => {
    if (isStreaming || !onCopy) return;
    
    await onCopy(messageId, messageContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [isStreaming, onCopy, messageId, messageContent]);

  const handleRegenerate = useCallback(() => {
    if (isStreaming || !onRegenerate) return;
    onRegenerate(messageId);
  }, [isStreaming, onRegenerate, messageId]);

  const handleEditStart = useCallback(() => {
    if (isStreaming || !onEdit) return;
    setEditContent(messageContent);
    setIsEditing(true);
  }, [isStreaming, onEdit, messageContent]);

  const handleEditSave = useCallback(() => {
    if (onEdit) {
      onEdit(messageId, editContent);
    }
    setIsEditing(false);
  }, [onEdit, messageId, editContent]);

  const handleEditCancel = useCallback(() => {
    setEditContent(messageContent);
    setIsEditing(false);
  }, [messageContent]);

  const handleDelete = useCallback(() => {
    if (isStreaming || !onDelete) return;
    setShowDeleteConfirm(true);
  }, [isStreaming, onDelete]);

  const handleDeleteConfirm = useCallback(() => {
    if (onDelete) {
      onDelete(messageId);
    }
    setShowDeleteConfirm(false);
  }, [onDelete, messageId]);

  // Don't render if streaming
  if (isStreaming) {
    return null;
  }

  // Determine which actions to show based on message type
  const showCopy = true; // All messages can be copied
  const showRegenerate = messageType === 'assistant' && onRegenerate;
  const showEdit = messageType === 'user' && onEdit;
  const showDelete = onDelete && messageType !== 'agent';

  if (isEditing) {
    return (
      <div className="absolute -top-2 right-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-80">
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="w-full h-24 p-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#F5A623]/20"
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={handleEditCancel}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-3 h-3" />
            Cancel
          </button>
          <button
            onClick={handleEditSave}
            className="flex items-center gap-1 px-2 py-1 text-xs text-white bg-[#F5A623] hover:bg-[#E09500] rounded-md transition-colors"
          >
            <Check className="w-3 h-3" />
            Save
          </button>
        </div>
      </div>
    );
  }

  if (showDeleteConfirm) {
    return (
      <div className="absolute -top-2 right-0 z-10 bg-white border border-red-200 rounded-xl shadow-lg p-3">
        <p className="text-xs text-gray-700 mb-2">Delete this message?</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDeleteConfirm}
            className="px-2 py-1 text-xs text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'absolute -top-3 right-0 opacity-0 group-hover:opacity-100 transition-opacity',
        'flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg shadow-sm px-1.5 py-1'
      )}
    >
      {showCopy && (
        <button
          onClick={handleCopy}
          className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-700 transition-colors"
          title={copied ? 'Copied!' : 'Copy'}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      )}

      {showRegenerate && (
        <button
          onClick={handleRegenerate}
          className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-700 transition-colors"
          title="Regenerate"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}

      {showEdit && (
        <button
          onClick={handleEditStart}
          className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-700 transition-colors"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}

      {showDelete && (
        <button
          onClick={handleDelete}
          className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hover:text-red-600 transition-colors"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}