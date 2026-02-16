import { useEffect, useRef, useState, useMemo, useLayoutEffect } from 'react';
import { type BoxRef, measureElement } from 'ink';
import { useStdoutDimensionsContext } from '@/contexts/StdoutDimensionsContext.js';
import { computeEffectiveWidth, stabilizeEffectiveWidth } from './widthUtils.js';
import { isTextInputDebugEnabled, logTextInputDebug } from './debugLogger.js';

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
    let measuredOuterWidth: number | undefined;
    let measuredInnerWidth: number | undefined;

    if (measureRef.current) {
      try {
        const { width } = measureElement(measureRef.current);
        if (width > 0) {
          measuredOuterWidth = width;
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
          measuredInnerWidth = width;
          setScrollBoxWidth((prev) => (prev === width ? prev : width));
        }
      } catch {
        // Element not ready
      }
    }

    if (isTextInputDebugEnabled) {
      const shouldLogWidthUpdate =
        (measuredOuterWidth !== undefined && measuredOuterWidth !== containerWidth) ||
        (measuredInnerWidth !== undefined && measuredInnerWidth !== scrollBoxWidth);

      if (shouldLogWidthUpdate) {
        logTextInputDebug('measure width updated', {
          measuredOuterWidth,
          previousOuterWidth: containerWidth,
          measuredInnerWidth,
          previousInnerWidth: scrollBoxWidth,
          cols,
        });
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

      if (isTextInputDebugEnabled) {
        logTextInputDebug('effective width reconcile', {
          previousEffectiveWidth,
          nextEffectiveWidth,
          stabilizedEffectiveWidth: stabilized,
          terminalColsChanged,
          cols,
          measuredContainerWidth: containerWidth,
          measuredScrollBoxWidth: scrollBoxWidth,
          suspiciousTinyCandidate: nextEffectiveWidth < 12,
          severeCollapseFromPrevious:
            previousEffectiveWidth !== undefined && nextEffectiveWidth < Math.floor(previousEffectiveWidth * 0.35),
        });

        if (stabilized <= 4) {
          logTextInputDebug('anomaly: tiny effective width', {
            previousEffectiveWidth,
            nextEffectiveWidth,
            stabilizedEffectiveWidth: stabilized,
            cols,
            measuredContainerWidth: containerWidth,
            measuredScrollBoxWidth: scrollBoxWidth,
          });
        }
      }

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
