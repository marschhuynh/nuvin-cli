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

describe('grep_tool - Status Text for No Matches', () => {
  it('should show "Not found" when matchCount is 0', () => {
    const toolCall = createMockToolCall('grep_tool', {
      pattern: 'nonexistent_pattern',
      include: '*.ts',
    });

    const toolResult = createMockToolResult('grep_tool', '', {
      matchCount: 0,
      fileCount: 0,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    const output = lastFrame();
    expect(output).toContain('⚙ Search nonexistent_pattern');
    expect(output).toContain('└─ Not found');
    expect(output).not.toContain('Found 0 matches');
    expect(output).not.toContain('in 0 files');
  });

  it('should show "Found 1 matches in 1 files" when matchCount is 1', () => {
    const toolCall = createMockToolCall('grep_tool', {
      pattern: 'TODO',
      include: '*.ts',
    });

    const toolResult = createMockToolResult('grep_tool', 'src/file.ts:10:  // TODO: fix this', {
      matchCount: 1,
      fileCount: 1,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    const output = lastFrame();
    expect(output).toContain('⚙ Search TODO');
    expect(output).toContain('└─ Found 1 matches in 1 files');
    expect(output).not.toContain('Not found');
  });

  it('should show "Found 5 matches in 2 files" when there are multiple matches', () => {
    const toolCall = createMockToolCall('grep_tool', {
      pattern: 'import',
    });

    const toolResult = createMockToolResult(
      'grep_tool',
      'src/file1.ts:1:import React\nsrc/file1.ts:5:import Vue\nsrc/file2.ts:10:import Angular',
      {
        matchCount: 5,
        fileCount: 2,
      },
    );
    const resultMessage = createMockToolResultMessage(toolResult, 150);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    const output = lastFrame();
    expect(output).toContain('⚙ Search import');
    expect(output).toContain('└─ Found 5 matches in 2 files');
    expect(output).not.toContain('Not found');
  });

  it('should show "Found 100 matches in 50 files (truncated)" when truncated', () => {
    const toolCall = createMockToolCall('grep_tool', {
      pattern: 'const',
      limit: 100,
    });

    const toolResult = createMockToolResult('grep_tool', 'Many matches...', {
      matchCount: 100,
      fileCount: 50,
      truncated: true,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 200);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    const output = lastFrame();
    expect(output).toContain('⚙ Search const with limit: 100');
    expect(output).toContain('└─ Found 100 matches in 50 files (truncated)');
    expect(output).not.toContain('Not found');
  });

  it('should show "Not found" even when limit is specified', () => {
    const toolCall = createMockToolCall('grep_tool', {
      pattern: 'xyz123',
      limit: 50,
    });

    const toolResult = createMockToolResult('grep_tool', '', {
      matchCount: 0,
      fileCount: 0,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 80);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    const output = lastFrame();
    expect(output).toContain('⚙ Search xyz123 with limit: 50');
    expect(output).toContain('└─ Not found');
    expect(output).not.toContain('Found 0');
  });

  it('should show "Search complete" when metadata is missing', () => {
    const toolCall = createMockToolCall('grep_tool', {
      pattern: 'test',
    });

    // No metadata provided
    const toolResult = createMockToolResult('grep_tool', 'Some result');
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    const output = lastFrame();
    expect(output).toContain('⚙ Search test');
    expect(output).toContain('└─ Search complete');
  });
});
