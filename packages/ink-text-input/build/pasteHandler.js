const PASTE_START = "\x1b[200~";
const PASTE_START_STRICT = "[200~";
const PASTE_END = "\x1b[201~";
const PASTE_END_STRICT = "[201~";
function normalizeNewlines(s) {
    return s.replace(/\r\n?/g, "\n");
}
function resolveCarriageReturns(s) {
    return s
        .split("\n")
        .map((line) => {
        if (line.includes("\r")) {
            const parts = line.split("\r");
            return parts[parts.length - 1] ?? "";
        }
        return line;
    })
        .join("\n");
}
function resolveBackspaces(s) {
    const codepoints = Array.from(s);
    const out = [];
    for (const cp of codepoints) {
        if (cp === "\b") {
            out.pop();
        }
        else {
            out.push(cp);
        }
    }
    return out.join("");
}
function canonicalizeTerminalPaste(raw) {
    let s = normalizeNewlines(raw);
    s = resolveCarriageReturns(s);
    s = resolveBackspaces(s);
    return s;
}
/**
 * Process a chunk of input that might be part of a bracketed paste operation.
 *
 * @param input - The raw input chunk from the terminal
 * @param currentState - The current paste buffer state
 * @returns Result containing new state, processed input, and whether to wait for more chunks
 */
export function processPasteChunk(input, currentState) {
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
function handlePasteStart(input) {
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
function handlePasteContinuation(input, currentBuffer) {
    const newBuffer = currentBuffer + input;
    // Check for end marker at the end of the accumulated buffer
    const endsWithPasteEnd = newBuffer.endsWith(PASTE_END) || newBuffer.endsWith(PASTE_END_STRICT);
    if (endsWithPasteEnd) {
        // Paste complete - extract and process
        const fullPaste = extractContent(newBuffer);
        const processedPaste = canonicalizeTerminalPaste(fullPaste);
        return {
            newState: { buffer: null },
            processedInput: processedPaste,
            shouldWaitForMore: false,
            isPasteStart: false,
        };
    }
    // Check for end marker anywhere in the buffer (can happen when parseKeypress
    // passes through chunks containing both paste data and the end marker)
    const endIdx = newBuffer.indexOf(PASTE_END);
    const endStrictIdx = newBuffer.indexOf(PASTE_END_STRICT);
    const foundIdx = endIdx !== -1 ? endIdx : endStrictIdx;
    if (foundIdx !== -1) {
        const fullPaste = newBuffer.slice(0, foundIdx);
        const processedPaste = canonicalizeTerminalPaste(fullPaste);
        return {
            newState: { buffer: null },
            processedInput: processedPaste,
            shouldWaitForMore: false,
            isPasteStart: false,
        };
    }
    // Still waiting for more chunks
    return {
        newState: { buffer: newBuffer },
        processedInput: null,
        shouldWaitForMore: true,
        isPasteStart: false,
    };
}
/**
 * Extract content by removing the end marker from the buffer.
 * Uses endsWith + slice instead of replace to avoid removing markers in the content.
 */
function extractContent(buffer) {
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
export function createPasteState() {
    return { buffer: null };
}
//# sourceMappingURL=pasteHandler.js.map