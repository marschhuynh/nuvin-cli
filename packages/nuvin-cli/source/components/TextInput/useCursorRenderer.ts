import { useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import chalk from 'chalk';

export type CursorRenderResult = {
  renderedValue: string;
  renderedPlaceholder?: string;
};

// Shared cursor blink store to avoid multiple intervals
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

// Helper function to compute cursor rendering - pure function, no state updates
function computeRenderedOutput(
  value: string,
  cursorOffset: number,
  placeholder: string,
  showCursor: boolean,
  focus: boolean,
  shouldShowCursor: boolean,
): CursorRenderResult {
  let renderedValue = value;
  let renderedPlaceholder = placeholder ? chalk.grey(placeholder) : undefined;

  if (!showCursor || !focus) {
    return { renderedValue, renderedPlaceholder };
  }

  renderedPlaceholder =
    placeholder.length > 0
      ? (shouldShowCursor ? chalk.inverse(placeholder[0]) : chalk.grey(placeholder[0])) + chalk.grey(placeholder.slice(1))
      : shouldShowCursor
        ? chalk.inverse(' ')
        : ' ';

  if (value.length === 0) {
    renderedValue = shouldShowCursor ? chalk.inverse(' ') : ' ';
    return { renderedValue, renderedPlaceholder };
  }

  const lines = value.split('\n');
  let currentPos = 0;
  let currentLine = 0;
  let columnInLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineEnd = currentPos + lines[i].length;
    if (cursorOffset <= lineEnd) {
      currentLine = i;
      columnInLine = cursorOffset - currentPos;
      break;
    }
    currentPos = lineEnd + 1;
  }

  renderedValue = lines
    .map((line, idx) => {
      if (idx === currentLine) {
        if (columnInLine >= 0 && columnInLine < line.length) {
          const cursorChar = shouldShowCursor ? chalk.inverse(line[columnInLine]) : line[columnInLine];
          return line.slice(0, columnInLine) + cursorChar + line.slice(columnInLine + 1);
        } else {
          return line + (shouldShowCursor ? chalk.inverse(' ') : '');
        }
      }
      return line;
    })
    .join('\n');

  return { renderedValue, renderedPlaceholder };
}

export function useCursorRenderer() {
  const cursorVisibleState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const lastValueRef = useRef<string>('');
  const lastOffsetRef = useRef<number>(0);

  // Effect to reset activity when input changes - runs after render
  useEffect(() => {
    return () => {
      // Cleanup: reset refs on unmount
      lastValueRef.current = '';
      lastOffsetRef.current = 0;
    };
  }, []);

  const renderWithCursor = useCallback((
    value: string,
    cursorOffset: number,
    placeholder: string,
    showCursor: boolean,
    focus: boolean,
  ): CursorRenderResult => {
    // Check if input changed and reset activity (no state updates here)
    if (value !== lastValueRef.current || cursorOffset !== lastOffsetRef.current) {
      lastValueRef.current = value;
      lastOffsetRef.current = cursorOffset;
      // Schedule activity reset for next tick to avoid state update during render
      queueMicrotask(resetActivity);
    }

    return computeRenderedOutput(
      value,
      cursorOffset,
      placeholder,
      showCursor,
      focus,
      cursorVisibleState,
    );
  }, [cursorVisibleState]);

  return { renderWithCursor };
}
