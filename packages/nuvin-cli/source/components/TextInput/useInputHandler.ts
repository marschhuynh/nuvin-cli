import { useEffect, useRef, useCallback } from 'react';
import { useInput } from '@/contexts/InputContext/index.js';
import { moveCursorVertically, moveCursorVisually } from '@/utils/textNavigation.js';
import type { LineInfo } from '@/utils/textNavigation.js';
import type { EditorState } from './useEditorState.js';
import type { LineIndex } from './useLineIndex.js';
import { applyBackspace, applyDelete } from './editing.js';
import { isTextInputDebugEnabled, logTextInputDebug } from './debugLogger.js';
import { splitByVisualWidth } from './widthUtils.js';

type InputKey = Parameters<Parameters<typeof useInput>[0]>[1];

function formatInputForDebug(input: string): string {
  return input
    .replace(/\x1b/g, '<ESC>')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

export type UseInputHandlerOptions = {
  focus: boolean;
  showCursor: boolean;
  effectiveWidth: number;
  vimModeEnabled: boolean;
  vimMode: 'insert' | 'normal';
  editorState: EditorState;
  lineIndex: LineIndex;
  setValue: (value: string, offset: number, width?: number) => void;
  moveCursor: (offset: number) => void;
  setInitialCursor: (focus: boolean) => void;
  handleVimInput: (input: string, key: InputKey, value: string, cursorOffset: number) => {
    type: 'move-cursor' | 'set-value' | 'enter-insert-and-set-value' | 'enter-insert-mode' | 'submit' | 'none' | string;
    offset?: number;
    value?: string;
  };
  enterInsertMode: () => void;
  processPaste: (input: string) => { processedInput: string | null; shouldWaitForMore: boolean; isPasteStart: boolean };
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onUpArrow?: (lineInfo: LineInfo) => void;
  onDownArrow?: (lineInfo: LineInfo) => void;
  onTab?: (
    value: string,
    cursorOffset: number,
    isShiftTab: boolean,
  ) => { value: string; cursorOffset: number } | undefined;
};

export function useInputHandler({
  focus,
  showCursor,
  effectiveWidth,
  vimModeEnabled,
  vimMode,
  editorState,
  lineIndex,
  setValue,
  moveCursor,
  setInitialCursor,
  handleVimInput,
  enterInsertMode,
  processPaste,
  onChange,
  onSubmit,
  onUpArrow,
  onDownArrow,
  onTab,
}: UseInputHandlerOptions): void {
  const setValueRef = useRef(setValue);
  setValueRef.current = setValue;

  const moveCursorRef = useRef(moveCursor);
  moveCursorRef.current = moveCursor;

  const lineIndexRef = useRef(lineIndex);
  lineIndexRef.current = lineIndex;

  const getVisualRowStart = useCallback(
    (cursorOffset: number): number => {
      const lineInfo = lineIndexRef.current.getLineInfo(cursorOffset);
      if (effectiveWidth && effectiveWidth > 0) {
        const currentLine = lineInfo.lines[lineInfo.lineIndex] ?? '';
        const chunks = splitByVisualWidth(currentLine, effectiveWidth);
        for (const chunk of chunks) {
          if (lineInfo.column >= chunk.charStart && lineInfo.column < chunk.charEnd) {
            return lineInfo.lineStart + chunk.charStart;
          }
        }
        // Cursor at end of line — belongs to last chunk
        const lastChunk = chunks[chunks.length - 1];
        if (lastChunk) {
          return lineInfo.lineStart + lastChunk.charStart;
        }
      }
      return lineInfo.lineStart;
    },
    [effectiveWidth],
  );

  const getVisualRowEnd = useCallback(
    (cursorOffset: number): number => {
      const lineInfo = lineIndexRef.current.getLineInfo(cursorOffset);
      if (effectiveWidth && effectiveWidth > 0) {
        const currentLine = lineInfo.lines[lineInfo.lineIndex] ?? '';
        const chunks = splitByVisualWidth(currentLine, effectiveWidth);
        for (const chunk of chunks) {
          if (lineInfo.column >= chunk.charStart && lineInfo.column < chunk.charEnd) {
            return lineInfo.lineStart + chunk.charEnd;
          }
        }
        // Cursor at end of line — belongs to last chunk
        const lastChunk = chunks[chunks.length - 1];
        if (lastChunk) {
          return lineInfo.lineStart + lastChunk.charEnd;
        }
      }
      return lineInfo.lineEnd;
    },
    [effectiveWidth],
  );

  useEffect(() => {
    setInitialCursor(focus);
  }, [focus, setInitialCursor]);

  const handleInput = useCallback(
    (input: string, key: InputKey) => {
      if (isTextInputDebugEnabled) {
        logTextInputDebug('input event', {
          input: formatInputForDebug(input),
          inputLength: input.length,
          key,
          cursorOffset: editorState.cursorOffset,
          valueLength: editorState.value.length,
        });
      }

      const pasteResult = processPaste(input);

      if (isTextInputDebugEnabled) {
        logTextInputDebug('paste processing result', {
          shouldWaitForMore: pasteResult.shouldWaitForMore,
          isPasteStart: pasteResult.isPasteStart,
          processedInputLength: pasteResult.processedInput?.length ?? null,
          processedInputPreview: pasteResult.processedInput ? formatInputForDebug(pasteResult.processedInput.slice(0, 80)) : null,
        });
      }

      if (pasteResult.shouldWaitForMore) {
        if (isTextInputDebugEnabled) {
          logTextInputDebug('paste waiting for more chunks');
        }
        return true;
      }

      if (pasteResult.processedInput !== null) {
        if (isTextInputDebugEnabled) {
          logTextInputDebug('paste completed', {
            pastedLength: pasteResult.processedInput.length,
            pastedPreview: formatInputForDebug(pasteResult.processedInput.slice(0, 120)),
          });
        }
        input = pasteResult.processedInput;
      }

      const currentCursorOffset = editorState.cursorOffset;
      const currentValue = editorState.value;
      const vimAction = handleVimInput(input, key, currentValue, currentCursorOffset);

      if (vimAction.type === 'move-cursor' && vimAction.offset !== undefined) {
        moveCursorRef.current(vimAction.offset);
        return true;
      }

      if (vimAction.type === 'set-value' && vimAction.value !== undefined && vimAction.offset !== undefined) {
        setValueRef.current(vimAction.value, vimAction.offset);
        return true;
      }

      if (vimAction.type === 'enter-insert-and-set-value' && vimAction.value !== undefined && vimAction.offset !== undefined) {
        setValueRef.current(vimAction.value, vimAction.offset);
        enterInsertMode();
        return true;
      }

      if (vimAction.type === 'enter-insert-mode') {
        enterInsertMode();
        if (vimAction.offset !== undefined) {
          moveCursorRef.current(vimAction.offset);
        }
        return true;
      }

      if (vimAction.type === 'submit') {
        if (onSubmit) {
          onSubmit(currentValue);
        }
        return true;
      }

      if (vimAction.type !== 'none') {
        return true;
      }

      if (vimModeEnabled && vimMode === 'normal') {
        return true;
      }

      if (key.escape) {
        return;
      }

      if (key.meta && input === '\u0003') {
        onChange('copied');
        return true;
      }

      if (key.ctrl) {
        if (input === 'a' && showCursor) {
          moveCursorRef.current(getVisualRowStart(currentCursorOffset));
          return true;
        }
        if (input === 'e' && showCursor) {
          moveCursorRef.current(getVisualRowEnd(currentCursorOffset));
          return true;
        }
        return;
      }

      if (key.tab || (key.shift && key.tab)) {
        if (onTab) {
          const result = onTab(currentValue, currentCursorOffset, key.shift === true);
          if (result) {
            setValueRef.current(result.value, result.cursorOffset);
          }
          return true;
        }
        return;
      }

      if (key.return) {
        if (key.shift) {
          const nextValue = `${currentValue.slice(0, currentCursorOffset)}\n${currentValue.slice(currentCursorOffset)}`;
          const nextCursorOffset = currentCursorOffset + 1;
          if (isTextInputDebugEnabled) {
            logTextInputDebug('shift+enter inserted newline', {
              previousValueLength: currentValue.length,
              nextValueLength: nextValue.length,
              previousCursorOffset: currentCursorOffset,
              nextCursorOffset,
            });
          }
          setValueRef.current(nextValue, nextCursorOffset);
          return true;
        }
        if (onSubmit) {
          if (isTextInputDebugEnabled) {
            logTextInputDebug('submit triggered from return key', {
              valueLength: currentValue.length,
              cursorOffset: currentCursorOffset,
            });
          }
          onSubmit(currentValue);
        }
        return true;
      }

      if (key.leftArrow) {
        if (showCursor) {
          if (key.meta) {
            moveCursorRef.current(getVisualRowStart(currentCursorOffset));
          } else {
            moveCursorRef.current(currentCursorOffset - 1);
          }
        }
        return true;
      } else if (key.rightArrow) {
        if (showCursor) {
          if (key.meta) {
            moveCursorRef.current(getVisualRowEnd(currentCursorOffset));
          } else {
            moveCursorRef.current(currentCursorOffset + 1);
          }
        }
        return true;
      } else if (key.home) {
        if (showCursor) {
          moveCursorRef.current(getVisualRowStart(currentCursorOffset));
        }
        return true;
      } else if (key.end) {
        if (showCursor) {
          moveCursorRef.current(getVisualRowEnd(currentCursorOffset));
        }
        return true;
      } else if (key.upArrow) {
        if (!showCursor) {
          return true;
        }
        const lineInfo = lineIndexRef.current.getLineInfo(currentCursorOffset);

        // Check if we're at the visual top (first row of first line)
        const isAtVisualTop = lineInfo.lineIndex === 0 && (() => {
          if (!effectiveWidth || effectiveWidth <= 0) return true;
          const currentLine = lineInfo.lines[lineInfo.lineIndex] ?? '';
          const chunks = splitByVisualWidth(currentLine, effectiveWidth);
          return lineInfo.column < (chunks[0]?.charEnd ?? effectiveWidth);
        })();

        if (onUpArrow && isAtVisualTop) {
          onUpArrow(lineInfo);
          return true;
        }

        const target =
          effectiveWidth && effectiveWidth > 0
            ? moveCursorVisually(currentValue, currentCursorOffset, 'up', effectiveWidth)
            : moveCursorVertically(currentValue, currentCursorOffset, 'up');
        if (target !== null) {
          moveCursorRef.current(target);
        }
        return true;
      } else if (key.downArrow) {
        if (!showCursor) {
          return true;
        }
        const lineInfo = lineIndexRef.current.getLineInfo(currentCursorOffset);
        const currentLine = lineInfo.lines[lineInfo.lineIndex] ?? '';
        const lastLineIndex = lineInfo.lines.length - 1;

        // Check if we're at the visual bottom (last row of last line)
        const isAtVisualBottom = (() => {
          if (lineInfo.lineIndex !== lastLineIndex) return false;
          if (!effectiveWidth || effectiveWidth <= 0) return true;
          const chunks = splitByVisualWidth(currentLine, effectiveWidth);
          const lastChunk = chunks[chunks.length - 1];
          return lastChunk ? lineInfo.column >= lastChunk.charStart : true;
        })();

        if (onDownArrow && isAtVisualBottom) {
          onDownArrow(lineInfo);
          return true;
        }

        const target =
          effectiveWidth && effectiveWidth > 0
            ? moveCursorVisually(currentValue, currentCursorOffset, 'down', effectiveWidth)
            : moveCursorVertically(currentValue, currentCursorOffset, 'down');
        if (target !== null) {
          moveCursorRef.current(target);
        }
        return true;
      } else if (key.backspace) {
        const nextState = applyBackspace(currentValue, currentCursorOffset);
        if (nextState) {
          setValueRef.current(nextState.value, nextState.cursorOffset);
        }
        return true;
      } else if (key.delete) {
        const nextState = applyDelete(currentValue, currentCursorOffset);
        if (nextState) {
          setValueRef.current(nextState.value, nextState.cursorOffset);
        }
        return true;
      } else {
        const nextValue =
          currentValue.slice(0, currentCursorOffset) +
          input +
          currentValue.slice(currentCursorOffset, currentValue.length);
        const nextCursorOffset = currentCursorOffset + input.length;
        const nextCursorWidth = input.length > 1 ? input.length : 0;

        if (isTextInputDebugEnabled) {
          logTextInputDebug('text inserted', {
            insertedInput: formatInputForDebug(input),
            insertedLength: input.length,
            previousValueLength: currentValue.length,
            nextValueLength: nextValue.length,
            previousCursorOffset: currentCursorOffset,
            nextCursorOffset,
          });
        }

        setValueRef.current(nextValue, nextCursorOffset, nextCursorWidth);
        return true;
      }
    },
    [
      editorState,
      processPaste,
      handleVimInput,
      enterInsertMode,
      onSubmit,
      onUpArrow,
      onDownArrow,
      showCursor,
      vimModeEnabled,
      vimMode,
      onChange,
      effectiveWidth,
      getVisualRowStart,
      getVisualRowEnd,
      onTab,
    ],
  );

  useInput(handleInput, { isActive: focus });
}
