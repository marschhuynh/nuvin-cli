import { useRef, useCallback, useEffect } from 'react';
import { processPasteChunk, createPasteState, type PasteState } from '@/utils/pasteHandler.js';
import { isTextInputDebugEnabled, logTextInputDebug } from './debugLogger.js';

const PASTE_TIMEOUT_MS = 2000;

function previewInput(input: string): string {
  return input
    .replace(/\x1b/g, '<ESC>')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .slice(0, 120);
}

export type UsePasteReturn = {
  processPaste: (input: string) => {
    processedInput: string | null;
    shouldWaitForMore: boolean;
    isPasteStart: boolean;
  };
};

export function usePaste(): UsePasteReturn {
  const pasteStateRef = useRef<PasteState>(createPasteState());
  const pasteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pasteTimerRef.current) {
        clearTimeout(pasteTimerRef.current);
        pasteTimerRef.current = null;
      }
    };
  }, []);

  const processPaste = useCallback((input: string) => {
    const previousBufferLength = pasteStateRef.current.buffer?.length ?? 0;
    const result = processPasteChunk(input, pasteStateRef.current);
    pasteStateRef.current = result.newState;

    if (isTextInputDebugEnabled) {
      logTextInputDebug('usePaste chunk processed', {
        rawInputLength: input.length,
        rawInputPreview: previewInput(input),
        previousBufferLength,
        nextBufferLength: result.newState.buffer?.length ?? 0,
        shouldWaitForMore: result.shouldWaitForMore,
        isPasteStart: result.isPasteStart,
        processedInputLength: result.processedInput?.length ?? null,
      });
    }

    if (result.shouldWaitForMore && !pasteTimerRef.current) {
      // Start a safety timeout — if we never receive the end marker,
      // reset the paste state so the user isn't stuck
      pasteTimerRef.current = setTimeout(() => {
        if (isTextInputDebugEnabled) {
          logTextInputDebug('usePaste timeout reset', {
            staleBufferLength: pasteStateRef.current.buffer?.length ?? 0,
            timeoutMs: PASTE_TIMEOUT_MS,
          });
        }
        pasteTimerRef.current = null;
        pasteStateRef.current = createPasteState();
      }, PASTE_TIMEOUT_MS);
    }

    if (!result.shouldWaitForMore) {
      // Paste completed or not in paste mode — clear any pending timeout
      if (pasteTimerRef.current) {
        clearTimeout(pasteTimerRef.current);
        pasteTimerRef.current = null;
      }
    }

    return {
      processedInput: result.processedInput,
      shouldWaitForMore: result.shouldWaitForMore,
      isPasteStart: result.isPasteStart,
    };
  }, []);

  return { processPaste };
}
