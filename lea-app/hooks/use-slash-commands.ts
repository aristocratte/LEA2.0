'use client';

import { useState, useEffect, useCallback } from 'react';
import { SLASH_COMMANDS, type SlashCommand } from '@/components/chat/slash-command-menu';

interface UseSlashCommandsOptions {
  inputValue: string;
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
  onSelectCommand,
}: UseSlashCommandsOptions): UseSlashCommandsReturn {
  const [dismissed, setDismissed] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const startsWithSlash = inputValue.startsWith('/');
  const query = startsWithSlash ? inputValue.slice(1) : '';
  const isOpen = startsWithSlash && !dismissed;

  // Reset dismissed whenever the user re-types a slash-prefixed value
  useEffect(() => {
    if (startsWithSlash) {
      setDismissed(false);
    }
  }, [inputValue, startsWithSlash]);

  // Filter commands based on the query
  const filteredCommands: SlashCommand[] = startsWithSlash
    ? query === ''
      ? SLASH_COMMANDS
      : SLASH_COMMANDS.filter(
          (cmd) =>
            cmd.label.toLowerCase().includes(query.toLowerCase()) ||
            cmd.description.toLowerCase().includes(query.toLowerCase()),
        )
    : [];

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = useCallback(
    (command: SlashCommand) => {
      onSelectCommand(command.template);
      setDismissed(false);
      setSelectedIndex(0);
    },
    [onSelectCommand],
  );

  const handleClose = useCallback(() => {
    setDismissed(true);
    setSelectedIndex(0);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!isOpen) return false;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setSelectedIndex((prev) =>
            filteredCommands.length === 0 ? 0 : (prev + 1) % filteredCommands.length,
          );
          return true;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setSelectedIndex((prev) =>
            filteredCommands.length === 0
              ? 0
              : (prev - 1 + filteredCommands.length) % filteredCommands.length,
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
    [isOpen, filteredCommands, selectedIndex, handleSelect, handleClose],
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
