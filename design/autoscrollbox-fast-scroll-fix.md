# AutoScrollBox Fast Scroll Issue Analysis & Fix

## Problem Statement

When content is large (700+ lines) and user scrolls fast, the terminal UI becomes corrupted - the bottom or top UI elements disappear and get overridden by scroll content.

## Environment

- **Framework**: Ink (React for terminal)
- **Layout Engine**: Yoga (flexbox)
- **Rendering**: Synchronous ANSI writes to stdout (no requestAnimationFrame)

## Root Cause Analysis

### The Race Condition

```
Fast Scroll Event Timeline:
─────────────────────────────────────────────────────────────────────────────
t=0ms    t=16ms   t=32ms   t=48ms   t=64ms
│        │        │        │        │
▼        ▼        ▼        ▼        ▼
wheel    wheel    wheel    wheel    wheel
  │        │        │        │        │
  ├──scrollTo()    │        │        │
  │   │            │        │        │
  │   ├──Yoga layout (700 nodes)     │
  │   │   │        │        │        │
  │   ├──measureElement() x2         │
  │   │   │        │        │        │
  │   ├──setScrollInfo()             │
  │   │   │        │        │        │
  │   │   ├──React reconcile         │
  │   │   │   │    │        │        │
  │   │   │   ├──Scrollbar (N elements)
  │   │   │   │    │        │        │
  │   │   │   ├──Terminal write      │
  │   │   │   │    │        │        │
  │   │   │   │    ├── CONFLICT! ────┤
  │   │   │   │    │   Next scroll   │
  │   │   │   │    │   starts before │
  │   │   │   │    │   previous ends │
```

### Specific Issues

#### 1. Unthrottled `scrollTo()` Calls

**Location**: `AutoScrollBox.tsx:170`

```typescript
const scrollBy = useCallback((delta: number) => {
  // ...
  boxRef.current.scrollTo({ x: 0, y: newY }); // Called on EVERY wheel event
  // ...
}, []);
```

**Problem**: Each `scrollTo()` triggers Ink to recalculate Yoga layout for all 700 nodes and write to terminal. With wheel events at ~16ms intervals, renders overlap.

#### 2. Expensive `measureElement()` During Scroll

**Location**: `AutoScrollBox.tsx:173`

```typescript
const scrollBy = useCallback((delta: number) => {
  // ...
  const dims = cachedDimensionsRef.current || measureDimensions(); // Called on every scroll
  // ...
}, []);
```

**Problem**: `measureElement()` forces synchronous Yoga layout calculation. With large content, this is expensive and blocks the event loop.

#### 3. Inefficient Scrollbar Rendering

**Location**: `AutoScrollBox.tsx:68-72`

```typescript
{track.map((char, i) => (
  <Text key={`track-${i}-${char}`} color={char === '┃' ? color : trackColor}>
    {char}
  </Text>
))}
```

**Problem**: Creates N `<Text>` elements (one per row) instead of 3 (before thumb, thumb, after thumb). Each element requires React reconciliation.

#### 4. Insufficient Throttle Duration

**Location**: `AutoScrollBox.tsx:160`

```typescript
throttle(() => {
  // ...
}, 32) // 32ms = ~30fps, but wheel events come at ~16ms
```

**Problem**: 32ms throttle allows 2 state updates per typical scroll gesture. Combined with unthrottled `scrollTo()`, this causes render overlaps.

#### 5. State Updates Trigger Full Re-renders

**Location**: `AutoScrollBox.tsx:155-159`

```typescript
setScrollInfo({
  scrollY: pos?.y ?? 0,
  containerHeight: dims.container.height,
  contentHeight: dims.content.height,
});
```

**Problem**: `setScrollInfo()` triggers React re-render of entire component tree including the expensive Scrollbar.

## Solution Design

### Principle: Decouple Scroll Position from React State

The key insight is that Ink's `Box.scrollTo()` already handles the actual scrolling. We only need React state for the scrollbar UI, which can update less frequently.

### Fix 1: Batch Scroll Operations

Accumulate scroll deltas and apply once per batch interval:

