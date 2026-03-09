/**
 * Regression test: VirtualizedList scroll skip on large lists
 *
 * Root cause: Items not yet in the viewport use a placeholder height of 1.
 * When the viewport scrolls over them for the first time, their real height is
 * measured and `totalContentHeight` grows suddenly. Because `scrollY` doesn't
 * compensate, `marginTop` jumps, causing a visible line skip instead of a
 * smooth 1-line scroll.
 *
 * This test reproduces the bug by:
 * 1. Building a large list where every item has a multi-line height (> 1).
 * 2. Starting at the bottom (auto-scroll).
 * 3. Scrolling upward one step at a time.
 * 4. Asserting that each scroll step changes the visible content by exactly
 *    `scrollStep` lines — not more (the skip) and not less (stuck).
 * 5. Recording the per-step render time to surface performance regressions.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { describe, expect, it } from 'vitest';
import { render } from '../../../ink/build/index.js';
import createStdout from '../../../ink/test/helpers/create-stdout.js';
import { VirtualizedList } from '../../source/components/VirtualizedList.js';
import { InputContext } from '../../source/contexts/InputContext/InputContext.js';
import { FocusProvider } from '../../source/contexts/InputContext/FocusContext.js';
import type {
  InputContextValue,
  InputHandler,
  Key,
  MouseHandler,
  UseInputOptions,
  UseMouseOptions,
} from '../../source/contexts/InputContext/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Item = {
  id: string;
  lines: string[];
};

type SubscriberRecord<THandler> = {
  handler: THandler;
  options: { isActive?: boolean; priority?: number };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strip scrollbar characters and blank lines from a rendered frame. */
function getVisibleLines(frame: string): string[] {
  return frame
    .split('\n')
    .map((line) => line.replace(/[│┃]/g, '').trimEnd())
    .filter(Boolean);
}

function createInputHarness() {
  let nextId = 0;
  const inputSubscribers = new Map<number, SubscriberRecord<InputHandler>>();
  const mouseSubscribers = new Map<number, SubscriberRecord<MouseHandler>>();

  const subscribeFactory =
    <THandler, TOptions extends UseInputOptions | UseMouseOptions>(
      store: Map<number, SubscriberRecord<THandler>>,
    ) =>
    (handler: THandler, options: TOptions = {} as TOptions) => {
      const id = ++nextId;
      store.set(id, { handler, options });
      return () => {
        store.delete(id);
      };
    };

  const contextValue: InputContextValue = {
    subscribe: subscribeFactory(inputSubscribers),
    subscribeMouse: subscribeFactory(mouseSubscribers),
    updateSubscriber: () => {},
    addMiddleware: () => () => {},
    setRawMode: () => {},
    isRawModeSupported: false,
    enableMouseMode: () => {},
    disableMouseMode: () => {},
    isMouseModeEnabled: false,
  };

  const dispatchInput = (input: string, key: Partial<Key> = {}) => {
    const resolvedKey: Key = {
      upArrow: false,
      downArrow: false,
      leftArrow: false,
      rightArrow: false,
      pageDown: false,
      pageUp: false,
      home: false,
      end: false,
      return: false,
      escape: false,
      ctrl: false,
      shift: false,
      tab: false,
      backspace: false,
      delete: false,
      meta: false,
      ...key,
    };

    const subscribers = [...inputSubscribers.values()]
      .filter((s) => s.options.isActive !== false)
      .sort((a, b) => (b.options.priority ?? 0) - (a.options.priority ?? 0));

    for (const s of subscribers) {
      if (s.handler(input, resolvedKey) === true) return true;
    }

    return false;
  };

  return { contextValue, dispatchInput };
}

/**
 * Build a list of `count` items, each with `linesPerItem` text lines.
 * Using a fixed pattern so output is deterministic and easy to verify.
 */
function buildItems(count: number, linesPerItem: number): Item[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    lines: Array.from({ length: linesPerItem }, (__, l) => `item-${i}-line-${l}`),
  }));
}

