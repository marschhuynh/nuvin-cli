import { vi } from 'vitest';

vi.mock('ink', async () => {
  const actual = await vi.importActual<typeof import('ink')>('ink');
  return {
    ...actual,
    measureElement: vi.fn(),
  };
});

vi.mock('@/contexts/InputContext/index.js', () => ({
  useInput: vi.fn(),
  useMouse: vi.fn(),
  useFocus: vi.fn().mockReturnValue({ isFocused: false }),
}));

vi.mock('@/contexts/ThemeContext.js', () => ({
  useTheme: vi.fn().mockReturnValue({
    theme: {
      colors: { accent: 'cyan', text: 'white', muted: 'gray', info: 'blue', warning: 'yellow' },
      tokens: { green: 'green', red: 'red', gray: 'gray', dim: 'gray' },
      model: { input: 'white', label: 'blue', selectedItem: 'cyan', item: 'white' },
      footer: { infoBg: undefined },
    },
  }),
}));

import { render } from 'ink-testing-library';
import { describe, it, expect, beforeEach } from 'vitest';
import { measureElement } from 'ink';
import type { ComboBoxItem } from '@/components/ComboBox/ComboBox.js';
import { WindowedComboBox } from '@/components/ComboBox/WindowedComboBox.js';

function makeItems(count: number): ComboBoxItem[] {
  return Array.from({ length: count }, (_, i) => ({
    label: `Item ${i + 1}`,
    value: `item-${i + 1}`,
  }));
}

/**
 * Wait until the component finishes all measurement useEffect cycles.
 * WindowedComboBox + WindowedScrollbar both have no-deps useEffects that
 * call measureElement → setState, causing multiple re-render rounds.
 * We poll until the frame stabilises (stays the same for `settleMs`).
 */
async function waitForStableFrame(
  lastFrame: () => string | undefined,
  { timeout = 2000, settleMs = 60 } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let prev = lastFrame();
  let stableSince = Date.now();

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    const current = lastFrame();
    if (current !== prev) {
      prev = current;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= settleMs) {
      return;
    }
  }
}

/**
 * Mock measureElement so that the items-area ref returns areaHeight
 * and all other refs return itemHeight.
 *
 * When TextInput is rendered (showSearchInput=true), it calls
 * measureElement on its own boxRef via useLayoutEffect BEFORE our
 * useEffect measures itemsAreaRef. So the area ref is the 2nd unique
 * ref when TextInput is present, or the 1st otherwise.
 *
 * We handle this by returning areaHeight for whichever ref gets the
 * highest measured height — since areaHeight > itemHeight, the first
 * ref that "should" be the area will be the one we want.
 *
 * Simpler approach: return areaHeight for every ref, then override
 * to itemHeight for refs seen after the designated area ref.
 */
function mockMeasure(areaHeight: number, itemHeight: number, textInputPresent = false) {
  const uniqueRefs: object[] = [];

  vi.mocked(measureElement).mockImplementation((ref: object) => {
    if (!uniqueRefs.includes(ref)) {
      uniqueRefs.push(ref);
    }
    // When TextInput is present, the 1st unique ref is TextInput's boxRef,
    // the 2nd is our itemsAreaRef. Without TextInput, the 1st is itemsAreaRef.
    const areaIndex = textInputPresent ? 1 : 0;
    if (uniqueRefs.indexOf(ref) === areaIndex) {
      return { width: 80, height: areaHeight } as never;
    }
    return { width: 80, height: itemHeight } as never;
  });
}

describe('WindowedComboBox - Snapshot Tests', () => {
  beforeEach(() => {
    vi.mocked(measureElement).mockReset();
  });

  it('renders windowed items with scroll indicators and scrollbar', async () => {
    mockMeasure(5, 1);

    const { lastFrame } = render(
      <WindowedComboBox
        items={makeItems(20)}
        onSelect={vi.fn()}
        showSearchInput={false}
        showItemCount={false}
      />,
    );
    await waitForStableFrame(lastFrame);

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders all items without scrollbar when they fit', async () => {
    mockMeasure(10, 1);

    const { lastFrame } = render(
      <WindowedComboBox
        items={makeItems(3)}
        onSelect={vi.fn()}
        showSearchInput={false}
        showItemCount={false}
      />,
    );
    await waitForStableFrame(lastFrame);

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders with search input placeholder', async () => {
    mockMeasure(5, 1, true);

    const { lastFrame } = render(
      <WindowedComboBox
        items={makeItems(15)}
        onSelect={vi.fn()}
        showSearchInput={true}
        placeholder="Search sessions..."
        showItemCount={false}
      />,
    );
    await waitForStableFrame(lastFrame);

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders grouped items with headers', async () => {
    mockMeasure(8, 1);

    const items: ComboBoxItem[] = [
      { label: 'Model A', value: 'a', group: 'Provider 1' },
      { label: 'Model B', value: 'b', group: 'Provider 1' },
      { label: 'Model C', value: 'c', group: 'Provider 2' },
      { label: 'Model D', value: 'd', group: 'Provider 2' },
    ];

    const { lastFrame } = render(
      <WindowedComboBox
        items={items}
        onSelect={vi.fn()}
        showSearchInput={false}
        showItemCount={true}
      />,
    );
    await waitForStableFrame(lastFrame);

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders empty state', () => {
    const { lastFrame } = render(
      <WindowedComboBox
        items={[]}
        onSelect={vi.fn()}
        showSearchInput={true}
        placeholder="Type to search..."
        showItemCount={false}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders multi-line items (area=12, item=3)', async () => {
    mockMeasure(12, 3);

    const { lastFrame } = render(
      <WindowedComboBox
        items={makeItems(10)}
        onSelect={vi.fn()}
        showSearchInput={false}
        showItemCount={false}
      />,
    );
    await waitForStableFrame(lastFrame);

    expect(lastFrame()).toMatchSnapshot();
  });
});
