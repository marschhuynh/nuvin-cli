import { useEffect, useRef, useCallback } from 'react';
import { eventBus } from '@/services/EventBus.js';
import type { InputAreaHandle } from '@/components/index.js';

type UseGlobalKeyboardProps = {
  busy: boolean;
  pendingApproval: unknown;
  inputAreaRef: React.RefObject<InputAreaHandle>;
  onNotification: (message: string | null, duration?: number) => void;
};

export const useGlobalKeyboard = ({
  busy,
  pendingApproval,
  inputAreaRef,
  onNotification,
}: UseGlobalKeyboardProps): void => {
  const ctrlCArmedRef = useRef(false);

  const handleCtrlC = useCallback(() => {
    if (!ctrlCArmedRef.current) {
      ctrlCArmedRef.current = true;
      onNotification('Press Ctrl+C again to exit', 1000);
      setTimeout(() => {
        ctrlCArmedRef.current = false;
      }, 1000);
    } else {
      ctrlCArmedRef.current = false;
      onNotification(null);
      process.stdout.write('\x1b[?2004l');
      process.exit(0);
    }
  }, [onNotification]);

  const handlePaste = useCallback(async () => {
    if (busy || pendingApproval) {
      return;
    }

    try {
      const { hasClipboardFiles, getClipboardFiles } = await import('../utils/clipboard.js');

      onNotification('Checking clipboard...', 500);

      const hasFiles = await hasClipboardFiles();

      if (hasFiles) {
        onNotification('Processing clipboard image...', 1000);
        const files = await getClipboardFiles();

        if (files.length > 0) {
          const clipboardBuffers = files.map((f) => f.data);

          const placeholderText = files
            .map((_f, i) => {
              return `[Image:Pasted #${i + 1}]`;
            })
            .join(' ');

          inputAreaRef.current?.appendValue(placeholderText);

          globalThis.__clipboardFiles = clipboardBuffers;

          const totalSizeKB = Math.round(clipboardBuffers.reduce((sum, buf) => sum + buf.length, 0) / 1024);
          onNotification(`${files.length} image${files.length > 1 ? 's' : ''} pasted (${totalSizeKB}KB total)`, 2000);
        } else {
          onNotification('No valid image data found in clipboard', 1000);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      onNotification(`Failed to paste from clipboard: ${errorMsg}`, 2000);
    }
  }, [busy, pendingApproval, onNotification, inputAreaRef]);

  useEffect(() => {
    eventBus.on('ui:keyboard:ctrlc', handleCtrlC);
    eventBus.on('ui:keyboard:paste', handlePaste);

    return () => {
      eventBus.off('ui:keyboard:ctrlc', handleCtrlC);
      eventBus.off('ui:keyboard:paste', handlePaste);
    };
  }, [handleCtrlC, handlePaste]);
};
