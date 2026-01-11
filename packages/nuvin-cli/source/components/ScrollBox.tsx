import {
  useRef,
  useCallback,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
  createContext,
  useContext,
} from 'react';
import { Box, useStdout, useStdin, type BoxRef } from 'ink';

type MouseEvent = {
  type: 'click' | 'wheel-up' | 'wheel-down' | 'release' | 'drag' | 'move';
  button: number;
  x: number;
  y: number;
};

type ScrollBoxContextValue = {
  enableMouseMode: () => void;
  disableMouseMode: () => void;
  isMouseModeEnabled: boolean;
  renderOffsetY: number;
  setRenderOffsetY: (y: number) => void;
};

const ScrollBoxContext = createContext<ScrollBoxContextValue>({
  enableMouseMode: () => {},
  disableMouseMode: () => {},
  isMouseModeEnabled: false,
  renderOffsetY: 0,
  setRenderOffsetY: () => {},
});

export const useScrollBoxContext = () => useContext(ScrollBoxContext);

export type ScrollBoxHandle = {
  scrollBy: (delta: number) => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
  getScrollPosition: () => { x: number; y: number } | undefined;
  getBounds: () => { x: number; y: number; width: number; height: number } | undefined;
  focus: () => void;
  blur: () => void;
};

type ScrollBoxProps = {
  children: ReactNode;
  maxHeight: number;
  width?: number | string;
  onFocus?: () => void;
  onBlur?: () => void;
  borderStyle?: 'single' | 'double' | 'round' | 'bold' | 'singleDouble' | 'doubleSingle' | 'classic';
  borderColor?: string;
  focusBorderColor?: string;
};

function parseMouseEvent(data: string): MouseEvent | null {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence for mouse events
  const sgrMatch = data.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
  if (sgrMatch) {
    const button = parseInt(sgrMatch[1], 10);
    const x = parseInt(sgrMatch[2], 10);
    const y = parseInt(sgrMatch[3], 10);
    const isRelease = sgrMatch[4] === 'm';

    if (button === 64) return { type: 'wheel-up', button, x, y };
    if (button === 65) return { type: 'wheel-down', button, x, y };
    if (button >= 32 && button < 64) return { type: 'drag', button: button - 32, x, y };
    if (isRelease) return { type: 'release', button, x, y };
    return { type: 'click', button, x, y };
  }

  if (data.length >= 6 && data.startsWith('\x1b[M')) {
    const rawButton = data.charCodeAt(3) - 32;
    const x = data.charCodeAt(4) - 32;
    const y = data.charCodeAt(5) - 32;
    const button = rawButton & 3;

    if (rawButton === 64) return { type: 'wheel-up', button: 64, x, y };
    if (rawButton === 65) return { type: 'wheel-down', button: 65, x, y };
    if (rawButton & 32) return { type: 'drag', button, x, y };
    if (rawButton === 3) return { type: 'release', button, x, y };
    return { type: 'click', button, x, y };
  }

  return null;
}

type ScrollBoxProviderProps = {
  children: ReactNode;
  onMouseMove?: (x: number, y: number) => void;
  renderFromTop?: boolean;
};

export function ScrollBoxProvider({ children, onMouseMove, renderFromTop = false }: ScrollBoxProviderProps) {
  const { stdout } = useStdout();
  const { internal_eventEmitter } = useStdin();
  const [isMouseModeEnabled, setIsMouseModeEnabled] = useState(false);
  const [renderOffsetY, setRenderOffsetY] = useState(0);
  const enableCountRef = useRef(0);
  const initializedRef = useRef(false);

  const enableMouseMode = useCallback(() => {
    enableCountRef.current++;
    if (enableCountRef.current === 1 && stdout) {
      stdout.write('\x1b[?1000h\x1b[?1002h\x1b[?1006h');
      setIsMouseModeEnabled(true);
    }
  }, [stdout]);

  const disableMouseMode = useCallback(() => {
    enableCountRef.current = Math.max(0, enableCountRef.current - 1);
    if (enableCountRef.current === 0 && stdout) {
      stdout.write('\x1b[?1006l\x1b[?1002l\x1b[?1000l');
      setIsMouseModeEnabled(false);
    }
  }, [stdout]);

  useEffect(() => {
    if (!initializedRef.current && stdout) {
      const rows = renderFromTop ? 0 : stdout.rows || 24;
      setRenderOffsetY(rows);
      initializedRef.current = true;
    }
  }, [stdout, renderFromTop]);

  useEffect(() => {
    return () => {
      if (stdout && enableCountRef.current > 0) {
        stdout.write('\x1b[?1006l\x1b[?1002l\x1b[?1000l');
      }
    };
  }, [stdout]);

  useEffect(() => {
    if (!onMouseMove || !isMouseModeEnabled) return;

    const handleRawInput = (data: string) => {
      const mouse = parseMouseEvent(data);
      if (mouse) {
        onMouseMove(mouse.x, mouse.y);
      }
    };

    internal_eventEmitter?.on('input', handleRawInput);
    return () => {
      internal_eventEmitter?.off('input', handleRawInput);
    };
  }, [internal_eventEmitter, isMouseModeEnabled, onMouseMove]);

  return (
    <ScrollBoxContext.Provider
      value={{ enableMouseMode, disableMouseMode, isMouseModeEnabled, renderOffsetY, setRenderOffsetY }}
    >
      {children}
    </ScrollBoxContext.Provider>
  );
}

