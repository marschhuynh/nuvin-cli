import { vi, describe, it, expect } from 'vitest';

// Mock all contexts and hooks used by ToolCallViewer
vi.mock('@/hooks/useStdoutDimensions.ts', () => ({
  useStdoutDimensions: vi.fn().mockReturnValue({ cols: 100, rows: 30 }),
}));

vi.mock('@/contexts/ThemeContext.js', () => ({
  useTheme: vi.fn().mockReturnValue({
    theme: {
      messageTypes: { tool: 'blue' },
      status: { success: 'green', error: 'red', idle: 'yellow', warning: 'yellow', pending: 'cyan' },
      colors: { warning: 'yellow', muted: 'gray', textDim: 'gray' },
      tokens: { gray: 'gray', red: 'red', green: 'green', blue: 'blue' },
    },
  }),
}));

vi.mock('@/contexts/ToolApprovalContext.js', () => ({
  useToolApproval: vi.fn().mockReturnValue({ pendingApprovalTools: [] }),
}));

import { render } from 'ink-testing-library';
import { ToolCallViewer } from '@/components/ToolCallViewer/index.js';
import { createMockToolCall, createMockToolResult, createMockToolResultMessage } from '../../helpers/toolMocks.js';

describe('Tool Denied State', () => {
  it('should show only status line without result content for denied bash_tool', () => {
    const toolCall = createMockToolCall('bash_tool', { cmd: 'rm -rf /' });
    const result = 'Tool execution denied by user';
    const toolResult = createMockToolResult('bash_tool', result);
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="denied" messageId="msg-1" />,
    );

    const output = lastFrame();

    // Should show the header
    expect(output).toContain('⚙');
    expect(output).toContain('Run');
    expect(output).toContain('rm -rf /');

    // Should show the denied status line
    expect(output).toContain('└─ Denied');

    // Should NOT show the result content
    expect(output).not.toContain('Tool execution denied by user');

    // Should not have the result border (│)
    const lines = output.split('\n');
    const hasResultBorder = lines.some((line) => line.includes('│') && !line.includes('⚙'));
    expect(hasResultBorder).toBe(false);
  });

  it('should show correct tree structure for denied grep_tool', () => {
    const toolCall = createMockToolCall('grep_tool', { pattern: 'password', path: '/etc' });
    const result = 'Tool execution denied by user';
    const toolResult = createMockToolResult('grep_tool', result);
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="denied" messageId="msg-1" />,
    );

    const output = lastFrame();

    // Should have proper tree structure with status at the end
    expect(output).toContain('⚙');
    expect(output).toContain('└─ Denied');
    expect(output).not.toContain('Tool execution denied by user');
  });

  it('should show correct tree structure for edited tool', () => {
    const toolCall = createMockToolCall('bash_tool', { cmd: 'ls' });
    const result = 'Some result';
    const toolResult = createMockToolResult('bash_tool', result);
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="edited" messageId="msg-1" />,
    );

    const output = lastFrame();

    // Should show the header
    expect(output).toContain('⚙');
    expect(output).toContain('Run');

    // Should show the edited status line
    expect(output).toContain('└─ Edited');

    // Should NOT show the result content to maintain tree structure
    expect(output).not.toContain('Some result');
  });

  it('should show result content for successful tool execution', () => {
    const toolCall = createMockToolCall('bash_tool', { cmd: 'echo hello' });
    const result = 'hello';
    const toolResult = createMockToolResult('bash_tool', result);
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    const output = lastFrame();

    // Should show the result content for successful execution
    expect(output).toContain('hello');
    expect(output).toContain('│');
    expect(output).toContain('└─');
  });
});
