import { afterEach, describe, expect, it } from 'vitest';
import { applyBackspace, applyDelete } from '../source/components/TextInput/editing.js';
import {
  parseKeypress,
  setKittyProtocolEnabled,
  splitInputChunksWithRemainder,
} from '../source/contexts/InputContext/parseKeypress.js';

describe('Fragmented input parsing', () => {
  afterEach(() => {
    setKittyProtocolEnabled(false);
  });

  it('buffers incomplete CSI delete until sequence is complete', () => {
    let remainder = '';
    const parsed: Array<ReturnType<typeof parseKeypress>> = [];

    for (const piece of ['\x1b[3', '~']) {
      const result = splitInputChunksWithRemainder(remainder + piece);
      remainder = result.remainder;
      parsed.push(...result.chunks.map((chunk) => parseKeypress(chunk)));
    }

    expect(remainder).toBe('');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.input).toBe('');
    expect(parsed[0]?.key.delete).toBe(true);
  });

  it('buffers incomplete kitty CSI-u repeat sequence until complete', () => {
    setKittyProtocolEnabled(true);

    let remainder = '';
    const parsed: Array<ReturnType<typeof parseKeypress>> = [];

    for (const piece of ['\x1b[127;1:', '2u']) {
      const result = splitInputChunksWithRemainder(remainder + piece);
      remainder = result.remainder;
      parsed.push(...result.chunks.map((chunk) => parseKeypress(chunk)));
    }

    expect(remainder).toBe('');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.input).toBe('');
    expect(parsed[0]?.key.backspace).toBe(true);
  });

  it('does not corrupt text when held delete/backspace stream is fragmented', () => {
    setKittyProtocolEnabled(true);

    const initialValue = 'this is a long line';
    const heldDeleteStream = '\x1b[127;1:2u'.repeat(initialValue.length);

    const chunks: string[] = [];
    for (let i = 0; i < heldDeleteStream.length; i += 4) {
      chunks.push(heldDeleteStream.slice(i, i + 4));
    }

    let state = { value: initialValue, cursorOffset: initialValue.length };
    let remainder = '';

    for (const chunk of chunks) {
      const split = splitInputChunksWithRemainder(remainder + chunk);
      remainder = split.remainder;

      for (const keyChunk of split.chunks) {
        const { input, key } = parseKeypress(keyChunk);

        if (key.backspace) {
          const next = applyBackspace(state.value, state.cursorOffset);
          if (next) state = next;
          continue;
        }

        if (key.delete) {
          const next = applyDelete(state.value, state.cursorOffset);
          if (next) state = next;
          continue;
        }

        const nextValue = state.value.slice(0, state.cursorOffset) + input + state.value.slice(state.cursorOffset);
        state = {
          value: nextValue,
          cursorOffset: state.cursorOffset + input.length,
        };
      }
    }

    expect(remainder).toBe('');
    expect(state).toEqual({ value: '', cursorOffset: 0 });
  });
});