function renderVirtualizedList(items: Item[], viewportHeight: number) {
  const stdout = createStdout(120);
  const inputHarness = createInputHarness();

  const instance = render(
    <InputContext.Provider value={inputHarness.contextValue}>
      <FocusProvider>
        <VirtualizedList
          items={items}
          renderItem={(item) => (
            <Box flexDirection="column" flexShrink={0}>
              {item.lines.map((line) => (
                <Text key={line}>{line}</Text>
              ))}
            </Box>
          )}
          keyExtractor={(item) => item.id}
          height={viewportHeight}
          overscan={3}
          scrollStep={1}
          showScrollbar={false}
          focus
        />
      </FocusProvider>
    </InputContext.Provider>,
    { stdout, debug: true },
  );

  return { instance, stdout, dispatchInput: inputHarness.dispatchInput };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VirtualizedList — scroll skip regression (large list)', () => {
  /**
   * Core reproduction: scroll up through the middle of a large list and
   * confirm that each scroll step changes the visible content by exactly
   * `scrollStep` lines — not more (the skip).
   *
   * With the bug present:
   *   - Items start with placeholder height 1.
   *   - As new items scroll into view they are measured (real height = 2).
   *   - `totalContentHeight` jumps, so the effective scroll position snaps
   *     forward, skipping lines instead of advancing smoothly.
   *
   * Detection: after each 'k' the previous top line should be at index 1 of
   * the new frame (viewport moved up 1 line). Index > 1 means lines were skipped.
   */
  it('advances exactly 1 line per scroll step throughout the entire list', async () => {
    const ITEM_COUNT = 60;
    const LINES_PER_ITEM = 2; // real height > placeholder (1) → triggers the bug
    const VIEWPORT_HEIGHT = 5;
    const items = buildItems(ITEM_COUNT, LINES_PER_ITEM);

    const { instance, stdout, dispatchInput } = renderVirtualizedList(items, VIEWPORT_HEIGHT);

    // Let auto-scroll settle at the bottom.
    await delay(100);

    let prev = getVisibleLines(stdout.get());
    expect(prev).toHaveLength(VIEWPORT_HEIGHT);

    // Scroll upward until the frame stops changing (top boundary hit).
    // Cap at 2× expected steps to avoid an infinite loop.
    const totalLines = ITEM_COUNT * LINES_PER_ITEM;
    const maxSteps = (totalLines - VIEWPORT_HEIGHT) * 2;

    const skipSizes: number[] = [];
    let stuckCount = 0;

    for (let step = 0; step < maxSteps; step++) {
      expect(dispatchInput('k')).toBe(true);
      await delay(30);

      const curr = getVisibleLines(stdout.get());

      // Detect top boundary: frame unchanged → we've reached the top.
      if (curr.join('') === prev.join('')) {
        stuckCount++;
        if (stuckCount >= 3) break;
        continue;
      }
      stuckCount = 0;

      const prevTop = prev[0];
      const posInCurr = curr.indexOf(prevTop);

      // posInCurr === 1 → correct 1-line advance
      // posInCurr  > 1 → skip (viewport jumped multiple lines)
      if (posInCurr > 1) {
        skipSizes.push(posInCurr);
      }

      prev = curr;
    }

    // No scroll step should have skipped more than 1 line.
    expect(skipSizes).toEqual(
      [],
      `Scroll skipped lines at ${skipSizes.length} step(s). Skip sizes: [${skipSizes.join(', ')}].` +
        ` This indicates totalContentHeight jumped when placeholder heights were replaced by real heights.`,
    );

    instance.unmount();
  });

  /**
   * Performance test: each scroll step should render in a bounded time.
   *
   * The skip manifests as sudden re-layout work after height-cache misses
   * accumulate. A healthy implementation renders each step in roughly the
   * same time. A pathological one spikes mid-list.
   *
   * This test records per-step render times and fails if the maximum is more
   * than 5× the minimum (an order-of-magnitude spike signals the bug).
   */
  it(
    'renders each scroll step in consistent time (no mid-list spike)',
    async () => {
      // Keep item count moderate to stay within test timeout.
      const ITEM_COUNT = 30;
      const LINES_PER_ITEM = 3;
      const VIEWPORT_HEIGHT = 6;
      const items = buildItems(ITEM_COUNT, LINES_PER_ITEM);

      const { instance, stdout, dispatchInput } = renderVirtualizedList(items, VIEWPORT_HEIGHT);

      await delay(100);

      const totalLines = ITEM_COUNT * LINES_PER_ITEM;
      const stepsToTop = totalLines - VIEWPORT_HEIGHT;

      // Warm up first 3 steps (initial caching), then measure.
      for (let i = 0; i < 3; i++) {
        dispatchInput('k');
        await delay(30);
      }

      const stepTimes: number[] = [];

      for (let step = 0; step < stepsToTop - 3; step++) {
        const t0 = performance.now();
        dispatchInput('k');
        await delay(30);
        // Snapshot the frame to force a flush.
        void stdout.get();
        const elapsed = performance.now() - t0;
        stepTimes.push(elapsed);
      }

      const minTime = Math.min(...stepTimes);
      const maxTime = Math.max(...stepTimes);
      const avgTime = stepTimes.reduce((a, b) => a + b, 0) / stepTimes.length;

      // Log timings for diagnostics even when passing.
      console.log(
        `Scroll render times — min: ${minTime.toFixed(1)}ms, avg: ${avgTime.toFixed(1)}ms, max: ${maxTime.toFixed(1)}ms`,
      );

      // Find the steps where spikes occur.
      const spikeSteps = stepTimes
        .map((t, i) => ({ step: i + 3, time: t }))
        .filter(({ time }) => time > avgTime * 3);

      if (spikeSteps.length > 0) {
        console.log(
          'Spike steps (>3× avg):',
          spikeSteps.map(({ step, time }) => `step ${step}: ${time.toFixed(1)}ms`).join(', '),
        );
      }

      // Max should not be more than 5× the min for healthy scrolling.
      // A spike ratio >5 indicates that mid-list height-cache misses are causing
      // a cascade of state updates that re-layouts the entire list.
      expect(maxTime).toBeLessThanOrEqual(
        minTime * 5,
        `Render time spiked mid-list. min=${minTime.toFixed(1)}ms max=${maxTime.toFixed(1)}ms ratio=${(maxTime / minTime).toFixed(1)}×. ` +
          `This is caused by placeholder heights (1px) being replaced by real heights, inflating totalContentHeight suddenly.`,
      );

      instance.unmount();
    },
    15_000,
  );

  /**
   * Precise repro: a list with variable-height items where the first half
   * renders fine but the second half triggers skips because the height cache
   * only holds the first visible window worth of items.
   *
   * Scroll up from the bottom through all items. For each step, the line that
   * was at the top of the previous frame should appear at index 1 of the new
   * frame (viewport moved up 1 line, old top is now second). If it appears at
   * index > 1, the viewport skipped lines.
   */
  it('does not skip when scrolling through items measured for the first time', async () => {
    // 20 items, each 4 lines. Viewport of 4 → only 1 item visible at once.
    // After auto-scroll settles at the bottom, items 0..N-viewport are unseen.
    const ITEM_COUNT = 20;
    const LINES_PER_ITEM = 4;
    const VIEWPORT_HEIGHT = 4;
    const items = buildItems(ITEM_COUNT, LINES_PER_ITEM);

    const { instance, stdout, dispatchInput } = renderVirtualizedList(items, VIEWPORT_HEIGHT);
    await delay(100);

    // Cap at 2× expected steps; stop early if top boundary is hit.
    const totalLines = ITEM_COUNT * LINES_PER_ITEM;
    const maxSteps = (totalLines - VIEWPORT_HEIGHT) * 2;

    let prev = getVisibleLines(stdout.get());
    const violations: { step: number; prevTop: string; posInCurr: number }[] = [];
    let stuckCount = 0;

    for (let step = 0; step < maxSteps; step++) {
      expect(dispatchInput('k')).toBe(true);
      await delay(40);

      const curr = getVisibleLines(stdout.get());

      // Detect top boundary: frame unchanged → we've reached the top.
      if (curr.join('') === prev.join('')) {
        stuckCount++;
        if (stuckCount >= 3) break;
        continue;
      }
      stuckCount = 0;

      const prevTopLine = prev[0];
      const posInCurr = curr.indexOf(prevTopLine);

      // posInCurr === 1 → correct 1-line advance
      // posInCurr  > 1 → viewport skipped lines
      // posInCurr === -1 → item completely skipped over (larger skip)
      if (posInCurr !== 1) {
        violations.push({ step, prevTop: prevTopLine, posInCurr });
      }

      prev = curr;
    }

    expect(violations).toEqual(
      [],
      `Scroll violations detected:\n${violations
        .map(
          (v) =>
            `  step ${v.step}: expected "${v.prevTop}" at index 1, found at ${v.posInCurr} (${v.posInCurr === -1 ? 'item disappeared — viewport jumped past it' : `skipped ${v.posInCurr - 1} extra line(s)`})`,
        )
        .join('\n')}`,
    );

    instance.unmount();
  });
});
