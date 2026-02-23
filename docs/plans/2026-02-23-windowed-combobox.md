# WindowedComboBox Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create `WindowedComboBox` — a drop-in sibling to `ComboBox` that renders only the visible window of items (no `AutoScrollBox`/`measureElement`), then use it in `HistorySelection`.

**Architecture:** `WindowedComboBox` is a new file at `packages/nuvin-cli/source/components/ComboBox/WindowedComboBox.tsx`. It shares `ComboBoxItem` and `ComboBoxProps` types from `ComboBox.tsx`. Instead of `AutoScrollBox`, it maintains `scrollOffset` state and slices the flat `listItems` array to only render the visible window. Keyboard navigation adjusts `scrollOffset` to keep the selected item visible — O(1) per keypress, no `measureElement` calls. `ComboBox.tsx` is NOT modified. `HistorySelection.tsx` switches from `ComboBox` to `WindowedComboBox`.

**Tech Stack:** React, Ink (Box/Text), existing `useInput` from `@/contexts/InputContext`, existing `useTheme`, `processPasteChunk`/`createPasteState` from `@/utils/pasteHandler`

---

### Task 1: Create `WindowedComboBox.tsx`

**Files:**
- Create: `packages/nuvin-cli/source/components/ComboBox/WindowedComboBox.tsx`

The component accepts the same props as `ComboBox` (`ComboBoxProps`) plus one extra: `itemHeight?: number` (default `1`) — the number of terminal rows each item occupies. This allows `HistorySelection` to pass `itemHeight={3}` for its tall `SessionItem` rows.

**Step 1: Write the file**

