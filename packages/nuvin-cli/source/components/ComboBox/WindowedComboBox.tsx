import type React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Box, Text, measureElement, type BoxRef } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import TextInput from '@/components/TextInput/index.js';
import type { ComboBoxItem, ComboBoxProps } from './ComboBox.js';

export type WindowedComboBoxProps = ComboBoxProps & {
  /**
   * Use fuzzy (subsequence) matching instead of substring includes.
   * Defaults to false.
   */
  fuzzySearch?: boolean;
};

/**
 * Fuzzy match: checks if all characters of `query` appear in `text` in order.
 * Returns a score (lower is better) or -1 if no match.
 */
function fuzzyMatch(text: string, query: string): number {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  let score = 0;
  let lastMatchPos = -1;

  for (let qi = 0; qi < q.length; qi++) {
    const found = lower.indexOf(q[qi], ti);
    if (found === -1) return -1;
    if (lastMatchPos >= 0) {
      score += found - lastMatchPos - 1;
    }
    lastMatchPos = found;
    ti = found + 1;
  }

  return score;
}

type ListItem =
  | { type: 'header'; group: string }
  | { type: 'item'; item: ComboBoxItem; originalIndex: number };

type WindowedScrollbarProps = {
  totalItems: number;
  visibleCount: number;
  scrollOffset: number;
};

