import React, { useEffect, useRef, useCallback, useState, useMemo, useLayoutEffect } from 'react';
import { Box, Text, type BoxRef, measureElement } from 'ink';
import type { Except } from 'type-fest';
import { useInput } from '@/contexts/InputContext/index.js';
import { moveCursorVertically, moveCursorVisually } from '@/utils/textNavigation.js';
import type { LineInfo } from '@/utils/textNavigation.js';

export type { LineInfo };
import { useVimMode } from './useVimMode.js';
import { usePaste } from './usePaste.js';
import { useEditorState } from './useEditorState.js';
import { useLineIndex } from './useLineIndex.js';
import { TextInputScrollbar } from './TextInputScrollbar.js';
import { useCursorBlink } from './useCursorBlink.js';

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
  readonly maxLines?: number;
  readonly showScrollbar?: boolean;
  readonly scrollbarColor?: string;
  readonly scrollbarTrackColor?: string;
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
  maxLines,
  showScrollbar = true,
  scrollbarColor,
  scrollbarTrackColor,
}: Props) {
  const boxRef = useRef<BoxRef>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [containerWidth, setContainerWidth] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (boxRef.current) {
      try {
        const { width } = measureElement(boxRef.current);
        if (width > 0 && (containerWidth === undefined || width > containerWidth)) {
          setContainerWidth(width);
        }
      } catch {
        // Element not ready
      }
    }
  });

  const effectiveWidth = useMemo(() => {
    if (!containerWidth) return undefined;
    const scrollbarWidth = showScrollbar && maxLines !== undefined ? 1 : 0;
    return Math.max(1, containerWidth - scrollbarWidth - 2);
  }, [containerWidth, showScrollbar, maxLines]);

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

  const lineIndex = useLineIndex(editorState.value);
  const cursorVisible = useCursorBlink(editorState.value, editorState.cursorOffset);

  const lines = useMemo(() => {
    const value = mask ? mask.repeat(editorState.value.length) : editorState.value;
    return value.split('\n');
  }, [editorState.value, mask]);

  const visualRows = useMemo(() => {
    // Only split into visual rows when scrolling is needed
    // Otherwise let Text wrap naturally
    if (!effectiveWidth || effectiveWidth <= 0 || maxLines === undefined) {
      return lines.map((line, logicalIndex) => ({
        text: line,
        logicalLine: logicalIndex,
        startCol: 0,
        endCol: line.length,
        isFullLine: true,
      }));
    }

    const rows: Array<{
      text: string;
      logicalLine: number;
      startCol: number;
      endCol: number;
      isFullLine: boolean;
    }> = [];

    for (let logicalIndex = 0; logicalIndex < lines.length; logicalIndex++) {
      const line = lines[logicalIndex] ?? '';
      if (line.length === 0) {
        rows.push({
          text: '',
          logicalLine: logicalIndex,
          startCol: 0,
          endCol: 0,
          isFullLine: true,
        });
      } else {
        for (let i = 0; i < line.length; i += effectiveWidth) {
          rows.push({
            text: line.slice(i, i + effectiveWidth),
            logicalLine: logicalIndex,
            startCol: i,
            endCol: Math.min(i + effectiveWidth, line.length),
            isFullLine: false,
          });
        }
      }
    }

    return rows;
  }, [lines, effectiveWidth, maxLines]);

  const cursorInfo = useMemo(() => {
    const info = lineIndex.getLineInfo(editorState.cursorOffset);
    const logicalRow = info.lineIndex;
    const logicalCol = info.column;

    // When not scrolling, use logical positions (Text wraps naturally)
    if (!effectiveWidth || effectiveWidth <= 0 || maxLines === undefined) {
      return {
        row: logicalRow,
        col: logicalCol,
        visualRow: logicalRow,
        visualCol: logicalCol,
      };
    }

    let visualRow = 0;
    for (let i = 0; i < logicalRow; i++) {
      const lineLen = lines[i]?.length ?? 0;
      visualRow += Math.max(1, Math.ceil(lineLen / effectiveWidth));
    }

    const currentLineLen = lines[logicalRow]?.length ?? 0;
    const wrappedRowsBeforeCursor = currentLineLen > 0
      ? Math.floor(logicalCol / effectiveWidth)
      : 0;
    visualRow += wrappedRowsBeforeCursor;
    const visualCol = currentLineLen > 0
      ? logicalCol % effectiveWidth
      : logicalCol;

    return {
      row: logicalRow,
      col: logicalCol,
      visualRow,
      visualCol,
    };
  }, [lineIndex, editorState.cursorOffset, effectiveWidth, lines, maxLines]);

  const visualLineCount = visualRows.length;
  const hasScrolling = maxLines !== undefined && visualLineCount > maxLines;
  const visibleLines = maxLines ?? visualLineCount;

  useEffect(() => {
    if (!hasScrolling) {
      if (scrollOffset !== 0) {
        setScrollOffset(0);
      }
      return;
    }

    if (!boxRef.current) return;

    const { visualRow } = cursorInfo;
    const maxScroll = Math.max(0, visualLineCount - visibleLines);

    if (visualRow < scrollOffset) {
      const newOffset = Math.max(0, visualRow);
      setScrollOffset(newOffset);
      boxRef.current.scrollTo({ y: newOffset });
    } else if (visualRow >= scrollOffset + visibleLines) {
      const newOffset = Math.min(maxScroll, visualRow - visibleLines + 1);
      setScrollOffset(newOffset);
      boxRef.current.scrollTo({ y: newOffset });
    } else if (scrollOffset > maxScroll) {
      setScrollOffset(maxScroll);
      boxRef.current.scrollTo({ y: maxScroll });
    }
  }, [cursorInfo, hasScrolling, scrollOffset, visibleLines, visualLineCount]);

  const scrollRatio = useMemo(() => {
    if (!hasScrolling || visualLineCount <= visibleLines) return 0;
    const maxScroll = visualLineCount - visibleLines;
    return maxScroll > 0 ? scrollOffset / maxScroll : 0;
  }, [hasScrolling, visualLineCount, visibleLines, scrollOffset]);

  const visibleRatio = useMemo(() => {
    if (visualLineCount === 0) return 1;
    return Math.min(1, visibleLines / visualLineCount);
  }, [visualLineCount, visibleLines]);

  const editorStateRef = useRef(editorState);
  editorStateRef.current = editorState;

  const setValueRef = useRef(setValue);
  setValueRef.current = setValue;

  const moveCursorRef = useRef(moveCursor);
  moveCursorRef.current = moveCursor;

  const lineIndexRef = useRef(lineIndex);
  lineIndexRef.current = lineIndex;

  const getVisualRowStart = useCallback((cursorOffset: number): number => {
    const lineInfo = lineIndexRef.current.getLineInfo(cursorOffset);
    if (effectiveWidth && effectiveWidth > 0) {
      const visualRowStart = Math.floor(lineInfo.column / effectiveWidth) * effectiveWidth;
      return lineInfo.lineStart + visualRowStart;
    }
    return lineInfo.lineStart;
  }, [effectiveWidth]);

  const getVisualRowEnd = useCallback((cursorOffset: number): number => {
    const lineInfo = lineIndexRef.current.getLineInfo(cursorOffset);
    if (effectiveWidth && effectiveWidth > 0) {
      const currentLine = lineInfo.lines[lineInfo.lineIndex] ?? '';
      const visualRowStart = Math.floor(lineInfo.column / effectiveWidth) * effectiveWidth;
      const visualRowEnd = Math.min(visualRowStart + effectiveWidth - 1, currentLine.length);
      return lineInfo.lineStart + visualRowEnd;
    }
    return lineInfo.lineEnd;
  }, [effectiveWidth]);

  useEffect(() => {
    setInitialCursor(focus);
  }, [focus, setInitialCursor]);

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
        return;
      }

      if (key.return) {
        if (key.shift) {
          const nextValue =
            currentValue.slice(0, currentCursorOffset) +
            '\n' +
            currentValue.slice(currentCursorOffset);
          const nextCursorOffset = currentCursorOffset + 1;
          setValueRef.current(nextValue, nextCursorOffset);
          return true;
        }
        if (onSubmit) {
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
        const isAtVisualTop = lineInfo.lineIndex === 0 &&
          (!effectiveWidth || lineInfo.column < effectiveWidth);

        if (onUpArrow && isAtVisualTop) {
          onUpArrow(lineInfo);
          return true;
        }

        const target = effectiveWidth && effectiveWidth > 0
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
        const totalWrappedRows = effectiveWidth && effectiveWidth > 0
          ? Math.max(1, Math.ceil(currentLine.length / effectiveWidth))
          : 1;
        const currentWrappedRow = effectiveWidth && effectiveWidth > 0
          ? Math.floor(lineInfo.column / effectiveWidth)
          : 0;
        const isAtVisualBottom = lineInfo.lineIndex === lastLineIndex &&
          currentWrappedRow >= totalWrappedRows - 1;

        if (onDownArrow && isAtVisualBottom) {
          onDownArrow(lineInfo);
          return true;
        }

        const target = effectiveWidth && effectiveWidth > 0
          ? moveCursorVisually(currentValue, currentCursorOffset, 'down', effectiveWidth)
          : moveCursorVertically(currentValue, currentCursorOffset, 'down');
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
      effectiveWidth,
      getVisualRowStart,
      getVisualRowEnd,
    ],
  );

  useInput(handleInput, { isActive: focus });

  const renderVisualRow = useCallback(
    (row: { text: string; logicalLine: number; startCol: number; endCol: number; isFullLine: boolean }, visualIndex: number) => {
      const isCursorRow = visualIndex === cursorInfo.visualRow;
      if (!isCursorRow || !showCursor || !focus) {
        return <Text>{row.text || ' '}</Text>;
      }

      // For full lines (non-scrolling), use logical col directly
      // For split rows (scrolling), use visual col within the row
      const cursorColInRow = row.isFullLine ? cursorInfo.col : cursorInfo.visualCol;
      const before = row.text.slice(0, cursorColInRow);
      const cursorChar = row.text[cursorColInRow] ?? ' ';
      const after = row.text.slice(cursorColInRow + 1);

      return (
        <Text>
          {before}
          <Text inverse={cursorVisible}>{cursorChar}</Text>
          {after}
        </Text>
      );
    },
    [cursorInfo.visualRow, cursorInfo.visualCol, cursorInfo.col, showCursor, focus, cursorVisible],
  );

  if (editorState.value.length === 0 && placeholder) {
    return (
      <Box ref={boxRef} flexDirection="row" flexGrow={1}>
        <Box flexGrow={1}>
          <Text dimColor>
            {showCursor && focus ? (
              <>
                <Text inverse={cursorVisible} dimColor={!cursorVisible}>{placeholder[0] || ' '}</Text>
                {placeholder.slice(1)}
              </>
            ) : (
              placeholder
            )}
          </Text>
        </Box>
      </Box>
    );
  }

  if (hasScrolling && maxLines) {
    return (
      <Box key="scrolling" flexDirection="row" maxHeight={maxLines} width={"100%"}>
        <Box
          ref={boxRef}
          flexDirection="column"
          flexGrow={1}
          maxHeight={maxLines}
          overflow="scroll"
        >
          {visualRows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: <i> is fine here since rows are stable
            <Box key={i} flexShrink={0} minHeight={1}>
              {renderVisualRow(row, i)}
            </Box>
          ))}
        </Box>
        {showScrollbar && (
          <TextInputScrollbar
            scrollRatio={scrollRatio}
            visibleRatio={visibleRatio}
            height={maxLines}
            color={scrollbarColor}
            trackColor={scrollbarTrackColor}
          />
        )}
      </Box>
    );
  }

  return (
    <Box key="non-scrolling" ref={boxRef} flexDirection="column" flexGrow={1} width={"100%"}>
      {visualRows.map((row, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: <i> is fine here since rows are stable
        <Box key={i} flexShrink={0} minHeight={1}>
          {renderVisualRow(row, i)}
        </Box>
      ))}
    </Box>
  );
}

export default TextInput;

type UncontrolledProps = {
  readonly initialValue?: string;
} & Except<Props, 'value' | 'onChange'>;

export function UncontrolledTextInput({ initialValue = '', ...props }: UncontrolledProps) {
  const [value, setValue] = React.useState(initialValue);
  return <TextInput {...props} value={value} onChange={setValue} />;
}
