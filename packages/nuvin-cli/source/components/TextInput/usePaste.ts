import { useRef } from 'react';
import { processPasteChunk, createPasteState, type PasteState } from '@/utils/pasteHandler.js';

export type UsePasteReturn = {
  processPaste: (input: string) => {
    processedInput: string | null;
    shouldWaitForMore: boolean;
    isPasteStart: boolean;
  };
};

export function usePaste(): UsePasteReturn {
  const pasteStateRef = useRef<PasteState>(createPasteState());

  const processPaste = (input: string) => {
    const result = processPasteChunk(input, pasteStateRef.current);
    pasteStateRef.current = result.newState;

    return {
      processedInput: result.processedInput,
      shouldWaitForMore: result.shouldWaitForMore,
      isPasteStart: result.isPasteStart,
    };
  };

  return { processPaste };
}
