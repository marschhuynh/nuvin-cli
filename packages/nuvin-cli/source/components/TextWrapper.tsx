import type React from 'react';
import { type RefObject, useMemo, useState, useLayoutEffect, useRef } from 'react';
import { Box, Text, measureElement, type BoxRef, type TextProps } from 'ink';
import wrapAnsi from 'wrap-ansi';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';

interface TextWrapperProps extends Omit<TextProps, 'wrap'> {
  children: string;
  width?: number;
  trim?: boolean;
  hard?: boolean;
  wordWrap?: boolean;
  containerRef?: RefObject<BoxRef | null>;
}

export const TextWrapper: React.FC<TextWrapperProps> = ({
  children,
  width: explicitWidth,
  trim = true,
  hard = false,
  wordWrap = true,
  containerRef,
  ...textProps
}) => {
  const { cols } = useStdoutDimensions();
  const innerRef = useRef<BoxRef>(null);
  const [containerWidth, setContainerWidth] = useState<number | undefined>(explicitWidth ?? cols);

  useLayoutEffect(() => {
    if (explicitWidth !== undefined) {
      setContainerWidth(explicitWidth);
      return;
    }

    if (!containerRef?.current && innerRef.current) {
      const { width } = measureElement(innerRef.current);
      if (width > 0) {
        setContainerWidth(width);
        return;
      }
    }

    if (cols > 0) {
      setContainerWidth(cols);
    }
  }, [explicitWidth, containerRef, cols]);

  const wrappedText = useMemo(() => {
    if (!children || containerWidth === undefined || containerWidth <= 0) {
      return children ?? '';
    }

    return wrapAnsi(children, containerWidth - 2, {
      trim,
      hard,
      wordWrap,
    });
  }, [children, containerWidth, trim, hard, wordWrap]);

  if (containerRef) {
    return <Text {...textProps} color={"red"}>{wrappedText}</Text>;
  }

  return (
    <Box ref={innerRef} width="100%">
      <Text {...textProps}>{wrappedText}</Text>
    </Box>
  );
};
