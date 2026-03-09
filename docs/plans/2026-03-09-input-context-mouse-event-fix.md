# Input Context Mouse Event Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three bugs in the input pipeline where mouse wheel events and mixed mouse+keyboard input sequences are silently dropped.

**Architecture:** Refactor `parseMouseEvent` to return fine-grained results (consumed bytes, unconsumed remainder, individual events) instead of an all-or-nothing approach. Update `InputProvider.handleInput` to dispatch non-mouse data through the keyboard pipeline and preserve incomplete trailing sequences as remainder.

**Tech Stack:** TypeScript, Vitest, React hooks

---

## Bug Summary

1. **Incomplete mouse sequences at chunk boundaries are lost**: When `parseMouseEvent` finds any SGR match, it returns `consumed: true`, the InputProvider calls `decoder.clear()` and discards any trailing incomplete escape sequence.
2. **Keyboard events interleaved with mouse events are dropped**: `consumed: true` causes the entire chunk to be treated as mouse-only data. Any keyboard sequences mixed in are silently ignored.
3. **Only one mouse event per read for non-wheel events**: For click/drag/release sequences in one chunk, only `lastMouse` is returned — intermediate events are lost.

## Key Files

- `packages/nuvin-cli/source/contexts/InputContext/parseKeypress.ts` — `parseMouseEvent`, `splitInputChunks`
- `packages/nuvin-cli/source/contexts/InputContext/InputProvider.tsx` — `handleInput`
- `packages/nuvin-cli/source/contexts/InputContext/InputStreamDecoder.ts` — remainder handling
- `packages/nuvin-cli/tests/InputStreamDecoder.test.ts` — existing decoder tests
- `packages/nuvin-cli/tests/InputParsing.fragmented-input.test.ts` — existing fragmented input tests

---

### Task 1: Write failing tests for parseMouseEvent bugs

**Files:**
- Create: `packages/nuvin-cli/tests/parseMouseEvent.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from 'vitest';
import { parseMouseEvent } from '../source/contexts/InputContext/parseKeypress.js';

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
  });

  describe('non-mouse data preservation', () => {
    it('returns unconsumed keyboard data when mixed with mouse events', () => {
      // Mouse event + up arrow + mouse event
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
      expect(result.events![0]).toEqual({ type: 'click', button: 0, x: 10, y: 20 });
      expect(result.events![1]).toEqual({ type: 'release', button: 0, x: 10, y: 20 });
    });

    it('returns all events for drag sequence', () => {
      const data = '\x1b[<0;10;20M\x1b[<32;11;20M\x1b[<32;12;20M\x1b[<0;12;20m';
      const result = parseMouseEvent(data);
      expect(result.consumed).toBe(true);
      expect(result.events).toHaveLength(4);
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
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/nuvin-cli && npx vitest run tests/parseMouseEvent.test.ts`
Expected: Multiple FAILs — `unconsumed`, `remainder`, and `events` properties don't exist yet on the return type.

---

### Task 2: Refactor parseMouseEvent return type and implementation

**Files:**
- Modify: `packages/nuvin-cli/source/contexts/InputContext/parseKeypress.ts` — `MouseParseResult` type and `parseMouseEvent` function

**Step 1: Update the MouseParseResult type**

Change:
```typescript
export type MouseParseResult = {
  mouse: MouseEvent | null;
  consumed: boolean;
};
```

To:
```typescript
export type MouseParseResult = {
  mouse: MouseEvent | null;
  consumed: boolean;
  /** Individual mouse events when multiple non-wheel events arrive in one chunk */
  events?: MouseEvent[];
  /** Non-mouse data that was interleaved — must be dispatched to keyboard pipeline */
  unconsumed?: string;
  /** Incomplete trailing escape sequence — must be preserved as decoder remainder */
  remainder?: string;
};
```

**Step 2: Rewrite parseMouseEvent to extract unconsumed and remainder data**

Replace the `parseMouseEvent` function body. The new logic:

1. Find all SGR mouse matches using `matchAll` with their indices
2. Collect non-mouse gaps between matches as `unconsumed`
3. Check if trailing data after last match looks like an incomplete escape sequence → `remainder`
4. For wheel events: aggregate into single event with count (existing behavior)
5. For non-wheel events: return individual events in `events` array
6. Still return `mouse` field for backwards compat (last event or aggregated wheel)

