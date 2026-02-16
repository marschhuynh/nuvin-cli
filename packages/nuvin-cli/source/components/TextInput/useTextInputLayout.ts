import { useEffect, useRef, useState, useMemo, useLayoutEffect } from 'react';
import { type BoxRef, measureElement } from 'ink';
import { useStdoutDimensionsContext } from '@/contexts/StdoutDimensionsContext.js';
import { computeEffectiveWidth, stabilizeEffectiveWidth } from './widthUtils.js';

export type UseTextInputLayoutOptions = {
  showScrollbar: boolean;
  maxLines: number | undefined;
};

export type UseTextInputLayoutReturn = {
  measureRef: React.RefObject<BoxRef | null>;
  scrollRef: React.RefObject<BoxRef | null>;
  effectiveWidth: number;
  containerWidth: number | undefined;
  scrollBoxWidth: number | undefined;
};

export function useTextInputLayout({
  showScrollbar,
  maxLines,
}: UseTextInputLayoutOptions): UseTextInputLayoutReturn {
  const measureRef = useRef<BoxRef>(null);
  const scrollRef = useRef<BoxRef>(null);
  const [containerWidth, setContainerWidth] = useState<number | undefined>(undefined);
  const [scrollBoxWidth, setScrollBoxWidth] = useState<number | undefined>(undefined);
  const { cols } = useStdoutDimensionsContext();
  const previousColsRef = useRef(cols);

  useLayoutEffect(() => {
    if (measureRef.current) {
      try {
        const { width } = measureElement(measureRef.current);
        if (width > 0) {
          setContainerWidth((prev) => (prev === width ? prev : width));
        }
      } catch {
        // Element not ready
      }
    }

    if (scrollRef.current) {
      try {
        const { width } = measureElement(scrollRef.current);
        if (width > 0) {
          setScrollBoxWidth((prev) => (prev === width ? prev : width));
        }
      } catch {
        // Element not ready
      }
    }
  });

  const nextEffectiveWidth = useMemo(() => {
    return computeEffectiveWidth({
      measuredContainerWidth: containerWidth,
      terminalCols: cols,
      showScrollbar,
      maxLines,
    });
  }, [containerWidth, cols, showScrollbar, maxLines]);
  const [effectiveWidth, setEffectiveWidth] = useState(nextEffectiveWidth);

  useEffect(() => {
    const terminalColsChanged = cols !== previousColsRef.current;
    setEffectiveWidth((previousEffectiveWidth) => {
      const stabilized = stabilizeEffectiveWidth({
        previousEffectiveWidth,
        nextEffectiveWidth,
        terminalColsChanged,
      });

      return stabilized;
    });
    previousColsRef.current = cols;
  }, [nextEffectiveWidth, cols, containerWidth, scrollBoxWidth]);

  return {
    measureRef,
    scrollRef,
    effectiveWidth,
    containerWidth,
    scrollBoxWidth,
  };
}
