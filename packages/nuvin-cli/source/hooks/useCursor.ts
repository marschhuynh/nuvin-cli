import { useState, useEffect, useRef, useCallback } from 'react';
import { clampOffset, type VimMode } from '@/utils/textNavigation.js';

export type CursorState = {
  offset: number;
  width: number;
};

export type UseCursorOptions = {
  value: string;
  mode: VimMode;
  focus: boolean;
  showCursor: boolean;
};

export type UseCursorReturn = {
  cursorOffset: number;
  cursorWidth: number;
  getCursorOffset: () => number;
  moveCursor: (offset: number, valueLength?: number) => void;
  setCursor: (offset: number, width?: number, valueLength?: number) => void;
};

export function useCursor({ value, mode, focus, showCursor }: UseCursorOptions): UseCursorReturn {
  const [state, setState] = useState<CursorState>({
    offset: 0,
    width: 0,
  });
  
  const stateRef = useRef<CursorState>(state);
  
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!focus || !showCursor) {
      return;
    }

    setState((prev) => {
      const clampedOffset = clampOffset(value.length, prev.offset, mode);
      if (clampedOffset !== prev.offset && prev.offset > value.length) {
        return { ...prev, offset: clampedOffset };
      }
      return prev;
    });
  }, [value, mode, focus, showCursor]);

  const getCursorOffset = useCallback(() => {
    return stateRef.current.offset;
  }, []);

  const moveCursor = (offset: number, valueLength?: number) => {
    const length = valueLength ?? value.length;
    const clamped = clampOffset(length, offset, mode);
    setState({ offset: clamped, width: 0 });
  };

  const setCursor = (offset: number, width = 0, valueLength?: number) => {
    const length = valueLength ?? value.length;
    const clamped = clampOffset(length, offset, mode);
    setState({ offset: clamped, width });
  };

  return {
    cursorOffset: state.offset,
    cursorWidth: state.width,
    getCursorOffset,
    moveCursor,
    setCursor,
  };
}
