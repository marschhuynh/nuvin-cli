import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import { useFocus, useInput } from '@/contexts/InputContext/index.js';
import type { MemoryPort, Message } from '@nuvin/nuvin-core';
import Spinner from 'ink-spinner';
import { useTheme, type Theme } from '@/contexts/ThemeContext.js';
import { useAltMode } from '@/contexts/AltModeContext.js';
import { useInputHistory } from '@/hooks/useInputHistory.js';
import TextInput from './TextInput/index.js';
import { findCommandCompletion, completeCommand } from './TextInput/useCommandCompletion.js';
import { CommandMenu, type CommandMenuHandle, type CommandMenuItem } from './CommandMenu/index.js';
import { orchestratorManager } from '@/services/OrchestratorManager.js';
import { eventBus } from '@/services/EventBus.js';

type VimMode = 'insert' | 'normal';

export type CommandMenuState = {
  show: boolean;
  items: CommandMenuItem[];
  ref: React.RefObject<CommandMenuHandle | null>;
};

export type InputAreaHandle = {
  clear: () => void;
  getValue: () => string;
  setValue: (value: string) => void;
  setValueForRecall: (value: string) => void;
  appendValue: (text: string) => void;
  closeMenu: () => void;
  getCommandMenuState: () => CommandMenuState;
};

type InputAreaProps = {
  busy: boolean;
  messageQueueLength: number;
  showToolApproval?: boolean;
  showUserQuestion?: boolean;
  disabled?: boolean;
  mode?: 'input' | 'approval' | 'command' | 'command-menu' | 'question';

  commandItems: Array<{ label: string; value: string; description?: string }>;
  vimModeEnabled?: boolean;
  memory?: MemoryPort<Message> | null;

  onInputChanged?: (value: string) => void;
  onInputSubmit?: (value: string) => Promise<void>;
  onVimModeToggle?: () => void;
  onVimModeChanged?: (mode: 'insert' | 'normal') => void;
  onCommandMenuChange?: (state: CommandMenuState) => void;
};

const InputAreaComponent = forwardRef<InputAreaHandle, InputAreaProps>(
  (
    {
      busy,
      showToolApproval = false,
      showUserQuestion = false,
      disabled = false,
      mode = 'input',

      commandItems,
      vimModeEnabled = false,
      memory,

      onInputChanged,
      onInputSubmit,
      onVimModeChanged,
      onCommandMenuChange,
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

    // Notify parent about command menu state changes
    useEffect(() => {
      onCommandMenuChange?.({
        show: showCommandMenu && filteredCommandItems.length > 0,
        items: filteredCommandItems,
        ref: commandMenuRef,
      });
    }, [showCommandMenu, filteredCommandItems, onCommandMenuChange]);

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
        getCommandMenuState: () => ({
          show: showCommandMenu && filteredCommandItems.length > 0,
          items: filteredCommandItems,
          ref: commandMenuRef,
        }),
      }),
      [onInputChanged, showCommandMenu, filteredCommandItems],
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
      { isActive: isFocused && !showToolApproval && !showUserQuestion && !disabled },
    );

    const handleTextInputUpArrow = showCommandMenu ? undefined : handleUpArrow;
    const handleTextInputDownArrow = showCommandMenu ? undefined : handleDownArrow;

    const handleTab = useCallback((value: string, cursorOffset: number, _isShiftTab: boolean) => {
      const completedCommand = findCommandCompletion(value, cursorOffset);
      if (completedCommand) {
        const { newValue, newCursorOffset } = completeCommand(value, cursorOffset, completedCommand);
        return { value: newValue, cursorOffset: newCursorOffset };
      }
      return undefined;
    }, []);

    const inputProps = {
      borderStyle: 'single' as const,
      borderBottomDimColor: true,
      borderTop: false,
      borderBottom: true,
      borderLeft: false,
      borderRight: false,
    };

    const shouldShowCommandMenu =
      mode !== 'approval' && mode !== 'command' && showCommandMenu && filteredCommandItems.length > 0;

    const renderCommandMenu = () => {
      if (!shouldShowCommandMenu) {
        return null;
      }
      return altMode ? (
        <Box position="absolute" bottom={2} zIndex={10} backgroundColor={theme.colors.background}>
          <CommandMenu
            ref={commandMenuRef}
            items={filteredCommandItems}
            focus={!showToolApproval && !showUserQuestion}
          />
        </Box>
      ) : (
        <CommandMenu ref={commandMenuRef} items={filteredCommandItems} focus={!showToolApproval && !showUserQuestion} />
      );
    };

    return (
      <Box flexDirection="column" position="relative" {...inputProps} flexShrink={0}>
        <Box flexShrink={0} minWidth={1}>
          <BusyIndicator busy={busy} isFocused={isFocused} theme={theme} />
          <Box minWidth={1} />
          <Box flexGrow={1} width="90%">
            <TextInput
              key={focusKey}
              value={input}
              onChange={handleChange}
              onSubmit={handleSubmit}
              placeholder="Type your message..."
              focus={isFocused && !showToolApproval && !showUserQuestion && !disabled}
              vimModeEnabled={vimModeEnabled}
              onVimModeChange={handleVimModeChange}
              onUpArrow={handleTextInputUpArrow}
              onDownArrow={handleTextInputDownArrow}
              onTab={handleTab}
              maxLines={10}
            />
          </Box>
        </Box>
        {renderCommandMenu()}
      </Box>
    );
  },
);

const BusyIndicator = ({ busy, isFocused, theme }: { busy: boolean; isFocused: boolean; theme: Theme }) => {
  const [activeAgentId, setActiveAgentId] = useState<string>('main');

  useEffect(() => {
    const updateAgent = () => {
      setActiveAgentId(orchestratorManager.getActiveAgentId());
    };
    updateAgent();
    const handler = (event: { agentId: string }) => {
      setActiveAgentId(event.agentId);
    };
    eventBus.on('agent:swapped', handler);
    return () => {
      eventBus.off('agent:swapped', handler);
    };
  }, []);

  return (
    <Box flexWrap="nowrap" flexShrink={0}>
      {activeAgentId !== 'main' && (
        <Text color={theme.colors.accent} bold>
          [{activeAgentId}]{' '}
        </Text>
      )}
      {!busy ? (
        <Text color={theme.input.prompt} bold>
          {isFocused ? '❯' : ' '}
        </Text>
      ) : (
        <Spinner type="dots" />
      )}
    </Box>
  );
};

export const InputArea = React.memo(InputAreaComponent);