```typescript
export function parseMouseEvent(data: string): MouseParseResult {
  const hasSgrMouse = data.includes('\x1b[<');
  const hasX10Mouse = data.startsWith('\x1b[M') && data.length >= 6;

  if (!hasSgrMouse && !hasX10Mouse) {
    return { mouse: null, consumed: false };
  }

  // SGR mouse parsing
  if (hasSgrMouse) {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence for mouse events
    const sgrRegex = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
    const allMatches: Array<{ match: RegExpExecArray; event: MouseEvent }> = [];
    let wheelUpCount = 0;
    let wheelDownCount = 0;
    let lastX = 0;
    let lastY = 0;

    for (const match of data.matchAll(sgrRegex)) {
      const button = parseInt(match[1] ?? '0', 10);
      const x = parseInt(match[2] ?? '0', 10);
      const y = parseInt(match[3] ?? '0', 10);
      const isRelease = match[4] === 'm';
      lastX = x;
      lastY = y;

      let event: MouseEvent;
      if (button === 64) {
        wheelUpCount++;
        event = { type: 'wheel-up', button: 64, x, y, count: 1 };
      } else if (button === 65) {
        wheelDownCount++;
        event = { type: 'wheel-down', button: 65, x, y, count: 1 };
      } else if (button >= 32 && button < 64) {
        event = { type: 'drag', button: button - 32, x, y };
      } else if (isRelease) {
        event = { type: 'release', button, x, y };
      } else {
        event = { type: 'click', button, x, y };
      }

      allMatches.push({ match: match as RegExpExecArray, event });
    }

    if (allMatches.length === 0) {
      return { mouse: null, consumed: false };
    }

    // Collect non-mouse gaps
    let unconsumedParts: string[] = [];
    let lastEnd = 0;
    for (const { match } of allMatches) {
      if (match.index > lastEnd) {
        unconsumedParts.push(data.slice(lastEnd, match.index));
      }
      lastEnd = match.index + match[0].length;
    }

    // Check trailing data
    let remainder: string | undefined;
    let trailingUnconsumed: string | undefined;
    if (lastEnd < data.length) {
      const trailing = data.slice(lastEnd);
      // Check if trailing looks like start of incomplete mouse/escape sequence
      if (trailing.includes('\x1b')) {
        remainder = trailing;
      } else {
        trailingUnconsumed = trailing;
      }
    }

    if (trailingUnconsumed) {
      unconsumedParts.push(trailingUnconsumed);
    }

    const unconsumed = unconsumedParts.join('') || undefined;
    const events = allMatches.map(m => m.event);

    // Determine primary mouse event (backwards compat)
    let mouse: MouseEvent;
    if (wheelUpCount > 0) {
      mouse = { type: 'wheel-up', button: 64, x: lastX, y: lastY, count: wheelUpCount };
    } else if (wheelDownCount > 0) {
      mouse = { type: 'wheel-down', button: 65, x: lastX, y: lastY, count: wheelDownCount };
    } else {
      mouse = events[events.length - 1]!;
    }

    return { mouse, consumed: true, events, unconsumed, remainder };
  }

  // X10 mouse fallback (unchanged logic)
  if (data.length >= 6 && data.startsWith('\x1b[M')) {
    const rawButton = data.charCodeAt(3) - 32;
    const x = data.charCodeAt(4) - 32;
    const y = data.charCodeAt(5) - 32;
    const button = rawButton & 3;

    let event: MouseEvent;
    if (rawButton === 64) event = { type: 'wheel-up', button: 64, x, y, count: 1 };
    else if (rawButton === 65) event = { type: 'wheel-down', button: 65, x, y, count: 1 };
    else if (rawButton & 32) event = { type: 'drag', button, x, y };
    else if (rawButton === 3) event = { type: 'release', button, x, y };
    else event = { type: 'click', button, x, y };

    const remainder = data.length > 6 ? data.slice(6) : undefined;
    return { mouse: event, consumed: true, events: [event], remainder };
  }

  return { mouse: null, consumed: false };
}
```

**Step 3: Run parseMouseEvent tests**

Run: `cd packages/nuvin-cli && npx vitest run tests/parseMouseEvent.test.ts`
Expected: All tests PASS

---

### Task 3: Update InputProvider to handle unconsumed and remainder data

**Files:**
- Modify: `packages/nuvin-cli/source/contexts/InputContext/InputProvider.tsx` — `handleInput` function

**Step 1: Write a test for the integration behavior**

Add to `packages/nuvin-cli/tests/parseMouseEvent.test.ts`:

```typescript
describe('InputProvider integration: mixed mouse + keyboard', () => {
  it('unconsumed keyboard data should be fed back through the decoder', () => {
    // This is a design-level test — the actual integration test is:
    // When data = '\x1b[<64;10;20M\x1b[A\x1b[<64;10;20M'
    // parseMouseEvent returns unconsumed = '\x1b[A'
    // InputProvider should dispatch '\x1b[A' through dispatchParsedChunk
    const data = '\x1b[<64;10;20M\x1b[A\x1b[<64;10;20M';
    const result = parseMouseEvent(data);
    expect(result.unconsumed).toBe('\x1b[A');
    // The InputProvider is responsible for dispatching this
  });
});
```

