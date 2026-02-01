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

describe('Limit Parameter Display', () => {
  describe('grep_tool with limit', () => {
    it('should show "with limit: 100" when limit is provided', () => {
      const toolCall = createMockToolCall('grep_tool', {
        pattern: 'TODO',
        limit: 100,
        include: '*.ts',
      });

      const { lastFrame } = render(
        <ToolCallViewer
          toolCall={toolCall}
          toolResult={undefined}
          toolState="running"
          messageId="msg-1"
        />
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Search TODO with limit: 100');
    });

    it('should not show limit when not provided', () => {
      const toolCall = createMockToolCall('grep_tool', {
        pattern: 'TODO',
        include: '*.ts',
      });

      const { lastFrame } = render(
        <ToolCallViewer
          toolCall={toolCall}
          toolResult={undefined}
          toolState="running"
          messageId="msg-1"
        />
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Search TODO');
      expect(output).not.toContain('with limit');
    });
  });

  describe('glob_tool with limit', () => {
    it('should show "with limit: 50" when limit is provided', () => {
      const toolCall = createMockToolCall('glob_tool', {
        pattern: '**/*.ts',
        limit: 50,
      });

      const { lastFrame } = render(
        <ToolCallViewer
          toolCall={toolCall}
          toolResult={undefined}
          toolState="running"
          messageId="msg-1"
        />
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Find files **/*.ts with limit: 50');
    });

    it('should not show limit when not provided', () => {
      const toolCall = createMockToolCall('glob_tool', {
        pattern: '**/*.ts',
      });

      const { lastFrame } = render(
        <ToolCallViewer
          toolCall={toolCall}
          toolResult={undefined}
          toolState="running"
          messageId="msg-1"
        />
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Find files **/*.ts');
      expect(output).not.toContain('with limit');
    });
  });

  describe('web_search with limit', () => {
    it('should show "with limit: 10" when limit is provided', () => {
      const toolCall = createMockToolCall('web_search', {
        query: 'TypeScript best practices',
        limit: 10,
      });

      const { lastFrame } = render(
        <ToolCallViewer
          toolCall={toolCall}
          toolResult={undefined}
          toolState="running"
          messageId="msg-1"
        />
      );

      const output = lastFrame();
      // web_search displayName is "Search" not "Web search"
      expect(output).toContain('⚙ Search TypeScript best practices with limit: 10');
    });
  });

  describe('ls_tool with limit', () => {
    it('should show "with limit: 100" for directory listing', () => {
      const toolCall = createMockToolCall('ls_tool', {
        path: '/src',
        limit: 100,
      });

      const { lastFrame } = render(
        <ToolCallViewer
          toolCall={toolCall}
          toolResult={undefined}
          toolState="running"
          messageId="msg-1"
        />
      );

      const output = lastFrame();
      expect(output).toContain('⚙ List /src with limit: 100');
    });
  });

  describe('bash_tool with limit (timeoutMs)', () => {
    it('should NOT show limit for bash_tool (uses timeoutMs, not limit)', () => {
      const toolCall = createMockToolCall('bash_tool', {
        cmd: 'npm test',
        timeoutMs: 30000,
      });

      const { lastFrame } = render(
        <ToolCallViewer
          toolCall={toolCall}
          toolResult={undefined}
          toolState="running"
          messageId="msg-1"
        />
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Run npm test');
      expect(output).not.toContain('with limit');
      // Note: timeoutMs appears in params section, which is expected behavior
    });
  });

  describe('Completed state with limit', () => {
    it('should show limit in success state', () => {
      const toolCall = createMockToolCall('grep_tool', {
        pattern: 'import',
        limit: 50,
      });

      const toolResult = createMockToolResult(
        'grep_tool',
        'src/file1.ts:10:import React\nsrc/file2.ts:5:import Vue',
        {
          matches: 2,
          files: 2,
        }
      );
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer
          toolCall={toolCall}
          toolResult={resultMessage}
          toolState="success"
          messageId="msg-1"
        />
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Search import with limit: 50');
    });
  });

  describe('Different limit values', () => {
    it('should display limit: 1', () => {
      const toolCall = createMockToolCall('grep_tool', {
        pattern: 'test',
        limit: 1,
      });

      const { lastFrame } = render(
        <ToolCallViewer
          toolCall={toolCall}
          toolResult={undefined}
          toolState="running"
          messageId="msg-1"
        />
      );

      const output = lastFrame();
      expect(output).toContain('with limit: 1');
    });

    it('should display limit: 1000', () => {
      const toolCall = createMockToolCall('grep_tool', {
        pattern: 'test',
        limit: 1000,
      });

      const { lastFrame } = render(
        <ToolCallViewer
          toolCall={toolCall}
          toolResult={undefined}
          toolState="running"
          messageId="msg-1"
        />
      );

      const output = lastFrame();
      expect(output).toContain('with limit: 1000');
    });
  });

  describe('Tools without main arg', () => {
    it('should not show limit for tools without main arg', () => {
      const toolCall = createMockToolCall('todo_write', {
        todos: [],
        limit: 100, // Even if limit is present, todo_write has no main arg
      });

      const toolResult = createMockToolResult('todo_write', 'Updated', {
        items: [],
      });
      const resultMessage = createMockToolResultMessage(toolResult, 50);

      const { lastFrame } = render(
        <ToolCallViewer
          toolCall={toolCall}
          toolResult={resultMessage}
          toolState="success"
          messageId="msg-1"
        />
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Update todo');
      expect(output).not.toContain('with limit');
    });
  });
});
