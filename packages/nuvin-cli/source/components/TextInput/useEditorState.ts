import { useState, useRef, useEffect, useCallback } from 'react';
import { clampOffset, type VimMode } from '@/utils/textNavigation.js';

export type EditorState = {
  value: string;
  cursorOffset: number;
  cursorWidth: number;
};

export type UseEditorStateOptions = {
  initialValue: string;
  vimMode: VimMode;
  onChange: (value: string) => void;
};

export function syncEditorStateFromExternalValue(
  current: EditorState,
  externalValue: string,
  vimMode: VimMode,
): EditorState {
  const nextCursorOffset = externalValue === '' ? 0 : clampOffset(externalValue.length, current.cursorOffset, vimMode);
  return {
    ...current,
    value: externalValue,
    cursorOffset: nextCursorOffset,
    cursorWidth: externalValue === '' ? 0 : current.cursorWidth,
  };
}

export function reconcileExternalValue(
  current: EditorState,
  externalValue: string,
  vimMode: VimMode,
  pendingEchoes: string[],
): {
  nextState: EditorState | null;
  nextPendingEchoes: string[];
} {
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

export function useEditorState({ initialValue, vimMode, onChange }: UseEditorStateOptions) {
  const [state, setState] = useState<EditorState>({
    value: initialValue,
    cursorOffset: 0,
    cursorWidth: 0,
  });

  const lastExternalValue = useRef(initialValue);
  const hasSetInitialCursor = useRef(false);
  const pendingEchoesRef = useRef<string[]>([]);

  useEffect(() => {
    if (initialValue !== lastExternalValue.current) {
      lastExternalValue.current = initialValue;

      setState((current) => {
        const reconciliation = reconcileExternalValue(current, initialValue, vimMode, pendingEchoesRef.current);
        pendingEchoesRef.current = reconciliation.nextPendingEchoes;

        if (reconciliation.nextState) {
          return reconciliation.nextState;
        }

        return current;
      });

      if (initialValue === '') {
        hasSetInitialCursor.current = false;
      }
    }
  }, [initialValue]);

  const setValue = useCallback((value: string, offset: number, width = 0) => {
    const clampedOffset = clampOffset(value.length, offset, vimMode);
    let valueChanged = false;
    setState((current) => {
      if (value === current.value && clampedOffset === current.cursorOffset && width === current.cursorWidth) {
        return current;
      }
      valueChanged = value !== current.value;
      return { value, cursorOffset: clampedOffset, cursorWidth: width };
    });
    if (valueChanged) {
      pendingEchoesRef.current.push(value);
      if (pendingEchoesRef.current.length > 200) {
        pendingEchoesRef.current.shift();
      }
      onChange(value);
    }
  }, [vimMode, onChange]);

  const moveCursor = useCallback((offset: number) => {
    setState((current) => {
      const clampedOffset = clampOffset(current.value.length, offset, vimMode);
      if (clampedOffset === current.cursorOffset) {
        return current;
      }
      return { ...current, cursorOffset: clampedOffset, cursorWidth: 0 };
    });
  }, [vimMode]);

  const reset = useCallback(() => {
    setState({ value: '', cursorOffset: 0, cursorWidth: 0 });
    pendingEchoesRef.current.push('');
    if (pendingEchoesRef.current.length > 200) {
      pendingEchoesRef.current.shift();
    }
    onChange('');
  }, [onChange]);

  const setInitialCursor = useCallback((focus: boolean) => {
    if (!hasSetInitialCursor.current && focus) {
      setState((current) => {
        if (!current.value || current.value.length === 0) {
          return current;
        }
        hasSetInitialCursor.current = true;
        const offset = Math.max(0, current.value.length);
        const clampedOffset = clampOffset(current.value.length, offset, vimMode);
        if (clampedOffset === current.cursorOffset) {
          return current;
        }
        return { ...current, cursorOffset: clampedOffset, cursorWidth: 0 };
      });
    }
  }, [vimMode]);

  return {
    state,
    setValue,
    moveCursor,
    reset,
    setInitialCursor,
  };
}
