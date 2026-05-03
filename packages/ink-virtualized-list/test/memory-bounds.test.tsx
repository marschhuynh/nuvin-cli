import { Box, render, Text } from "@nuvin/ink";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { VirtualizedList, type VirtualizedListRef } from "../src/index.js";
import createStdin from "./helpers/create-stdin.js";
import createStdout from "./helpers/create-stdout.js";

const waitForInk = async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
};

const makeItems = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) => ({
    id: `item-${index + offset}`,
    label: `Item ${index + offset}`,
  }));

describe("VirtualizedList — memory bounds & callback gating", () => {
  it("does not call onScroll when scroll-state values are unchanged across renders", async () => {
    const onScroll = vi.fn();
    const stdout = createStdout();
    const stdin = createStdin();
    const items = makeItems(20);

    const instance = render(
      <VirtualizedList
        items={items}
        height={5}
        autoFollow={false}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
        onScroll={onScroll}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    const initialCallCount = onScroll.mock.calls.length;
    expect(initialCallCount).toBeGreaterThan(0);

    // Re-render with the SAME props — scroll state is unchanged.
    instance.rerender(
      <VirtualizedList
        items={items}
        height={5}
        autoFollow={false}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
        onScroll={onScroll}
      />,
    );
    await waitForInk();

    instance.unmount();
    instance.cleanup();

    // Re-render with same scroll state should NOT trigger onScroll again.
    expect(onScroll.mock.calls.length).toBe(initialCallCount);
  });

  it("does not call onVisibleRangeChange when range is unchanged", async () => {
    const onVisibleRangeChange = vi.fn();
    const stdout = createStdout();
    const stdin = createStdin();
    const items = makeItems(20);

    const instance = render(
      <VirtualizedList
        items={items}
        height={5}
        autoFollow={false}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
        onVisibleRangeChange={onVisibleRangeChange}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    const initialCallCount = onVisibleRangeChange.mock.calls.length;
    expect(initialCallCount).toBeGreaterThan(0);

    instance.rerender(
      <VirtualizedList
        items={items}
        height={5}
        autoFollow={false}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
        onVisibleRangeChange={onVisibleRangeChange}
      />,
    );
    await waitForInk();

    instance.unmount();
    instance.cleanup();

    expect(onVisibleRangeChange.mock.calls.length).toBe(initialCallCount);
  });

  it("calls onScroll only once when scrollY actually changes", async () => {
    const onScroll = vi.fn();
    const stdout = createStdout();
    const stdin = createStdin();
    const items = makeItems(50);
    const ref = React.createRef<VirtualizedListRef>();

    const instance = render(
      <VirtualizedList
        ref={ref}
        items={items}
        height={5}
        autoFollow={false}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
        onScroll={onScroll}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    const before = onScroll.mock.calls.length;

    ref.current?.scrollToOffset(10);
    await waitForInk();

    instance.unmount();
    instance.cleanup();

    // At least one new call (the scroll event), but not many.
    const newCalls = onScroll.mock.calls.length - before;
    expect(newCalls).toBeGreaterThanOrEqual(1);
    expect(newCalls).toBeLessThanOrEqual(3);
  });

  it("re-renders many visible rows without crashing under append-only growth", async () => {
    // Smoke test for the bounded-cache behavior: a long-running append-only
    // list should not throw or grow without limit.
    const stdout = createStdout();
    const stdin = createStdin();

    let items = makeItems(10);
    const instance = render(
      <VirtualizedList
        items={items}
        height={5}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
      { stdout, stdin, debug: true },
    );

    for (let batch = 0; batch < 50; batch++) {
      items = items.concat(makeItems(50, items.length));
      instance.rerender(
        <VirtualizedList
          items={items}
          height={5}
          estimateItemHeight={() => 1}
          keyExtractor={(item) => item.id}
          renderItem={(item) => <Text>{item.label}</Text>}
        />,
      );
      await waitForInk();
    }

    instance.unmount();
    instance.cleanup();

    expect(items.length).toBe(2510);
  });

  it("renders correctly after many resize events", async () => {
    const stdout = createStdout(80);
    const stdin = createStdin();
    const items = [
      { id: "a", label: "Alpha Beta Gamma Delta" },
      { id: "b", label: "Epsilon Zeta Eta Theta" },
    ];

    const instance = render(
      <VirtualizedList
        items={items}
        height={3}
        autoFollow={false}
        keyExtractor={(item) => item.id}
        renderItem={(item) => (
          <Box flexDirection="column">
            <Text>{item.label}</Text>
          </Box>
        )}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();

    for (const cols of [60, 40, 80, 20, 100]) {
      stdout.columns = cols;
      stdout.emit("resize");
      await waitForInk();
    }

    const final = stdout.get();

    instance.unmount();
    instance.cleanup();

    // Must still render the scrollbar glyph after multiple resizes.
    expect(final).toContain("▌");
  });

  it("updates contentHeight when offscreen estimates change", async () => {
    // When items above the viewport get a larger estimate, contentHeight
    // grows accordingly. Note: anchor preservation across estimate-prop
    // changes (vs. measurement-driven changes) is a known limitation.
    const stdout = createStdout();
    const stdin = createStdin();
    const ref = React.createRef<VirtualizedListRef>();

    const compactItems = makeItems(20).map((item) => ({ ...item, lines: 1 }));
    const expandedItems = compactItems.map((item, index) =>
      index < 5 ? { ...item, lines: 2 } : item,
    );

    const instance = render(
      <VirtualizedList
        ref={ref}
        items={compactItems}
        height={3}
        overscan={0}
        autoFollow={false}
        estimateItemHeight={(item) => item.lines}
        keyExtractor={(item) => item.id}
        renderItem={(item) => (
          <Box flexDirection="column">
            {Array.from({ length: item.lines }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed test rows
              <Text key={i}>{`${item.label} L${i}`}</Text>
            ))}
          </Box>
        )}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    ref.current?.scrollToIndex(10, "start");
    await waitForInk();
    const beforeState = ref.current?.getScrollState();

    instance.rerender(
      <VirtualizedList
        ref={ref}
        items={expandedItems}
        height={3}
        overscan={0}
        autoFollow={false}
        estimateItemHeight={(item) => item.lines}
        keyExtractor={(item) => item.id}
        renderItem={(item) => (
          <Box flexDirection="column">
            {Array.from({ length: item.lines }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed test rows
              <Text key={i}>{`${item.label} L${i}`}</Text>
            ))}
          </Box>
        )}
      />,
    );
    await waitForInk();

    const afterState = ref.current?.getScrollState();

    instance.unmount();
    instance.cleanup();

    // 5 items above grew by 1 line each → contentHeight grew by 5.
    expect(afterState?.contentHeight).toBe((beforeState?.contentHeight ?? 0) + 5);
  });
});