```typescript
const pendingScrollDelta = useRef(0);
const scrollBatchTimer = useRef<NodeJS.Timeout | null>(null);
const SCROLL_BATCH_MS = 48; // ~20fps for scroll, sufficient for smooth feel

const scrollBy = useCallback((delta: number) => {
  pendingScrollDelta.current += delta;
  
  if (!scrollBatchTimer.current) {
    scrollBatchTimer.current = setTimeout(() => {
      if (!boxRef.current) return;
      
      const currentPos = boxRef.current.getScrollPosition();
      if (currentPos) {
        const newY = Math.max(0, currentPos.y + pendingScrollDelta.current);
        boxRef.current.scrollTo({ x: 0, y: newY });
      }
      
      pendingScrollDelta.current = 0;
      scrollBatchTimer.current = null;
      updateScrollInfoDebounced();
    }, SCROLL_BATCH_MS);
  }
}, []);
```

### Fix 2: Lazy Dimension Measurement

Only measure dimensions when content changes, never during scroll:

```typescript
// Measure only when children change
useEffect(() => {
  measureDimensions();
}, [children]);

// During scroll, always use cached dimensions
const scrollBy = useCallback((delta: number) => {
  const dims = cachedDimensionsRef.current;
  if (!dims) return; // Skip if not measured yet
  // ...
}, []);
```

### Fix 3: Optimized Scrollbar (3 Elements Instead of N)

```typescript
function Scrollbar({ scrollInfo, color, trackColor }: ScrollbarProps) {
  const { scrollY, containerHeight, contentHeight } = scrollInfo;
  
  if (contentHeight <= containerHeight) return null;
  
  const trackHeight = containerHeight;
  const thumbHeight = Math.max(1, Math.round((containerHeight / contentHeight) * trackHeight));
  const maxScrollY = contentHeight - containerHeight;
  const scrollRatio = maxScrollY > 0 ? scrollY / maxScrollY : 0;
  const thumbPosition = Math.round(scrollRatio * (trackHeight - thumbHeight));
  
  const beforeThumb = thumbPosition;
  const afterThumb = trackHeight - thumbPosition - thumbHeight;
  
  return (
    <Box flexDirection="column" flexShrink={0}>
      {beforeThumb > 0 && (
        <Text color={trackColor}>{'│'.repeat(1) + '\n'.repeat(beforeThumb - 1)}</Text>
      )}
      <Text color={color}>{'┃'.repeat(1) + '\n'.repeat(thumbHeight - 1)}</Text>
      {afterThumb > 0 && (
        <Text color={trackColor}>{'│'.repeat(1) + '\n'.repeat(afterThumb - 1)}</Text>
      )}
    </Box>
  );
}
```

**Note**: The above approach won't work directly in Ink because `\n` in Text doesn't create multiple lines. Instead, we use vertical Text stacking:

```typescript
function Scrollbar({ scrollInfo, color, trackColor }: ScrollbarProps) {
  const { scrollY, containerHeight, contentHeight } = scrollInfo;
  
  if (contentHeight <= containerHeight) return null;
  
  const trackHeight = containerHeight;
  const thumbHeight = Math.max(1, Math.round((containerHeight / contentHeight) * trackHeight));
  const maxScrollY = contentHeight - containerHeight;
  const scrollRatio = maxScrollY > 0 ? scrollY / maxScrollY : 0;
  const thumbPosition = Math.round(scrollRatio * (trackHeight - thumbHeight));
  
  const beforeThumb = thumbPosition;
  const afterThumb = trackHeight - thumbPosition - thumbHeight;
  
  // Build track string and color array for single render pass
  const trackChars: Array<{ char: string; isThumb: boolean }> = [];
  
  for (let i = 0; i < beforeThumb; i++) {
    trackChars.push({ char: '│', isThumb: false });
  }
  for (let i = 0; i < thumbHeight; i++) {
    trackChars.push({ char: '┃', isThumb: true });
  }
  for (let i = 0; i < afterThumb; i++) {
    trackChars.push({ char: '│', isThumb: false });
  }
  
  // Group consecutive same-color chars to minimize elements
  const segments: Array<{ chars: string; isThumb: boolean }> = [];
  let current: { chars: string; isThumb: boolean } | null = null;
  
  for (const { char, isThumb } of trackChars) {
    if (current && current.isThumb === isThumb) {
      current.chars += char;
    } else {
      if (current) segments.push(current);
      current = { chars: char, isThumb };
    }
  }
  if (current) segments.push(current);
  
  return (
    <Box flexDirection="column" flexShrink={0}>
      {segments.map((seg, i) => (
        <Box key={i} flexDirection="column">
          {seg.chars.split('').map((char, j) => (
            <Text key={j} color={seg.isThumb ? color : trackColor}>{char}</Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}
```

