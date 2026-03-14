import { describe, it, expect, afterEach } from 'vitest';
import { applyBackspace, applyDelete } from '../source/components/TextInput/editing.js';
import { parseKeypress, setKittyProtocolEnabled, splitInputChunks } from '../source/contexts/InputContext/parseKeypress.js';

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

describe('IME sequence handling', () => {
  it('keeps backspace + printable chars as a single chunk', () => {
    // Vietnamese IME: type "a" then accent key → \x7f + replacement char
    const chunks = splitInputChunks('\x7f\u0103');
    expect(chunks).toEqual(['\x7f\u0103']);
  });

  it('keeps multiple backspaces + printable chars as a single chunk', () => {
    const chunks = splitInputChunks('\x7f\x7f\u00e2');
    expect(chunks).toEqual(['\x7f\x7f\u00e2']);
  });

  it('still splits pure backspace sequences', () => {
    const chunks = splitInputChunks('\x7f\x7f\x7f');
    expect(chunks).toEqual(['\x7f', '\x7f', '\x7f']);
  });

  it('parses IME chunk as plain input with no special keys', () => {
    const result = parseKeypress('\x7f\u0103');
    expect(result.key.backspace).toBe(false);
    expect(result.input).toBe('\x7f\u0103');
  });

  it('processes IME sequence correctly in full editing flow', () => {
    // Simulate: user typed "a", then IME sends \x7f + "ă" to replace it
    const initialValue = 'a';
    const chunks = splitInputChunks('\x7f\u0103');
    expect(chunks).toHaveLength(1);

    const chunk = chunks[0];
    expect(chunk).toBeDefined();
    const { input, key } = parseKeypress(chunk ?? '');

    // Should NOT be parsed as backspace
    expect(key.backspace).toBe(false);

    // The raw input contains backspace + replacement — TextInput handles this
    const backspaceCount = (input.match(/\x7f/g) || []).length;
    const replacement = input.replace(/\x7f/g, '');
    const cursorOffset = initialValue.length;
    const deleteCount = Math.min(backspaceCount, cursorOffset);
    const afterDelete = cursorOffset - deleteCount;
    const nextValue =
      initialValue.slice(0, afterDelete) +
      replacement +
      initialValue.slice(cursorOffset);

    expect(nextValue).toBe('\u0103');
  });

  it('handles multi-backspace IME replacement', () => {
    // Simulate: "ao" → IME replaces both chars with "ô"
    const initialValue = 'ao';
    const _input = '\x7f\x7f\u00f4';
    const backspaceCount = 2;
    const replacement = '\u00f4';
    const cursorOffset = 2;
    const deleteCount = Math.min(backspaceCount, cursorOffset);
    const afterDelete = cursorOffset - deleteCount;
    const nextValue =
      initialValue.slice(0, afterDelete) +
      replacement +
      initialValue.slice(cursorOffset);

    expect(nextValue).toBe('\u00f4');
  });

  it('preserves text after cursor during IME replacement', () => {
    // Cursor is at position 1 in "a world", IME replaces "a" → "ă"
    const initialValue = 'a world';
    const cursorOffset = 1;
    const backspaceCount = 1;
    const replacement = '\u0103';
    const deleteCount = Math.min(backspaceCount, cursorOffset);
    const afterDelete = cursorOffset - deleteCount;
    const nextValue =
      initialValue.slice(0, afterDelete) +
      replacement +
      initialValue.slice(cursorOffset);

    expect(nextValue).toBe('\u0103 world');
  });
});
