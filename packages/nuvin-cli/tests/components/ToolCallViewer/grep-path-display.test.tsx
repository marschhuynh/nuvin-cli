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

describe('grep_tool - Path Display', () => {
  describe('With path parameter', () => {
    it('should show "pattern at path" when path is provided', () => {
      const toolCall = createMockToolCall('grep_tool', {
        pattern: 'TODO',
        path: '/src/components',
      });

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Search TODO at /src/components');
    });

    it('should show "pattern at path" with limit', () => {
      const toolCall = createMockToolCall('grep_tool', {
        pattern: 'import',
        path: '/src',
        limit: 50,
      });

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Search import at /src with limit: 50');
    });

    it('should show path in success state', () => {
      const toolCall = createMockToolCall('grep_tool', {
        pattern: 'export',
        path: '/src/utils',
      });

      const toolResult = createMockToolResult('grep_tool', 'Found matches', {
        matchCount: 10,
        fileCount: 5,
      });
      const resultMessage = createMockToolResultMessage(toolResult, 150);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Search export at /src/utils');
      expect(output).toContain('└─ Found 10 matches in 5 files');
    });

    it('should show path with nested directory', () => {
      const toolCall = createMockToolCall('grep_tool', {
        pattern: 'class',
        path: '/src/components/ui/Button',
      });

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Search class at /src/components/ui/Button');
    });

    it('should show path with relative path', () => {
      const toolCall = createMockToolCall('grep_tool', {
        pattern: 'test',
        path: './tests',
      });

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Search test at ./tests');
    });
  });

  describe('Without path parameter', () => {
    it('should show only pattern when path is not provided', () => {
      const toolCall = createMockToolCall('grep_tool', {
        pattern: 'TODO',
        include: '*.ts',
      });

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Search TODO');
      expect(output).not.toContain(' at ');
    });

    it('should show pattern with limit but no path', () => {
      const toolCall = createMockToolCall('grep_tool', {
        pattern: 'const',
        limit: 100,
      });

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Search const with limit: 100');
      expect(output).not.toContain(' at ');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty path string', () => {
      const toolCall = createMockToolCall('grep_tool', {
        pattern: 'TODO',
        path: '',
      });

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Search TODO');
      expect(output).not.toContain(' at ');
    });

    it('should handle path with spaces', () => {
      const toolCall = createMockToolCall('grep_tool', {
        pattern: 'import',
        path: '/my project/src',
      });

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Search import at /my project/src');
    });

    it('should handle pattern with special characters and path', () => {
      const toolCall = createMockToolCall('grep_tool', {
        pattern: 'TODO|FIXME',
        path: '/src',
      });

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Search TODO|FIXME at /src');
    });
  });

  describe('Combined with include parameter', () => {
    it('should show path in header, include remains in params', () => {
      const toolCall = createMockToolCall('grep_tool', {
        pattern: 'useState',
        path: '/src/components',
        include: '*.tsx',
      });

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      const output = lastFrame();
      // Path should be in the header
      expect(output).toContain('⚙ Search useState at /src/components');
      // Include is a separate parameter (shown in params section if expanded)
    });
  });
});
