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
import {
  createMockToolCall,
  createMockToolResult,
  createMockToolResultMessage,
  createMockToolError,
} from '../../helpers/toolMocks.js';

describe('Dynamic DisplayName - file_read', () => {
  const toolCall = createMockToolCall('file_read', {
    path: '/test/example.ts',
  });

  it('should show "Reading" in running state', () => {
    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
    );

    const output = lastFrame();
    expect(output).toContain('⚙ Reading');
    expect(output).not.toContain('⚙ Read failed');
    expect(output).not.toContain('⚙ Read '); // Note the space to avoid matching "Reading"
  });

  it('should show "Read" in success state', () => {
    const toolResult = createMockToolResult('file_read', 'File content');
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    const output = lastFrame();
    expect(output).toContain('⚙ Read');
    expect(output).not.toContain('⚙ Reading');
    expect(output).not.toContain('⚙ Read failed');
  });

  it('should show "Read failed" in error state', () => {
    const toolError = createMockToolError('file_read', 'File not found');
    const resultMessage = createMockToolResultMessage(toolError, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="error" messageId="msg-1" />,
    );

    const output = lastFrame();
    expect(output).toContain('⚙ Read failed');
    expect(output).not.toContain('⚙ Reading');
  });

  it('should show "Read" in denied state', () => {
    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="denied" messageId="msg-1" />,
    );

    const output = lastFrame();
    expect(output).toContain('⚙ Read');
    expect(output).not.toContain('⚙ Reading');
    expect(output).not.toContain('⚙ Read failed');
  });

  it('should show "Read" in edited state', () => {
    const toolResult = createMockToolResult('file_read', 'Content');
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="edited" messageId="msg-1" />,
    );

    const output = lastFrame();
    expect(output).toContain('⚙ Read');
    expect(output).not.toContain('⚙ Reading');
    expect(output).not.toContain('⚙ Read failed');
  });

  it('should show "Read" in aborted state', () => {
    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="aborted" messageId="msg-1" />,
    );

    const output = lastFrame();
    expect(output).toContain('⚙ Read');
    expect(output).not.toContain('⚙ Reading');
    expect(output).not.toContain('⚙ Read failed');
  });

  it('should show "Read" in timeout state', () => {
    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="timeout" messageId="msg-1" />,
    );

    const output = lastFrame();
    expect(output).toContain('⚙ Read');
    expect(output).not.toContain('⚙ Reading');
    expect(output).not.toContain('⚙ Read failed');
  });
});
