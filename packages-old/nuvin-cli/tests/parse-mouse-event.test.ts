import { describe, expect, it } from 'vitest';
import { parseMouseEvent, splitInputChunks } from '../source/contexts/InputContext/parseKeypress.js';

describe('parseMouseEvent', () => {
  describe('wheel event aggregation', () => {
    it('parses a single wheel-up event', () => {
      const data = '\x1b[<64;10;20M';
      const result = parseMouseEvent(data);
      expect(result.consumed).toBe(true);
      expect(result.mouse).toEqual({ type: 'wheel-up', button: 64, x: 10, y: 20, count: 1 });
    });

    it('aggregates multiple wheel-up events', () => {
      const data = '\x1b[<64;10;20M\x1b[<64;10;20M\x1b[<64;10;20M';
      const result = parseMouseEvent(data);
      expect(result.consumed).toBe(true);
      expect(result.mouse).toEqual({ type: 'wheel-up', button: 64, x: 10, y: 20, count: 3 });
    });

    it('aggregates multiple wheel-down events', () => {
      const data = '\x1b[<65;10;20M\x1b[<65;10;20M';
      const result = parseMouseEvent(data);
      expect(result.consumed).toBe(true);
      expect(result.mouse).toEqual({ type: 'wheel-down', button: 65, x: 10, y: 20, count: 2 });
    });
  });

  describe('non-mouse data preservation', () => {
    it('returns unconsumed keyboard data when mixed with mouse events', () => {
      const data = '\x1b[<64;10;20M\x1b[A\x1b[<64;10;20M';
      const result = parseMouseEvent(data);
      expect(result.consumed).toBe(true);
      expect(result.unconsumed).toBe('\x1b[A');
    });

    it('returns trailing non-mouse data as unconsumed', () => {
      const data = '\x1b[<64;10;20Mhello';
      const result = parseMouseEvent(data);
      expect(result.consumed).toBe(true);
      expect(result.unconsumed).toBe('hello');
    });

    it('returns leading non-mouse data as unconsumed', () => {
      const data = 'abc\x1b[<64;10;20M';
      const result = parseMouseEvent(data);
      expect(result.consumed).toBe(true);
      expect(result.unconsumed).toBe('abc');
    });
  });

  describe('incomplete trailing mouse sequences', () => {
    it('returns incomplete trailing SGR sequence as remainder', () => {
      const data = '\x1b[<64;10;20M\x1b[<64;10';
      const result = parseMouseEvent(data);
      expect(result.consumed).toBe(true);
      expect(result.remainder).toBe('\x1b[<64;10');
    });

    it('returns incomplete trailing ESC as remainder', () => {
      const data = '\x1b[<64;10;20M\x1b';
      const result = parseMouseEvent(data);
      expect(result.consumed).toBe(true);
      expect(result.remainder).toBe('\x1b');
    });
  });

  describe('multiple non-wheel mouse events', () => {
    it('returns all events for click then release in one chunk', () => {
      const data = '\x1b[<0;10;20M\x1b[<0;10;20m';
      const result = parseMouseEvent(data);
      expect(result.consumed).toBe(true);
      expect(result.events).toHaveLength(2);
      expect(result.events?.[0]).toEqual({ type: 'click', button: 0, x: 10, y: 20 });
      expect(result.events?.[1]).toEqual({ type: 'release', button: 0, x: 10, y: 20 });
    });

    it('returns all events for drag sequence', () => {
      const data = '\x1b[<0;10;20M\x1b[<32;11;20M\x1b[<32;12;20M\x1b[<0;12;20m';
      const result = parseMouseEvent(data);
      expect(result.consumed).toBe(true);
      expect(result.events).toHaveLength(4);
      expect(result.events[0]?.type).toBe('click');
      expect(result.events[1]?.type).toBe('drag');
      expect(result.events[2]?.type).toBe('drag');
      expect(result.events[3]?.type).toBe('release');
    });
  });

  describe('no mouse data', () => {
    it('returns consumed false for plain keyboard input', () => {
      const data = '\x1b[A';
      const result = parseMouseEvent(data);
      expect(result.consumed).toBe(false);
      expect(result.mouse).toBeNull();
    });

    it('returns consumed false for plain text', () => {
      const data = 'hello';
      const result = parseMouseEvent(data);
      expect(result.consumed).toBe(false);
      expect(result.mouse).toBeNull();
    });
  });
});

describe('splitInputChunks with mouse sequences', () => {
  it('splits multiple SGR mouse events into separate chunks', () => {
    const data = '\x1b[<64;10;20M\x1b[<64;10;20M\x1b[<64;10;20M';
    const chunks = splitInputChunks(data);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toBe('\x1b[<64;10;20M');
  });

  it('splits mixed mouse + keyboard into separate chunks', () => {
    const data = '\x1b[<64;10;20M\x1b[A\x1b[<64;10;20M';
    const chunks = splitInputChunks(data);
    expect(chunks).toHaveLength(3);
    expect(chunks[1]).toBe('\x1b[A');
  });
});
