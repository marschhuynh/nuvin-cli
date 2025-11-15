import { forwardRef, useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useInput } from 'ink';
import { ToolApprovalPrompt } from './ToolApprovalPrompt/ToolApprovalPrompt.js';
import { ActiveCommand } from '@/modules/commands/components/ActiveCommand.js';
import { InputArea, type InputAreaHandle } from './InputArea.js';
import { useCommand } from '@/modules/commands/hooks/useCommand.js';
import { useToolApproval } from '@/contexts/ToolApprovalContext.js';
import { useTheme } from '@/contexts/ThemeContext.js';

type InteractionAreaProps = {
  busy?: boolean;
  messageQueueLength?: number;
  vimModeEnabled?: boolean;
  hasActiveCommand?: boolean;

  abortRef?: React.MutableRefObject<AbortController | null>;
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
  const { pendingApproval, toolApprovalMode, handleApprovalResponse } = useToolApproval();
  const { theme } = useTheme();

  const escStageRef = useRef<'none' | 'armed-clear' | 'armed-stop'>('none');
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);
  const isProcessingQueueRef = useRef(false);

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
      if (key.escape && abortRef && onNotification && onBusyChange) {
        if (pendingApproval) {
          return;
        }

        if (busy) {
          if (escStageRef.current === 'none') {
            if (typeof ref !== 'function' && ref?.current) {
              const hasInput = ref.current.getValue && ref.current.getValue().trim() !== '';
              if (hasInput) {
                onNotification('Press ESC again to clear input (or once more to stop process)', 1500);
                escStageRef.current = 'armed-clear';
                setTimeout(() => {
                  escStageRef.current = 'none';
                }, 1500);
                return;
              }
            }
            onNotification('Press ESC again to stop the process', 1500);
            escStageRef.current = 'armed-stop';
            setTimeout(() => {
              escStageRef.current = 'none';
            }, 1500);
            return;
          }

          if (escStageRef.current === 'armed-clear') {
            onNotification('Input cleared. Press ESC again to stop the process', 1500);
            if (typeof ref !== 'function' && ref?.current) {
              ref.current.clear();
            }
            escStageRef.current = 'armed-stop';
            setTimeout(() => {
              escStageRef.current = 'none';
            }, 1500);
            return;
          }

          if (escStageRef.current === 'armed-stop') {
            onNotification(null);
            escStageRef.current = 'none';
            try {
              abortRef.current?.abort();
            } catch {
            } finally {
              onBusyChange(false);
            }
            return;
          }
          return;
        }

        if (escStageRef.current === 'none') {
          if (typeof ref !== 'function' && ref?.current) {
            const hasInput = ref.current.getValue && ref.current.getValue().trim() !== '';
            if (hasInput) {
              onNotification('Press ESC again to clear the input', 1500);
              escStageRef.current = 'armed-clear';
              setTimeout(() => {
                escStageRef.current = 'none';
              }, 1500);
              return;
            }
          }
        }

        if (escStageRef.current === 'armed-clear') {
          onNotification(null);
          escStageRef.current = 'none';
          if (typeof ref !== 'function' && ref?.current) {
            ref.current.clear();
          }
          return;
        }
      }
    },
    { isActive: !hasActiveCommand && !pendingApproval },
  );

  const commandItems = useMemo(
    () => commands.map((cmd) => ({ label: `${cmd.id} - ${cmd.description}`, value: cmd.id })),
    [commands],
  );

  const mode = pendingApproval ? 'approval' : hasActiveCommand ? 'command' : 'input';

  switch (mode) {
    case 'approval':
      if (!pendingApproval || !toolApprovalMode) {
        return null;
      }
      return <ToolApprovalPrompt toolCalls={pendingApproval.toolCalls} onApproval={handleApprovalResponse} />;

    case 'command':
      return <ActiveCommand />;
    default:
      return (
        <Box flexDirection="column" marginTop={1}>
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
            showToolApproval={!!pendingApproval}
            commandItems={commandItems}
            vimModeEnabled={vimModeEnabled}
            onInputChanged={onInputChanged}
            onInputSubmit={handleInputSubmit}
            onVimModeToggle={onVimModeToggle}
            onVimModeChanged={onVimModeChanged}
          />
        </Box>
      );
  }
});
