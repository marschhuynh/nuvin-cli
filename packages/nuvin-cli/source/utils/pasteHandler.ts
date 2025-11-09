import { canonicalizeTerminalPaste } from '@/utils.js';

const PASTE_START = '\x1b[200~';
const PASTE_START_STRICT = '[200~';
const PASTE_END = '\x1b[201~';
const PASTE_END_STRICT = '[201~';

export interface PasteState {
  buffer: string | null;
}

export interface PasteResult {
  newState: PasteState;
  processedInput: string | null;
  shouldWaitForMore: boolean;
  isPasteStart: boolean; // True when paste operation is first detected
}

/**
 * Process a chunk of input that might be part of a bracketed paste operation.
 *
 * @param input - The raw input chunk from the terminal
 * @param currentState - The current paste buffer state
 * @returns Result containing new state, processed input, and whether to wait for more chunks
 */
export function processPasteChunk(input: string, currentState: PasteState): PasteResult {
  // Check if this is the start of a paste operation
  if (input?.startsWith(PASTE_START) || input?.startsWith(PASTE_START_STRICT)) {
    return handlePasteStart(input);
  }

  // Check if we're in the middle of a multi-chunk paste
  if (currentState.buffer !== null) {
    return handlePasteContinuation(input, currentState.buffer);
  }

  // Not a paste operation
  return {
    newState: currentState,
    processedInput: null,
    shouldWaitForMore: false,
    isPasteStart: false,
  };
}

/**
 * Handle the first chunk of a paste operation
 */
function handlePasteStart(input: string): PasteResult {
  const hasAnsiPrefix = input.startsWith(PASTE_START);
  const buffer = input.slice(hasAnsiPrefix ? PASTE_START.length : PASTE_START_STRICT.length);

  // Check if this chunk also contains the end marker (single-chunk paste)
  const endsWithPasteEnd = buffer.endsWith(PASTE_END) || buffer.endsWith(PASTE_END_STRICT);

  if (endsWithPasteEnd) {
    // Single-chunk paste - extract and process immediately
    const fullPaste = extractContent(buffer);
    const processedPaste = canonicalizeTerminalPaste(fullPaste);

    return {
      newState: { buffer: null },
      processedInput: processedPaste,
      shouldWaitForMore: false,
      isPasteStart: true, // This is the start of a paste
    };
  }

  // Multi-chunk paste - store buffer and wait for more
  return {
    newState: { buffer },
    processedInput: null,
    shouldWaitForMore: true,
    isPasteStart: true, // This is the start of a paste
  };
}

/**
 * Handle continuation chunks in a multi-chunk paste operation
 */
function handlePasteContinuation(input: string, currentBuffer: string): PasteResult {
  const newBuffer = currentBuffer + input;

  // Check if we received the end marker at the END of the accumulated buffer
  const endsWithPasteEnd = newBuffer.endsWith(PASTE_END) || newBuffer.endsWith(PASTE_END_STRICT);

  if (endsWithPasteEnd) {
    // Paste complete - extract and process
    const fullPaste = extractContent(newBuffer);
    const processedPaste = canonicalizeTerminalPaste(fullPaste);

    return {
      newState: { buffer: null },
      processedInput: processedPaste,
      shouldWaitForMore: false,
      isPasteStart: false, // This is continuation, not start
    };
  }

  // Still waiting for more chunks
  return {
    newState: { buffer: newBuffer },
    processedInput: null,
    shouldWaitForMore: true,
    isPasteStart: false, // This is continuation, not start
  };
}

/**
 * Extract content by removing the end marker from the buffer.
 * Uses endsWith + slice instead of replace to avoid removing markers in the content.
 */
function extractContent(buffer: string): string {
  if (buffer.endsWith(PASTE_END)) {
    return buffer.slice(0, -PASTE_END.length);
  }
  if (buffer.endsWith(PASTE_END_STRICT)) {
    return buffer.slice(0, -PASTE_END_STRICT.length);
  }
  return buffer;
}

/**
 * Create initial paste state
 */
export function createPasteState(): PasteState {
  return { buffer: null };
}
