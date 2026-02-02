import { vi } from 'vitest';

// Mock all contexts and hooks used by ToolCallViewer
vi.mock('@/hooks/useStdoutDimensions.ts', () => ({
  useStdoutDimensions: vi.fn().mockReturnValue({ cols: 100, rows: 30 }),
}));

vi.mock('@/contexts/ThemeContext.js', () => ({
  useTheme: vi.fn().mockReturnValue({
    theme: {
      messageTypes: { tool: 'blue' },
      status: { success: 'green', error: 'red', idle: 'yellow', warning: 'yellow' },
      colors: { warning: 'yellow', muted: 'gray', textDim: 'gray' },
      tokens: { gray: 'gray', red: 'red' },
    },
  }),
}));

vi.mock('@/contexts/ToolApprovalContext.js', () => ({
  useToolApproval: vi.fn().mockReturnValue({ pendingApprovalTools: [] }),
}));

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { ToolCallViewer } from '@/components/ToolCallViewer/index.js';
import { createMockToolCall, createMockToolResult, createMockToolResultMessage } from '../../../helpers/toolMocks.js';

describe('file_new - Snapshot Tests', () => {
  it('renders successful file creation with metadata', () => {
    const content = 'export const greeting = "Hello, World!";\n';

    const toolCall = createMockToolCall('file_new', {
      file_path: 'src/greeting.ts',
      content,
    });
    const toolResult = createMockToolResult('file_new', 'File created successfully', {
      lines: 1,
      bytes: 42,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 65);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders file creation with multi-line content', () => {
    const content = `import React from 'react';\nimport { Box, Text } from 'ink';\n\nexport const App = () => {\n  return (\n    <Box>\n      <Text>Hello</Text>\n    </Box>\n  );\n};\n`;

    const toolCall = createMockToolCall('file_new', {
      file_path: 'src/components/App.tsx',
      content,
    });
    const toolResult = createMockToolResult('file_new', 'File created successfully', {
      lines: 10,
      bytes: 156,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 89);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders file creation with empty content', () => {
    const toolCall = createMockToolCall('file_new', {
      file_path: 'src/empty.ts',
      content: '',
    });
    const toolResult = createMockToolResult('file_new', 'File created successfully', {
      lines: 0,
      bytes: 0,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 23);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders file creation without metadata', () => {
    const toolCall = createMockToolCall('file_new', {
      file_path: 'README.md',
      content: '# My Project\n\nA great project.',
    });
    const toolResult = createMockToolResult('file_new', 'File created successfully');
    const resultMessage = createMockToolResultMessage(toolResult, 45);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });
});
