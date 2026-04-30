import { Box, render, Text } from "@nuvin/ink";
import React from "react";
import { describe, expect, it } from "vitest";
import { VirtualizedList, type VirtualizedListRef } from "../src/index.js";
import createStdin from "./helpers/create-stdin.js";
import createStdout from "./helpers/create-stdout.js";

const waitForInk = async () => {
  await new Promise((resolve) => setTimeout(resolve, 5));
};

const makeItems = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    label: `Item ${index}`,
  }));

describe("VirtualizedList — scroll stress / cache bounds", () => {
  it("keeps caches bounded under continuous scrolling", async () => {
    const stdout = createStdout();
    const stdin = createStdin();
    const ref = React.createRef<VirtualizedListRef>();
    const items = makeItems(10000); // large list

    const instance = render(
      <VirtualizedList
        ref={ref}
        items={items}
        height={20}
        overscan={5}
        autoFollow={false}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();

    if (global.gc) global.gc();
    const heapBefore = process.memoryUsage().heapUsed;

    // Scroll progressively through the entire list.
    const SCROLLS = 400;
    for (let step = 0; step < SCROLLS; step++) {
      ref.current?.scrollToOffset(step * 25);
      await waitForInk();
    }

    const finalSizes = ref.current?.__getDebugCacheSizes?.();

    // Clear the stdout mock's call history — it retains every frame string,
    // which inflates heap measurement and is a test-artifact, not a real leak.
    const writeMock = stdout.write as unknown as { mockClear?: () => void };
    writeMock.mockClear?.();

    if (global.gc) {
      global.gc();
      global.gc();
    }
    const heapAfter = process.memoryUsage().heapUsed;
    const heapGrowthMB = (heapAfter - heapBefore) / 1024 / 1024;
    const heapPerScrollKB = ((heapAfter - heapBefore) / SCROLLS / 1024).toFixed(2);

    instance.unmount();
    instance.cleanup();

    // eslint-disable-next-line no-console
    console.log(
      `[scroll stress] cache sizes after ${SCROLLS} scrolls: heightCache=${finalSizes?.heightCache}, refSetters=${finalSizes?.refSetters}, itemRefs=${finalSizes?.itemRefs}, heap growth=${heapGrowthMB.toFixed(2)} MB (${heapPerScrollKB} KB/scroll)`,
    );

    expect(finalSizes).toBeDefined();
    if (!finalSizes) return;

    expect(finalSizes.heightCache).toBeLessThanOrEqual(2048);
    expect(finalSizes.refSetters).toBeLessThanOrEqual(60);
    expect(finalSizes.itemRefs).toBeLessThanOrEqual(60);
  });

  it("keeps caches bounded under autoFollow with continuous appends", async () => {
    const stdout = createStdout();
    const stdin = createStdin();
    const ref = React.createRef<VirtualizedListRef>();

    let items = makeItems(20);

    const instance = render(
      <VirtualizedList
        ref={ref}
        items={items}
        height={20}
        overscan={5}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();

    // Simulate streaming logs/chat: append items repeatedly.
    for (let batch = 0; batch < 100; batch++) {
      const newItems = Array.from({ length: 20 }, (_, i) => {
        const id = items.length + i;
        return { id: `item-${id}`, label: `Item ${id}` };
      });
      items = items.concat(newItems);
      instance.rerender(
        <VirtualizedList
          ref={ref}
          items={items}
          height={20}
          overscan={5}
          estimateItemHeight={() => 1}
          keyExtractor={(item) => item.id}
          renderItem={(item) => <Text>{item.label}</Text>}
        />,
      );
      await waitForInk();
    }

    const finalSizes = ref.current?.__getDebugCacheSizes?.();

    instance.unmount();
    instance.cleanup();

    expect(finalSizes).toBeDefined();
    if (!finalSizes) return;

    // 2020 items total, but only visible ones should be retained beyond cap.
    expect(items.length).toBe(2020);
    expect(finalSizes.heightCache).toBeLessThanOrEqual(2048);
    expect(finalSizes.refSetters).toBeLessThanOrEqual(60);
    expect(finalSizes.itemRefs).toBeLessThanOrEqual(60);
  });

  it("keeps caches bounded when scrolling rapidly back and forth (LRU stress)", async () => {
    const stdout = createStdout();
    const stdin = createStdin();
    const ref = React.createRef<VirtualizedListRef>();
    const items = makeItems(5000);

    const instance = render(
      <VirtualizedList
        ref={ref}
        items={items}
        height={20}
        overscan={5}
        autoFollow={false}
        estimateItemHeight={() => 1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />,
      { stdout, stdin, debug: true },
    );

    await waitForInk();

    // Jump randomly through the list 300 times.
    for (let step = 0; step < 300; step++) {
      const target = Math.floor(Math.random() * 4900);
      ref.current?.scrollToIndex(target, "start");
      await waitForInk();
    }

    const finalSizes = ref.current?.__getDebugCacheSizes?.();

    instance.unmount();
    instance.cleanup();

    expect(finalSizes).toBeDefined();
    if (!finalSizes) return;

    expect(finalSizes.heightCache).toBeLessThanOrEqual(2048);
    expect(finalSizes.refSetters).toBeLessThanOrEqual(60);
    expect(finalSizes.itemRefs).toBeLessThanOrEqual(60);
  });
});
