import { type BoxRef, Box, type BoxProps, measureElement, Text } from 'ink';
import React, { useRef, useEffect, useCallback, useState, useMemo, type ReactNode, useImperativeHandle, forwardRef } from 'react';
import { useMouse, useInput, useFocus, type MouseEvent, type Key } from '../contexts/InputContext/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';

export type AutoScrollBoxHandle = {
  scrollTo: (y: number) => void;
  scrollBy: (delta: number) => void;
  getScrollInfo: () => ScrollInfo;
};

type AutoScrollBoxProps = {
  maxHeight?: number | string;
  children: ReactNode;
  scrollStep?: number;
  enableMouseScroll?: boolean;
  showScrollbar?: boolean;
  scrollbarColor?: string;
  scrollbarTrackColor?: string;
  mousePriority?: number;
  enableKeyboardScroll?: boolean;
  focus?: boolean;
  manualFocus?: boolean;
  onFocusChange?: (focused: boolean) => void;
  onScrollChange?: (scrollInfo: ScrollInfo) => void;
  flexGrow?: number;
  autoScrollToBottom?: boolean;
} & Omit<BoxProps, 'ref' | 'overflow' | 'height'>;

type ScrollInfo = {
  scrollY: number;
  containerHeight: number;
  contentHeight: number;
};

type ScrollbarProps = {
  scrollInfo: ScrollInfo;
  color?: string;
  trackColor?: string;
};

function calculateThumbPosition(scrollInfo: ScrollInfo): number {
  const { scrollY, containerHeight, contentHeight } = scrollInfo;
  if (contentHeight <= containerHeight) return 0;

  const trackHeight = containerHeight;
  const thumbHeight = Math.max(1, Math.round((containerHeight / contentHeight) * trackHeight));
  const maxScrollY = contentHeight - containerHeight;
  const scrollRatio = maxScrollY > 0 ? scrollY / maxScrollY : 0;
  return Math.round(scrollRatio * (trackHeight - thumbHeight));
}

