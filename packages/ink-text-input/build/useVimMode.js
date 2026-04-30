import { useCallback, useEffect, useRef, useState } from "react";
import { applyBackspace, applyDelete } from "./editing.js";
import { findNextWordEnd, getLineInfo, moveCursorVertically, } from "./textNavigation.js";
export function useVimMode({ enabled, onModeChange }) {
    const [mode, setMode] = useState("insert");
    const [pendingCommand, setPendingCommand] = useState(null);
    const previousEnabledRef = useRef(false);
    const updateMode = useCallback((newMode) => {
        setMode(newMode);
        onModeChange?.(newMode);
    }, [onModeChange]);
    useEffect(() => {
        if (enabled) {
            if (!previousEnabledRef.current) {
                updateMode("normal");
            }
        }
        else if (previousEnabledRef.current) {
            updateMode("insert");
        }
        previousEnabledRef.current = enabled;
    }, [enabled, updateMode]);
    const enterInsertMode = useCallback(() => {
        updateMode("insert");
        setPendingCommand(null);
    }, [updateMode]);
    const enterNormalMode = useCallback(() => {
        updateMode("normal");
        setPendingCommand(null);
    }, [updateMode]);
    const handleVimInput = useCallback((input, key, value, cursorOffset) => {
        if (!enabled) {
            return { type: "none" };
        }
        if (mode === "insert") {
            if (key.escape) {
                enterNormalMode();
                return { type: "none" };
            }
            return { type: "none" };
        }
        if (key.return) {
            return { type: "submit" };
        }
        if (key.escape) {
            setPendingCommand(null);
            return { type: "none" };
        }
        if (key.leftArrow) {
            return { type: "move-cursor", offset: cursorOffset - 1 };
        }
        if (key.rightArrow) {
            return { type: "move-cursor", offset: cursorOffset + 1 };
        }
        if (key.upArrow) {
            const nextOffset = moveCursorVertically(value, cursorOffset, "up");
            if (nextOffset !== null) {
                return { type: "move-cursor", offset: nextOffset };
            }
            return { type: "none" };
        }
        if (key.downArrow) {
            const nextOffset = moveCursorVertically(value, cursorOffset, "down");
            if (nextOffset !== null) {
                return { type: "move-cursor", offset: nextOffset };
            }
            return { type: "none" };
        }
        if (key.backspace) {
            const nextState = applyBackspace(value, cursorOffset);
            if (!nextState) {
                return { type: "none" };
            }
            return { type: "set-value", value: nextState.value, offset: nextState.cursorOffset };
        }
        if (key.delete) {
            const nextState = applyDelete(value, cursorOffset);
            if (!nextState) {
                return { type: "none" };
            }
            return { type: "set-value", value: nextState.value, offset: nextState.cursorOffset };
        }
        if (input.length > 1) {
            return { type: "none" };
        }
        if (pendingCommand) {
            if (pendingCommand === "d") {
                if (input === "d") {
                    const info = getLineInfo(value, cursorOffset);
                    const lineStart = info.lineStart;
                    const lineEnd = info.lineEnd;
                    let newValue;
                    let nextOffset;
                    if (info.lines.length === 1) {
                        newValue = "";
                        nextOffset = 0;
                    }
                    else if (info.lineIndex === info.lines.length - 1) {
                        newValue = value.slice(0, Math.max(0, lineStart - 1));
                        nextOffset = Math.max(0, lineStart - 1);
                    }
                    else {
                        newValue = value.slice(0, lineStart) + value.slice(lineEnd + 1);
                        nextOffset = lineStart;
                    }
                    setPendingCommand(null);
                    return { type: "set-value", value: newValue, offset: nextOffset };
                }
                else if (input === "w") {
                    const wordEnd = findNextWordEnd(value, cursorOffset);
                    const newValue = value.slice(0, cursorOffset) + value.slice(wordEnd);
                    const nextOffset = Math.min(cursorOffset, Math.max(0, newValue.length - 1));
                    setPendingCommand(null);
                    return { type: "set-value", value: newValue, offset: nextOffset };
                }
            }
            else if (pendingCommand === "g") {
                if (input === "g") {
                    setPendingCommand(null);
                    return { type: "move-cursor", offset: 0 };
                }
            }
            setPendingCommand(null);
            return { type: "none" };
        }
        switch (input) {
            case "h":
                return { type: "move-cursor", offset: cursorOffset - 1 };
            case "l":
                return { type: "move-cursor", offset: cursorOffset + 1 };
            case "j": {
                const nextOffset = moveCursorVertically(value, cursorOffset, "down");
                if (nextOffset !== null) {
                    return { type: "move-cursor", offset: nextOffset };
                }
                return { type: "none" };
            }
            case "k": {
                const nextOffset = moveCursorVertically(value, cursorOffset, "up");
                if (nextOffset !== null) {
                    return { type: "move-cursor", offset: nextOffset };
                }
                return { type: "none" };
            }
            case "i":
                enterInsertMode();
                return { type: "none" };
            case "a":
                return { type: "enter-insert-mode", offset: cursorOffset + 1 };
            case "A": {
                const info = getLineInfo(value, cursorOffset);
                return { type: "enter-insert-mode", offset: info.lineEnd };
            }
            case "I": {
                const info = getLineInfo(value, cursorOffset);
                return { type: "enter-insert-mode", offset: info.lineStart };
            }
            case "o": {
                const info = getLineInfo(value, cursorOffset);
                const insertPos = info.lineEnd;
                const newValue = `${value.slice(0, insertPos)}\n${value.slice(insertPos)}`;
                return { type: "enter-insert-and-set-value", value: newValue, offset: insertPos + 1 };
            }
            case "O": {
                const info = getLineInfo(value, cursorOffset);
                const insertPos = info.lineStart;
                const newValue = `${value.slice(0, insertPos)}\n${value.slice(insertPos)}`;
                return { type: "enter-insert-and-set-value", value: newValue, offset: insertPos };
            }
            case "x": {
                if (value.length === 0 || cursorOffset >= value.length) {
                    return { type: "none" };
                }
                const deleteIndex = cursorOffset;
                const newValue = value.slice(0, deleteIndex) + value.slice(deleteIndex + 1);
                const nextOffset = newValue.length === 0 ? 0 : Math.min(deleteIndex, newValue.length - 1);
                return { type: "set-value", value: newValue, offset: nextOffset };
            }
            case "s": {
                if (value.length === 0) {
                    enterInsertMode();
                    return { type: "none" };
                }
                const deleteIndex = cursorOffset >= value.length ? Math.max(0, value.length - 1) : cursorOffset;
                const newValue = value.slice(0, deleteIndex) + value.slice(deleteIndex + 1);
                return { type: "enter-insert-and-set-value", value: newValue, offset: deleteIndex };
            }
            case "0": {
                const info = getLineInfo(value, cursorOffset);
                return { type: "move-cursor", offset: info.lineStart };
            }
            case "$": {
                const info = getLineInfo(value, cursorOffset);
                const hasContent = info.lineEnd > info.lineStart;
                const target = hasContent ? info.lineEnd - 1 : info.lineStart;
                return { type: "move-cursor", offset: target };
            }
            case "^": {
                const info = getLineInfo(value, cursorOffset);
                const line = info.lines[info.lineIndex] ?? "";
                let firstNonWhitespace = 0;
                for (let i = 0; i < line.length; i++) {
                    if (!/\s/.test(line[i] ?? "")) {
                        firstNonWhitespace = i;
                        break;
                    }
                }
                return { type: "move-cursor", offset: info.lineStart + firstNonWhitespace };
            }
            case "d":
                setPendingCommand("d");
                return { type: "none" };
            case "g":
                setPendingCommand("g");
                return { type: "none" };
            case "G": {
                const info = getLineInfo(value, cursorOffset);
                const lastLineIndex = info.lines.length - 1;
                let lastLineStart = 0;
                for (let i = 0; i < lastLineIndex; i++) {
                    lastLineStart += (info.lines[i] ?? "").length + 1;
                }
                return { type: "move-cursor", offset: lastLineStart };
            }
            case "/": {
                const newValue = `${value.slice(0, cursorOffset)}/${value.slice(cursorOffset)}`;
                return { type: "enter-insert-and-set-value", value: newValue, offset: cursorOffset + 1 };
            }
            case " ":
                return { type: "move-cursor", offset: cursorOffset + 1 };
        }
        if (/^[0-9]$/.test(input)) {
            return { type: "none" };
        }
        return { type: "none" };
    }, [enabled, mode, pendingCommand, enterInsertMode, enterNormalMode]);
    return {
        mode,
        handleVimInput,
        enterInsertMode,
        enterNormalMode,
    };
}
//# sourceMappingURL=useVimMode.js.map