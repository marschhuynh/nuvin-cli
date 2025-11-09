import { useReducer, useRef, useEffect } from 'react';
import { clampOffset, type VimMode } from '@/utils/textNavigation.js';

export type EditorState = {
  value: string;
  cursorOffset: number;
  cursorWidth: number;
};

type EditorAction =
  | { type: 'SET_VALUE'; payload: { value: string; offset: number; width?: number } }
  | { type: 'MOVE_CURSOR'; payload: { offset: number } }
  | { type: 'RESET' }
  | { type: 'SYNC_EXTERNAL_VALUE'; payload: { value: string } };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_VALUE':
      return {
        value: action.payload.value,
        cursorOffset: action.payload.offset,
        cursorWidth: action.payload.width ?? 0,
      };
    case 'MOVE_CURSOR':
      return {
        ...state,
        cursorOffset: action.payload.offset,
        cursorWidth: 0,
      };
    case 'RESET':
      return {
        value: '',
        cursorOffset: 0,
        cursorWidth: 0,
      };
    case 'SYNC_EXTERNAL_VALUE':
      return {
        ...state,
        value: action.payload.value,
        cursorOffset: action.payload.value === '' ? 0 : state.cursorOffset,
        cursorWidth: action.payload.value === '' ? 0 : state.cursorWidth,
      };
    default:
      return state;
  }
}

export type UseEditorStateOptions = {
  initialValue: string;
  vimMode: VimMode;
  onChange: (value: string) => void;
};

export function useEditorState({ initialValue, vimMode, onChange }: UseEditorStateOptions) {
  const [state, dispatch] = useReducer(editorReducer, {
    value: initialValue,
    cursorOffset: 0,
    cursorWidth: 0,
  });

  const lastExternalValue = useRef(initialValue);
  const hasSetInitialCursor = useRef(false);

  useEffect(() => {
    if (initialValue !== lastExternalValue.current) {
      lastExternalValue.current = initialValue;
      dispatch({ type: 'SYNC_EXTERNAL_VALUE', payload: { value: initialValue } });

      if (initialValue === '') {
        hasSetInitialCursor.current = false;
      }
    }
  }, [initialValue]);

  const setValue = (value: string, offset: number, width = 0) => {
    const clampedOffset = clampOffset(value.length, offset, vimMode);
    dispatch({
      type: 'SET_VALUE',
      payload: { value, offset: clampedOffset, width },
    });
    if (value !== state.value) {
      onChange(value);
    }
  };

  const moveCursor = (offset: number) => {
    const clampedOffset = clampOffset(state.value.length, offset, vimMode);
    dispatch({ type: 'MOVE_CURSOR', payload: { offset: clampedOffset } });
  };

  const reset = () => {
    dispatch({ type: 'RESET' });
    onChange('');
  };

  const setInitialCursor = (focus: boolean) => {
    if (!hasSetInitialCursor.current && focus && state.value && state.value.length > 0) {
      hasSetInitialCursor.current = true;
      moveCursor(Math.max(0, state.value.length));
    }
  };

  return {
    state,
    setValue,
    moveCursor,
    reset,
    setInitialCursor,
  };
}
