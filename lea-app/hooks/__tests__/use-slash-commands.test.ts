import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSlashCommands } from '../use-slash-commands';
import { FALLBACK_COMMANDS, type SlashCommand } from '../use-commands';

const TEST_COMMANDS: SlashCommand[] = FALLBACK_COMMANDS;

describe('useSlashCommands', () => {
  const mockOnSelectCommand = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('menu visibility', () => {
    it('should be open when input starts with /', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
      );

      expect(result.current.isOpen).toBe(true);
    });

    it('should be closed when input does not start with /', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: 'hello', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
      );

      expect(result.current.isOpen).toBe(false);
    });

    it('should extract query from input', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/scan example.com', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
      );

      expect(result.current.query).toBe('scan example.com');
    });

    it('should close when dismissed', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/help', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
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
        useSlashCommands({ inputValue: '/', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
      );

      expect(result.current.filteredCommands).toEqual(TEST_COMMANDS);
    });

    it('should filter commands by label', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/scan', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
      );

      expect(result.current.filteredCommands.length).toBeGreaterThan(0);
      expect(result.current.filteredCommands.every(cmd =>
        cmd.label.toLowerCase().includes('scan') ||
        cmd.description.toLowerCase().includes('scan')
      )).toBe(true);
    });

    it('should filter commands by description', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/clear', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
      );

      expect(result.current.filteredCommands.length).toBeGreaterThan(0);
      expect(result.current.filteredCommands.some(cmd =>
        cmd.description.toLowerCase().includes('clear')
      )).toBe(true);
    });

    it('should return empty array for no match', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/nonexistent', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
      );

      expect(result.current.filteredCommands).toEqual([]);
    });
  });

  describe('keyboard navigation', () => {
    it('should handle ArrowDown to select next command', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
      );

      const event = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent;

      act(() => {
        result.current.handleKeyDown(event);
      });

      expect(result.current.selectedIndex).toBe(1);
    });

    it('should wrap around on ArrowDown at end of list', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
      );

      const lastIndex = TEST_COMMANDS.length - 1;

      for (let i = 0; i <= lastIndex; i++) {
        act(() => {
          result.current.handleKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent);
        });
      }

      expect(result.current.selectedIndex).toBe(0);
    });

    it('should handle ArrowUp to select previous command', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
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
        useSlashCommands({ inputValue: '/', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
      );

      act(() => {
        result.current.handleKeyDown({ key: 'ArrowUp', preventDefault: vi.fn() } as unknown as React.KeyboardEvent);
      });

      expect(result.current.selectedIndex).toBe(TEST_COMMANDS.length - 1);
    });

    it('should select command on Enter', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
      );

      const event = { key: 'Enter', preventDefault: vi.fn() } as unknown as React.KeyboardEvent;

      act(() => {
        result.current.handleKeyDown(event);
      });

      expect(mockOnSelectCommand).toHaveBeenCalledWith(TEST_COMMANDS[0].template);
    });

    it('should select command on Tab', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
      );

      const event = { key: 'Tab', preventDefault: vi.fn() } as unknown as React.KeyboardEvent;

      act(() => {
        result.current.handleKeyDown(event);
      });

      expect(mockOnSelectCommand).toHaveBeenCalledWith(TEST_COMMANDS[0].template);
    });

    it('should close on Escape', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/help', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
      );

      const event = { key: 'Escape', preventDefault: vi.fn() } as unknown as React.KeyboardEvent;

      act(() => {
        result.current.handleKeyDown(event);
      });

      expect(result.current.isOpen).toBe(false);
    });

    it('should return false for unhandled keys', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/help', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
      );

      const event = { key: 'a' } as unknown as React.KeyboardEvent;

      const handled = result.current.handleKeyDown(event);

      expect(handled).toBe(false);
    });
  });

  describe('command selection', () => {
    it('should call onSelectCommand with template when selecting', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
      );

      act(() => {
        result.current.handleSelect(TEST_COMMANDS[0]);
      });

      expect(mockOnSelectCommand).toHaveBeenCalledWith(TEST_COMMANDS[0].template);
    });

    it('should reset selected index after selection', () => {
      const { result } = renderHook(() =>
        useSlashCommands({ inputValue: '/', commands: TEST_COMMANDS, onSelectCommand: mockOnSelectCommand })
      );

      act(() => {
        result.current.handleKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent);
      });

      act(() => {
        result.current.handleSelect(TEST_COMMANDS[0]);
      });

      expect(result.current.selectedIndex).toBe(0);
    });
  });
});
