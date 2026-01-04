import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import { useFocus, useInput } from '@/contexts/InputContext/index.js';
import type { MemoryPort, Message } from '@nuvin/nuvin-core';
import Spinner from 'ink-spinner';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useInputHistory } from '@/hooks/useInputHistory.js';
import TextInput from './TextInput/index.js';
import { CommandMenu, type CommandMenuHandle } from './CommandMenu/index.js';
import { useAltMode } from '@/contexts/AltModeContext.js';

type VimMode = 'insert' | 'normal';

export type InputAreaHandle = {
  clear: () => void;
  getValue: () => string;
  setValue: (value: string) => void;
  setValueForRecall: (value: string) => void;
  appendValue: (text: string) => void;
  closeMenu: () => void;
};

type InputAreaProps = {
  busy: boolean;
  messageQueueLength: number;
  showToolApproval?: boolean;
  useAbsoluteMenu?: boolean;
  disabled?: boolean;

  commandItems: Array<{ label: string; value: string }>;
  vimModeEnabled?: boolean;
  memory?: MemoryPort<Message> | null;

  onInputChanged?: (value: string) => void;
  onInputSubmit?: (value: string) => Promise<void>;
  onVimModeToggle?: () => void;
  onVimModeChanged?: (mode: 'insert' | 'normal') => void;
};

const InputAreaComponent = forwardRef<InputAreaHandle, InputAreaProps>(
  (
    {
      busy,
      showToolApproval = false,
      useAbsoluteMenu: _useAbsoluteMenu = false,
      disabled = false,

      commandItems,
      vimModeEnabled = false,
      memory,

      onInputChanged,
      onInputSubmit,
      onVimModeChanged,
    },
    ref,
  ) => {
    const { theme } = useTheme();
    const { altMode } = useAltMode();
    const [input, setInput] = useState('');
    const [focusKey, setFocusKey] = useState(0);
    const [_vimMode, setVimMode] = useState<VimMode>('insert');
    const { isFocused } = useFocus({ autoFocus: true, active: true });
    const commandMenuRef = useRef<CommandMenuHandle>(null);

    // Track input value in ref for stable callbacks
    const inputRef = useRef(input);
    inputRef.current = input;

    const showCommandMenu = input.startsWith('/');

    const filteredCommandItems = useMemo(() => {
      if (!showCommandMenu) return [];
      const inputParts = input.split(/\s+/);
      const commandPart = inputParts[0];
      return commandItems.filter(
        (item) =>
          item.value.toLowerCase().includes(commandPart.toLowerCase()) ||
          item.label.toLowerCase().includes(commandPart.toLowerCase()),
      );
    }, [input, commandItems, showCommandMenu]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: ref only used to reset selected index
    useEffect(() => {
      commandMenuRef.current?.setSelectedIndex(0);
    }, [filteredCommandItems.length]);

    const onRecall = useCallback(
      (message: string) => {
        setInput(message);
        setFocusKey((prev) => prev + 1);
        onInputChanged?.(message);
      },
      [onInputChanged],
    );

    const { handleUpArrow, handleDownArrow, addMessage } = useInputHistory({
      memory,
      currentInput: input,
      onRecall,
    });

    useImperativeHandle(
      ref,
      () => ({
        clear: () => {
          setInput('');
          onInputChanged?.('');
        },
        getValue: () => inputRef.current,
        setValue: (value: string) => {
          setInput(value);
          onInputChanged?.(value);
        },
        setValueForRecall: (value: string) => {
          setInput(value);
          setFocusKey((prev) => prev + 1);
          onInputChanged?.(value);
        },
        appendValue: (text: string) => {
          setInput((current) => {
            const newValue = current + text;
            onInputChanged?.(newValue);
            return newValue;
          });
          setFocusKey((prev) => prev + 1);
        },
        closeMenu: () => {
          setInput('');
        },
      }),
      [onInputChanged],
    );

    useEffect(() => {
      if (vimModeEnabled) {
        setVimMode('normal');
      } else {
        setVimMode('insert');
      }
    }, [vimModeEnabled]);

    const handleChange = useCallback(
      (value: string) => {
        setInput(value);
        onInputChanged?.(value);
      },
      [onInputChanged],
    );

    const handleVimModeChange = useCallback(
      (mode: VimMode) => {
        setVimMode(mode);
        onVimModeChanged?.(mode);
      },
      [onVimModeChanged],
    );

    const submitCommand = useCallback(
      async (command: string) => {
        setInput('');
        onInputChanged?.('');
        await onInputSubmit?.(command);
      },
      [onInputChanged, onInputSubmit],
    );

    const handleSubmit = useCallback(
      async (value: string) => {
        const trimmed = value.trim();

        if (showCommandMenu && filteredCommandItems.length > 0) {
          const selected = commandMenuRef.current?.getSelectedItem();
          if (selected) {
            const inputParts = trimmed.split(/\s+/);
            const args = inputParts.slice(1).join(' ').trim();
            const completed = args ? `${selected.value} ${args}` : selected.value;
            await submitCommand(completed);
            return;
          }
        }

        if (trimmed.startsWith('/')) {
          const commandMatch = commandItems.find((item) => item.value === trimmed.split(/\s+/)[0]);
          if (commandMatch) {
            await submitCommand(trimmed);
            return;
          }
        }

        if (trimmed && !trimmed.startsWith('/')) {
          addMessage(trimmed);
        }

        setInput('');
        onInputChanged?.('');
        await onInputSubmit?.(value);
      },
      [showCommandMenu, filteredCommandItems, commandItems, submitCommand, addMessage, onInputChanged, onInputSubmit],
    );

    useInput(
      (_input, key) => {
        if (key.escape && showCommandMenu) {
          setInput('');
          onInputChanged?.('');
        }
      },
      { isActive: isFocused && !showToolApproval && !disabled },
    );

    const handleTextInputUpArrow = showCommandMenu ? undefined : handleUpArrow;
    const handleTextInputDownArrow = showCommandMenu ? undefined : handleDownArrow;

    const inputProps = {
      borderStyle: 'single' as const,
      borderBottomDimColor: true,
      borderTop: false,
      borderBottom: true,
      borderLeft: false,
      borderRight: false,
    };

    return (
      <Box flexDirection="column" position="relative" {...inputProps}>
        <Box flexShrink={0} minWidth={1}>
          {!busy ? (
            <Text color={theme.input.prompt} bold>
              {isFocused ? '❯' : ' '}
            </Text>
          ) : (
            <Spinner type="dots" />
          )}
          <Box minWidth={1} />
          <Box flexGrow={1} width="90%">
            <TextInput
              key={focusKey}
              value={input}
              onChange={handleChange}
              onSubmit={handleSubmit}
              placeholder="Type your message..."
              focus={isFocused && !showToolApproval && !disabled}
              vimModeEnabled={vimModeEnabled}
              onVimModeChange={handleVimModeChange}
              onUpArrow={handleTextInputUpArrow}
              onDownArrow={handleTextInputDownArrow}
            />
          </Box>
        </Box>
        {showCommandMenu &&
          filteredCommandItems.length > 0 &&
          (altMode ? (
            <Box position="absolute" bottom={2} backgroundColor={theme.colors.background}>
              <CommandMenu ref={commandMenuRef} items={filteredCommandItems} focus={isFocused && !showToolApproval} />
            </Box>
          ) : (
            <CommandMenu ref={commandMenuRef} items={filteredCommandItems} focus={isFocused && !showToolApproval} />
          ))}
      </Box>
    );
  },
);

export const InputArea = React.memo(InputAreaComponent);
