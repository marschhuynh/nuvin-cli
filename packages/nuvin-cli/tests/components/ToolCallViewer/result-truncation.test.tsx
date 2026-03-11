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

describe('Tool Result Truncation', () => {
  describe('Line limit (5 lines)', () => {
    it('should show all lines when result has fewer than 5 lines', () => {
      const toolCall = createMockToolCall('bash_tool', { cmd: 'ls' });
      const result = 'line1\nline2\nline3\nline4\nline5';
      const toolResult = createMockToolResult('bash_tool', result);
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('line1');
      expect(output).toContain('line5');
      expect(output).not.toContain('(truncated)');
    });

    it('should show exactly 5 lines when result has exactly 5 lines', () => {
      const toolCall = createMockToolCall('bash_tool', { cmd: 'ls' });
      const lines = Array.from({ length: 5 }, (_, i) => `line${i + 1}`);
      const result = lines.join('\n');
      const toolResult = createMockToolResult('bash_tool', result);
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('line1');
      expect(output).toContain('line5');
      expect(output).not.toContain('(truncated)');
    });

    it('should truncate to 5 lines when result has more than 5 lines', () => {
      const toolCall = createMockToolCall('bash_tool', { cmd: 'ls -la' });
      const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
      const result = lines.join('\n');
      const toolResult = createMockToolResult('bash_tool', result);
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();
      // Check for first line with boundary (avoid matching line11, line12, etc)
      expect(output).not.toMatch(/│\s+line1\n/);
      expect(output).not.toMatch(/│\s+line16\n/);
      expect(output).toContain('line17');
      expect(output).toContain('line20');
      expect(output).toContain('(truncated)');
    });

    it('should truncate at 5 lines for very long output', () => {
      const toolCall = createMockToolCall('bash_tool', { cmd: 'find /' });
      const lines = Array.from({ length: 100 }, (_, i) => `/path/to/file${i + 1}.txt`);
      const result = lines.join('\n');
      const toolResult = createMockToolResult('bash_tool', result);
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).not.toContain('file1.txt');
      expect(output).not.toContain('file96.txt');
      expect(output).toContain('file97.txt');
      expect(output).toContain('file98.txt');
      expect(output).toContain('file99.txt');
      expect(output).toContain('file100.txt');
      expect(output).toContain('(truncated)');
    });
  });

  describe('Character limit (1000 characters)', () => {
    it('should show all content when result has fewer than 1000 characters', () => {
      const toolCall = createMockToolCall('bash_tool', { cmd: 'echo' });
      const result = 'A'.repeat(500);
      const toolResult = createMockToolResult('bash_tool', result);
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('A');
      expect(output).not.toContain('(truncated)');
    });

    it('should show exactly 1000 characters when result has exactly 1000 characters', () => {
      const toolCall = createMockToolCall('bash_tool', { cmd: 'cat file' });
      const result = 'B'.repeat(1000);
      const toolResult = createMockToolResult('bash_tool', result);
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('B');
      expect(output).not.toContain('(truncated)');
    });

    it('should truncate to 1000 characters when result exceeds 1000 characters', () => {
      const toolCall = createMockToolCall('bash_tool', { cmd: 'cat large_file' });
      const result = 'C'.repeat(2000);
      const toolResult = createMockToolResult('bash_tool', result);
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('C');
      expect(output).toContain('(truncated)');
      // Result should be cut off, so not all 2000 'C's should be present
      const cCount = (output.match(/C/g) || []).length;
      expect(cCount).toBeLessThan(2000);
    });

    it('should handle single line with more than 1000 characters', () => {
      const toolCall = createMockToolCall('bash_tool', { cmd: 'echo long' });
      // Single line, no newlines, > 1000 chars
      const result = 'x'.repeat(1500);
      const toolResult = createMockToolResult('bash_tool', result);
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('x');
      expect(output).toContain('(truncated)');
    });
  });

  describe('Combined limits', () => {
    it('should apply character limit first, then line limit', () => {
      const toolCall = createMockToolCall('bash_tool', { cmd: 'cat file' });
      // Create 20 lines of 100 chars each = 2000 chars total
      const lines = Array.from({ length: 20 }, (_, i) => `${'z'.repeat(95)}line${i + 1}`);
      const result = lines.join('\n');
      const toolResult = createMockToolResult('bash_tool', result);
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('(truncated)');
      // Should be truncated by character limit first (1000 chars), then by line limit
    });

    it('should apply line limit when under character limit', () => {
      const toolCall = createMockToolCall('bash_tool', { cmd: 'ls' });
      // 15 short lines, total < 1000 chars
      const lines = Array.from({ length: 15 }, (_, i) => `line${i + 1}`);
      const result = lines.join('\n');
      const toolResult = createMockToolResult('bash_tool', result);
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();
      // Check for first few lines with boundary (avoid matching line11, line12, etc)
      expect(output).not.toMatch(/│\s+line1\n/);
      expect(output).not.toMatch(/│\s+line11\n/);
      expect(output).toContain('line12');
      expect(output).toContain('line13');
      expect(output).toContain('line14');
      expect(output).toContain('line15');
      expect(output).toContain('(truncated)');
    });
  });

  describe('Different tools', () => {
    it('should truncate bash_tool results with many lines', () => {
      const toolCall = createMockToolCall('bash_tool', { cmd: 'find /' });
      const lines = Array.from({ length: 50 }, (_, i) => `/path/to/file${i + 1}.txt`);
      const result = lines.join('\n');
      const toolResult = createMockToolResult('bash_tool', result);
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).not.toContain('file1.txt');
      expect(output).not.toContain('file46.txt');
      expect(output).toContain('file47.txt');
      expect(output).toContain('file48.txt');
      expect(output).toContain('file49.txt');
      expect(output).toContain('file50.txt');
      expect(output).toContain('(truncated)');
    });

    it('should not truncate short results', () => {
      const toolCall = createMockToolCall('bash_tool', { cmd: 'pwd' });
      const result = '/home/user/project';
      const toolResult = createMockToolResult('bash_tool', result);
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('/home/user/project');
      expect(output).not.toContain('(truncated)');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty result', () => {
      const toolCall = createMockToolCall('bash_tool', { cmd: 'true' });
      const result = '';
      const toolResult = createMockToolResult('bash_tool', result);
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).not.toContain('(truncated)');
    });

    it('should handle result with only newlines', () => {
      const toolCall = createMockToolCall('bash_tool', { cmd: 'echo' });
      const result = '\n\n\n\n\n';
      const toolResult = createMockToolResult('bash_tool', result);
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).not.toContain('(truncated)');
    });
  });
});