```tsx
import type React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { Box, Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { processPasteChunk, createPasteState, type PasteState } from '@/utils/pasteHandler.js';
import type { ComboBoxItem, ComboBoxProps } from './ComboBox.js';

export type WindowedComboBoxProps = ComboBoxProps & {
  /**
   * How many terminal rows a single rendered item occupies.
   * Defaults to 1. Set to 3 for history items (status + preview + blank).
   */
  itemHeight?: number;
  /**
   * How many items to show at once in the window.
   * Defaults to 10.
   */
  visibleCount?: number;
};

type ListItem =
  | { type: 'header'; group: string }
  | { type: 'item'; item: ComboBoxItem; originalIndex: number };

export const WindowedComboBox: React.FC<WindowedComboBoxProps> = ({
  items,
  placeholder = 'Type to search...',
  enableRotation = false,
  showSearchInput = true,
  showItemCount = true,
  focus = true,
  renderItem,
  onSelect,
  onCancel,
  onHighlight,
  onSpace,
  onNew,
  itemHeight = 1,
  visibleCount = 10,
}) => {
  const { theme } = useTheme();
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0); // index into selectableIndices
  const [scrollOffset, setScrollOffset] = useState(0);   // index into listItems (first visible)
  const pasteStateRef = useRef<PasteState>(createPasteState());
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search — flush immediately when cleared
  useEffect(() => {
    if (!input.trim()) {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      setSearchQuery(input);
      return;
    }
    searchTimerRef.current = setTimeout(() => setSearchQuery(input), 200);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [input]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(query));
  }, [searchQuery, items]);

  // Build flat list with group headers interleaved
  const { listItems, selectableIndices } = useMemo(() => {
    const result: ListItem[] = [];
    const selectable: number[] = [];
    let lastGroup: string | undefined;

    for (let i = 0; i < filteredItems.length; i++) {
      const item = filteredItems[i];
      if (item.group && item.group !== lastGroup) {
        result.push({ type: 'header', group: item.group });
        lastGroup = item.group;
      }
      selectable.push(result.length);
      result.push({ type: 'item', item, originalIndex: i });
    }

    return { listItems: result, selectableIndices: selectable };
  }, [filteredItems]);

  // Reset selection when filter changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on query change
  useEffect(() => {
    setSelectedIndex(0);
    setScrollOffset(0);
  }, [searchQuery]);

  // Keep scrollOffset in sync so the selected item is always visible.
  // A header immediately above the selected item must also be included.
  useEffect(() => {
    if (selectableIndices.length === 0) return;

    const listIndex = selectableIndices[selectedIndex];
    if (listIndex === undefined) return;

    // If the item above is a header, include it in the scroll window
    const effectiveTop = listItems[listIndex - 1]?.type === 'header' ? listIndex - 1 : listIndex;
    const effectiveBottom = listIndex; // last row of selected item

    setScrollOffset((prev) => {
      // Visible window: [prev, prev + visibleCount)
      if (effectiveTop < prev) {
        return effectiveTop;
      }
      if (effectiveBottom >= prev + visibleCount) {
        return effectiveBottom - visibleCount + 1;
      }
      return prev;
    });
  }, [selectedIndex, selectableIndices, listItems, visibleCount]);

  // Emit highlight
  useEffect(() => {
    if (!onHighlight) return;
    if (selectableIndices.length === 0) {
      onHighlight(null, selectedIndex);
      return;
    }
    const listIndex = selectableIndices[selectedIndex];
    const listItem = listIndex !== undefined ? listItems[listIndex] : undefined;
    if (listItem?.type === 'item') {
      onHighlight(listItem.item, listItem.originalIndex);
    } else {
      onHighlight(null, selectedIndex);
    }
  }, [selectedIndex, onHighlight, selectableIndices, listItems]);

  const navigate = useCallback(
    (direction: 'up' | 'down') => {
      setSelectedIndex((prev) => {
        if (selectableIndices.length === 0) return 0;
        if (direction === 'up') {
          if (enableRotation) return prev <= 0 ? selectableIndices.length - 1 : prev - 1;
          return Math.max(0, prev - 1);
        }
        if (enableRotation) return prev >= selectableIndices.length - 1 ? 0 : prev + 1;
        return Math.min(selectableIndices.length - 1, prev + 1);
      });
    },
    [selectableIndices.length, enableRotation],
  );

  useInput(
    (inputChar, key) => {
      const pasteResult = processPasteChunk(inputChar, pasteStateRef.current);
      pasteStateRef.current = pasteResult.newState;
      if (pasteResult.shouldWaitForMore) return;
      if (pasteResult.processedInput !== null) inputChar = pasteResult.processedInput;

      if (key.return) {
        if (selectableIndices.length > 0 && selectedIndex < selectableIndices.length) {
          const listIndex = selectableIndices[selectedIndex];
          const listItem = listIndex !== undefined ? listItems[listIndex] : undefined;
          if (listItem?.type === 'item') onSelect(listItem.item);
        }
        return;
      }

      if (key.escape) { onCancel?.(); return; }
      if (key.upArrow) { navigate('up'); return; }
      if (key.downArrow) { navigate('down'); return; }

      if (inputChar === ' ' && onSpace) {
        if (selectableIndices.length > 0 && selectedIndex < selectableIndices.length) {
          const listIndex = selectableIndices[selectedIndex];
          const listItem = listIndex !== undefined ? listItems[listIndex] : undefined;
          if (listItem?.type === 'item') onSpace(listItem.item);
        }
        return;
      }

      if (key.ctrl && (inputChar === 'n' || inputChar === 'N') && onNew) { onNew(); return; }
      if (key.backspace || key.delete) { setInput((prev) => prev.slice(0, -1)); return; }
      if (inputChar && !key.ctrl && !key.meta && inputChar.length === 1 && inputChar >= ' ') {
        setInput((prev) => prev + inputChar);
      }
    },
    { isActive: focus },
  );

  // Windowed slice — only render [scrollOffset, scrollOffset + visibleCount)
  const visibleListItems = listItems.slice(scrollOffset, scrollOffset + visibleCount);
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + visibleCount < listItems.length;

  const renderedInput = input ? (
    <>
      <Text>{input}</Text>
      <Text color={theme.model?.input || theme.colors.text}>█</Text>
    </>
  ) : (
    <Text>
      {placeholder.length > 0 ? (
        <>
          <Text backgroundColor={theme.footer.infoBg} color={theme.model?.input || theme.colors.text}>
            {placeholder[0]}
          </Text>
          <Text color={theme.colors.muted}>{placeholder.slice(1)}</Text>
        </>
      ) : (
        <Text backgroundColor={theme.footer.infoBg} color={theme.model?.input || theme.colors.text}>
          {' '}
        </Text>
      )}
    </Text>
  );

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      {showSearchInput && (
        <Box marginBottom={1} flexShrink={0}>
          <Text color={theme.model?.label || theme.colors.info}>Search: </Text>
          {renderedInput}
        </Box>
      )}

      {filteredItems.length === 0 ? (
        <Box>
          <Text color={theme.colors.warning}>No matches found</Text>
        </Box>
      ) : (
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {showItemCount && (
            <Box marginBottom={1} flexShrink={0}>
              <Text dimColor>
                {selectedIndex + 1} / {selectableIndices.length} (↑↓ navigate, Enter select)
              </Text>
            </Box>
          )}

          {/* Scroll indicator — above */}
          <Box height={1} flexShrink={0}>
            {hasMoreAbove ? (
              <Text dimColor> ▲ {scrollOffset} more</Text>
            ) : null}
          </Box>

          {/* Windowed items */}
          <Box flexDirection="column" flexShrink={0}>
            {visibleListItems.map((listItem, relIndex) => {
              const absoluteIndex = scrollOffset + relIndex;
              const isSelected =
                listItem.type === 'item' &&
                selectableIndices[selectedIndex] === absoluteIndex;

              if (listItem.type === 'header') {
                return (
                  <Box key={`header-${listItem.group}`} flexShrink={0}>
                    <Text color={theme.colors.muted} bold>
                      {listItem.group}
                    </Text>
                  </Box>
                );
              }

              return (
                <Box key={`item-${listItem.item.value}-${absoluteIndex}`} flexShrink={0} overflow="hidden">
                  {renderItem ? (
                    renderItem(listItem.item, isSelected)
                  ) : (
                    <Box overflow="hidden" flexShrink={0}>
                      <Text>{isSelected ? '❯ ' : '  '}</Text>
                      <Text
                        color={
                          isSelected
                            ? theme.model?.selectedItem || theme.colors.accent
                            : theme.model?.item || theme.colors.text
                        }
                        bold={isSelected}
                      >
                        {listItem.item.label}
                      </Text>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>

          {/* Scroll indicator — below */}
          <Box height={1} flexShrink={0}>
            {hasMoreBelow ? (
              <Text dimColor> ▼ {listItems.length - scrollOffset - visibleCount} more</Text>
            ) : null}
          </Box>
        </Box>
      )}
    </Box>
  );
};
```

