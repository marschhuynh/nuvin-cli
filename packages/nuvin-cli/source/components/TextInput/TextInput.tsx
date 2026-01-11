import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Box, Text, measureElement } from 'ink';
import type { Except } from 'type-fest';
import { useInput } from '@/contexts/InputContext/index.js';
import { moveCursorVertically, getLineInfo } from '@/utils/textNavigation.js';
import type { LineInfo } from '@/utils/textNavigation.js';

export type { LineInfo };
import { useVimMode } from './useVimMode.js';
import { usePaste } from './usePaste.js';
import { useCursorRenderer } from './useCursorRenderer.js';
import { useEditorState } from './useEditorState.js';
import { useViewport } from './useViewport.js';

export type Props = {
  readonly placeholder?: string;
  readonly focus?: boolean;
  readonly mask?: string;
  readonly showCursor?: boolean;
  readonly highlightPastedText?: boolean;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit?: (value: string) => void;
  readonly vimModeEnabled?: boolean;
  readonly onVimModeChange?: (mode: 'insert' | 'normal') => void;
  readonly onUpArrow?: (lineInfo: LineInfo) => void;
  readonly onDownArrow?: (lineInfo: LineInfo) => void;
  readonly maxHeight?: number;
  readonly scrollable?: boolean;
};

