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

describe('file_edit - Snapshot Tests', () => {
  it('renders successful file edit with diff view', () => {
    const oldText = 'const value = "hello";';
    const newText = 'const value = "world";';

    const toolCall = createMockToolCall('file_edit', {
      file_path: 'src/config.ts',
      old_text: oldText,
      new_text: newText,
    });
    const toolResult = createMockToolResult('file_edit', 'File edited successfully', {
      bytesWritten: 22,
      path: 'src/config.ts',
      lineNumbers: {
        oldStartLine: 5,
        oldEndLine: 5,
        newStartLine: 5,
        newEndLine: 5,
        oldLineCount: 1,
        newLineCount: 1,
      },
    });
    const resultMessage = createMockToolResultMessage(toolResult, 78);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders multi-line file edit', () => {
    const oldText = `function foo() {\n  console.log("old");\n}`;
    const newText = `function foo() {\n  console.log("new");\n  console.log("added");\n}`;

    const toolCall = createMockToolCall('file_edit', {
      file_path: 'src/utils.ts',
      old_text: oldText,
      new_text: newText,
    });
    const toolResult = createMockToolResult('file_edit', 'File edited successfully', {
      bytesWritten: 65,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 95);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders file edit with no bytes metadata', () => {
    const toolCall = createMockToolCall('file_edit', {
      file_path: 'README.md',
      old_text: '# Old Title',
      new_text: '# New Title',
    });
    const toolResult = createMockToolResult('file_edit', 'File edited successfully');
    const resultMessage = createMockToolResultMessage(toolResult, 42);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });
});
