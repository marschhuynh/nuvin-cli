import { useRef, useCallback, useState, useEffect } from 'react';
import { Box, render, Text, type BoxRef, useStdout, useStdin, useInput, type Key } from 'ink';

const randomHeight = () => 3 + Math.floor(Math.random() * 5);

const sections = [
  {
    name: 'Getting Started',
    items: [
      { label: 'Installation', height: randomHeight() },
      { label: 'Quick Start', height: randomHeight() },
      { label: 'Configuration', height: randomHeight() },
      { label: 'First App', height: randomHeight() },
      { label: 'Project Structure', height: randomHeight() },
      { label: 'Environment Setup', height: randomHeight() },
    ],
  },
  {
    name: 'Components',
    items: [
      { label: 'Box', height: randomHeight() },
      { label: 'Text', height: randomHeight() },
      { label: 'Newline', height: randomHeight() },
      { label: 'Spacer', height: randomHeight() },
      { label: 'Static', height: randomHeight() },
      { label: 'Transform', height: randomHeight() },
      { label: 'ScrollView', height: randomHeight() },
      { label: 'List', height: randomHeight() },
    ],
  },
  {
    name: 'Hooks',
    items: [
      { label: 'useInput', height: randomHeight() },
      { label: 'useApp', height: randomHeight() },
      { label: 'useStdin', height: randomHeight() },
      { label: 'useStdout', height: randomHeight() },
      { label: 'useFocus', height: randomHeight() },
      { label: 'useFocusManager', height: randomHeight() },
      { label: 'useInterval', height: randomHeight() },
      { label: 'useTimeout', height: randomHeight() },
    ],
  },
  {
    name: 'Advanced',
    items: [
      { label: 'Custom Renderer', height: randomHeight() },
      { label: 'Testing', height: randomHeight() },
      { label: 'CI/CD', height: randomHeight() },
      { label: 'Performance', height: randomHeight() },
      { label: 'Debugging', height: randomHeight() },
      { label: 'Profiling', height: randomHeight() },
    ],
  },
  {
    name: 'API Reference',
    items: [
      { label: 'render()', height: randomHeight() },
      { label: 'measureElement()', height: randomHeight() },
      { label: 'Box Props', height: randomHeight() },
      { label: 'Text Props', height: randomHeight() },
      { label: 'Color Support', height: randomHeight() },
      { label: 'Border Styles', height: randomHeight() },
    ],
  },
  {
    name: 'Examples',
    items: [
      { label: 'Todo App', height: randomHeight() },
      { label: 'File Browser', height: randomHeight() },
      { label: 'Progress Bar', height: randomHeight() },
      { label: 'Spinner', height: randomHeight() },
      { label: 'Table View', height: randomHeight() },
      { label: 'Form Input', height: randomHeight() },
    ],
  },
  {
    name: 'Troubleshooting',
    items: [
      { label: 'Common Issues', height: randomHeight() },
      { label: 'FAQ', height: randomHeight() },
      { label: 'Migration Guide', height: randomHeight() },
      { label: 'Breaking Changes', height: randomHeight() },
    ],
  },
].sort(() => Math.random() - 0.5);

function parseMouseEvent(data: string): { type: 'wheel-up' | 'wheel-down' | 'other'; x: number; y: number } | null {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence for mouse events
  const sgrMatch = data.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
  if (sgrMatch) {
    const button = parseInt(sgrMatch[1] ?? '0', 10);
    const x = parseInt(sgrMatch[2] ?? '0', 10);
    const y = parseInt(sgrMatch[3] ?? '0', 10);
    if (button === 64) return { type: 'wheel-up', x, y };
    if (button === 65) return { type: 'wheel-down', x, y };
    return { type: 'other', x, y };
  }

  if (data.length >= 6 && data.startsWith('\x1b[M')) {
    const button = data.charCodeAt(3) - 32;
    const x = data.charCodeAt(4) - 32;
    const y = data.charCodeAt(5) - 32;
    if (button === 64) return { type: 'wheel-up', x, y };
    if (button === 65) return { type: 'wheel-down', x, y };
    return { type: 'other', x, y };
  }

  return null;
}

function ScrollExample() {
  const boxReference = useRef<BoxRef>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [terminalSize, setTerminalSize] = useState({
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24,
  });
  const { stdout } = useStdout();
  const { internal_eventEmitter } = useStdin();

  useEffect(() => {
    const handleResize = () => {
      setTerminalSize({ width: process.stdout.columns || 80, height: process.stdout.rows || 24 });
    };
    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (stdout) {
      stdout.write('\x1b[?1000h\x1b[?1002h\x1b[?1006h');
    }

    return () => {
      if (stdout) {
        stdout.write('\x1b[?1006l\x1b[?1002l\x1b[?1000l');
      }
    };
  }, [stdout]);

  const scrollBy = useCallback((delta: number) => {
    setScrollTop((previous) => {
      const next = Math.max(0, previous + delta);
      boxReference.current?.scrollTo({ x: 0, y: next });
      return next;
    });
  }, []);

  useEffect(() => {
    const handleRawInput = (data: string) => {
      const mouse = parseMouseEvent(data);
      if (mouse) {
        if (mouse.type === 'wheel-up') {
          scrollBy(-2);
        } else if (mouse.type === 'wheel-down') {
          scrollBy(2);
        }
      }
    };

    internal_eventEmitter?.on('input', handleRawInput);
    return () => {
      internal_eventEmitter?.off('input', handleRawInput);
    };
  }, [internal_eventEmitter, scrollBy]);

  useInput((input: string, key: Key) => {
    if (input === 'q') {
      process.exit(0);
    } else if (key.downArrow) {
      scrollBy(1);
    } else if (key.upArrow) {
      scrollBy(-1);
    } else if (key.pageDown) {
      scrollBy(10);
    } else if (key.pageUp) {
      scrollBy(-10);
    } else if (input === 'g') {
      boxReference.current?.scrollToTop();
      setScrollTop(0);
    } else if (input === 'G') {
      boxReference.current?.scrollToBottom();
      const pos = boxReference.current?.getScrollPosition();
      if (pos) setScrollTop(pos.y);
    }
  });

  const contentWidth = terminalSize.width - 2;
  const contentHeight = terminalSize.height - 2;

  return (
    <Box flexDirection="column" width={terminalSize.width} height={terminalSize.height}>
      <Box paddingX={1} justifyContent="space-between">
        <Text bold>Sticky Headers Demo</Text>
        <Text dimColor>
          Scroll: {scrollTop} | {terminalSize.width}x{terminalSize.height}
        </Text>
      </Box>
      <Box paddingX={1}>
        <Text dimColor>↑/↓ scroll, PageUp/Down, g/G for top/bottom, Mouse wheel, q to quit</Text>
      </Box>

      <Box flexGrow={1} paddingX={1}>
        <Box
          flexDirection="column"
          ref={boxReference}
          width={contentWidth}
          height={contentHeight}
          overflow="scroll"
          borderStyle="round"
        >
          {sections.map((section) => (
            <Box key={section.name} flexDirection="column" flexShrink={0}>
              <Box
                position="sticky"
                top={0}
                flexShrink={0}
                backgroundColor="blue"
                width={contentWidth - 2}
                paddingX={1}
              >
                <Text bold color="white">
                  {section.name}
                </Text>
              </Box>
              {section.items.map((item) => (
                <Box key={item.label} flexShrink={0} paddingLeft={2} borderStyle="single" height={item.height}>
                  <Text>{`• ${item.label} - ${item.height}`}</Text>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

render(<ScrollExample />);
