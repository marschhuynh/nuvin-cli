import { forwardRef, useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import type { MemoryPort, Message } from '@nuvin/nuvin-core';
import { ActiveCommand } from '@/modules/commands/components/ActiveCommand.js';
import { useCommand } from '@/modules/commands/hooks/useCommand.js';
import { useToolApproval } from '@/contexts/ToolApprovalContext.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useAltMode } from '@/contexts/AltModeContext.js';
import { ToolApprovalPrompt } from './ToolApprovalPrompt/ToolApprovalPrompt.js';
import { InputArea, type InputAreaHandle } from './InputArea.js';

type InteractionAreaProps = {
  busy?: boolean;
  messageQueueLength?: number;
  vimModeEnabled?: boolean;
  hasActiveCommand?: boolean;
  memory?: MemoryPort<Message> | null;
  useAbsoluteMenu?: boolean;

  abortRef?: React.RefObject<AbortController | null>;
  onNotification?: (message: string | null, duration?: number) => void;
  onBusyChange?: (busy: boolean) => void;

  onInputChanged?: (value: string) => void;
  onInputSubmit?: (value: string) => Promise<void>;
  onVimModeToggle?: () => void;
  onVimModeChanged?: (mode: 'insert' | 'normal') => void;
};

export const InteractionArea = forwardRef<InputAreaHandle, InteractionAreaProps>(function InteractionArea(
  {
    busy = false,
    messageQueueLength = 0,
    vimModeEnabled = false,
    hasActiveCommand = false,
    memory,

    abortRef,
    onNotification,
    onBusyChange,

    onInputChanged,
    onInputSubmit,
    onVimModeToggle,
    onVimModeChanged,
  },
  ref,
) {
  const { commands } = useCommand();
  const { pendingApprovalTools, toolApprovalMode } = useToolApproval();
  const { theme } = useTheme();
  const { altMode } = useAltMode();

  const hasPendingApproval = pendingApprovalTools.length > 0;

  const escStageRef = useRef<'none' | 'armed-clear' | 'armed-stop'>('none');
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);
  const isProcessingQueueRef = useRef(false);
  const escTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!busy && queuedMessages.length > 0 && onInputSubmit && !isProcessingQueueRef.current) {
      isProcessingQueueRef.current = true;
      const [messageToSubmit, ...remaining] = queuedMessages;
      setQueuedMessages(remaining);

      onInputSubmit(messageToSubmit).finally(() => {
        isProcessingQueueRef.current = false;
      });
    }
  }, [busy, queuedMessages, onInputSubmit]);

  const handleInputSubmit = useCallback(
    async (value: string) => {
      if (!value.trim()) {
        return;
      }
      if (busy && !value.startsWith('/')) {
        setQueuedMessages((prev) => [...prev, value]);
        onNotification?.(`Message queued, will be sent when current request completes`, 1000);
      } else {
        await onInputSubmit?.(value);
      }
    },
    [busy, onNotification, onInputSubmit],
  );

  useInput(
    (_input, key) => {
      if (key.escape) {
        if (hasPendingApproval) {
          return;
        }

        if (busy) {
          if (!abortRef || !onNotification || !onBusyChange) {
            return;
          }

          if (escStageRef.current === 'none') {
            if (typeof ref !== 'function' && ref?.current) {
              const hasInput = ref.current.getValue && ref.current.getValue().trim() !== '';
              if (hasInput) {
                onNotification('Press ESC again to clear input (or once more to stop process)', 1500);
                escStageRef.current = 'armed-clear';
                if (escTimeoutRef.current) clearTimeout(escTimeoutRef.current);
                escTimeoutRef.current = setTimeout(() => {
                  escStageRef.current = 'none';
                  escTimeoutRef.current = null;
                }, 1500);
                return;
              }
            }
            onNotification('Press ESC again to stop the process', 1500);
            escStageRef.current = 'armed-stop';
            if (escTimeoutRef.current) clearTimeout(escTimeoutRef.current);
            escTimeoutRef.current = setTimeout(() => {
              escStageRef.current = 'none';
              escTimeoutRef.current = null;
            }, 1500);
            return;
          }

          if (escStageRef.current === 'armed-clear') {
            onNotification('Input cleared. Press ESC again to stop the process', 1500);
            if (typeof ref !== 'function' && ref?.current) {
              ref.current.clear();
            }
            escStageRef.current = 'armed-stop';
            if (escTimeoutRef.current) clearTimeout(escTimeoutRef.current);
            escTimeoutRef.current = setTimeout(() => {
              escStageRef.current = 'none';
              escTimeoutRef.current = null;
            }, 1500);
            return;
          }

          if (escStageRef.current === 'armed-stop') {
            if (escTimeoutRef.current) clearTimeout(escTimeoutRef.current);
            escTimeoutRef.current = null;
            onNotification(null);
            escStageRef.current = 'none';

            // Only clear busy state if we successfully create/abort controller
            try {
              const controller = abortRef.current;
              if (controller) {
                controller.abort();
                onBusyChange(false);
              }
            } catch (_error) {
              // Ignore abort errors
            }
            return;
          }
          return;
        }

        // Handle ESC when not busy
        if (typeof ref !== 'function' && ref?.current) {
          if (escStageRef.current === 'none') {
            const hasInput = ref.current.getValue && ref.current.getValue().trim() !== '';
            if (hasInput) {
              if (onNotification) {
                onNotification('Press ESC again to clear the input', 1500);
              }
              escStageRef.current = 'armed-clear';
              if (escTimeoutRef.current) clearTimeout(escTimeoutRef.current);
              escTimeoutRef.current = setTimeout(() => {
                escStageRef.current = 'none';
                escTimeoutRef.current = null;
              }, 1500);
              return;
            }
          }

          if (escStageRef.current === 'armed-clear') {
            if (escTimeoutRef.current) clearTimeout(escTimeoutRef.current);
            escTimeoutRef.current = null;
            if (onNotification) {
              onNotification(null);
            }
            escStageRef.current = 'none';
            ref.current.clear();
            return;
          }
        }
      }
    },
    { isActive: !hasActiveCommand && !hasPendingApproval },
  );

  const commandItems = useMemo(
    () => commands.map((cmd) => ({ label: `${cmd.id} - ${cmd.description}`, value: cmd.id })),
    [commands],
  );

  const mode = hasPendingApproval ? 'approval' : hasActiveCommand ? 'command' : 'input';

  const renderDynamicContent = () => {
    switch (mode) {
      case 'approval':
        if (!hasPendingApproval || !toolApprovalMode) {
          return null;
        }
        return altMode ? (
          <Box position="absolute" bottom={2} zIndex={20} flexShrink={0}>
            <ToolApprovalPrompt toolCalls={pendingApprovalTools} />
          </Box>
        ) : (
          <Box flexShrink={0}>
            <ToolApprovalPrompt toolCalls={pendingApprovalTools} />
          </Box>
        );

      case 'command':
        return altMode ? (
          <Box position="absolute" bottom={2} zIndex={10} flexShrink={0}>
            <ActiveCommand />
          </Box>
        ) : (
          <Box flexShrink={0}>
            <ActiveCommand />
          </Box>
        );

      default:
        return (
          <Box flexDirection="column" marginTop={3} position="relative" flexShrink={0}>
            {queuedMessages.length > 0 && (
              <Box flexDirection="row" marginLeft={2}>
                <Text color={theme.colors.secondary} dimColor>
                  ⟀ {queuedMessages[0]}
                </Text>
                {queuedMessages.length > 1 && (
                  <Text color={theme.colors.secondary} dimColor>
                    {' '}
                    + {queuedMessages.length - 1}
                  </Text>
                )}
              </Box>
            )}
            <InputArea
              ref={ref}
              busy={busy}
              messageQueueLength={messageQueueLength}
              showToolApproval={hasPendingApproval}
              commandItems={commandItems}
              vimModeEnabled={vimModeEnabled}
              memory={memory}
              mode={mode}
              onInputChanged={onInputChanged}
              onInputSubmit={handleInputSubmit}
              onVimModeToggle={onVimModeToggle}
              onVimModeChanged={onVimModeChanged}
              // disabled={mode === 'approval' || mode === 'command'}
            />
          </Box>
        );
    }
  };

  return renderDynamicContent();
});