**Step 2: Update handleInput in InputProvider**

Change lines 311-335 in InputProvider.tsx:

Old:
```typescript
    const handleInput = (data: string) => {
      clearEscapeFlushTimer();

      const combinedData = decoderRef.current.getCombinedData(data);

      const { mouse, consumed } = parseMouseEvent(combinedData);
      if (consumed && mouse) {
        decoderRef.current.clear();
        distributeMouse(mouse);
        return;
      }

      const { chunks, hasPendingEscape } = decoderRef.current.feedCombinedData(combinedData);
      for (const chunk of chunks) {
        dispatchParsedChunk(chunk);
      }

      if (hasPendingEscape) {
        escapeFlushTimerRef.current = setTimeout(() => {
          escapeFlushTimerRef.current = null;
          for (const chunk of decoderRef.current.flushPendingEscape()) {
            dispatchParsedChunk(chunk);
          }
        }, ESC_FLUSH_DELAY_MS);
      }
    };
```

New:
```typescript
    const handleInput = (data: string) => {
      clearEscapeFlushTimer();

      const combinedData = decoderRef.current.getCombinedData(data);

      const { mouse, consumed, events, unconsumed, remainder } = parseMouseEvent(combinedData);
      if (consumed && mouse) {
        // Set remainder for incomplete trailing sequences, or clear if none
        if (remainder) {
          decoderRef.current.setRemainder(remainder);
        } else {
          decoderRef.current.clear();
        }

        // Dispatch mouse events
        if (events && events.length > 1 && !mouse.count) {
          // Multiple non-wheel events: dispatch each individually
          for (const event of events) {
            distributeMouse(event);
          }
        } else {
          // Single event or aggregated wheel: dispatch the primary
          distributeMouse(mouse);
        }

        // Dispatch any non-mouse data through the keyboard pipeline
        if (unconsumed) {
          const { chunks, hasPendingEscape } = decoderRef.current.feedCombinedData(unconsumed);
          for (const chunk of chunks) {
            dispatchParsedChunk(chunk);
          }
          if (hasPendingEscape) {
            escapeFlushTimerRef.current = setTimeout(() => {
              escapeFlushTimerRef.current = null;
              for (const chunk of decoderRef.current.flushPendingEscape()) {
                dispatchParsedChunk(chunk);
              }
            }, ESC_FLUSH_DELAY_MS);
          }
        }

        return;
      }

      const { chunks, hasPendingEscape } = decoderRef.current.feedCombinedData(combinedData);
      for (const chunk of chunks) {
        dispatchParsedChunk(chunk);
      }

      if (hasPendingEscape) {
        escapeFlushTimerRef.current = setTimeout(() => {
          escapeFlushTimerRef.current = null;
          for (const chunk of decoderRef.current.flushPendingEscape()) {
            dispatchParsedChunk(chunk);
          }
        }, ESC_FLUSH_DELAY_MS);
      }
    };
```

**Step 3: Add setRemainder method to InputStreamDecoder**

In `InputStreamDecoder.ts`, add:

```typescript
  setRemainder(value: string): void {
    this.remainder = value;
  }
```

**Step 4: Run all input-related tests**

Run: `cd packages/nuvin-cli && npx vitest run tests/parseMouseEvent.test.ts tests/InputStreamDecoder.test.ts tests/InputParsing.fragmented-input.test.ts`
Expected: All PASS

---

### Task 4: Add splitInputChunks test for mouse sequence non-interference

**Files:**
- Modify: `packages/nuvin-cli/tests/parseMouseEvent.test.ts`

**Step 1: Add test verifying splitInputChunks correctly handles SGR mouse sequences**

```typescript
import { splitInputChunks } from '../source/contexts/InputContext/parseKeypress.js';

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
```

**Step 2: Run tests**

Run: `cd packages/nuvin-cli && npx vitest run tests/parseMouseEvent.test.ts`
Expected: All PASS

---

### Task 5: Run full test suite and commit

**Step 1: Run full test suite**

Run: `cd packages/nuvin-cli && npx vitest run`
Expected: All existing tests still PASS

**Step 2: Check for TypeScript errors**

Run: `cd packages/nuvin-cli && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/contexts/InputContext/parseKeypress.ts \
       packages/nuvin-cli/source/contexts/InputContext/InputProvider.tsx \
       packages/nuvin-cli/source/contexts/InputContext/InputStreamDecoder.ts \
       packages/nuvin-cli/tests/parseMouseEvent.test.ts
git commit -m "fix(input): handle incomplete mouse sequences, mixed mouse+keyboard data, and multi-event batches"
```
