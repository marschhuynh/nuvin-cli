import { Box, Text, measureElement } from 'ink';
import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('ink', async () => {
  const actual = await vi.importActual<typeof import('ink')>('ink');
  return {
    ...actual,
    measureElement: vi.fn(),
  };
});

vi.mock('../../source/contexts/InputContext/index.js', () => ({
  useInput: vi.fn(),
  useMouse: vi.fn(),
  useFocus: vi.fn().mockReturnValue({ isFocused: false }),
}));

import { VirtualizedList } from '../../source/components/VirtualizedList.js';

type Item = {
  id: string;
  label: string;
};

function delay(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMeasureMock({
  itemCount,
  getContainerHeight,
  getContainerWidth,
  getItemHeight,
}: {
  itemCount: number;
  getContainerHeight: () => number;
  getContainerWidth: () => number;
  getItemHeight: () => number;
}) {
  const uniqueRefs: object[] = [];
  const containerRefIndex = itemCount;

  vi.mocked(measureElement).mockImplementation((ref: object) => {
    if (!uniqueRefs.includes(ref)) {
      uniqueRefs.push(ref);
    }

    if (uniqueRefs.indexOf(ref) === containerRefIndex) {
      return {
        width: getContainerWidth(),
        height: getContainerHeight(),
      } as never;
    }

    return {
      width: getContainerWidth(),
      height: getItemHeight(),
    } as never;
  });
}

describe('VirtualizedList', () => {
  beforeEach(() => {
    vi.mocked(measureElement).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('remeasures the viewport when the parent height changes', async () => {
    const items: Item[] = [
      { id: 'item-1', label: 'Alpha' },
      { id: 'item-2', label: 'Beta' },
      { id: 'item-3', label: 'Gamma' },
    ];

    let containerHeight = 2;

    createMeasureMock({
      itemCount: items.length,
      getContainerHeight: () => containerHeight,
      getContainerWidth: () => 20,
      getItemHeight: () => 1,
    });

    const { lastFrame, rerender } = render(
      <VirtualizedList
        items={items}
        renderItem={(item) => (
          <Box>
            <Text>{item.label}</Text>
          </Box>
        )}
        keyExtractor={(item) => item.id}
        height={containerHeight}
      />,
    );

    await delay();
    expect(lastFrame()).toContain('┃');

    containerHeight = 6;
    rerender(
      <VirtualizedList
        items={items}
        renderItem={(item) => (
          <Box>
            <Text>{item.label}</Text>
          </Box>
        )}
        keyExtractor={(item) => item.id}
        height={containerHeight}
      />,
    );

    await delay();
    expect(lastFrame()).not.toContain('┃');
  });

  it('invalidates cached item heights when the viewport width changes', async () => {
    const items: Item[] = [
      { id: 'item-1', label: 'Alpha' },
      { id: 'item-2', label: 'Beta' },
    ];

    let containerWidth = 20;
    let itemHeight = 1;

    createMeasureMock({
      itemCount: items.length,
      getContainerHeight: () => 3,
      getContainerWidth: () => containerWidth,
      getItemHeight: () => itemHeight,
    });

    const estimateItemHeight = () => itemHeight;

    const { lastFrame, rerender } = render(
      <VirtualizedList
        items={items}
        renderItem={(item) => (
          <Box>
            <Text>{item.label}</Text>
          </Box>
        )}
        keyExtractor={(item) => item.id}
        estimateItemHeight={estimateItemHeight}
        width={containerWidth}
      />,
    );

    await delay();
    expect(lastFrame()).not.toContain('┃');

    containerWidth = 10;
    itemHeight = 3;
    rerender(
      <VirtualizedList
        items={items}
        renderItem={(item) => (
          <Box>
            <Text>{item.label}</Text>
          </Box>
        )}
        keyExtractor={(item) => item.id}
        estimateItemHeight={estimateItemHeight}
        width={containerWidth}
      />,
    );

    await delay();
    expect(lastFrame()).toContain('┃');
  });

  it('invalidates cached item heights when the container width changes', async () => {
    const items: Item[] = [
      { id: 'item-1', label: 'Alpha' },
      { id: 'item-2', label: 'Beta' },
    ];

    let containerWidth = 20;

    createMeasureMock({
      itemCount: items.length,
      getContainerHeight: () => 3,
      getContainerWidth: () => containerWidth,
      getItemHeight: () => (containerWidth <= 10 ? 3 : 1),
    });

    const { lastFrame, rerender } = render(
      <VirtualizedList
        items={items}
        renderItem={(item) => (
          <Box>
            <Text>{item.label}</Text>
          </Box>
        )}
        keyExtractor={(item) => item.id}
        width={containerWidth}
        height={3}
      />,
    );

    await delay();
    expect(lastFrame()).not.toContain('┃');

    containerWidth = 10;
    rerender(
      <VirtualizedList
        items={items}
        renderItem={(item) => (
          <Box>
            <Text>{item.label}</Text>
          </Box>
        )}
        keyExtractor={(item) => item.id}
        width={containerWidth}
        height={3}
      />,
    );

    await delay();
    expect(lastFrame()).toContain('┃');
  });
});