function WindowedScrollbar({ totalItems, visibleCount, scrollOffset }: WindowedScrollbarProps) {
  const { theme } = useTheme();
  const containerRef = useRef<BoxRef>(null);
  const [trackHeight, setTrackHeight] = useState(0);

  useEffect(() => {
    if (containerRef.current) {
      const { height } = measureElement(containerRef.current);
      if (height !== trackHeight) setTrackHeight(height);
    }
  });

  if (trackHeight === 0) {
    return <Box ref={containerRef} flexGrow={1} flexDirection="column" width={1} />;
  }

  const thumbHeight = Math.max(1, Math.round((visibleCount / totalItems) * trackHeight));
  const maxOffset = totalItems - visibleCount;
  const thumbPos = maxOffset > 0 ? Math.round((scrollOffset / maxOffset) * (trackHeight - thumbHeight)) : 0;

  return (
    <Box ref={containerRef} flexDirection="column" flexShrink={0} width={1}>
      {Array.from({ length: trackHeight }, (_, i) => {
        const isThumb = i >= thumbPos && i < thumbPos + thumbHeight;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: scrollbar cells are positional — index is the correct key
          <Text key={i} color={isThumb ? theme.colors.accent : theme.colors.muted} dimColor={!isThumb}>
            {isThumb ? '┃' : '│'}
          </Text>
        );
      })}
    </Box>
  );
}

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
  fuzzySearch = false,
  onQueryChange,
  showScrollIndicators = true,
}) => {
  const { theme } = useTheme();
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Self-measuring: itemsAreaRef wraps ONLY the items (flexGrow fills remaining space).
  // sampleItemRef is on the first rendered item.
  // visibleCount = floor(itemsAreaHeight / sampleItemHeight). No overhead guessing.
  const itemsAreaRef = useRef<BoxRef>(null);
  const sampleItemRef = useRef<BoxRef>(null);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (!itemsAreaRef.current || !sampleItemRef.current) return;
    const areaHeight = measureElement(itemsAreaRef.current).height;
    const itemHeight = measureElement(sampleItemRef.current).height;
    if (itemHeight <= 0) return;
    const count = Math.max(1, Math.floor(areaHeight / itemHeight));
    if (count !== visibleCount) setVisibleCount(count);
  });

  // Debounce search
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
    // When onQueryChange is provided, the parent handles filtering externally
    // (e.g. searching across all sessions on disk). Skip internal re-filtering
    // to avoid discarding results that matched on fields not in item.label.
    if (onQueryChange) return items;

    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();

    if (fuzzySearch) {
      return items
        .map((item) => ({ item, score: fuzzyMatch(item.label, query) }))
        .filter((r) => r.score >= 0)
        .sort((a, b) => a.score - b.score)
        .map((r) => r.item);
    }

    return items.filter((item) => item.label.toLowerCase().includes(query));
  }, [searchQuery, items, fuzzySearch, onQueryChange]);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on query change
  useEffect(() => {
    setSelectedIndex(0);
    setScrollOffset(0);
  }, [searchQuery]);

  useEffect(() => {
    onQueryChange?.(searchQuery);
  }, [searchQuery, onQueryChange]);

  useEffect(() => {
    if (visibleCount === 0 || selectableIndices.length === 0) return;

    const listIndex = selectableIndices[selectedIndex];
    if (listIndex === undefined) return;

    const effectiveTop = listItems[listIndex - 1]?.type === 'header' ? listIndex - 1 : listIndex;
    const effectiveBottom = listIndex;

    setScrollOffset((prev) => {
      if (effectiveTop < prev) return effectiveTop;
      if (effectiveBottom >= prev + visibleCount) return effectiveBottom - visibleCount + 1;
      return prev;
    });
  }, [selectedIndex, selectableIndices, listItems, visibleCount]);

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

  const handleSelect = useCallback(() => {
    if (selectableIndices.length > 0 && selectedIndex < selectableIndices.length) {
      const listIndex = selectableIndices[selectedIndex];
      const listItem = listIndex !== undefined ? listItems[listIndex] : undefined;
      if (listItem?.type === 'item') onSelect(listItem.item);
    }
  }, [selectableIndices, selectedIndex, listItems, onSelect]);

  useInput(
    (inputChar, key) => {
      if (key.escape) { onCancel?.(); return; }

      // When TextInput is not rendered, handle navigation directly
      if (!showSearchInput) {
        if (key.return) { handleSelect(); return; }
        if (key.upArrow) { navigate('up'); return; }
        if (key.downArrow) { navigate('down'); return; }
      }

      if (inputChar === ' ' && onSpace) {
        if (selectableIndices.length > 0 && selectedIndex < selectableIndices.length) {
          const listIndex = selectableIndices[selectedIndex];
          const listItem = listIndex !== undefined ? listItems[listIndex] : undefined;
          if (listItem?.type === 'item') onSpace(listItem.item);
        }
        return;
      }

      if (key.ctrl && (inputChar === 'n' || inputChar === 'N') && onNew) { onNew(); return; }
    },
    { isActive: focus },
  );

  // --- Rendering ---

  const effectiveVisibleCount = visibleCount > 0 ? Math.min(visibleCount, listItems.length) : 0;
  // Slice extra items beyond visibleCount so overflow="hidden" clips naturally,
  // eliminating spacing gaps at the bottom of the list.
  const sliceCount = effectiveVisibleCount > 0 ? Math.min(effectiveVisibleCount + 2, listItems.length - scrollOffset) : 0;
  const visibleListItems = sliceCount > 0 ? listItems.slice(scrollOffset, scrollOffset + sliceCount) : [];
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = effectiveVisibleCount > 0 && scrollOffset + effectiveVisibleCount < listItems.length;

  // Find a sample item to render for measurement (always needed for re-measuring on resize)
  const sampleItem = listItems.find((li): li is Extract<ListItem, { type: 'item' }> => li.type === 'item');

  // Sticky header: scan backwards from scrollOffset to find the nearest group header.
  // Show it pinned above the list only when the viewport top is NOT already that header.
  const hasGroups = listItems.some((li) => li.type === 'header');
  let stickyGroup: string | null = null;
  if (hasGroups && scrollOffset > 0) {
    for (let i = scrollOffset - 1; i >= 0; i--) {
      if (listItems[i]?.type === 'header') {
        stickyGroup = (listItems[i] as Extract<ListItem, { type: 'header' }>).group;
        break;
      }
    }
    // Hide the pinned header when the first visible row is already that same header
    const firstVisible = listItems[scrollOffset];
    if (firstVisible?.type === 'header' && firstVisible.group === stickyGroup) {
      stickyGroup = null;
    }
  }

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      {showSearchInput && (
        <Box marginBottom={1} flexShrink={0}>
          <Text color={theme.model?.label || theme.colors.info}>Search: </Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSelect}
            onUpArrow={() => navigate('up')}
            onDownArrow={() => navigate('down')}
            placeholder={placeholder}
            focus={focus}
            showCursor={true}
          />
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
          {showScrollIndicators && (
            <Box height={1} flexShrink={0}>
              {hasMoreAbove ? <Text dimColor> ▲ {scrollOffset} more</Text> : null}
            </Box>
          )}

          {/*
            itemsAreaRef: flexGrow={1} fills whatever space remains after
            search, indicators, and itemCount. Only items live inside.
            measureElement(itemsAreaRef) / measureElement(sampleItemRef) = visibleCount.
            No overhead subtraction needed.
          */}

          {/* Sticky group header — shown when scrolled into the middle of a group */}
          {stickyGroup && (
            <Box flexShrink={0} backgroundColor={theme.tokens.dim}>
              <Text color={theme.colors.muted} bold>
                {stickyGroup}
              </Text>
            </Box>
          )}

          <Box ref={itemsAreaRef} flexDirection="row" flexGrow={1} overflow="hidden">
            <Box flexDirection="column" flexGrow={1} overflow="hidden">
              {(() => {
                let sampleRefAssigned = false;
                return visibleListItems.map((listItem, relIndex) => {
                  const absoluteIndex = scrollOffset + relIndex;
                  const isSelected =
                    listItem.type === 'item' && selectableIndices[selectedIndex] === absoluteIndex;

                  if (listItem.type === 'header') {
                    return (
                      <Box key={`header-${listItem.group}`} flexShrink={0} backgroundColor={theme.tokens.dim}>
                        <Text color={theme.colors.muted} bold>
                          {listItem.group}
                        </Text>
                      </Box>
                    );
                  }

                  const needsRef = !sampleRefAssigned;
                  if (needsRef) sampleRefAssigned = true;

                  return (
                    <Box
                      key={`item-${listItem.item.value}-${absoluteIndex}`}
                      ref={needsRef ? sampleItemRef : undefined}
                      flexShrink={0}
                      overflow="hidden"
                    >
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
                });
              })()}

              {/* Hidden sample item for measurement when no items are visible yet */}
              {effectiveVisibleCount === 0 && sampleItem && (
                <Box ref={sampleItemRef} flexShrink={0}>
                  {renderItem ? (
                    renderItem(sampleItem.item, false)
                  ) : (
                    <Text>  {sampleItem.item.label}</Text>
                  )}
                </Box>
              )}
            </Box>

            {effectiveVisibleCount > 0 && listItems.length > effectiveVisibleCount && (
              <WindowedScrollbar
                totalItems={listItems.length}
                visibleCount={effectiveVisibleCount}
                scrollOffset={scrollOffset}
              />
            )}
          </Box>

          {/* Scroll indicator — below */}
          {showScrollIndicators && (
            <Box height={1} flexShrink={0}>
              {hasMoreBelow ? (
                <Text dimColor> ▼ {listItems.length - scrollOffset - effectiveVisibleCount} more</Text>
              ) : null}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
