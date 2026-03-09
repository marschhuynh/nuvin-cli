import { describe, expect, it } from 'vitest';
import {
  reconcileExternalValue,
  syncEditorStateFromExternalValue,
  type EditorState,
} from '../source/components/TextInput/useEditorState.js';

describe('useEditorState external sync', () => {
  it('clamps cursor offset when external value becomes shorter', () => {
    const current: EditorState = {
      value: 'this is a long line',
      cursorOffset: 19,
      cursorWidth: 0,
    };

    const next = syncEditorStateFromExternalValue(current, 'this', 'insert');

    expect(next.value).toBe('this');
    expect(next.cursorOffset).toBe(4);
  });

  it('resets cursor to 0 when external value becomes empty', () => {
    const current: EditorState = {
      value: 'text',
      cursorOffset: 4,
      cursorWidth: 2,
    };

    const next = syncEditorStateFromExternalValue(current, '', 'insert');

    expect(next).toEqual({
      value: '',
      cursorOffset: 0,
      cursorWidth: 0,
    });
  });

  it('ignores stale echo-back values emitted by rapid internal updates', () => {
    const current: EditorState = {
      value: 'abc',
      cursorOffset: 3,
      cursorWidth: 0,
    };

    const pending = ['a', 'ab', 'abc'];

    const first = reconcileExternalValue(current, 'a', 'insert', pending);
    expect(first.nextState).toBeNull();
    expect(first.nextPendingEchoes).toEqual(['ab', 'abc']);

    const second = reconcileExternalValue(current, 'ab', 'insert', first.nextPendingEchoes);
    expect(second.nextState).toBeNull();
    expect(second.nextPendingEchoes).toEqual(['abc']);

    const third = reconcileExternalValue(current, 'abc', 'insert', second.nextPendingEchoes);
    expect(third.nextState).toBeNull();
    expect(third.nextPendingEchoes).toEqual([]);
  });

  it('applies real external updates not present in pending echoes', () => {
    const current: EditorState = {
      value: 'abc',
      cursorOffset: 3,
      cursorWidth: 0,
    };

    const result = reconcileExternalValue(current, 'server-overwrite', 'insert', ['a', 'ab', 'abc']);

    expect(result.nextState).toEqual({
      value: 'server-overwrite',
      cursorOffset: 3,
      cursorWidth: 0,
    });
    expect(result.nextPendingEchoes).toEqual([]);
  });
});
