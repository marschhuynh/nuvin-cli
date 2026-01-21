import type React from 'react';
import { type RefObject, useMemo, useState, useLayoutEffect, useRef } from 'react';
import { Box, Text, measureElement, type BoxRef, type TextProps } from 'ink';
import wrapAnsi from 'wrap-ansi';

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
  const innerRef = useRef<BoxRef>(null);
  const effectiveRef = containerRef ?? innerRef;
  const [containerWidth, setContainerWidth] = useState<number | undefined>(explicitWidth);

  useLayoutEffect(() => {
    if (explicitWidth !== undefined) {
      setContainerWidth(explicitWidth);
      return;
    }

    if (effectiveRef?.current) {
      const { width } = measureElement(effectiveRef.current);
      if (width > 0) {
        setContainerWidth(width);
      }
    }
  }, [explicitWidth, effectiveRef]);

  const wrappedText = useMemo(() => {
    if (!children || containerWidth === undefined || containerWidth <= 0) {
      return children ?? '';
    }

    return wrapAnsi(children, containerWidth, {
      trim,
      hard,
      wordWrap,
    });
  }, [children, containerWidth, trim, hard, wordWrap]);

  if (containerRef) {
    return <Text {...textProps}>{wrappedText}</Text>;
  }

  return (
    <Box ref={innerRef} width="100%">
      <Text {...textProps}>{wrappedText}</Text>
    </Box>
  );
};
