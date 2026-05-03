import { useCallback, useEffect, useRef } from "react";
import { createPasteState, processPasteChunk } from "./pasteHandler.js";
const PASTE_TIMEOUT_MS = 2000;
export function usePaste() {
    const pasteStateRef = useRef(createPasteState());
    const pasteTimerRef = useRef(null);
    useEffect(() => {
        return () => {
            if (pasteTimerRef.current) {
                clearTimeout(pasteTimerRef.current);
                pasteTimerRef.current = null;
            }
        };
    }, []);
    const processPaste = useCallback((input) => {
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
    }, []);
    return { processPaste };
}
//# sourceMappingURL=usePaste.js.map