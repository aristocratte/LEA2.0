import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMessageActionHandlers } from '../use-message-action-handlers';
import { usePentestStore } from '@/store/pentest-store';
import { toast } from '@/hooks/use-toast';

vi.mock('@/store/pentest-store');
vi.mock('@/hooks/use-toast');

Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(),
  },
});

describe('useMessageActionHandlers', () => {
  const mockUpdateMessage = vi.fn();
  const mockRemoveMessage = vi.fn();
  const mockSetMessages = vi.fn();
  const mockToastSuccess = vi.fn();
  const mockToastError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (usePentestStore as unknown as Mock).mockReturnValue({
      updateMessage: mockUpdateMessage,
      removeMessage: mockRemoveMessage,
      messages: [],
    });

    (usePentestStore.getState as Mock) = vi.fn(() => ({
      setMessages: mockSetMessages,
    }));

    (toast.success as Mock) = mockToastSuccess;
    (toast.error as Mock) = mockToastError;
  });

  describe('handleCopy', () => {
    it('should copy content to clipboard successfully', async () => {
      const { result } = renderHook(() => useMessageActionHandlers());
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      navigator.clipboard.writeText = writeTextMock;

      await act(async () => {
        await result.current.handleCopy('msg-1', 'Test content');
      });

      expect(writeTextMock).toHaveBeenCalledWith('Test content');
      expect(mockToastSuccess).toHaveBeenCalledWith('Copied to clipboard');
    });

    it('should show error when clipboard fails', async () => {
      const { result } = renderHook(() => useMessageActionHandlers());
      navigator.clipboard.writeText = vi.fn().mockRejectedValue(new Error('Failed'));

      await act(async () => {
        await result.current.handleCopy('msg-1', 'Test content');
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to copy');
    });
  });

  describe('handleEdit', () => {
    it('should update message content', () => {
      const { result } = renderHook(() => useMessageActionHandlers());

      act(() => {
        result.current.handleEdit('msg-1', 'Updated content');
      });

      expect(mockUpdateMessage).toHaveBeenCalledWith('msg-1', { content: 'Updated content' });
      expect(mockToastSuccess).toHaveBeenCalledWith('Message updated');
    });
  });

  describe('handleDelete', () => {
    it('should remove message from store', () => {
      const { result } = renderHook(() => useMessageActionHandlers());

      act(() => {
        result.current.handleDelete('msg-1');
      });

      expect(mockRemoveMessage).toHaveBeenCalledWith('msg-1');
      expect(mockToastSuccess).toHaveBeenCalledWith('Message deleted');
    });
  });

  describe('handleRegenerate', () => {
    it('should show error when message not found', () => {
      (usePentestStore as unknown as Mock).mockReturnValue({
        updateMessage: mockUpdateMessage,
        removeMessage: mockRemoveMessage,
        messages: [],
      });

      const { result } = renderHook(() => useMessageActionHandlers());

      act(() => {
        result.current.handleRegenerate('msg-1');
      });

      expect(mockToastError).not.toHaveBeenCalled();
    });

    it('should show error for non-regeneratable message types', () => {
      (usePentestStore as unknown as Mock).mockReturnValue({
        updateMessage: mockUpdateMessage,
        removeMessage: mockRemoveMessage,
        messages: [
          { id: 'msg-1', type: 'finding', content: 'Test' },
        ],
      });

      const { result } = renderHook(() => useMessageActionHandlers());

      act(() => {
        result.current.handleRegenerate('msg-1');
      });

      expect(mockToastError).toHaveBeenCalledWith('Cannot regenerate this message type');
    });
  });
});
