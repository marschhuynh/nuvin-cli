import { useRef } from 'react';
import { processPasteChunk, createPasteState, type PasteState } from '@/utils/pasteHandler.js';

const PASTE_TIMEOUT_MS = 2000;

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

  const processPaste = (input: string) => {
    const result = processPasteChunk(input, pasteStateRef.current);
    pasteStateRef.current = result.newState;

    if (result.shouldWaitForMore && !pasteTimerRef.current) {
      // Start a safety timeout — if we never receive the end marker,
      // reset the paste state so the user isn't stuck
      pasteTimerRef.current = setTimeout(() => {
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
  };

  return { processPaste };
}
