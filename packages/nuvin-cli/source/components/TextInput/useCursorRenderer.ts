import { useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import chalk from 'chalk';

export type CursorRenderResult = {
  renderedValue: string;
  renderedPlaceholder?: string;
};

let cursorVisible = true;
let lastActivityTime = Date.now();
const subscribers = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function subscribe(callback: () => void) {
  subscribers.add(callback);
  if (intervalId === null && subscribers.size > 0) {
    intervalId = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityTime;
      if (timeSinceActivity > 300) {
        cursorVisible = !cursorVisible;
        for (const cb of subscribers) cb();
      }
    }, 530);
  }
  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function getSnapshot() {
  return cursorVisible;
}

function resetActivity() {
  lastActivityTime = Date.now();
  if (!cursorVisible) {
    cursorVisible = true;
    for (const cb of subscribers) cb();
  }
}

function findCursorLine(
  value: string,
  cursorOffset: number,
  lineStarts?: number[],
): { lineIndex: number; columnInLine: number; lineStart: number } {
  if (lineStarts && lineStarts.length > 0) {
    let low = 0;
    let high = lineStarts.length - 1;

    while (low < high) {
      const mid = Math.ceil((low + high + 1) / 2);
      if (lineStarts[mid] <= cursorOffset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return {
      lineIndex: low,
      columnInLine: cursorOffset - lineStarts[low],
      lineStart: lineStarts[low],
    };
  }

  let currentPos = 0;
  let lineIndex = 0;

  for (let i = 0; i < value.length; i++) {
    if (
      cursorOffset <=
      currentPos +
        (value.indexOf('\n', currentPos) === -1
          ? value.length - currentPos
          : value.indexOf('\n', currentPos) - currentPos)
    ) {
      break;
    }
    const nextNewline = value.indexOf('\n', currentPos);
    if (nextNewline === -1) break;
    currentPos = nextNewline + 1;
    lineIndex++;
  }

  return {
    lineIndex,
    columnInLine: cursorOffset - currentPos,
    lineStart: currentPos,
  };
}

function computeRenderedOutput(
  value: string,
  cursorOffset: number,
  placeholder: string,
  showCursor: boolean,
  focus: boolean,
  shouldShowCursor: boolean,
  lineStarts?: number[],
): CursorRenderResult {
  let renderedValue = value;
  let renderedPlaceholder = placeholder ? chalk.grey(placeholder) : undefined;

  if (!showCursor || !focus) {
    return { renderedValue, renderedPlaceholder };
  }

  renderedPlaceholder =
    placeholder.length > 0
      ? (shouldShowCursor ? chalk.inverse(placeholder[0]) : chalk.grey(placeholder[0])) +
        chalk.grey(placeholder.slice(1))
      : shouldShowCursor
        ? chalk.inverse(' ')
        : ' ';

  if (value.length === 0) {
    renderedValue = shouldShowCursor ? chalk.inverse(' ') : ' ';
    return { renderedValue, renderedPlaceholder };
  }

  const { lineIndex, columnInLine, lineStart } = findCursorLine(value, cursorOffset, lineStarts);

  const lineEnd =
    lineStarts && lineIndex < lineStarts.length - 1
      ? lineStarts[lineIndex + 1] - 1
      : value.indexOf('\n', lineStart) === -1
        ? value.length
        : value.indexOf('\n', lineStart);

  const currentLineContent = value.slice(lineStart, lineEnd);

  let renderedLine: string;
  if (columnInLine >= 0 && columnInLine < currentLineContent.length) {
    const cursorChar = shouldShowCursor
      ? chalk.inverse(currentLineContent[columnInLine])
      : currentLineContent[columnInLine];
    renderedLine = currentLineContent.slice(0, columnInLine) + cursorChar + currentLineContent.slice(columnInLine + 1);
  } else {
    renderedLine = currentLineContent + (shouldShowCursor ? chalk.inverse(' ') : '');
  }

  if (!value.includes('\n')) {
    renderedValue = renderedLine;
  } else {
    const beforeLine = lineStart > 0 ? value.slice(0, lineStart) : '';
    const afterLine = lineEnd < value.length ? value.slice(lineEnd) : '';
    renderedValue = beforeLine + renderedLine + afterLine;
  }

  return { renderedValue, renderedPlaceholder };
}

export function useCursorRenderer() {
  const cursorVisibleState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const lastValueRef = useRef<string>('');
  const lastOffsetRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      lastValueRef.current = '';
      lastOffsetRef.current = 0;
    };
  }, []);

  const renderWithCursor = useCallback(
    (
      value: string,
      cursorOffset: number,
      placeholder: string,
      showCursor: boolean,
      focus: boolean,
      lineStarts?: number[],
    ): CursorRenderResult => {
      if (value !== lastValueRef.current || cursorOffset !== lastOffsetRef.current) {
        lastValueRef.current = value;
        lastOffsetRef.current = cursorOffset;
        queueMicrotask(resetActivity);
      }

      return computeRenderedOutput(value, cursorOffset, placeholder, showCursor, focus, cursorVisibleState, lineStarts);
    },
    [cursorVisibleState],
  );

  return { renderWithCursor };
}
