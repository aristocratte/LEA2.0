'use client';

import { useState, useCallback } from 'react';
import type { SlashCommand } from '@/hooks/use-commands';

interface UseSlashCommandsOptions {
  inputValue: string;
  commands: SlashCommand[];
  onSelectCommand: (template: string) => void;
}

interface UseSlashCommandsReturn {
  isOpen: boolean;
  query: string;
  selectedIndex: number;
  filteredCommands: SlashCommand[];
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  handleSelect: (command: SlashCommand) => void;
  handleClose: () => void;
}

export function useSlashCommands({
  inputValue,
  commands,
  onSelectCommand,
}: UseSlashCommandsOptions): UseSlashCommandsReturn {
  const [dismissedInput, setDismissedInput] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ query: string; index: number }>({
    query: '',
    index: 0,
  });

  const startsWithSlash = inputValue.startsWith('/');
  const query = startsWithSlash ? inputValue.slice(1) : '';
  const isOpen = startsWithSlash && dismissedInput !== inputValue;
  const selectedIndex = selection.query === query ? selection.index : 0;

  // Filter commands based on the query
  const filteredCommands: SlashCommand[] = startsWithSlash
    ? query === ''
      ? commands
      : commands.filter(
          (cmd) =>
            cmd.label.toLowerCase().includes(query.toLowerCase()) ||
            cmd.description.toLowerCase().includes(query.toLowerCase()),
        )
    : [];

  const handleSelect = useCallback(
    (command: SlashCommand) => {
      onSelectCommand(command.template);
      setDismissedInput(null);
      setSelection({ query, index: 0 });
    },
    [onSelectCommand, query],
  );

  const handleClose = useCallback(() => {
    setDismissedInput(inputValue);
    setSelection({ query, index: 0 });
  }, [inputValue, query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!isOpen) return false;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setSelection(() =>
            filteredCommands.length === 0
              ? { query, index: 0 }
              : { query, index: (selectedIndex + 1) % filteredCommands.length },
          );
          return true;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setSelection(() =>
            filteredCommands.length === 0
              ? { query, index: 0 }
              : { query, index: (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length },
          );
          return true;
        }
        case 'Enter':
        case 'Tab': {
          if (filteredCommands[selectedIndex]) {
            e.preventDefault();
            handleSelect(filteredCommands[selectedIndex]);
          }
          return true;
        }
        case 'Escape': {
          e.preventDefault();
          handleClose();
          return true;
        }
        default:
          return false;
      }
    },
    [isOpen, filteredCommands, selectedIndex, handleSelect, handleClose, query],
  );

  return {
    isOpen,
    query,
    selectedIndex,
    filteredCommands,
    handleKeyDown,
    handleSelect,
    handleClose,
  };
}
