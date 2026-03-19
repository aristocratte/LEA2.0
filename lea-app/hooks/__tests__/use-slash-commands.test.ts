import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSlashCommands } from '../use-slash-commands';
import { SLASH_COMMANDS } from '@/components/chat/slash-command-menu';

describe('useSlashCommands', () => {
  const mockOnSelectCommand = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('menu visibility', () => {
    it('should be open when input starts with /', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', onSelectCommand: mockOnSelectCommand })
      );

      expect(result.current.isOpen).toBe(true);
    });

    it('should be closed when input does not start with /', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: 'hello', onSelectCommand: mockOnSelectCommand })
      );

      expect(result.current.isOpen).toBe(false);
    });

    it('should extract query from input', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/scan example.com', onSelectCommand: mockOnSelectCommand })
      );

      expect(result.current.query).toBe('scan example.com');
    });

    it('should close when dismissed', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/help', onSelectCommand: mockOnSelectCommand })
      );

      act(() => {
        result.current.handleClose();
      });

      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('command filtering', () => {
    it('should show all commands when query is empty', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', onSelectCommand: mockOnSelectCommand })
      );

      expect(result.current.filteredCommands).toEqual(SLASH_COMMANDS);
    });

    it('should filter commands by label', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/scan', onSelectCommand: mockOnSelectCommand })
      );

      expect(result.current.filteredCommands.length).toBeGreaterThan(0);
      expect(result.current.filteredCommands.every(cmd => 
        cmd.label.toLowerCase().includes('scan') || 
        cmd.description.toLowerCase().includes('scan')
      )).toBe(true);
    });

    it('should filter commands by description', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/clear', onSelectCommand: mockOnSelectCommand })
      );

      expect(result.current.filteredCommands.length).toBeGreaterThan(0);
      expect(result.current.filteredCommands.some(cmd => 
        cmd.description.toLowerCase().includes('clear')
      )).toBe(true);
    });

    it('should return empty array for no match', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/nonexistent', onSelectCommand: mockOnSelectCommand })
      );

      expect(result.current.filteredCommands).toEqual([]);
    });
  });

  describe('keyboard navigation', () => {
    it('should handle ArrowDown to select next command', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', onSelectCommand: mockOnSelectCommand })
      );

      const event = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent;

      act(() => {
        result.current.handleKeyDown(event);
      });

      expect(result.current.selectedIndex).toBe(1);
    });

    it('should wrap around on ArrowDown at end of list', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', onSelectCommand: mockOnSelectCommand })
      );

      const lastIndex = SLASH_COMMANDS.length - 1;

      for (let i = 0; i <= lastIndex; i++) {
        act(() => {
          result.current.handleKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent);
        });
      }

      expect(result.current.selectedIndex).toBe(0);
    });

    it('should handle ArrowUp to select previous command', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', onSelectCommand: mockOnSelectCommand })
      );

      act(() => {
        result.current.handleKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent);
      });

      act(() => {
        result.current.handleKeyDown({ key: 'ArrowUp', preventDefault: vi.fn() } as unknown as React.KeyboardEvent);
      });

      expect(result.current.selectedIndex).toBe(0);
    });

    it('should wrap around on ArrowUp at start of list', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', onSelectCommand: mockOnSelectCommand })
      );

      act(() => {
        result.current.handleKeyDown({ key: 'ArrowUp', preventDefault: vi.fn() } as unknown as React.KeyboardEvent);
      });

      expect(result.current.selectedIndex).toBe(SLASH_COMMANDS.length - 1);
    });

    it('should select command on Enter', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', onSelectCommand: mockOnSelectCommand })
      );

      const event = { key: 'Enter', preventDefault: vi.fn() } as unknown as React.KeyboardEvent;

      act(() => {
        result.current.handleKeyDown(event);
      });

      expect(mockOnSelectCommand).toHaveBeenCalledWith(SLASH_COMMANDS[0].template);
    });

    it('should select command on Tab', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', onSelectCommand: mockOnSelectCommand })
      );

      const event = { key: 'Tab', preventDefault: vi.fn() } as unknown as React.KeyboardEvent;

      act(() => {
        result.current.handleKeyDown(event);
      });

      expect(mockOnSelectCommand).toHaveBeenCalledWith(SLASH_COMMANDS[0].template);
    });

    it('should close on Escape', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/help', onSelectCommand: mockOnSelectCommand })
      );

      const event = { key: 'Escape', preventDefault: vi.fn() } as unknown as React.KeyboardEvent;

      act(() => {
        result.current.handleKeyDown(event);
      });

      expect(result.current.isOpen).toBe(false);
    });

    it('should return false for unhandled keys', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/help', onSelectCommand: mockOnSelectCommand })
      );

      const event = { key: 'a' } as unknown as React.KeyboardEvent;

      const handled = result.current.handleKeyDown(event);

      expect(handled).toBe(false);
    });
  });

  describe('command selection', () => {
    it('should call onSelectCommand with template when selecting', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', onSelectCommand: mockOnSelectCommand })
      );

      act(() => {
        result.current.handleSelect(SLASH_COMMANDS[0]);
      });

      expect(mockOnSelectCommand).toHaveBeenCalledWith(SLASH_COMMANDS[0].template);
    });

    it('should reset selected index after selection', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', onSelectCommand: mockOnSelectCommand })
      );

      act(() => {
        result.current.handleKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent);
      });

      act(() => {
        result.current.handleSelect(SLASH_COMMANDS[0]);
      });

      expect(result.current.selectedIndex).toBe(0);
    });
  });
});
