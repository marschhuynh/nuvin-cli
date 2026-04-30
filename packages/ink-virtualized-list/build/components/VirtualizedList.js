import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, measureElement, Text, useFocus, useInput, useStdout, } from "@nuvin/ink";
import { useMouse } from "@nuvin/ink-input";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, } from "react";
const DEFAULT_OVERSCAN = 10;
const DEFAULT_SCROLL_STEP = 1;
const DEFAULT_ESTIMATE = () => 1;
const HEIGHT_CACHE_MAX = 2048;
const touchHeightCache = (cache, key, entry) => {
    // Re-insert to bump key to most-recent in the Map's insertion order (LRU).
    cache.delete(key);
    cache.set(key, entry);
    if (cache.size > HEIGHT_CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) {
            cache.delete(oldest);
        }
    }
};
const SCROLLBAR_GLYPH = "▌";
const repeatGlyph = (count) => {
    if (count <= 0)
        return "";
    let out = SCROLLBAR_GLYPH;
    for (let i = 1; i < count; i++)
        out += `\n${SCROLLBAR_GLYPH}`;
    return out;
};
const Scrollbar = ({ scrollInfo, color, trackColor, visible }) => {
    const { scrollY, containerHeight, contentHeight } = scrollInfo;
    if (containerHeight <= 0) {
        return null;
    }
    const trackHeight = containerHeight;
    if (!visible || contentHeight <= containerHeight) {
        return (_jsx(Box, { flexDirection: "column", flexShrink: 0, width: 1, children: _jsx(Text, { color: trackColor, children: repeatGlyph(trackHeight) }) }));
    }
    const thumbHeight = Math.max(1, Math.round((containerHeight / contentHeight) * trackHeight));
    const maxScrollY = contentHeight - containerHeight;
    const scrollRatio = maxScrollY > 0 ? scrollY / maxScrollY : 0;
    const thumbPosition = Math.round(scrollRatio * (trackHeight - thumbHeight));
    const aboveCount = thumbPosition;
    const belowCount = trackHeight - thumbPosition - thumbHeight;
    return (_jsxs(Box, { flexDirection: "column", flexShrink: 0, width: 1, children: [aboveCount > 0 && _jsx(Text, { color: trackColor, children: repeatGlyph(aboveCount) }), _jsx(Text, { color: color, children: repeatGlyph(thumbHeight) }), belowCount > 0 && _jsx(Text, { color: trackColor, children: repeatGlyph(belowCount) })] }));
};
const clamp = (value, min, max) => {
    return Math.max(min, Math.min(value, max));
};
const normalizedEstimate = (estimateItemHeight, item, index) => Math.max(1, estimateItemHeight(item, index));
const findStartIndex = (itemOffsets, scrollPos) => {
    if (itemOffsets.length === 0 || scrollPos <= 0) {
        return 0;
    }
    let low = 0;
    let high = itemOffsets.length - 1;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if ((itemOffsets[mid] ?? 0) < scrollPos) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return Math.max(0, low - 1);
};
const buildScrollState = (scrollY, containerHeight, contentHeight) => {
    const maxScrollY = Math.max(0, contentHeight - containerHeight);
    const clampedScrollY = clamp(scrollY, 0, maxScrollY);
    return {
        scrollY: clampedScrollY,
        containerHeight,
        contentHeight,
        atTop: clampedScrollY <= 0,
        atBottom: clampedScrollY >= maxScrollY,
    };
};
function VirtualizedListInner({ items, renderItem, keyExtractor, estimateItemHeight = DEFAULT_ESTIMATE, overscan = DEFAULT_OVERSCAN, scrollStep = DEFAULT_SCROLL_STEP, autoFollow = true, enableKeyboardScroll = true, focusable = true, autoFocus = false, focusId, onFocusChange, showScrollbar = true, scrollbarColor = "#666666", scrollbarTrackColor = "#262626", onScroll, onVisibleRangeChange, height: heightProp, ...boxProps }, ref) {
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const containerRef = useRef(null);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const itemRefsMap = useRef(new Map());
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const refSettersRef = useRef(new Map());
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const heightCacheRef = useRef(new Map());
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const prevItemCountRef = useRef(items.length);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const prevContainerWidthRef = useRef(0);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const shouldAutoFollowRef = useRef(autoFollow);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const isMeasuringRef = useRef(false);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const [shouldAutoFollow, setShouldAutoFollowState] = useState(autoFollow);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const setShouldAutoFollow = useCallback((next) => {
        if (shouldAutoFollowRef.current === next)
            return;
        shouldAutoFollowRef.current = next;
        setShouldAutoFollowState(next);
    }, []);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const [scrollY, setScrollY] = useState(0);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const [containerSize, setContainerSize] = useState({
        width: 0,
        height: typeof heightProp === "number" ? heightProp : 0,
    });
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const [heightCacheVersion, setHeightCacheVersion] = useState(0);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const [resizeVersion, setResizeVersion] = useState(0);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const { stdout } = useStdout();
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const { isFocused } = useFocus({
        isActive: focusable,
        autoFocus,
        id: focusId,
    });
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    useEffect(() => {
        onFocusChange?.(isFocused);
    }, [isFocused, onFocusChange]);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    useEffect(() => {
        if (!stdout || typeof stdout.on !== "function") {
            return;
        }
        const handleResize = () => {
            setResizeVersion((version) => version + 1);
        };
        stdout.on("resize", handleResize);
        return () => {
            stdout.off("resize", handleResize);
        };
    }, [stdout]);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    useEffect(() => {
        if (!autoFollow) {
            setShouldAutoFollow(false);
        }
    }, [autoFollow, setShouldAutoFollow]);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    useEffect(() => {
        const currentKeys = new Set(items.map((item, index) => keyExtractor(item, index)));
        let hasEvictions = false;
        for (const key of heightCacheRef.current.keys()) {
            if (!currentKeys.has(key)) {
                heightCacheRef.current.delete(key);
                hasEvictions = true;
            }
        }
        for (const key of itemRefsMap.current.keys()) {
            if (!currentKeys.has(key)) {
                itemRefsMap.current.delete(key);
            }
        }
        for (const key of refSettersRef.current.keys()) {
            if (!currentKeys.has(key)) {
                refSettersRef.current.delete(key);
            }
        }
        if (hasEvictions) {
            setHeightCacheVersion((version) => version + 1);
        }
    }, [items, keyExtractor]);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const { itemOffsets, itemHeights, totalContentHeight } = useMemo(() => {
        void heightCacheVersion;
        const offsets = [];
        const heights = [];
        let totalHeight = 0;
        for (let index = 0; index < items.length; index++) {
            offsets.push(totalHeight);
            const item = items[index];
            if (!item)
                break;
            const key = keyExtractor(item, index);
            const cachedHeight = heightCacheRef.current.get(key);
            const estimate = normalizedEstimate(estimateItemHeight, item, index);
            const height = cachedHeight !== undefined && cachedHeight.estimate === estimate
                ? cachedHeight.height
                : estimate;
            heights.push(height);
            totalHeight += height;
        }
        return {
            itemOffsets: offsets,
            itemHeights: heights,
            totalContentHeight: totalHeight,
        };
    }, [items, keyExtractor, estimateItemHeight, heightCacheVersion]);
    const containerHeight = containerSize.height;
    const maxScrollY = Math.max(0, totalContentHeight - containerHeight);
    const effectiveScrollY = shouldAutoFollow ? maxScrollY : clamp(scrollY, 0, maxScrollY);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const visibleRange = useMemo(() => {
        if (items.length === 0) {
            return { startIndex: 0, endIndex: -1 };
        }
        if (containerHeight <= 0) {
            return {
                startIndex: 0,
                endIndex: Math.min(items.length - 1, overscan),
            };
        }
        const startIndex = Math.max(0, findStartIndex(itemOffsets, effectiveScrollY) - overscan);
        const viewportEnd = effectiveScrollY + containerHeight;
        let endIndex = startIndex;
        let visibleBottom = itemOffsets[startIndex] ?? 0;
        while (endIndex < items.length && visibleBottom < viewportEnd) {
            visibleBottom += itemHeights[endIndex] ?? 1;
            endIndex++;
        }
        return {
            startIndex,
            endIndex: Math.min(items.length - 1, endIndex + overscan),
        };
    }, [items, containerHeight, overscan, itemOffsets, itemHeights, effectiveScrollY]);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const scrollToOffset = useCallback((offsetY) => {
        const clampedY = clamp(offsetY, 0, maxScrollY);
        setScrollY(clampedY);
        setShouldAutoFollow(autoFollow && clampedY >= maxScrollY);
    }, [autoFollow, maxScrollY, setShouldAutoFollow]);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const scrollBy = useCallback((delta) => {
        setScrollY((current) => {
            const base = shouldAutoFollowRef.current ? maxScrollY : current;
            const next = clamp(base + delta, 0, maxScrollY);
            setShouldAutoFollow(autoFollow && next >= maxScrollY);
            return next;
        });
    }, [autoFollow, maxScrollY, setShouldAutoFollow]);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const scrollToIndex = useCallback((index, align = "auto") => {
        if (items.length === 0) {
            scrollToOffset(0);
            return;
        }
        const targetIndex = clamp(index, 0, items.length - 1);
        const itemTop = itemOffsets[targetIndex] ?? 0;
        const itemHeight = itemHeights[targetIndex] ?? 1;
        const itemBottom = itemTop + itemHeight;
        if (align === "start") {
            scrollToOffset(itemTop);
            return;
        }
        if (align === "end") {
            scrollToOffset(itemBottom - containerHeight);
            return;
        }
        if (itemTop < effectiveScrollY) {
            scrollToOffset(itemTop);
            return;
        }
        if (itemBottom > effectiveScrollY + containerHeight) {
            scrollToOffset(itemBottom - containerHeight);
        }
    }, [items, itemOffsets, itemHeights, containerHeight, effectiveScrollY, scrollToOffset]);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    useImperativeHandle(ref, () => ({
        scrollToOffset,
        scrollToIndex,
        scrollToTop() {
            scrollToOffset(0);
        },
        scrollToBottom() {
            setShouldAutoFollow(autoFollow);
            scrollToOffset(maxScrollY);
        },
        getScrollState() {
            return buildScrollState(shouldAutoFollowRef.current ? maxScrollY : scrollY, containerHeight, totalContentHeight);
        },
        __getDebugCacheSizes() {
            return {
                heightCache: heightCacheRef.current.size,
                refSetters: refSettersRef.current.size,
                itemRefs: itemRefsMap.current.size,
            };
        },
    }), [
        autoFollow,
        containerHeight,
        maxScrollY,
        scrollY,
        scrollToIndex,
        scrollToOffset,
        setShouldAutoFollow,
        totalContentHeight,
    ]);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    useInput((_input, key) => {
        if (!enableKeyboardScroll || !isFocused || containerHeight <= 0) {
            return;
        }
        if (key.downArrow) {
            scrollBy(scrollStep);
        }
        if (key.upArrow) {
            scrollBy(-scrollStep);
        }
        if (key.pageDown) {
            scrollBy(containerHeight);
        }
        if (key.pageUp) {
            scrollBy(-containerHeight);
        }
    }, { isActive: enableKeyboardScroll && focusable });
    // Mouse wheel scroll
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    useMouse((event) => {
        if (!isFocused || containerHeight <= 0)
            return false;
        if (event.type === "wheel-up") {
            scrollBy(-scrollStep * (event.count ?? 1));
            return true;
        }
        if (event.type === "wheel-down") {
            scrollBy(scrollStep * (event.count ?? 1));
            return true;
        }
        return false;
    }, { isActive: enableKeyboardScroll && focusable });
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const registerItemRef = useCallback((key, element) => {
        if (element) {
            itemRefsMap.current.set(key, element);
        }
        else {
            itemRefsMap.current.delete(key);
        }
    }, []);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const getRefSetter = useCallback((key) => {
        let setter = refSettersRef.current.get(key);
        if (!setter) {
            setter = (element) => registerItemRef(key, element);
            refSettersRef.current.set(key, setter);
        }
        return setter;
    }, [registerItemRef]);
    // Trim ref-setter cache to the visible window so it stays O(visible rows)
    // even for append-only lists where keys never leave `items`.
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    useEffect(() => {
        if (refSettersRef.current.size === 0)
            return;
        const keep = new Set();
        for (let index = visibleRange.startIndex; index <= visibleRange.endIndex && index < items.length; index++) {
            const item = items[index];
            if (!item)
                continue;
            keep.add(keyExtractor(item, index));
        }
        for (const key of refSettersRef.current.keys()) {
            if (!keep.has(key)) {
                refSettersRef.current.delete(key);
            }
        }
    }, [visibleRange.startIndex, visibleRange.endIndex, items, keyExtractor]);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    useLayoutEffect(() => {
        if (!containerRef.current) {
            return;
        }
        const { width, height } = measureElement(containerRef.current);
        if (width <= 0 || height <= 0) {
            return;
        }
        setContainerSize((current) => {
            if (current.width === width && current.height === height) {
                return current;
            }
            return { width, height };
        });
        if (prevContainerWidthRef.current !== width) {
            prevContainerWidthRef.current = width;
            heightCacheRef.current.clear();
            setHeightCacheVersion((version) => version + 1);
        }
    }, [resizeVersion]);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    useLayoutEffect(() => {
        if (isMeasuringRef.current) {
            return;
        }
        isMeasuringRef.current = true;
        try {
            // Capture the anchor BEFORE applying measurement updates: this is the row
            // currently at the top of the viewport. Heights changing above it would
            // otherwise visually shift its position; we'll counter-scroll by the delta.
            let anchorIndex = -1;
            if (!shouldAutoFollowRef.current && items.length > 0 && containerHeight > 0) {
                anchorIndex = findStartIndex(itemOffsets, effectiveScrollY);
            }
            let scrollDelta = 0;
            let hasUpdates = false;
            for (let index = visibleRange.startIndex; index <= visibleRange.endIndex && index < items.length; index++) {
                const item = items[index];
                if (!item)
                    continue;
                const key = keyExtractor(item, index);
                const estimate = normalizedEstimate(estimateItemHeight, item, index);
                const cached = heightCacheRef.current.get(key);
                // #9: skip re-measuring rows whose cache is already valid for this estimate.
                // Content changes that don't change `estimate` are assumed stable per the
                // keyExtractor contract (stable key implies stable identity).
                if (cached !== undefined && cached.estimate === estimate) {
                    continue;
                }
                const element = itemRefsMap.current.get(key);
                if (!element) {
                    continue;
                }
                const { height } = measureElement(element);
                if (height <= 0)
                    continue;
                if (cached?.height === height && cached.estimate === estimate)
                    continue;
                // O(1) anchor correction: only items above the anchor shift its viewport
                // position; accumulate (new - rendered) deltas there.
                if (anchorIndex >= 0 && index < anchorIndex) {
                    const oldRendered = cached !== undefined && cached.estimate === estimate ? cached.height : estimate;
                    scrollDelta += height - oldRendered;
                }
                touchHeightCache(heightCacheRef.current, key, { height, estimate });
                hasUpdates = true;
            }
            if (!hasUpdates) {
                return;
            }
            if (scrollDelta !== 0 && !shouldAutoFollowRef.current) {
                setScrollY((current) => {
                    const next = current + scrollDelta;
                    return next === current ? current : next;
                });
            }
            setHeightCacheVersion((version) => version + 1);
        }
        finally {
            isMeasuringRef.current = false;
        }
    }, [
        visibleRange.startIndex,
        visibleRange.endIndex,
        items,
        keyExtractor,
        estimateItemHeight,
        itemOffsets,
        effectiveScrollY,
        containerHeight,
    ]);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    useLayoutEffect(() => {
        if (containerHeight <= 0) {
            return;
        }
        const boundedMaxScroll = Math.max(0, totalContentHeight - containerHeight);
        if (shouldAutoFollowRef.current) {
            setScrollY((current) => (current === boundedMaxScroll ? current : boundedMaxScroll));
            return;
        }
        setScrollY((current) => clamp(current, 0, boundedMaxScroll));
    }, [containerHeight, totalContentHeight]);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    useEffect(() => {
        const nextCount = items.length;
        const previousCount = prevItemCountRef.current;
        prevItemCountRef.current = nextCount;
        if (nextCount <= previousCount) {
            return;
        }
        if (autoFollow && shouldAutoFollowRef.current) {
            setScrollY(maxScrollY);
        }
    }, [items.length, autoFollow, maxScrollY]);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const scrollState = useMemo(() => buildScrollState(shouldAutoFollow ? maxScrollY : scrollY, containerHeight, totalContentHeight), [containerHeight, maxScrollY, scrollY, shouldAutoFollow, totalContentHeight]);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const prevScrollStateRef = useRef(null);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    useEffect(() => {
        if (!onScroll)
            return;
        const prev = prevScrollStateRef.current;
        if (prev &&
            prev.scrollY === scrollState.scrollY &&
            prev.containerHeight === scrollState.containerHeight &&
            prev.contentHeight === scrollState.contentHeight &&
            prev.atTop === scrollState.atTop &&
            prev.atBottom === scrollState.atBottom) {
            return;
        }
        prevScrollStateRef.current = scrollState;
        onScroll(scrollState);
    }, [onScroll, scrollState]);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    const prevVisibleRangeRef = useRef(null);
    // biome-ignore lint/correctness/useHookAtTopLevel: forwardRef component
    useEffect(() => {
        if (!onVisibleRangeChange)
            return;
        const prev = prevVisibleRangeRef.current;
        if (prev &&
            prev.startIndex === visibleRange.startIndex &&
            prev.endIndex === visibleRange.endIndex) {
            return;
        }
        prevVisibleRangeRef.current = visibleRange;
        onVisibleRangeChange(visibleRange);
    }, [onVisibleRangeChange, visibleRange]);
    const visibleItems = items.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
    const topOffset = visibleRange.startIndex >= 0 && visibleRange.startIndex < itemOffsets.length
        ? (itemOffsets[visibleRange.startIndex] ?? 0)
        : 0;
    const marginTop = -scrollState.scrollY + topOffset;
    return (_jsxs(Box, { flexDirection: "row", overflow: "hidden", ...boxProps, children: [_jsx(Box, { ref: containerRef, flexDirection: "column", flexGrow: 1, overflow: "hidden", height: heightProp, children: _jsx(Box, { flexDirection: "column", marginTop: marginTop, width: "100%", children: visibleItems.map((item, offset) => {
                        const actualIndex = visibleRange.startIndex + offset;
                        const key = keyExtractor(item, actualIndex);
                        return (_jsx(Box, { flexShrink: 0, ref: getRefSetter(key), width: "100%", children: renderItem(item, actualIndex) }, key));
                    }) }) }), showScrollbar && (_jsx(Scrollbar, { scrollInfo: scrollState, color: scrollbarColor, trackColor: scrollbarTrackColor, visible: totalContentHeight > containerHeight }))] }));
}
const VirtualizedListBase = forwardRef(VirtualizedListInner);
VirtualizedListBase.displayName = "VirtualizedList";
const VirtualizedList = VirtualizedListBase;
export default VirtualizedList;
//# sourceMappingURL=VirtualizedList.js.map