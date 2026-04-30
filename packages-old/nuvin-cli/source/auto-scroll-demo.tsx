import { useRef, useState, useEffect, type ReactNode } from 'react';
import { Box, render, Text, type BoxRef, useInput, type BoxProps } from 'ink';

type AutoScrollBoxProps = {
  maxHeight: number;
  children: ReactNode;
} & Omit<BoxProps, 'ref' | 'overflow' | 'height'>;

function AutoScrollBox({ maxHeight, children, ...boxProps }: AutoScrollBoxProps) {
  const boxRef = useRef<BoxRef>(null);
  const prevChildrenRef = useRef(children);

  useEffect(() => {
    if (prevChildrenRef.current !== children) {
      boxRef.current?.scrollToBottom();
      prevChildrenRef.current = children;
    }
  }, [children]);

  return (
    <Box ref={boxRef} flexDirection="column" height={maxHeight} overflow="scroll" {...boxProps}>
      <Box flexShrink={0}>{children}</Box>
    </Box>
  );
}

function AutoScrollDemo() {
  const [text, setText] = useState('Line 1');

  useEffect(() => {
    let count = 2;
    const interval = setInterval(() => {
      setText((prev) => `${prev}\nLine ${count++}`);
    }, 300);

    return () => clearInterval(interval);
  }, []);

  useInput((input) => {
    if (input === 'q') process.exit(0);
  });

  const height = Math.min(process.stdout.rows - 4, 20);

  return (
    <Box flexDirection="column" width={60}>
      <Box paddingX={1}>
        <Text bold>Auto-Scroll Demo</Text>
        <Text dimColor> - Press q to quit</Text>
      </Box>
      <AutoScrollBox maxHeight={height} borderStyle="round" paddingX={1}>
        <Text>{text}</Text>
      </AutoScrollBox>
      <Box paddingX={1}>
        <Text dimColor>Lines: {text.split('\n').length}</Text>
      </Box>
    </Box>
  );
}

render(<AutoScrollDemo />);
