import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import type React from 'react';
import { useEffect, useState } from 'react';
import { FocusProvider, useFocus, useFocusCycle } from '../source/contexts/InputContext/FocusContext.js';
import { Box, Text } from 'ink';

// Test component that uses useFocus
const FocusableItem: React.FC<{ id: string; tabIndex?: number; label: string }> = ({ id, tabIndex, label }) => {
  const { isFocused } = useFocus({ id, tabIndex });
  return <Text>{isFocused ? `[${label}]` : label}</Text>;
};

// Test component with cycle control
const FocusTestApp: React.FC<{ items: Array<{ id: string; tabIndex?: number; label: string }> }> = ({ items }) => {
  const { getFocusableIds } = useFocusCycle();
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    // Wait a tick for all items to register
    const timer = setTimeout(() => {
      setIds(getFocusableIds());
    }, 10);
    return () => clearTimeout(timer);
  }, [getFocusableIds]);

  return (
    <Box flexDirection="column">
      {items.map((item) => (
        <FocusableItem key={item.id} {...item} />
      ))}
      <Text>{`Ids: ${ids.join(',')}`}</Text>
    </Box>
  );
};

describe('FocusContext tabIndex logic', () => {
  it('should sort by tabIndex in ascending order', async () => {
    const items = [
      { id: 'item3', tabIndex: 3, label: 'Third' },
      { id: 'item1', tabIndex: 1, label: 'First' },
      { id: 'item2', tabIndex: 2, label: 'Second' },
    ];

    const { lastFrame } = render(
      <FocusProvider>
        <FocusTestApp items={items} />
      </FocusProvider>,
    );

    // Wait for registration
    await new Promise((resolve) => setTimeout(resolve, 50));
    const output = lastFrame();
    expect(output).toContain('Ids: item1,item2,item3');
  });

  it('should handle duplicate tabIndex values with stable sort (registration order)', async () => {
    const items = [
      { id: 'itemC', tabIndex: 0, label: 'C' },
      { id: 'itemA', tabIndex: 0, label: 'A' },
      { id: 'itemB', tabIndex: 0, label: 'B' },
    ];

    const { lastFrame } = render(
      <FocusProvider>
        <FocusTestApp items={items} />
      </FocusProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    const output = lastFrame();
    // Should preserve registration order when tabIndex is the same
    expect(output).toContain('Ids: itemC,itemA,itemB');
  });

  it('should handle negative tabIndex', async () => {
    const items = [
      { id: 'item0', tabIndex: 0, label: 'Zero' },
      { id: 'item-1', tabIndex: -1, label: 'Minus One' },
      { id: 'item1', tabIndex: 1, label: 'One' },
    ];

    const { lastFrame } = render(
      <FocusProvider>
        <FocusTestApp items={items} />
      </FocusProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    const output = lastFrame();
    expect(output).toContain('Ids: item-1,item0,item1');
  });

  it('should handle gaps in tabIndex sequence', async () => {
    const items = [
      { id: 'item10', tabIndex: 10, label: 'Ten' },
      { id: 'item1', tabIndex: 1, label: 'One' },
      { id: 'item5', tabIndex: 5, label: 'Five' },
    ];

    const { lastFrame } = render(
      <FocusProvider>
        <FocusTestApp items={items} />
      </FocusProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    const output = lastFrame();
    expect(output).toContain('Ids: item1,item5,item10');
  });

  it('should handle items with no explicit tabIndex (defaults to 0)', async () => {
    const items = [
      { id: 'itemWithTab', tabIndex: 1, label: 'With Tab' },
      { id: 'itemNoTab1', label: 'No Tab 1' },
      { id: 'itemNoTab2', label: 'No Tab 2' },
    ];

    const { lastFrame } = render(
      <FocusProvider>
        <FocusTestApp items={items} />
      </FocusProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    const output = lastFrame();
    // Items without tabIndex default to 0, should come before tabIndex 1
    expect(output).toContain('Ids: itemNoTab1,itemNoTab2,itemWithTab');
  });

  it('should handle mixed positive and negative tabIndex', async () => {
    const items = [
      { id: 'item2', tabIndex: 2, label: 'Two' },
      { id: 'item-5', tabIndex: -5, label: 'Minus Five' },
      { id: 'item0', tabIndex: 0, label: 'Zero' },
      { id: 'item-1', tabIndex: -1, label: 'Minus One' },
    ];

    const { lastFrame } = render(
      <FocusProvider>
        <FocusTestApp items={items} />
      </FocusProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    const output = lastFrame();
    expect(output).toContain('Ids: item-5,item-1,item0,item2');
  });

  it('should maintain stable order with duplicate tabIndex across multiple items', async () => {
    const items = [
      { id: 'item1a', tabIndex: 1, label: '1a' },
      { id: 'item1b', tabIndex: 1, label: '1b' },
      { id: 'item1c', tabIndex: 1, label: '1c' },
      { id: 'item2', tabIndex: 2, label: '2' },
    ];

    const { lastFrame } = render(
      <FocusProvider>
        <FocusTestApp items={items} />
      </FocusProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    const output = lastFrame();
    // Registration order should be preserved for items with same tabIndex
    expect(output).toContain('Ids: item1a,item1b,item1c,item2');
  });
});

describe('FocusContext tabIndex edge cases', () => {
  it('should handle very large tabIndex values', async () => {
    const items = [
      { id: 'item999', tabIndex: 999, label: 'Large' },
      { id: 'item1', tabIndex: 1, label: 'Small' },
    ];

    const { lastFrame } = render(
      <FocusProvider>
        <FocusTestApp items={items} />
      </FocusProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    const output = lastFrame();
    expect(output).toContain('Ids: item1,item999');
  });

  it('should handle zero tabIndex explicitly set', async () => {
    const items = [
      { id: 'item0', tabIndex: 0, label: 'Explicit Zero' },
      { id: 'item1', tabIndex: 1, label: 'One' },
    ];

    const { lastFrame } = render(
      <FocusProvider>
        <FocusTestApp items={items} />
      </FocusProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    const output = lastFrame();
    expect(output).toContain('Ids: item0,item1');
  });
});

describe('FocusContext tabIndex with dynamic changes', () => {
  // Test component that can change tabIndex
  const DynamicTabIndexItem: React.FC<{ id: string; tabIndex: number; label: string }> = ({ id, tabIndex, label }) => {
    const { isFocused } = useFocus({ id, tabIndex });
    return <Text>{isFocused ? `[${label}]` : label}</Text>;
  };

  const DynamicTestApp: React.FC<{ items: Array<{ id: string; tabIndex: number; label: string }> }> = ({ items }) => {
    const { getFocusableIds } = useFocusCycle();
    const [ids, setIds] = useState<string[]>([]);

    useEffect(() => {
      const timer = setTimeout(() => {
        setIds(getFocusableIds());
      }, 10);
      return () => clearTimeout(timer);
    }, [getFocusableIds]);

    return (
      <Box flexDirection="column">
        {items.map((item) => (
          <DynamicTabIndexItem key={item.id} {...item} />
        ))}
        <Text>{`Ids: ${ids.join(',')}`}</Text>
      </Box>
    );
  };

  it('should verify tabIndex is captured correctly on initial render', async () => {
    const items = [
      { id: 'item1', tabIndex: 1, label: 'First' },
      { id: 'item2', tabIndex: 2, label: 'Second' },
    ];

    const { lastFrame } = render(
      <FocusProvider>
        <DynamicTestApp items={items} />
      </FocusProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lastFrame()).toContain('Ids: item1,item2');
  });
});