function TextInput({
  value: originalValue,
  placeholder = '',
  focus = true,
  mask,
  showCursor = true,
  onChange,
  onSubmit,
  vimModeEnabled = false,
  onVimModeChange,
  onUpArrow,
  onDownArrow,
  maxHeight: maxHeightProp,
  scrollable = false,
}: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const containerNodeRef = useRef<any>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!scrollable || maxHeightProp) return;

    const measureContainer = () => {
      if (containerNodeRef.current) {
        try {
          const { height } = measureElement(containerNodeRef.current);
          if (height > 0 && height !== measuredHeight) {
            setMeasuredHeight(height);
          }
        } catch {
          // Element not ready for measurement
        }
      }
    };

    measureContainer();
    const interval = setInterval(measureContainer, 100);
    return () => clearInterval(interval);
  }, [scrollable, maxHeightProp, measuredHeight]);

  const maxHeight = maxHeightProp ?? (scrollable ? measuredHeight : undefined);

  const {
    mode: vimMode,
    handleVimInput,
    enterInsertMode,
  } = useVimMode({
    enabled: vimModeEnabled,
    onModeChange: onVimModeChange,
  });

  const {
    state: editorState,
    setValue,
    moveCursor,
    setInitialCursor,
  } = useEditorState({
    initialValue: originalValue,
    vimMode,
    onChange,
  });

  const { processPaste } = usePaste();
  const { renderWithCursor } = useCursorRenderer();

  const { getVisibleContent, hasScrolling } = useViewport({
    value: editorState.value,
    cursorOffset: editorState.cursorOffset,
    maxHeight,
  });

  // Use refs to access current state in callbacks without recreating them
  const editorStateRef = useRef(editorState);
  editorStateRef.current = editorState;

  const setValueRef = useRef(setValue);
  setValueRef.current = setValue;

  const moveCursorRef = useRef(moveCursor);
  moveCursorRef.current = moveCursor;

  useEffect(() => {
    setInitialCursor(focus);
  }, [focus, setInitialCursor]);

  // Stable input handler using refs for current state
  const handleInput = useCallback(
    (input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) => {
      const pasteResult = processPaste(input);

      if (pasteResult.shouldWaitForMore) {
        return true;
      }

      if (pasteResult.processedInput !== null) {
        input = pasteResult.processedInput;
      }

      const currentCursorOffset = editorStateRef.current.cursorOffset;
      const currentValue = editorStateRef.current.value;
      const vimAction = handleVimInput(input, key, currentValue, currentCursorOffset);

      if (vimAction.type === 'move-cursor') {
        moveCursorRef.current(vimAction.offset);
        return true;
      }

      if (vimAction.type === 'set-value') {
        setValueRef.current(vimAction.value, vimAction.offset);
        return true;
      }

      if (vimAction.type === 'enter-insert-and-set-value') {
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
        return;
      }

      if (key.tab || (key.shift && key.tab)) {
        return;
      }

      if (key.return) {
        if (onSubmit) {
          onSubmit(currentValue);
        }
        return true;
      }

      if (key.leftArrow) {
        if (showCursor) {
          if (key.meta) {
            const lineInfo = getLineInfo(currentValue, currentCursorOffset);
            moveCursorRef.current(lineInfo.lineStart);
          } else {
            moveCursorRef.current(currentCursorOffset - 1);
          }
        }
        return true;
      } else if (key.rightArrow) {
        if (showCursor) {
          if (key.meta) {
            const lineInfo = getLineInfo(currentValue, currentCursorOffset);
            moveCursorRef.current(lineInfo.lineEnd);
          } else {
            moveCursorRef.current(currentCursorOffset + 1);
          }
        }
        return true;
      } else if (key.home) {
        if (showCursor) {
          const lineInfo = getLineInfo(currentValue, currentCursorOffset);
          moveCursorRef.current(lineInfo.lineStart);
        }
        return true;
      } else if (key.end) {
        if (showCursor) {
          const lineInfo = getLineInfo(currentValue, currentCursorOffset);
          moveCursorRef.current(lineInfo.lineEnd);
        }
        return true;
      } else if (key.upArrow) {
        if (!showCursor) {
          return true;
        }
        const lineInfo = getLineInfo(currentValue, currentCursorOffset);
        if (onUpArrow) {
          onUpArrow(lineInfo);
          if (lineInfo.lineIndex === 0) {
            return true;
          }
        }
        const target = moveCursorVertically(currentValue, currentCursorOffset, 'up');
        if (target !== null) {
          moveCursorRef.current(target);
        }
        return true;
      } else if (key.downArrow) {
        if (!showCursor) {
          return true;
        }
        const lineInfo = getLineInfo(currentValue, currentCursorOffset);
        if (onDownArrow) {
          onDownArrow(lineInfo);
          if (lineInfo.lineIndex === lineInfo.lines.length - 1) {
            return true;
          }
        }
        const target = moveCursorVertically(currentValue, currentCursorOffset, 'down');
        if (target !== null) {
          moveCursorRef.current(target);
        }
        return true;
      } else if (key.backspace || key.delete) {
        if (currentCursorOffset > 0) {
          const nextValue =
            currentValue.slice(0, currentCursorOffset - 1) +
            currentValue.slice(currentCursorOffset, currentValue.length);
          const nextCursorOffset = currentCursorOffset - 1;
          setValueRef.current(nextValue, nextCursorOffset);
        }
        return true;
      } else {
        const nextValue =
          currentValue.slice(0, currentCursorOffset) +
          input +
          currentValue.slice(currentCursorOffset, currentValue.length);
        const nextCursorOffset = currentCursorOffset + input.length;
        const nextCursorWidth = input.length > 1 ? input.length : 0;

        setValueRef.current(nextValue, nextCursorOffset, nextCursorWidth);
        return true;
      }
    },
    [
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
    ],
  );

  useInput(handleInput, { isActive: focus });

  const value = mask ? mask.repeat(editorState.value.length) : editorState.value;

  if (maxHeight && hasScrolling) {
    const {
      visibleValue,
      cursorOffsetInView,
      showTopIndicator,
      showBottomIndicator,
      linesAbove,
      linesBelow,
    } = getVisibleContent();
    const maskedVisibleValue = mask ? mask.repeat(visibleValue.length) : visibleValue;
    const { renderedValue, renderedPlaceholder } = renderWithCursor(
      maskedVisibleValue,
      cursorOffsetInView,
      placeholder,
      showCursor,
      focus,
    );

    return (
      <Box ref={containerNodeRef} flexDirection="column" height={maxHeightProp ?? undefined} flexGrow={scrollable ? 1 : undefined}>
        {showTopIndicator && (
          <Box>
            <Text dimColor>↑ {linesAbove} more line{linesAbove !== 1 ? 's' : ''} above</Text>
          </Box>
        )}
        <Box flexDirection="column" flexGrow={1} overflow='hidden'>
          <Text>{placeholder ? (visibleValue.length > 0 ? renderedValue : renderedPlaceholder) : renderedValue}</Text>
        </Box>
        {showBottomIndicator && (
          <Box>
            <Text dimColor>↓ {linesBelow} more line{linesBelow !== 1 ? 's' : ''} below</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (scrollable && !maxHeight) {
    const { renderedValue, renderedPlaceholder } = renderWithCursor(
      value,
      editorState.cursorOffset,
      placeholder,
      showCursor,
      focus,
    );

    return (
      <Box ref={containerNodeRef} flexDirection="column" flexGrow={1}>
        <Text>{placeholder ? (value.length > 0 ? renderedValue : renderedPlaceholder) : renderedValue}</Text>
      </Box>
    );
  }

  const { renderedValue, renderedPlaceholder } = renderWithCursor(
    value,
    editorState.cursorOffset,
    placeholder,
    showCursor,
    focus,
  );

  return <Text>{placeholder ? (value.length > 0 ? renderedValue : renderedPlaceholder) : renderedValue}</Text>;
}

export default TextInput;

type UncontrolledProps = {
  readonly initialValue?: string;
} & Except<Props, 'value' | 'onChange'>;

export function UncontrolledTextInput({ initialValue = '', ...props }: UncontrolledProps) {
  const [value, setValue] = React.useState(initialValue);
  return <TextInput {...props} value={value} onChange={setValue} />;
}
