import { describe, expect, it } from 'vitest';
import { InputStreamDecoder } from '../source/contexts/InputContext/InputStreamDecoder.js';

describe('InputStreamDecoder', () => {
  it('keeps lone ESC pending and flushes it as a standalone key', () => {
    const decoder = new InputStreamDecoder();

    const first = decoder.feedCombinedData(decoder.getCombinedData('\x1b'));
    expect(first.chunks).toEqual([]);
    expect(first.hasPendingEscape).toBe(true);
    expect(decoder.getRemainder()).toBe('\x1b');

    expect(decoder.flushPendingEscape()).toEqual(['\x1b']);
    expect(decoder.getRemainder()).toBe('');
  });

  it('combines split ESC+char into a single meta sequence when next chunk arrives', () => {
    const decoder = new InputStreamDecoder();

    const first = decoder.feedCombinedData(decoder.getCombinedData('\x1b'));
    expect(first.hasPendingEscape).toBe(true);

    const second = decoder.feedCombinedData(decoder.getCombinedData('a'));
    expect(second.hasPendingEscape).toBe(false);
    expect(second.chunks).toEqual(['\x1ba']);
    expect(decoder.getRemainder()).toBe('');
  });

  it('continues buffering fragmented CSI sequences', () => {
    const decoder = new InputStreamDecoder();

    const first = decoder.feedCombinedData(decoder.getCombinedData('\x1b[3'));
    expect(first.chunks).toEqual([]);
    expect(decoder.getRemainder()).toBe('\x1b[3');

    const second = decoder.feedCombinedData(decoder.getCombinedData('~'));
    expect(second.chunks).toEqual(['\x1b[3~']);
    expect(decoder.getRemainder()).toBe('');
  });
});
