import { Box, type DOMElement, measureElement, render, Text } from "@nuvin/ink";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { VirtualizedList, type VirtualizedListRef } from "../src/index.js";
import createStdin from "./helpers/create-stdin.js";
import createStdout from "./helpers/create-stdout.js";
import { renderToString } from "./helpers/render-to-string.js";

const waitForInk = async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
};

const getVisibleLines = (output: string) => {
  return output
    .split("\n")
    .map((line) => line.replace(/[│┃▌]/g, "").trimEnd())
    .filter(Boolean);
};

const makeItems = (count: number) => {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    label: `Item ${index}`,
  }));
};

describe("VirtualizedList", () => {
  it("is exported from the public package entrypoint", () => {
    expect(VirtualizedList).toBeDefined();
  });

  it("lets rendered items take the full list width", async () => {
    const measuredWidths: number[] = [];

    const MeasuredItem = () => {
      const ref = React.useRef<DOMElement | null>(null);

      React.useLayoutEffect(() => {
        if (ref.current) {
          measuredWidths.push(measureElement(ref.current).width);
        }
      });

      return (
        <Box ref={ref} width="100%">
          <Text>short</Text>
        </Box>
      );
    };

    const stdout = createStdout();
    const stdin = createStdin();

    const instance = render(
      <VirtualizedList
        items={[{ id: "item-0" }]}
        width={40}
        height={3}
        showScrollbar={false}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={() => <MeasuredItem />}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    instance.unmount();
    instance.cleanup();

    expect(measuredWidths.at(-1)).toBe(40);
  });

  it("renders only the visible slice plus overscan", async () => {
    const items = makeItems(100);

    const stdout = createStdout();
    const stdin = createStdin();

    const instance = render(
      <VirtualizedList
        items={items}
        height={5}
        overscan={1}
        autoFollow={false}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
      { stdout, stdin, debug: true },
    );
    await waitForInk();
    const output = stdout.get();
    instance.unmount();
    instance.cleanup();

    expect(output).toContain("Item 0");
    expect(output).toContain("Item 4");
    expect(output).not.toContain("Item 20");
    expect(output).not.toContain("Item 99");
  });

  it("renders a bounded subset of items for large lists", async () => {
    const items = makeItems(100);
    const renderItem = vi.fn((item: { label: string }) => <Text>{item.label}</Text>);
    const stdout = createStdout();
    const stdin = createStdin();

    const instance = render(
      <VirtualizedList
        items={items}
        height={5}
        overscan={1}
        autoFollow={false}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    instance.unmount();
    instance.cleanup();

    const uniqueIds = new Set(renderItem.mock.calls.map((call) => call[0].label));
    expect(uniqueIds.size).toBeLessThan(20);
  });

  it("scrolls with keyboard only when focused", async () => {
    const items = makeItems(10);
    const stdout = createStdout();
    const stdin = createStdin();

    const instance = render(
      <VirtualizedList
        items={items}
        height={3}
        autoFollow={false}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    stdin.send("\u001B[B");
    await waitForInk();
    const unfocused = getVisibleLines(stdout.get());

    instance.rerender(
      <VirtualizedList
        items={items}
        height={3}
        autoFollow={false}
        autoFocus
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
    );
    await waitForInk();
    stdin.send("\u001B[B");
    await waitForInk();
    const focused = getVisibleLines(stdout.get());

    instance.unmount();
    instance.cleanup();

    expect(unfocused).toEqual(["Item 0", "Item 1", "Item 2"]);
    expect(focused).toEqual(["Item 1", "Item 2", "Item 3"]);
  });

  it("supports imperative scrolling through the public ref", async () => {
    const items = makeItems(20);
    const stdout = createStdout();
    const stdin = createStdin();
    const ref = React.createRef<VirtualizedListRef>();

    const instance = render(
      <VirtualizedList
        ref={ref}
        items={items}
        height={3}
        autoFollow={false}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    ref.current?.scrollToIndex(10, "start");
    await waitForInk();
    const output = getVisibleLines(stdout.get());
    const scrollState = ref.current?.getScrollState();

    instance.unmount();
    instance.cleanup();

    expect(output).toEqual(["Item 10", "Item 11", "Item 12"]);
    expect(scrollState?.scrollY).toBe(10);
    expect(scrollState?.atTop).toBe(false);
    expect(scrollState?.atBottom).toBe(false);
  });

  it("auto-follows new items at the bottom by default", async () => {
    const stdout = createStdout();
    const stdin = createStdin();

    const instance = render(
      <VirtualizedList
        items={makeItems(5)}
        height={3}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    const before = getVisibleLines(stdout.get());

    instance.rerender(
      <VirtualizedList
        items={makeItems(6)}
        height={3}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
    );
    await waitForInk();
    const after = getVisibleLines(stdout.get());

    instance.unmount();
    instance.cleanup();

    expect(before).toEqual(["Item 2", "Item 3", "Item 4"]);
    expect(after).toEqual(["Item 3", "Item 4", "Item 5"]);
  });

  it("uses a larger current estimate immediately when an existing item grows", async () => {
    const stdout = createStdout();
    const stdin = createStdin();
    const ref = React.createRef<VirtualizedListRef>();
    const compactItems = [
      { id: "item-0", lines: 1 },
      { id: "item-1", lines: 1 },
      { id: "item-2", lines: 1 },
    ];
    const expandedItems = [
      { id: "item-0", lines: 1 },
      { id: "item-1", lines: 4 },
      { id: "item-2", lines: 1 },
    ];

    const renderItem = (item: { lines: number }) => (
      <Box flexDirection="column">
        {Array.from({ length: item.lines }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed test rows
          <Text key={index}>{`line ${index}`}</Text>
        ))}
      </Box>
    );

    const instance = render(
      <VirtualizedList
        ref={ref}
        items={compactItems}
        height={3}
        estimateItemHeight={(item) => item.lines}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();

    instance.rerender(
      <VirtualizedList
        ref={ref}
        items={expandedItems}
        height={3}
        estimateItemHeight={(item) => item.lines}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
      />,
    );

    const scrollState = ref.current?.getScrollState();

    instance.unmount();
    instance.cleanup();

    expect(scrollState?.contentHeight).toBe(6);
    expect(scrollState?.scrollY).toBe(3);
  });

  it("invalidates a cached measured height when an offscreen item's estimate changes", async () => {
    const stdout = createStdout();
    const stdin = createStdin();
    const ref = React.createRef<VirtualizedListRef>();
    const compactItems = makeItems(20).map((item) => ({ ...item, lines: 1 }));
    const expandedItems = compactItems.map((item, index) =>
      index === 0 ? { ...item, lines: 5 } : item,
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
            {Array.from({ length: item.lines }, (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed test rows
              <Text key={index}>{`${item.label} line ${index}`}</Text>
            ))}
          </Box>
        )}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    ref.current?.scrollToIndex(19, "end");
    await waitForInk();

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
            {Array.from({ length: item.lines }, (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed test rows
              <Text key={index}>{`${item.label} line ${index}`}</Text>
            ))}
          </Box>
        )}
      />,
    );

    const scrollState = ref.current?.getScrollState();

    instance.unmount();
    instance.cleanup();

    expect(scrollState?.contentHeight).toBe(24);
  });

  it("suspends auto-follow after manual upward scroll", async () => {
    const items = makeItems(5);
    const stdout = createStdout();
    const stdin = createStdin();

    const instance = render(
      <VirtualizedList
        items={items}
        height={3}
        autoFocus
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    stdin.send("\u001B[A");
    await waitForInk();

    instance.rerender(
      <VirtualizedList
        items={makeItems(6)}
        height={3}
        autoFocus
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
    );
    await waitForInk();
    const output = getVisibleLines(stdout.get());

    instance.unmount();
    instance.cleanup();

    expect(output).toEqual(["Item 1", "Item 2", "Item 3"]);
    expect(output).not.toContain("Item 5");
  });

  it("invalidates measured heights when terminal width changes", async () => {
    const items = [
      { id: "item-1", label: "Alpha Beta Gamma Delta" },
      { id: "item-2", label: "Alpha Beta Gamma Delta" },
    ];
    const stdout = createStdout(30);
    const stdin = createStdin();

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
    const before = stdout.get();

    stdout.columns = 10;
    stdout.emit("resize");
    await waitForInk();
    const after = stdout.get();

    instance.unmount();
    instance.cleanup();

    expect(before).toContain("▌");
    expect(after).toContain("▌");
  });

  it("remeasures when the container height changes", async () => {
    const items = makeItems(5);
    const stdout = createStdout();
    const stdin = createStdin();

    const instance = render(
      <VirtualizedList
        items={items}
        height={2}
        autoFollow={false}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    const before = stdout.get();

    instance.rerender(
      <VirtualizedList
        items={items}
        height={5}
        autoFollow={false}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
    );
    await waitForInk();
    const after = stdout.get();

    instance.unmount();
    instance.cleanup();

    expect(before).toContain("▌");
    expect(after).toContain("▌");
  });

  it("always reserves scrollbar space when enabled", () => {
    const idle = renderToString(
      <VirtualizedList
        items={makeItems(2)}
        height={3}
        autoFollow={false}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
    );

    const scrolling = renderToString(
      <VirtualizedList
        items={makeItems(6)}
        height={3}
        autoFollow={false}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
    );

    expect(idle).toContain("▌");
    expect(scrolling).toContain("▌");
  });
});
