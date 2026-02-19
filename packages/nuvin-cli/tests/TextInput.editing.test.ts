import { describe, it, expect, afterEach } from 'vitest';
import { applyBackspace, applyDelete } from '../source/components/TextInput/editing.js';
import {
  parseKeypress,
  setKittyProtocolEnabled,
  splitInputChunks,
} from '../source/contexts/InputContext/parseKeypress.js';

describe('TextInput editing operations', () => {
  it('applies backspace by removing character before cursor and moving cursor left', () => {
    const result = applyBackspace('hello', 5);
    expect(result).toEqual({ value: 'hell', cursorOffset: 4 });
  });

  it('keeps cursor and content in sync across repeated backspace operations', () => {
    let state = { value: 'abcdef', cursorOffset: 6 };

    for (let i = 0; i < 6; i++) {
      const next = applyBackspace(state.value, state.cursorOffset);
      expect(next).not.toBeNull();
      if (!next) {
        throw new Error('Unexpected null during repeated backspace');
      }
      state = next;
      expect(state.cursorOffset).toBe(state.value.length);
    }

    expect(state).toEqual({ value: '', cursorOffset: 0 });
    expect(applyBackspace(state.value, state.cursorOffset)).toBeNull();
  });

  it('applies delete by removing character at cursor without moving cursor left', () => {
    const result = applyDelete('abcdef', 2);
    expect(result).toEqual({ value: 'abdef', cursorOffset: 2 });
  });

  it('returns null for delete at end of text', () => {
    expect(applyDelete('abc', 3)).toBeNull();
  });
});

describe('Input key parsing for delete/backspace', () => {
  afterEach(() => {
    setKittyProtocolEnabled(false);
  });

  it('treats terminal DEL (\\x7f) as backspace', () => {
    const result = parseKeypress('\x7f');
    expect(result.key.backspace).toBe(true);
    expect(result.key.delete).toBe(false);
  });

  it('treats CSI delete as forward delete', () => {
    const result = parseKeypress('\x1b[3~');
    expect(result.key.backspace).toBe(false);
    expect(result.key.delete).toBe(true);
  });

  it('splits held DEL chunks into individual keypresses', () => {
    const chunks = splitInputChunks('\x7f\x7f\x7f');
    expect(chunks).toEqual(['\x7f', '\x7f', '\x7f']);
  });

  it('reproduces hold-delete bug with Kitty CSI-u repeat sequence', () => {
    setKittyProtocolEnabled(true);

    // Kitty key-repeat packets include an event subtype: ;<mods>:2u
    // Backspace/delete while held can arrive as \x1b[127;1:2u.
    const result = parseKeypress('\x1b[127;1:2u');

    // Expected behavior: this should be interpreted as a deletion key.
    // Current behavior (bug): parsed as plain input with no key flags.
    expect(result.key.backspace || result.key.delete).toBe(true);
  });

  it('deletes the full line under held delete/backspace CSI-u repeat events', () => {
    setKittyProtocolEnabled(true);

    const heldDelete = '\x1b[127;1:2u';
    const initialValue = 'this is a long line';
    const chunks = splitInputChunks(heldDelete.repeat(initialValue.length));

    let state = { value: initialValue, cursorOffset: initialValue.length };
    for (const chunk of chunks) {
      const { input, key } = parseKeypress(chunk);
      if (key.backspace) {
        const next = applyBackspace(state.value, state.cursorOffset);
        if (next) {
          state = next;
        }
        continue;
      }
      if (key.delete) {
        const next = applyDelete(state.value, state.cursorOffset);
        if (next) {
          state = next;
        }
        continue;
      }
      const nextValue = state.value.slice(0, state.cursorOffset) + input + state.value.slice(state.cursorOffset);
      state = { value: nextValue, cursorOffset: state.cursorOffset + input.length };
    }

    expect(state).toEqual({ value: '', cursorOffset: 0 });
  });
});
