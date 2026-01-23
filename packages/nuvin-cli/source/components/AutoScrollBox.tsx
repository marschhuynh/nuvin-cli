import { type BoxRef, Box, type BoxProps, measureElement, Text } from 'ink';
import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  type ReactNode,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { useMouse, useInput, useFocus, type MouseEvent, type Key } from '../contexts/InputContext/index.js';

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
  autoFocus?: boolean;
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

function ScrollbarComponent({ scrollInfo, color = 'gray', trackColor = 'dim' }: ScrollbarProps) {
  const { containerHeight, contentHeight } = scrollInfo;

  if (contentHeight <= containerHeight) {
    return null;
  }

  const trackHeight = containerHeight;
  const thumbHeight = Math.max(1, Math.round((containerHeight / contentHeight) * trackHeight));
  const thumbPosition = calculateThumbPosition(scrollInfo);

  const beforeThumb = thumbPosition;
  const afterThumb = trackHeight - thumbPosition - thumbHeight;

  const beforeThumbItems = Array.from({ length: beforeThumb }, (_, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: Items are static and never reorder
    <Text key={`before-thumb-${i}`} color={trackColor}>
      │
    </Text>
  ));
  const thumbItems = Array.from({ length: thumbHeight }, (_, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: Items are static and never reorder
    <Text key={`thumb-${i}`} color={color}>
      ┃
    </Text>
  ));
  const afterThumbItems = Array.from({ length: afterThumb }, (_, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: Items are static and never reorder
    <Text key={`after-thumb-${i}`} color={trackColor}>
      │
    </Text>
  ));

  return (
    <Box flexDirection="column" flexShrink={0}>
      {beforeThumb > 0 && <Box flexDirection="column">{beforeThumbItems}</Box>}
      <Box flexDirection="column">{thumbItems}</Box>
      {afterThumb > 0 && <Box flexDirection="column">{afterThumbItems}</Box>}
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

export const AutoScrollBox = forwardRef<AutoScrollBoxHandle, AutoScrollBoxProps>(function AutoScrollBox(
  {
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
    autoFocus = false,
    onFocusChange,
    onScrollChange,
    flexGrow,
    autoScrollToBottom = true,
    ...boxProps
  }: AutoScrollBoxProps,
  ref,
) {
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

  const measureDimensions = useCallback(() => {
    if (!boxRef.current || !contentRef.current) return null;
    const containerDim = measureElement(boxRef.current);
    const contentDim = measureElement(contentRef.current);
    cachedDimensionsRef.current = { container: containerDim, content: contentDim };
    return cachedDimensionsRef.current;
  }, []);

  const updateScrollInfo = useCallback(() => {
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

  const needsScrollbar = showScrollbar && scrollInfo.contentHeight > scrollInfo.containerHeight;
  const internalFocus = useFocus({ active: needsScrollbar && !manualFocus, autoFocus });
  const isFocused = externalFocus !== undefined ? externalFocus : internalFocus.isFocused;

  useEffect(() => {
    onFocusChange?.(isFocused);
  }, [isFocused, onFocusChange]);

  const scrollBy = useCallback(
    (delta: number) => {
      if (!boxRef.current || !contentRef.current) return;

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

      updateScrollInfo();
    },
    [updateScrollInfo],
  );

  const scrollByImmediate = useCallback(
    (delta: number) => {
      if (!boxRef.current || !contentRef.current) return;

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

      updateScrollInfo();
    },
    [updateScrollInfo],
  );

  const scrollPage = useCallback(
    (direction: 'up' | 'down', pageSize?: number) => {
      if (!boxRef.current || !contentRef.current) return;

      const dims = cachedDimensionsRef.current;
      if (!dims) return;

      const scrollPageSize = pageSize ?? Math.max(1, dims.container.height - 1);
      const delta = direction === 'down' ? scrollPageSize : -scrollPageSize;

      const currentPos = boxRef.current.getScrollPosition();
      if (!currentPos) return;

      const newY = Math.max(0, currentPos.y + delta);
      boxRef.current.scrollTo({ x: 0, y: newY });

      const actualPos = boxRef.current.getScrollPosition();
      if (actualPos) {
        const maxScrollY = dims.content.height - dims.container.height;
        const isAtBottom = actualPos.y >= maxScrollY - 1;
        if (isAtBottom) {
          isUserScrolledRef.current = false;
        } else if (actualPos.y > 0) {
          isUserScrolledRef.current = true;
        }
      }

      updateScrollInfo();
    },
    [updateScrollInfo],
  );

  const scrollLine = useCallback(
    (direction: 'up' | 'down') => {
      if (!boxRef.current) return;

      const delta = direction === 'down' ? 1 : -1;
      const currentPos = boxRef.current.getScrollPosition();
      if (!currentPos) return;

      const newY = Math.max(0, currentPos.y + delta);
      boxRef.current.scrollTo({ x: 0, y: newY });

      updateScrollInfo();
    },
    [updateScrollInfo],
  );

  const scrollToPositionInView = useCallback(
    (position: 'top' | 'middle' | 'bottom') => {
      if (!boxRef.current) return;

      const dims = cachedDimensionsRef.current;
      if (!dims) return;

      let targetY: number;
      switch (position) {
        case 'top':
          targetY = 0;
          break;
        case 'bottom':
          targetY = Math.max(0, dims.content.height - dims.container.height);
          break;
        case 'middle':
        default:
          targetY = Math.max(0, Math.floor((dims.content.height - dims.container.height) / 2));
          break;
      }

      boxRef.current.scrollTo({ x: 0, y: targetY });
      isUserScrolledRef.current = true;
      updateScrollInfo();
    },
    [updateScrollInfo],
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
    (input: string, key: Key) => {
      if (!isFocused || !needsScrollbar || !enableKeyboardScroll) {
        if (isFocused) {
          const vimCommands = ['j', 'k', 'g', 'G', 'H', 'M', 'L', 'z'];
          if (vimCommands.includes(input) || key.pageUp || key.pageDown || key.ctrl) {
            return true;
          }
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
        updateScrollInfo();
        return true;
      }
      if (input === 'G') {
        boxRef.current?.scrollToBottom();
        isUserScrolledRef.current = false;
        updateScrollInfo();
        return true;
      }
      if (key.pageUp) {
        scrollPage('up');
        return true;
      }
      if (key.pageDown) {
        scrollPage('down');
        return true;
      }
      if (key.ctrl && (input === 'f' || input === 'F')) {
        scrollPage('down');
        return true;
      }
      if (key.ctrl && (input === 'b' || input === 'B')) {
        scrollPage('up');
        return true;
      }
      if (key.ctrl && (input === 'd' || input === 'D')) {
        scrollPage('down', Math.max(1, Math.floor((cachedDimensionsRef.current?.container.height ?? 10) / 2)));
        return true;
      }
      if (key.ctrl && (input === 'u' || input === 'U')) {
        scrollPage('up', Math.max(1, Math.floor((cachedDimensionsRef.current?.container.height ?? 10) / 2)));
        return true;
      }
      if (key.ctrl && (input === 'e' || input === 'E')) {
        scrollLine('down');
        return true;
      }
      if (key.ctrl && (input === 'y' || input === 'Y')) {
        scrollLine('up');
        return true;
      }
      if (input === 'H') {
        scrollToPositionInView('top');
        return true;
      }
      if (input === 'M') {
        scrollToPositionInView('middle');
        return true;
      }
      if (input === 'L') {
        scrollToPositionInView('bottom');
        return true;
      }
    },
    [
      isFocused,
      scrollByImmediate,
      scrollStep,
      needsScrollbar,
      updateScrollInfo,
      enableKeyboardScroll,
      scrollPage,
      scrollLine,
      scrollToPositionInView,
    ],
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
    updateScrollInfo();
  }, [children, measureDimensions, updateScrollInfo, autoScrollToBottom]);

  useEffect(() => {
    onScrollChange?.(scrollInfo);
  }, [scrollInfo, onScrollChange]);

  const scrollToPosition = useCallback(
    (y: number) => {
      if (!boxRef.current) return;
      boxRef.current.scrollTo({ x: 0, y: Math.max(0, y) });
      isUserScrolledRef.current = true;
      updateScrollInfo();
    },
    [updateScrollInfo],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollTo: scrollToPosition,
      scrollBy: scrollByImmediate,
      getScrollInfo: () => scrollInfo,
    }),
    [scrollToPosition, scrollByImmediate, scrollInfo],
  );

  const scrollbarElement = needsScrollbar && (
    <Scrollbar scrollInfo={scrollInfo} color={scrollbarColor} trackColor={scrollbarTrackColor} />
  );

  const scrollHint =
    enableKeyboardScroll && needsScrollbar && isFocused ? (
      <Box flexShrink={0} alignSelf="flex-end">
        <Text color={scrollbarColor}>
          <Text bold>g</Text>
          <Text> top </Text>
          <Text bold>G</Text>
          <Text> bot </Text>
          <Text bold>j</Text>
          <Text>/</Text>
          <Text bold>k</Text>
          <Text> scroll</Text>
        </Text>
      </Box>
    ) : (
      <Box height={1} flexShrink={0} />
    );

  return (
    <Box
      flexDirection="column"
      width="100%"
      {...(maxHeight !== undefined ? { maxHeight } : {})}
      {...(flexGrow !== undefined ? { flexGrow } : {})}
      overflow="hidden"
    >
      <Box flexDirection="row" flexGrow={1} flexShrink={1} overflow="hidden">
        <Box ref={boxRef} overflow="scroll" flexGrow={1} {...boxProps} flexDirection="column">
          <Box ref={contentRef} flexShrink={0} flexDirection="column">
            {children}
          </Box>
        </Box>
        {scrollbarElement}
      </Box>
      {scrollHint}
    </Box>
  );
});
