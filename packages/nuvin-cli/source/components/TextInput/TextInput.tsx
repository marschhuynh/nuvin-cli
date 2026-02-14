import React, { useEffect, useRef, useCallback, useState, useMemo, useLayoutEffect } from 'react';
import { Box, Text, type BoxRef, measureElement } from 'ink';
import type { Except } from 'type-fest';
import { useInput } from '@/contexts/InputContext/index.js';
import { useStdoutDimensionsContext } from '@/contexts/StdoutDimensionsContext.js';
import { moveCursorVertically, moveCursorVisually } from '@/utils/textNavigation.js';
import type { LineInfo } from '@/utils/textNavigation.js';

export type { LineInfo };
import { useVimMode } from './useVimMode.js';
import { usePaste } from './usePaste.js';
import { useEditorState } from './useEditorState.js';
import { useLineIndex } from './useLineIndex.js';
import { TextInputScrollbar } from './TextInputScrollbar.js';
import { useCursorBlink } from './useCursorBlink.js';
import { applyBackspace, applyDelete } from './editing.js';
import { isTextInputDebugEnabled, isTextInputDebugVerbose, logTextInputDebug } from './debugLogger.js';

type InputKey = Parameters<Parameters<typeof useInput>[0]>[1];

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
  readonly onTab?: (
    value: string,
    cursorOffset: number,
    isShiftTab: boolean,
  ) => { value: string; cursorOffset: number } | undefined;
  readonly maxLines?: number;
  readonly showScrollbar?: boolean;
  readonly scrollbarColor?: string;
  readonly scrollbarTrackColor?: string;
};

export function computeEffectiveWidth({
  measuredContainerWidth,
  terminalCols,
  showScrollbar,
  maxLines,
}: {
  measuredContainerWidth: number | undefined;
  terminalCols: number;
  showScrollbar: boolean;
  maxLines: number | undefined;
}): number {
  // Keep a conservative fallback based on terminal width to avoid tiny
  // measured widths causing pathological wrapping of short pasted text.
  const fallbackContainerWidth = Math.max(1, terminalCols - 4);
  const baseContainerWidth = Math.max(measuredContainerWidth ?? 0, fallbackContainerWidth);
  const scrollbarWidth = showScrollbar && maxLines !== undefined ? 1 : 0;
  return Math.max(1, baseContainerWidth - scrollbarWidth - 2);
}

export function stabilizeEffectiveWidth({
  previousEffectiveWidth,
  nextEffectiveWidth,
  terminalColsChanged,
}: {
  previousEffectiveWidth: number | undefined;
  nextEffectiveWidth: number;
  terminalColsChanged: boolean;
}): number {
  if (previousEffectiveWidth === undefined || terminalColsChanged) {
    return nextEffectiveWidth;
  }

  const collapsedTooFar = nextEffectiveWidth < Math.floor(previousEffectiveWidth * 0.35);
  const suspiciousTinyWidth = nextEffectiveWidth < 12;

  // Ignore transient tiny collapses (for example, width briefly measured as 1-2)
  // when terminal columns did not actually change.
  if (collapsedTooFar && suspiciousTinyWidth) {
    return previousEffectiveWidth;
  }

  return nextEffectiveWidth;
}


export function resolveRenderedCursorColumn(rawCursorColInRow: number, rowTextLength: number): number {
  if (rowTextLength <= 0) {
    return rawCursorColInRow;
  }

  return rawCursorColInRow >= rowTextLength ? rowTextLength - 1 : rawCursorColInRow;
}
function formatInputForDebug(input: string): string {
  return input
    .replaceAll('\x1b', '<ESC>')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t');
}

function summarizeLinesForDebug(lines: string[]): Array<{ index: number; length: number; preview: string }> {
  return lines.slice(0, 8).map((line, index) => ({
    index,
    length: line.length,
    preview: formatInputForDebug(line.slice(0, 120)),
  }));
}

