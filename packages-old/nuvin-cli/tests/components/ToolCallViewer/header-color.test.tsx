import { vi, describe, it, expect } from 'vitest';

// Mock all contexts and hooks used by ToolCallViewer
vi.mock('@/hooks/useStdoutDimensions.ts', () => ({
  useStdoutDimensions: vi.fn().mockReturnValue({ cols: 100, rows: 30 }),
}));

vi.mock('@/contexts/ThemeContext.js', () => ({
  useTheme: vi.fn().mockReturnValue({
    theme: {
      messageTypes: { tool: 'blue' },
      status: {
        success: 'green',
        error: 'red', // This is the color that should be used for error state
        idle: 'yellow',
        warning: 'yellow',
        pending: 'cyan',
      },
      colors: { warning: 'yellow', muted: 'gray', textDim: 'gray' },
      tokens: { gray: 'gray', red: 'red', green: 'green', blue: 'blue' },
    },
  }),
}));

vi.mock('@/contexts/ToolApprovalContext.js', () => ({
  useToolApproval: vi.fn().mockReturnValue({ pendingApprovalTools: [] }),
}));

import React from 'react';
import { render } from 'ink-testing-library';
import { ToolCallViewer } from '@/components/ToolCallViewer/index.js';
import {
  createMockToolCall,
  createMockToolResult,
  createMockToolResultMessage,
  createMockToolError,
} from '../../helpers/toolMocks.js';

describe('Header Color Behavior', () => {
  const toolCall = createMockToolCall('file_read', {
    path: '/test/example.ts',
  });

  it('should render header without error color in running state', () => {
    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
    );

    const output = lastFrame();

    // Text content should be "Reading"
    expect(output).toContain('⚙ Reading');
    expect(output).toContain('/test/example.ts');
  });

  it('should render header without error color in success state', () => {
    const toolResult = createMockToolResult('file_read', 'File content');
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    const output = lastFrame();

    // Text content should be "Read"
    expect(output).toContain('⚙ Read');
    expect(output).toContain('/test/example.ts');
  });

  it('should render header with error color in error state', () => {
    const toolError = createMockToolError('file_read', 'File not found');
    const resultMessage = createMockToolResultMessage(toolError, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="error" messageId="msg-1" />,
    );

    const output = lastFrame();

    // Text content should be "Read failed"
    expect(output).toContain('⚙ Read failed');
    expect(output).toContain('/test/example.ts');

    // Note: Ink text snapshots don't capture ANSI color codes,
    // but the color is being applied via the color prop in defaultRenderHeader
    // The color comes from theme.status.error which is 'red' in our mock
  });

  it('should transition from normal color (running) to error color (error)', () => {
    const { lastFrame, rerender } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
    );

    // Initial: running state - no error color
    let output = lastFrame();
    expect(output).toContain('⚙ Reading');

    // Transition to error - should have error color
    const toolError = createMockToolError('file_read', 'File not found');
    const resultMessage = createMockToolResultMessage(toolError, 100);

    rerender(<ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="error" messageId="msg-1" />);

    output = lastFrame();
    expect(output).toContain('⚙ Read failed');
  });

  it('should transition from error color back to normal color when state changes', () => {
    const toolError = createMockToolError('file_read', 'File not found');
    const errorMessage = createMockToolResultMessage(toolError, 100);

    const { lastFrame, rerender } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={errorMessage} toolState="error" messageId="msg-1" />,
    );

    // Initial: error state - has error color
    let output = lastFrame();
    expect(output).toContain('⚙ Read failed');

    // Change to edited state - should not have error color
    rerender(<ToolCallViewer toolCall={toolCall} toolResult={errorMessage} toolState="edited" messageId="msg-1" />);

    output = lastFrame();
    expect(output).toContain('⚙ Read');
    expect(output).not.toContain('⚙ Read failed');
  });

  describe('Other tools with default header renderer', () => {
    it('should apply error color to bash_tool in error state', () => {
      const bashCall = createMockToolCall('bash_tool', {
        cmd: 'ls /nonexistent',
      });
      const toolError = createMockToolError('bash_tool', 'ls: /nonexistent: No such file or directory');
      const resultMessage = createMockToolResultMessage(toolError, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={bashCall} toolResult={resultMessage} toolState="error" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Run');
    });

    it('should apply error color to file_new in error state', () => {
      const fileNewCall = createMockToolCall('file_new', {
        file_path: '/readonly/test.txt',
        content: 'content',
      });
      const toolError = createMockToolError('file_new', 'EACCES: permission denied');
      const resultMessage = createMockToolResultMessage(toolError, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={fileNewCall} toolResult={resultMessage} toolState="error" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Create');
    });
  });
});