**Better approach**: Memoize the scrollbar and only update when thumb position changes significantly:

```typescript
const MemoizedScrollbar = React.memo(Scrollbar, (prev, next) => {
  // Only re-render if thumb position changed by at least 1 row
  const prevThumbPos = calculateThumbPosition(prev.scrollInfo);
  const nextThumbPos = calculateThumbPosition(next.scrollInfo);
  return prevThumbPos === nextThumbPos;
});
```

### Fix 4: Debounce State Updates (Not Just Throttle)

Use debounce for scrollbar updates - only update after scroll stops:

```typescript
const updateScrollInfoDebounced = useMemo(
  () =>
    debounce(() => {
      if (!boxRef.current || !contentRef.current) return;
      const pos = boxRef.current.getScrollPosition();
      const dims = cachedDimensionsRef.current;
      if (!dims) return;
      
      setScrollInfo({
        scrollY: pos?.y ?? 0,
        containerHeight: dims.container.height,
        contentHeight: dims.content.height,
      });
    }, 100), // Update scrollbar 100ms after scroll stops
  [],
);
```

### Fix 5: Track Active Scrolling State

Optionally hide or simplify scrollbar during active scrolling:

```typescript
const isScrollingRef = useRef(false);
const scrollIdleTimer = useRef<NodeJS.Timeout | null>(null);

const markScrollActive = useCallback(() => {
  isScrollingRef.current = true;
  
  if (scrollIdleTimer.current) {
    clearTimeout(scrollIdleTimer.current);
  }
  
  scrollIdleTimer.current = setTimeout(() => {
    isScrollingRef.current = false;
    updateScrollInfoDebounced();
  }, 150);
}, []);
```

## Implementation Plan

### Phase 1: Critical Fixes (Immediate)

1. **Batch `scrollTo()` calls** - Prevents render overlap
2. **Use cached dimensions during scroll** - Eliminates expensive measurements
3. **Increase throttle/use debounce** - Reduces state updates

### Phase 2: Optimization (Follow-up)

1. **Memoize Scrollbar** - Prevent unnecessary re-renders
2. **Simplify Scrollbar rendering** - Reduce element count

### Phase 3: Long-term (Optional)

1. **Implement virtualization** - Per existing `auto-scroll-box-virtualization-plan.md`
2. **Consider removing nested AutoScrollBox** - Single scroll container for chat

## Testing

### Manual Test Cases

1. Load 700+ lines of content
2. Scroll rapidly with mouse wheel (up and down)
3. Verify header/footer remain visible
4. Verify scroll position is accurate after fast scroll
5. Verify scrollbar reflects correct position

### Performance Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Scroll events per render | 1:1 | 3-5:1 |
| measureElement calls/scroll | 2+ | 0 |
| Scrollbar elements | N | 3-N (memoized) |
| State updates during fast scroll | ~30/sec | ~10/sec |

## Files to Modify

| File | Changes |
|------|---------|
| `packages/nuvin-cli/source/components/AutoScrollBox.tsx` | Batch scrollTo, debounce state, memoize scrollbar |

## Risks

1. **Scroll feel may be less responsive** - Batching adds latency (mitigated by short batch window)
2. **Scrollbar position may lag** - Debouncing delays update (acceptable tradeoff)
3. **Edge cases with rapid direction changes** - Need to handle accumulated delta correctly

## References

- `design/auto-scroll-box-virtualization-plan.md` - Long-term virtualization approach
- Ink source: `packages/ink/src/components/Box.tsx` - Scroll implementation
- Ink source: `packages/ink/src/render-node-to-output.ts` - Terminal rendering