export const ScrollBox = forwardRef<ScrollBoxHandle, ScrollBoxProps>(function ScrollBox(
  { children, maxHeight, width, onFocus, onBlur, borderStyle, borderColor, focusBorderColor },
  ref,
) {
  const boxRef = useRef<BoxRef>(null);
  const [isFocused, setIsFocused] = useState(false);
  const isFocusedRef = useRef(false);
  const [_scrollTop, setScrollTop] = useState(0);
  const { internal_eventEmitter } = useStdin();
  const { enableMouseMode, disableMouseMode, isMouseModeEnabled, renderOffsetY } = useScrollBoxContext();

  useEffect(() => {
    enableMouseMode();
    return () => disableMouseMode();
  }, [enableMouseMode, disableMouseMode]);

  const isPointInBounds = useCallback(
    (mouseX: number, mouseY: number): boolean => {
      if (!boxRef.current) return false;
      const bounds = boxRef.current.getBounds();
      const adjustedY = mouseY - renderOffsetY;
      return (
        mouseX >= bounds.x + 1 &&
        mouseX <= bounds.x + bounds.width &&
        adjustedY >= bounds.y + 1 &&
        adjustedY <= bounds.y + bounds.height
      );
    },
    [renderOffsetY],
  );

  const scrollBy = useCallback((delta: number) => {
    setScrollTop((previous) => {
      const next = Math.max(0, previous + delta);
      boxRef.current?.scrollTo({ x: 0, y: next });
      return next;
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    boxRef.current?.scrollToBottom();
    const pos = boxRef.current?.getScrollPosition();
    if (pos) setScrollTop(pos.y);
  }, []);

  const scrollToTop = useCallback(() => {
    boxRef.current?.scrollToTop();
    setScrollTop(0);
  }, []);

  const focus = useCallback(() => {
    setIsFocused(true);
    isFocusedRef.current = true;
    onFocus?.();
  }, [onFocus]);

  const blur = useCallback(() => {
    setIsFocused(false);
    isFocusedRef.current = false;
    onBlur?.();
  }, [onBlur]);

  useImperativeHandle(
    ref,
    () => ({
      scrollBy,
      scrollToTop,
      scrollToBottom,
      getScrollPosition: () => boxRef.current?.getScrollPosition(),
      getBounds: () => boxRef.current?.getBounds(),
      focus,
      blur,
    }),
    [scrollBy, scrollToTop, scrollToBottom, focus, blur],
  );

  useEffect(() => {
    if (!isMouseModeEnabled) return;

    const handleRawInput = (data: string) => {
      const mouse = parseMouseEvent(data);
      if (!mouse) return;

      const inBounds = isPointInBounds(mouse.x, mouse.y);

      if (mouse.type === 'click' && mouse.button === 0) {
        if (inBounds && !isFocusedRef.current) {
          focus();
        } else if (!inBounds && isFocusedRef.current) {
          blur();
        }
      }

      if (isFocusedRef.current || inBounds) {
        if (mouse.type === 'wheel-up') {
          scrollBy(-3);
        } else if (mouse.type === 'wheel-down') {
          scrollBy(3);
        }
      }
    };

    internal_eventEmitter?.on('input', handleRawInput);
    return () => {
      internal_eventEmitter?.off('input', handleRawInput);
    };
  }, [internal_eventEmitter, isMouseModeEnabled, isPointInBounds, scrollBy, focus, blur]);

  const currentBorderColor = isFocused ? (focusBorderColor ?? 'cyan') : borderColor;

  return (
    <Box
      ref={boxRef}
      flexDirection="column"
      maxHeight={maxHeight}
      width={width}
      overflow="scroll"
      borderStyle={borderStyle}
      borderColor={currentBorderColor}
      flexShrink={0}
    >
      {children}
    </Box>
  );
});