**Step 2: Export from ComboBox index**

Add to `packages/nuvin-cli/source/components/ComboBox/index.ts`:

```ts
export { WindowedComboBox } from './WindowedComboBox.js';
export type { WindowedComboBoxProps } from './WindowedComboBox.js';
```

**Step 3: Build to verify no errors**

```bash
cd /Users/marsch/Projects/nuvin-space-public
pnpm --filter nuvin-cli build
```

Expected: `🎉 Build complete!` with no TypeScript errors.

---

### Task 2: Use `WindowedComboBox` in `HistorySelection`

**Files:**
- Modify: `packages/nuvin-cli/source/components/HistorySelection.tsx`

`HistorySelection` currently uses `ComboBox` with `showSearchInput={false}`. Switch to `WindowedComboBox` with `itemHeight={3}` (each `SessionItem` is `height={3}`) and `visibleCount` derived from terminal height.

**Step 1: Update imports in `HistorySelection.tsx`**

Replace:
```ts
import { ComboBox, type ComboBoxItem } from '@/components/ComboBox/ComboBox.js';
```
With:
```ts
import { WindowedComboBox, type ComboBoxItem } from '@/components/ComboBox/index.js';
```

(Re-export `ComboBoxItem` from index so both types stay in sync.)

**Step 2: Accept `visibleCount` from parent**

Change `HistorySelectionProps` and the component signature:

```ts
type HistorySelectionProps = {
  availableSessions: SessionInfo[];
  visibleCount: number;
};
```

Remove the `useStdoutDimensions` call from `HistorySelection` — terminal dimensions are already known by the parent (`history.tsx`) which passes `modalHeight`. The visible count is:

```ts
// Each SessionItem = 3 rows. Reserve 2 rows for scroll indicators.
const visibleCount = Math.max(1, Math.floor((modalHeight - 2) / 3));
```

This calculation lives in `history.tsx` alongside the existing `modalHeight` computation, then is passed down.

**Step 3: Switch from `ComboBox` to `WindowedComboBox`**

Replace:
```tsx
<ComboBox
  items={comboBoxItems}
  showSearchInput={false}
  showItemCount={false}
  enableRotation={true}
  focus={true}
  renderItem={...}
  onSelect={handleSelect}
/>
```

With:
```tsx
<WindowedComboBox
  items={comboBoxItems}
  showSearchInput={false}
  showItemCount={false}
  enableRotation={true}
  focus={true}
  itemHeight={3}
  visibleCount={visibleCount}
  renderItem={...}
  onSelect={handleSelect}
/>
```

**Step 4: Update `history.tsx` to pass `visibleCount`**

In `history.tsx`, change the render block:

```tsx
const modalHeight = Math.min(rows - 4, 24);
const visibleCount = Math.max(1, Math.floor((modalHeight - 2) / 3));

return (
  <AppModal visible={true} title="Session History" onClose={deactivate} closeOnEscape={false} height={modalHeight}>
    <HistorySelection availableSessions={availableSessions} visibleCount={visibleCount} />
  </AppModal>
);
```

**Step 5: Build and verify**

```bash
pnpm --filter nuvin-cli build
```

Expected: `🎉 Build complete!`

---

### Task 3: Remove unused imports from `HistorySelection.tsx`

After switching to `WindowedComboBox`, these imports will no longer be needed:
- `useStdoutDimensions` (dimensions now come from parent)

Check with LSP diagnostics and remove any unused imports.

```bash
pnpm --filter nuvin-cli build
```

Expected: clean build, no warnings.
