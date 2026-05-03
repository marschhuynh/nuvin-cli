import { useCallback, useEffect, useRef, useState } from "react";
import { clampOffset } from "./textNavigation.js";
export function syncEditorStateFromExternalValue(current, externalValue, vimMode) {
    const nextCursorOffset = externalValue === "" ? 0 : clampOffset(externalValue.length, current.cursorOffset, vimMode);
    return {
        ...current,
        value: externalValue,
        cursorOffset: nextCursorOffset,
        cursorWidth: externalValue === "" ? 0 : current.cursorWidth,
    };
}
export function reconcileExternalValue(current, externalValue, vimMode, pendingEchoes) {
    const echoIndex = pendingEchoes.indexOf(externalValue);
    if (echoIndex !== -1) {
        return {
            nextState: null,
            nextPendingEchoes: pendingEchoes.slice(echoIndex + 1),
        };
    }
    if (externalValue === current.value) {
        return {
            nextState: null,
            nextPendingEchoes: pendingEchoes,
        };
    }
    return {
        nextState: syncEditorStateFromExternalValue(current, externalValue, vimMode),
        nextPendingEchoes: [],
    };
}
export function useEditorState({ initialValue, vimMode, onChange }) {
    const [state, setState] = useState({
        value: initialValue,
        cursorOffset: 0,
        cursorWidth: 0,
    });
    // stateRef is the single source of truth for input handling.
    // It's updated eagerly (synchronously) so rapid keystrokes between renders
    // always read the latest state. setState is called only to trigger re-renders.
    const stateRef = useRef(state);
    const lastExternalValue = useRef(initialValue);
    const hasSetInitialCursor = useRef(false);
    const pendingEchoesRef = useRef([]);
    useEffect(() => {
        if (initialValue !== lastExternalValue.current) {
            lastExternalValue.current = initialValue;
            const reconciliation = reconcileExternalValue(stateRef.current, initialValue, vimMode, pendingEchoesRef.current);
            pendingEchoesRef.current = reconciliation.nextPendingEchoes;
            if (reconciliation.nextState) {
                const next = reconciliation.nextState;
                stateRef.current = next;
                setState(next);
            }
            if (initialValue === "") {
                hasSetInitialCursor.current = false;
            }
        }
    }, [initialValue, vimMode]);
    const setValue = useCallback((value, offset, width = 0) => {
        const current = stateRef.current;
        const clampedOffset = clampOffset(value.length, offset, vimMode);
        if (value === current.value &&
            clampedOffset === current.cursorOffset &&
            width === current.cursorWidth) {
            return;
        }
        const next = { value, cursorOffset: clampedOffset, cursorWidth: width };
        stateRef.current = next;
        setState(next);
        if (value !== current.value) {
            pendingEchoesRef.current.push(value);
            if (pendingEchoesRef.current.length > 200) {
                pendingEchoesRef.current.shift();
            }
            onChange(value);
        }
    }, [vimMode, onChange]);
    const moveCursor = useCallback((offset) => {
        const current = stateRef.current;
        const clampedOffset = clampOffset(current.value.length, offset, vimMode);
        if (clampedOffset === current.cursorOffset) {
            return;
        }
        const next = { ...current, cursorOffset: clampedOffset, cursorWidth: 0 };
        stateRef.current = next;
        setState(next);
    }, [vimMode]);
    const reset = useCallback(() => {
        const next = { value: "", cursorOffset: 0, cursorWidth: 0 };
        stateRef.current = next;
        setState(next);
        pendingEchoesRef.current.push("");
        if (pendingEchoesRef.current.length > 200) {
            pendingEchoesRef.current.shift();
        }
        onChange("");
    }, [onChange]);
    const setInitialCursor = useCallback((focus) => {
        if (!hasSetInitialCursor.current &&
            focus &&
            stateRef.current.value &&
            stateRef.current.value.length > 0) {
            hasSetInitialCursor.current = true;
            const current = stateRef.current;
            const offset = Math.max(0, current.value.length);
            const clampedOffset = clampOffset(current.value.length, offset, vimMode);
            if (clampedOffset !== current.cursorOffset) {
                const next = { ...current, cursorOffset: clampedOffset, cursorWidth: 0 };
                stateRef.current = next;
                setState(next);
            }
        }
    }, [vimMode]);
    return {
        state,
        stateRef,
        setValue,
        moveCursor,
        reset,
        setInitialCursor,
    };
}
//# sourceMappingURL=useEditorState.js.map