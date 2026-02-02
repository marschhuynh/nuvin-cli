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

describe('bash_tool - Snapshot Tests', () => {
  it('renders successful bash command execution', () => {
    const output =
      'total 64\ndrwxr-xr-x  12 user  staff   384 Jan 31 10:00 src\ndrwxr-xr-x   5 user  staff   160 Jan 31 10:00 tests';

    const toolCall = createMockToolCall('bash_tool', {
      cmd: 'ls -la',
      cwd: '/Users/user/project',
    });
    const toolResult = createMockToolResult('bash_tool', output, { code: 0 });
    const resultMessage = createMockToolResultMessage(toolResult, 156);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders bash command with empty output', () => {
    const toolCall = createMockToolCall('bash_tool', {
      cmd: 'touch newfile.txt',
    });
    const toolResult = createMockToolResult('bash_tool', '', { code: 0 });
    const resultMessage = createMockToolResultMessage(toolResult, 34);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders bash command with long multi-line output', () => {
    const longOutput = Array(30)
      .fill(0)
      .map((_, i) => `[${i + 1}] Processing item ${i + 1}...`)
      .join('\n');

    const toolCall = createMockToolCall('bash_tool', {
      cmd: 'npm install',
    });
    const toolResult = createMockToolResult('bash_tool', longOutput, { code: 0 });
    const resultMessage = createMockToolResultMessage(toolResult, 8950);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders bash command with special characters in output', () => {
    const output = '✓ Tests passed\n✗ 2 warnings\n🚀 Build complete\nPath: /usr/local/bin → ~/.local/bin';

    const toolCall = createMockToolCall('bash_tool', {
      cmd: 'npm test',
    });
    const toolResult = createMockToolResult('bash_tool', output, { code: 0 });
    const resultMessage = createMockToolResultMessage(toolResult, 234);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });
});