function ScrollbarComponent({
  scrollInfo,
  color = 'gray',
  trackColor = 'dim',
}: ScrollbarProps) {
  const { containerHeight, contentHeight } = scrollInfo;

  if (contentHeight <= containerHeight) {
    return null;
  }

  const trackHeight = containerHeight;
  const thumbHeight = Math.max(1, Math.round((containerHeight / contentHeight) * trackHeight));
  const thumbPosition = calculateThumbPosition(scrollInfo);

  const beforeThumb = thumbPosition;
  const afterThumb = trackHeight - thumbPosition - thumbHeight;

  return (
    <Box flexDirection="column" flexShrink={0}>
      {beforeThumb > 0 && (
        <Box flexDirection="column">
          {Array.from({ length: beforeThumb }, (_, i) => (
            <Text key={`before-${i}`} color={trackColor}>│</Text>
          ))}
        </Box>
      )}
      <Box flexDirection="column">
        {Array.from({ length: thumbHeight }, (_, i) => (
          <Text key={`thumb-${i}`} color={color}>┃</Text>
        ))}
      </Box>
      {afterThumb > 0 && (
        <Box flexDirection="column">
          {Array.from({ length: afterThumb }, (_, i) => (
            <Text key={`after-${i}`} color={trackColor}>│</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

const Scrollbar = React.memo(ScrollbarComponent, (prev, next) => {
  const prevThumbPos = calculateThumbPosition(prev.scrollInfo);
  const nextThumbPos = calculateThumbPosition(next.scrollInfo);
  return (
    prevThumbPos === nextThumbPos &&
    prev.scrollInfo.containerHeight === next.scrollInfo.containerHeight &&
    prev.scrollInfo.contentHeight === next.scrollInfo.contentHeight &&
    prev.color === next.color &&
    prev.trackColor === next.trackColor
  );
});

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T & { cancel: () => void } {
  let timeoutId: NodeJS.Timeout | null = null;

  const debounced = ((...args: unknown[]) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, ms);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}

const SCROLL_BATCH_MS = 48;
const SCROLL_INFO_DEBOUNCE_MS = 80;

export const AutoScrollBox = forwardRef<AutoScrollBoxHandle, AutoScrollBoxProps>(function AutoScrollBox({
  maxHeight,
  children,
  scrollStep = 1,
  enableMouseScroll = true,
  showScrollbar = true,
  scrollbarColor = 'cyan',
  scrollbarTrackColor = 'gray',
  mousePriority = 0,
  enableKeyboardScroll = true,
  focus: externalFocus,
  manualFocus = false,
  onFocusChange,
  onScrollChange,
  flexGrow,
  autoScrollToBottom = true,
  ...boxProps
}: AutoScrollBoxProps, ref) {
  const { theme } = useTheme();
  const boxRef = useRef<BoxRef>(null);
  const contentRef = useRef<BoxRef>(null);
  const prevChildrenRef = useRef(children);
  const isUserScrolledRef = useRef(false);
  const cachedDimensionsRef = useRef<{ container: { height: number }; content: { height: number } } | null>(null);
  const [scrollInfo, setScrollInfo] = useState<ScrollInfo>({
    scrollY: 0,
    containerHeight: 0,
    contentHeight: 0,
  });

  const pendingScrollDelta = useRef(0);
  const scrollBatchTimer = useRef<NodeJS.Timeout | null>(null);

  const needsScrollbar = showScrollbar && scrollInfo.contentHeight > scrollInfo.containerHeight;
  const internalFocus = useFocus({ active: needsScrollbar && !manualFocus });
  const isFocused = externalFocus !== undefined ? externalFocus : internalFocus.isFocused;

  useEffect(() => {
    onFocusChange?.(isFocused);
  }, [isFocused, onFocusChange]);

  const measureDimensions = useCallback(() => {
    if (!boxRef.current || !contentRef.current) return null;
    const containerDim = measureElement(boxRef.current);
    const contentDim = measureElement(contentRef.current);
    cachedDimensionsRef.current = { container: containerDim, content: contentDim };
    return cachedDimensionsRef.current;
  }, []);

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
      }, SCROLL_INFO_DEBOUNCE_MS),
    [],
  );

  const updateScrollInfoImmediate = useCallback(() => {
    if (!boxRef.current || !contentRef.current) return;
    const pos = boxRef.current.getScrollPosition();
    const dims = measureDimensions();
    if (!dims) return;
    setScrollInfo({
      scrollY: pos?.y ?? 0,
      containerHeight: dims.container.height,
      contentHeight: dims.content.height,
    });
  }, [measureDimensions]);

  const applyBatchedScroll = useCallback(() => {
    if (!boxRef.current) return;

    const delta = pendingScrollDelta.current;
    pendingScrollDelta.current = 0;
    scrollBatchTimer.current = null;

    if (delta === 0) return;

    const currentPos = boxRef.current.getScrollPosition();
    if (!currentPos) return;

    const newY = Math.max(0, currentPos.y + delta);
    boxRef.current.scrollTo({ x: 0, y: newY });

    const actualPos = boxRef.current.getScrollPosition();
    if (actualPos) {
      const dims = cachedDimensionsRef.current;
      if (dims) {
        const maxScrollY = dims.content.height - dims.container.height;
        const isAtBottom = actualPos.y >= maxScrollY - 1;
        if (isAtBottom) {
          isUserScrolledRef.current = false;
        } else if (actualPos.y > 0) {
          isUserScrolledRef.current = true;
        }
      }
    }

    updateScrollInfoDebounced();
  }, [updateScrollInfoDebounced]);

  const scrollBy = useCallback(
    (delta: number) => {
      if (!boxRef.current || !contentRef.current) return;

      pendingScrollDelta.current += delta;

      if (!scrollBatchTimer.current) {
        scrollBatchTimer.current = setTimeout(applyBatchedScroll, SCROLL_BATCH_MS);
      }
    },
    [applyBatchedScroll],
  );

  const scrollByImmediate = useCallback(
    (delta: number) => {
      if (!boxRef.current || !contentRef.current) return;

      if (scrollBatchTimer.current) {
        clearTimeout(scrollBatchTimer.current);
        scrollBatchTimer.current = null;
      }
      pendingScrollDelta.current = 0;

      const currentPos = boxRef.current.getScrollPosition();
      if (!currentPos) return;
      const newY = Math.max(0, currentPos.y + delta);
      boxRef.current.scrollTo({ x: 0, y: newY });

      const actualPos = boxRef.current.getScrollPosition();
      if (actualPos) {
        const dims = cachedDimensionsRef.current;
        if (dims) {
          const maxScrollY = dims.content.height - dims.container.height;
          const isAtBottom = actualPos.y >= maxScrollY - 1;
          if (isAtBottom) {
            isUserScrolledRef.current = false;
          } else if (actualPos.y > 0) {
            isUserScrolledRef.current = true;
          }
        }
      }

      updateScrollInfoDebounced();
    },
    [updateScrollInfoDebounced],
  );

  useEffect(() => {
    return () => {
      if (scrollBatchTimer.current) {
        clearTimeout(scrollBatchTimer.current);
      }
      updateScrollInfoDebounced.cancel();
    };
  }, [updateScrollInfoDebounced]);

  const handleMouseEvent = useCallback(
    (event: MouseEvent) => {
      const multiplier = event.count || 1;
      if (event.type === 'wheel-up') {
        scrollBy(-scrollStep * multiplier);
        return true;
      }
      if (event.type === 'wheel-down') {
        scrollBy(scrollStep * multiplier);
        return true;
      }
    },
    [scrollBy, scrollStep],
  );

  const handleKeyboardEvent = useCallback(
    (input: string, _key: Key) => {
      if (!isFocused || !needsScrollbar || !enableKeyboardScroll) {
        if (isFocused && (input === 'j' || input === 'k' || input === 'g' || input === 'G')) {
          return true;
        }
        return;
      }

      if (input === 'j') {
        scrollByImmediate(scrollStep);
        return true;
      }
      if (input === 'k') {
        scrollByImmediate(-scrollStep);
        return true;
      }
      if (input === 'g') {
        if (!boxRef.current || !contentRef.current) return;
        boxRef.current.scrollTo({ x: 0, y: 0 });
        isUserScrolledRef.current = true;
        updateScrollInfoDebounced();
        return true;
      }
      if (input === 'G') {
        boxRef.current?.scrollToBottom();
        isUserScrolledRef.current = false;
        updateScrollInfoDebounced();
        return true;
      }
    },
    [isFocused, scrollByImmediate, scrollStep, needsScrollbar, updateScrollInfoDebounced, enableKeyboardScroll],
  );

  useMouse(handleMouseEvent, { isActive: enableMouseScroll && needsScrollbar, priority: mousePriority });
  useInput(handleKeyboardEvent, { isActive: needsScrollbar, priority: mousePriority });

  useEffect(() => {
    if (prevChildrenRef.current !== children) {
      measureDimensions();
      if (autoScrollToBottom && !isUserScrolledRef.current) {
        boxRef.current?.scrollToBottom();
      }
      prevChildrenRef.current = children;
    }
    updateScrollInfoImmediate();
  }, [children, measureDimensions, updateScrollInfoImmediate, autoScrollToBottom]);

  useEffect(() => {
    onScrollChange?.(scrollInfo);
  }, [scrollInfo, onScrollChange]);

  const scrollToPosition = useCallback((y: number) => {
    if (!boxRef.current) return;
    boxRef.current.scrollTo({ x: 0, y: Math.max(0, y) });
    isUserScrolledRef.current = true;
    updateScrollInfoDebounced();
  }, [updateScrollInfoDebounced]);

  useImperativeHandle(ref, () => ({
    scrollTo: scrollToPosition,
    scrollBy: scrollByImmediate,
    getScrollInfo: () => scrollInfo,
  }), [scrollToPosition, scrollByImmediate, scrollInfo]);

  const scrollbarElement = needsScrollbar && (
    <Scrollbar scrollInfo={scrollInfo} color={scrollbarColor} trackColor={scrollbarTrackColor} />
  );

  return (
    <Box
      flexDirection="row"
      width="100%"
      {...(maxHeight !== undefined ? { maxHeight } : {})}
      {...(flexGrow !== undefined ? { flexGrow } : {})}
      overflow="hidden"
      backgroundColor={isFocused ? theme.tokens.dim : undefined}
    >
      <Box ref={boxRef} overflow="scroll" flexGrow={1} {...boxProps} flexDirection="column">
        <Box ref={contentRef} flexShrink={0} flexDirection="column">
          {children}
        </Box>
      </Box>
      {scrollbarElement}
    </Box>
  );
});
