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

describe('ls_tool - Snapshot Tests', () => {
  it('renders successful directory listing', () => {
    const listing = `total: 5

drwxr-xr-x  2024-01-31T10:00:00.000Z  4096  src
-rw-r--r--  2024-01-31T09:30:00.000Z  1234  package.json
-rw-r--r--  2024-01-31T09:00:00.000Z   567  README.md
-rw-r--r--  2024-01-30T15:00:00.000Z   890  tsconfig.json
drwxr-xr-x  2024-01-29T14:00:00.000Z  2048  tests`;

    const toolCall = createMockToolCall('ls_tool', {
      path: '/Users/user/project',
    });
    const toolResult = createMockToolResult('ls_tool', listing);
    const resultMessage = createMockToolResultMessage(toolResult, 123);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders directory listing with truncation', () => {
    const entries = Array(50)
      .fill(0)
      .map((_, i) => `-rw-r--r--  2024-01-31T10:00:00.000Z  ${1000 + i}  file${i + 1}.txt`)
      .join('\n');
    const listing = `total: 50\n\n${entries}\n\ntruncated: true (50 of 100 entries shown)`;

    const toolCall = createMockToolCall('ls_tool', {
      path: '/Users/user/large-dir',
      limit: 50,
    });
    const toolResult = createMockToolResult('ls_tool', listing);
    const resultMessage = createMockToolResultMessage(toolResult, 345);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders empty directory listing', () => {
    const listing = 'total: 0';

    const toolCall = createMockToolCall('ls_tool', {
      path: '/Users/user/empty-dir',
    });
    const toolResult = createMockToolResult('ls_tool', listing);
    const resultMessage = createMockToolResultMessage(toolResult, 67);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders directory listing with special characters in filenames', () => {
    const listing = `total: 4

-rw-r--r--  2024-01-31T10:00:00.000Z  1234  file with spaces.txt
-rw-r--r--  2024-01-31T09:30:00.000Z   567  file-with-dashes.md
-rw-r--r--  2024-01-31T09:00:00.000Z   890  file_with_underscores.ts
-rw-r--r--  2024-01-30T15:00:00.000Z   456  file.multiple.dots.json`;

    const toolCall = createMockToolCall('ls_tool', {
      path: '/Users/user/special-names',
    });
    const toolResult = createMockToolResult('ls_tool', listing);
    const resultMessage = createMockToolResultMessage(toolResult, 89);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });
});
