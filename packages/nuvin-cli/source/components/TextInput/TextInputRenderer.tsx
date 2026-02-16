import type React from 'react';
import { useCallback } from 'react';
import { Box, Text, type BoxRef } from 'ink';
import type { VisualRow, CursorInfo } from './useVisualRows.js';
import { TextInputScrollbar } from './TextInputScrollbar.js';
import { resolveRenderedCursorColumn } from './widthUtils.js';

export type TextInputRendererProps = {
  measureRef: React.RefObject<BoxRef | null>;
  scrollRef: React.RefObject<BoxRef | null>;
  value: string;
  placeholder: string;
  focus: boolean;
  showCursor: boolean;
  cursorVisible: boolean;
  visualRows: VisualRow[];
  cursorInfo: CursorInfo;
  hasScrolling: boolean;
  maxLines: number | undefined;
  showScrollbar: boolean;
  scrollRatio: number;
  visibleRatio: number;
  scrollbarColor: string | undefined;
  scrollbarTrackColor: string | undefined;
};

export function TextInputRenderer({
  measureRef,
  scrollRef,
  value,
  placeholder,
  focus,
  showCursor,
  cursorVisible,
  visualRows,
  cursorInfo,
  hasScrolling,
  maxLines,
  showScrollbar,
  scrollRatio,
  visibleRatio,
  scrollbarColor,
  scrollbarTrackColor,
}: TextInputRendererProps) {
  const renderVisualRow = useCallback(
    (row: VisualRow, visualIndex: number) => {
      const isCursorRow = visualIndex === cursorInfo.visualRow;
      if (!isCursorRow || !showCursor || !focus) {
        return <Text>{row.text || ' '}</Text>;
      }

      // For full lines (non-scrolling), use logical col directly
      // For split rows (scrolling), use visual col within the row
      const rawCursorColInRow = row.isFullLine ? cursorInfo.logicalCol : cursorInfo.visualCol;
      const cursorColInRow = resolveRenderedCursorColumn(rawCursorColInRow, row.text.length, row.isFullLine);
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

  if (value.length === 0 && placeholder) {
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
        <Box key={i} flexShrink={0} minHeight={1} backgroundColor={"red"}>
          {renderVisualRow(row, i)}
        </Box>
      ))}
    </Box>
  );
}