function summarizeVisualRowsForDebug(
  rows: Array<{ text: string; logicalLine: number; startCol: number; endCol: number; isFullLine: boolean }>,
): Array<{ index: number; logicalLine: number; startCol: number; endCol: number; length: number; preview: string }> {
  return rows.slice(0, 20).map((row, index) => ({
    index,
    logicalLine: row.logicalLine,
    startCol: row.startCol,
    endCol: row.endCol,
    length: row.text.length,
    preview: formatInputForDebug(row.text.slice(0, 80)),
  }));
}

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
  onTab,
  maxLines,
  showScrollbar = true,
  scrollbarColor,
  scrollbarTrackColor,
}: Props) {
  const measureRef = useRef<BoxRef>(null);
  const scrollRef = useRef<BoxRef>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [containerWidth, setContainerWidth] = useState<number | undefined>(undefined);
  const [scrollBoxWidth, setScrollBoxWidth] = useState<number | undefined>(undefined);
  const { cols } = useStdoutDimensionsContext();
  const previousColsRef = useRef(cols);
  const lastRenderFingerprintRef = useRef<string>('');

  useLayoutEffect(() => {
    let measuredOuterWidth: number | undefined;
    let measuredInnerWidth: number | undefined;

    if (measureRef.current) {
      try {
        const { width } = measureElement(measureRef.current);
        if (width > 0) {
          measuredOuterWidth = width;
          setContainerWidth((prev) => (prev === width ? prev : width));
        }
      } catch {
        // Element not ready
      }
    }

    if (scrollRef.current) {
      try {
        const { width } = measureElement(scrollRef.current);
        if (width > 0) {
          measuredInnerWidth = width;
          setScrollBoxWidth((prev) => (prev === width ? prev : width));
        }
      } catch {
        // Element not ready
      }
    }

    if (isTextInputDebugEnabled) {
      const shouldLogWidthUpdate =
        (measuredOuterWidth !== undefined && measuredOuterWidth !== containerWidth) ||
        (measuredInnerWidth !== undefined && measuredInnerWidth !== scrollBoxWidth);

      if (shouldLogWidthUpdate) {
        logTextInputDebug('measure width updated', {
          measuredOuterWidth,
          previousOuterWidth: containerWidth,
          measuredInnerWidth,
          previousInnerWidth: scrollBoxWidth,
          cols,
        });
      }
    }
  });

  const nextEffectiveWidth = useMemo(() => {
    return computeEffectiveWidth({
      measuredContainerWidth: containerWidth,
      terminalCols: cols,
      showScrollbar,
      maxLines,
    });
  }, [containerWidth, cols, showScrollbar, maxLines]);
  const [effectiveWidth, setEffectiveWidth] = useState(nextEffectiveWidth);

  useEffect(() => {
    const terminalColsChanged = cols !== previousColsRef.current;
    setEffectiveWidth((previousEffectiveWidth) => {
      const stabilized = stabilizeEffectiveWidth({
        previousEffectiveWidth,
        nextEffectiveWidth,
        terminalColsChanged,
      });

      if (isTextInputDebugEnabled) {
        logTextInputDebug('effective width reconcile', {
          previousEffectiveWidth,
          nextEffectiveWidth,
          stabilizedEffectiveWidth: stabilized,
          terminalColsChanged,
          cols,
          measuredContainerWidth: containerWidth,
          measuredScrollBoxWidth: scrollBoxWidth,
          suspiciousTinyCandidate: nextEffectiveWidth < 12,
          severeCollapseFromPrevious:
            previousEffectiveWidth !== undefined && nextEffectiveWidth < Math.floor(previousEffectiveWidth * 0.35),
        });

        if (stabilized <= 4) {
          logTextInputDebug('anomaly: tiny effective width', {
            previousEffectiveWidth,
            nextEffectiveWidth,
            stabilizedEffectiveWidth: stabilized,
            cols,
            measuredContainerWidth: containerWidth,
            measuredScrollBoxWidth: scrollBoxWidth,
          });
        }
      }

      return stabilized;
    });
    previousColsRef.current = cols;
  }, [nextEffectiveWidth, cols, containerWidth, scrollBoxWidth]);

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
    stateRef: editorStateRef,
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
        logicalRow,
        logicalCol,
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
    const wrappedRowsBeforeCursor = currentLineLen > 0 ? Math.floor(logicalCol / effectiveWidth) : 0;
    visualRow += wrappedRowsBeforeCursor;
    const visualCol = currentLineLen > 0 ? logicalCol % effectiveWidth : logicalCol;

    return {
      logicalRow,
      logicalCol,
      visualRow,
      visualCol,
    };
  }, [lineIndex, editorState.cursorOffset, effectiveWidth, lines, maxLines]);

  const visualLineCount = visualRows.length;
  const hasScrolling = maxLines !== undefined && visualLineCount > maxLines;
  const visibleLines = maxLines ?? visualLineCount;

  useEffect(() => {
    if (!isTextInputDebugEnabled) {
      return;
    }

    const lineInfo = lineIndex.getLineInfo(editorState.cursorOffset);

    const fingerprint = [
      editorState.value.length,
      editorState.cursorOffset,
      cols,
      containerWidth,
      scrollBoxWidth,
      nextEffectiveWidth,
      effectiveWidth,
      maxLines,
      visualLineCount,
      hasScrolling,
      visibleLines,
      scrollOffset,
      cursorInfo.visualRow,
      cursorInfo.visualCol,
      lineInfo.lineIndex,
      lineInfo.column,
    ].join('|');

    if (!isTextInputDebugVerbose && lastRenderFingerprintRef.current === fingerprint) {
      return;
    }

    lastRenderFingerprintRef.current = fingerprint;

    const summary: Record<string, unknown> = {
      valueLength: editorState.value.length,
      cursorOffset: editorState.cursorOffset,
      cursorLogicalLine: lineInfo.lineIndex,
      cursorLogicalCol: lineInfo.column,
      cursorLineStart: lineInfo.lineStart,
      cursorLineEnd: lineInfo.lineEnd,
      cursorVisualRow: cursorInfo.visualRow,
      cursorVisualCol: cursorInfo.visualCol,
      cols,
      measuredOuterWidth: containerWidth,
      measuredInnerWidth: scrollBoxWidth,
      nextEffectiveWidth,
      effectiveWidth,
      maxLines,
      lineCount: lines.length,
      lineLengths: lines.slice(0, 20).map((line) => line.length),
      visualLineCount,
      hasScrolling,
      visibleLines,
      scrollOffset,
    };

    if (isTextInputDebugVerbose) {
      summary.linesHead = summarizeLinesForDebug(lines);
      summary.visualRowsHead = summarizeVisualRowsForDebug(visualRows);
    }

    logTextInputDebug('render summary', summary);

    if (effectiveWidth <= 4 || (scrollBoxWidth !== undefined && scrollBoxWidth <= 4)) {
      logTextInputDebug('anomaly: suspicious tiny layout width in render', {
        effectiveWidth,
        measuredOuterWidth: containerWidth,
        measuredInnerWidth: scrollBoxWidth,
        cols,
        cursorOffset: editorState.cursorOffset,
        valueLength: editorState.value.length,
      });
    }
  }, [
    editorState.value.length,
    editorState.cursorOffset,
    cols,
    containerWidth,
    scrollBoxWidth,
    nextEffectiveWidth,
    effectiveWidth,
    maxLines,
    lines,
    visualRows,
    visualLineCount,
    hasScrolling,
    visibleLines,
    scrollOffset,
    cursorInfo.visualRow,
    cursorInfo.visualCol,
    lineIndex,
  ]);

  useEffect(() => {
    if (!hasScrolling) {
      if (scrollOffset !== 0) {
        setScrollOffset(0);
      }
      return;
    }

    if (!scrollRef.current) return;

    const { visualRow } = cursorInfo;
    const maxScroll = Math.max(0, visualLineCount - visibleLines);

    if (visualRow < scrollOffset) {
      const newOffset = Math.max(0, visualRow);
      setScrollOffset(newOffset);
      scrollRef.current.scrollTo({ y: newOffset });
    } else if (visualRow >= scrollOffset + visibleLines) {
      const newOffset = Math.min(maxScroll, visualRow - visibleLines + 1);
      setScrollOffset(newOffset);
      scrollRef.current.scrollTo({ y: newOffset });
    } else if (scrollOffset > maxScroll) {
      setScrollOffset(maxScroll);
      scrollRef.current.scrollTo({ y: maxScroll });
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
        const visualRowStart = Math.floor(lineInfo.column / effectiveWidth) * effectiveWidth;
        return lineInfo.lineStart + visualRowStart;
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
        const visualRowStart = Math.floor(lineInfo.column / effectiveWidth) * effectiveWidth;
        const visualRowEnd = Math.min(visualRowStart + effectiveWidth - 1, currentLine.length);
        return lineInfo.lineStart + visualRowEnd;
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
          cursorOffset: editorStateRef.current.cursorOffset,
          valueLength: editorStateRef.current.value.length,
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
        const isAtVisualTop = lineInfo.lineIndex === 0 && (!effectiveWidth || lineInfo.column < effectiveWidth);

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
        const totalWrappedRows =
          effectiveWidth && effectiveWidth > 0 ? Math.max(1, Math.ceil(currentLine.length / effectiveWidth)) : 1;
        const currentWrappedRow =
          effectiveWidth && effectiveWidth > 0 ? Math.floor(lineInfo.column / effectiveWidth) : 0;
        const isAtVisualBottom = lineInfo.lineIndex === lastLineIndex && currentWrappedRow >= totalWrappedRows - 1;

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

  const renderVisualRow = useCallback(
    (
      row: { text: string; logicalLine: number; startCol: number; endCol: number; isFullLine: boolean },
      visualIndex: number,
    ) => {
      const isCursorRow = visualIndex === cursorInfo.visualRow;
      if (!isCursorRow || !showCursor || !focus) {
        return <Text>{row.text || ' '}</Text>;
      }

      // For full lines (non-scrolling), use logical col directly
      // For split rows (scrolling), use visual col within the row
      const rawCursorColInRow = row.isFullLine ? cursorInfo.logicalCol : cursorInfo.visualCol;
      const cursorColInRow = resolveRenderedCursorColumn(rawCursorColInRow, row.text.length);
      const before = row.text.slice(0, cursorColInRow);
      const cursorChar = row.text[cursorColInRow] ?? ' ';
      const after = row.text.slice(Math.min(cursorColInRow + 1, row.text.length));

      return (
        <Text>
          {before}
          <Text inverse={cursorVisible}>{cursorChar}</Text>
          {after}
        </Text>
      );
    },
    [cursorInfo.visualRow, cursorInfo.visualCol, cursorInfo.logicalCol, showCursor, focus, cursorVisible],
  );

  if (editorState.value.length === 0 && placeholder) {
    return (
      <Box ref={measureRef} flexDirection="row" flexGrow={1}>
        <Box flexGrow={1}>
          <Text dimColor>
            {showCursor && focus ? (
              <>
                <Text inverse={cursorVisible} dimColor={!cursorVisible}>
                  {placeholder[0] || ' '}
                </Text>
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
      <Box key="scrolling" ref={measureRef} flexDirection="row" maxHeight={maxLines} width={'100%'}>
        <Box ref={scrollRef} flexDirection="column" flexGrow={1} maxHeight={maxLines} overflow="scroll" minWidth={0}>
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
    <Box key="non-scrolling" ref={measureRef} flexDirection="column" flexGrow={1} width={'100%'}>
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
