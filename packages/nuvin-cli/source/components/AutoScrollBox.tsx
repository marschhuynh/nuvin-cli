import { type BoxRef, Box, type BoxProps, measureElement, Text } from 'ink';
import { useRef, useEffect, useCallback, useState, useMemo, type ReactNode } from 'react';
import { useMouse, useInput, useFocus, type MouseEvent, type Key } from '../contexts/InputContext/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';

type AutoScrollBoxProps = {
  maxHeight: number | string | undefined;
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
} & Omit<BoxProps, 'ref' | 'overflow' | 'height'>;

type ScrollInfo = {
  scrollY: number;
  containerHeight: number;
  contentHeight: number;
};

function Scrollbar({
  scrollInfo,
  color = 'gray',
  trackColor = 'dim',
}: {
  scrollInfo: ScrollInfo;
  color?: string;
  trackColor?: string;
}) {
  const { scrollY, containerHeight, contentHeight } = scrollInfo;

  if (contentHeight <= containerHeight) {
    return null;
  }

  const trackHeight = containerHeight;
  const thumbHeight = Math.max(1, Math.round((containerHeight / contentHeight) * trackHeight));
  const maxScrollY = contentHeight - containerHeight;
  const scrollRatio = maxScrollY > 0 ? scrollY / maxScrollY : 0;
  const thumbPosition = Math.round(scrollRatio * (trackHeight - thumbHeight));

  const track: string[] = [];
  for (let i = 0; i < trackHeight; i++) {
    if (i >= thumbPosition && i < thumbPosition + thumbHeight) {
      track.push('┃');
    } else {
      track.push('│');
    }
  }

  return (
    <Box flexDirection="column" flexShrink={0}>
      {track.map((char, i) => (
        <Text key={`track-${i}-${char}`} color={char === '┃' ? color : trackColor}>
          {char}
        </Text>
      ))}
    </Box>
  );
}

function throttle<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;
  let lastArgs: unknown[] | null = null;

  return ((...args: unknown[]) => {
    const now = Date.now();
    lastArgs = args;

    if (now - lastCall >= ms) {
      lastCall = now;
      fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(
        () => {
          lastCall = Date.now();
          timeoutId = null;
          if (lastArgs) fn(...lastArgs);
        },
        ms - (now - lastCall),
      );
    }
  }) as T;
}

export function AutoScrollBox({
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
  ...boxProps
}: AutoScrollBoxProps) {
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

  const updateScrollInfoThrottled = useMemo(
    () =>
      throttle(() => {
        if (!boxRef.current || !contentRef.current) return;
        const pos = boxRef.current.getScrollPosition();
        const dims = measureDimensions();
        if (!dims) return;
        setScrollInfo({
          scrollY: pos?.y ?? 0,
          containerHeight: dims.container.height,
          contentHeight: dims.content.height,
        });
      }, 32),
    [measureDimensions],
  );

  const scrollBy = useCallback(
    (delta: number) => {
      if (!boxRef.current || !contentRef.current) return;
      const currentPos = boxRef.current.getScrollPosition();
      if (!currentPos) return;
      const newY = Math.max(0, currentPos.y + delta);
      boxRef.current.scrollTo({ x: 0, y: newY });
      const actualPos = boxRef.current.getScrollPosition();
      if (actualPos) {
        const dims = cachedDimensionsRef.current || measureDimensions();
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
      updateScrollInfoThrottled();
    },
    [measureDimensions, updateScrollInfoThrottled],
  );

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
        scrollBy(scrollStep);
        return true;
      }
      if (input === 'k') {
        scrollBy(-scrollStep);
        return true;
      }
      if (input === 'g') {
        if (!boxRef.current || !contentRef.current) return;
        boxRef.current.scrollTo({ x: 0, y: 0 });
        isUserScrolledRef.current = true;
        updateScrollInfoThrottled();
        return true;
      }
      if (input === 'G') {
        boxRef.current?.scrollToBottom();
        isUserScrolledRef.current = false;
        updateScrollInfoThrottled();
        return true;
      }
    },
    [isFocused, scrollBy, scrollStep, needsScrollbar, updateScrollInfoThrottled, enableKeyboardScroll],
  );

  useMouse(handleMouseEvent, { isActive: enableMouseScroll && needsScrollbar, priority: mousePriority });
  useInput(handleKeyboardEvent, { isActive: needsScrollbar, priority: mousePriority });

  useEffect(() => {
    if (prevChildrenRef.current !== children) {
      if (!isUserScrolledRef.current) {
        boxRef.current?.scrollToBottom();
      }
      prevChildrenRef.current = children;
    }
    updateScrollInfoThrottled();
  }, [children, updateScrollInfoThrottled]);

  const scrollbarElement = needsScrollbar && (
    <Scrollbar scrollInfo={scrollInfo} color={scrollbarColor} trackColor={scrollbarTrackColor} />
  );

  return (
    <Box
      flexDirection="row"
      width="100%"
      {...(maxHeight !== undefined ? { maxHeight } : {})}
      overflow="hidden"
      backgroundColor={isFocused ? theme.tokens.dim : undefined}
    >
      <Box ref={boxRef} overflow="scroll" flexGrow={1} {...boxProps} flexDirection="column">
        <Box ref={contentRef} flexShrink={0} flexDirection="column">
          {children}
        </Box>
      </Box>
      <Box flexGrow={1} />
      {scrollbarElement}
    </Box>
  );
}
