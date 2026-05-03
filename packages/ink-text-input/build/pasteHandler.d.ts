export interface PasteState {
    buffer: string | null;
}
export interface PasteResult {
    newState: PasteState;
    processedInput: string | null;
    shouldWaitForMore: boolean;
    isPasteStart: boolean;
}
/**
 * Process a chunk of input that might be part of a bracketed paste operation.
 *
 * @param input - The raw input chunk from the terminal
 * @param currentState - The current paste buffer state
 * @returns Result containing new state, processed input, and whether to wait for more chunks
 */
export declare function processPasteChunk(input: string, currentState: PasteState): PasteResult;
/**
 * Create initial paste state
 */
export declare function createPasteState(): PasteState;
//# sourceMappingURL=pasteHandler.d.ts.map