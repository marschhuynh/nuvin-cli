import { vi, describe, it, expect, beforeEach } from 'vitest';

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
import type { ComputedToolState } from '@/components/ToolCallViewer/types.js';

describe('file_read - Integration Tests (State Transitions)', () => {
  const toolCall = createMockToolCall('file_read', {
    path: '/test/example.ts',
    lineStart: 1,
    lineEnd: 10,
  });

  describe('State: running', () => {
    it('should render header with "Reading" (no status line due to renderStatus: null)', () => {
      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      const output = lastFrame();

      // Should have header with "Reading"
      expect(output).toContain('⚙ Reading');
      expect(output).toContain('/test/example.ts:1-10');

      // Should NOT have "Running..." indicator (renderStatus: null suppresses it)
      expect(output).not.toContain('Running');
      expect(output).not.toContain('└─');
    });
  });

  describe('State: success', () => {
    it('should render header only (no status line due to renderStatus: null)', () => {
      const fileContent = `function hello() {
  console.log("Hello, world!");
}

export default hello;`;

      const toolResult = createMockToolResult('file_read', fileContent);
      const resultMessage = createMockToolResultMessage(toolResult, 150);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();

      // Should have header
      expect(output).toContain('⚙ Read');
      expect(output).toContain('/test/example.ts:1-10');

      // Should NOT have status line (renderStatus: null)
      // Status line would be like "└─ Read 5 lines"
      expect(output).not.toContain('lines');
      expect(output).not.toContain('└─');

      // Should NOT have result content (collapsedByDefault: true)
      expect(output).not.toContain('function hello');
      expect(output).not.toContain('console.log');
    });

    it('should handle empty file', () => {
      const toolResult = createMockToolResult('file_read', '');
      const resultMessage = createMockToolResultMessage(toolResult, 50);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();

      expect(output).toContain('⚙ Read');
      expect(output).not.toContain('└─');
    });

    it('should handle large file content', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}: Some content here`);
      const fileContent = lines.join('\n');

      const toolResult = createMockToolResult('file_read', fileContent);
      const resultMessage = createMockToolResultMessage(toolResult, 200);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();

      expect(output).toContain('⚙ Read');
      // Content is collapsed by default
      expect(output).not.toContain('Line 1');
    });
  });

  describe('State: error', () => {
    it('should render header with "Read failed" (no status line due to renderStatus: null)', () => {
      const toolError = createMockToolError('file_read', 'ENOENT: no such file or directory');
      const resultMessage = createMockToolResultMessage(toolError, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="error" messageId="msg-1" />,
      );

      const output = lastFrame();

      // Should have header with "Read failed"
      expect(output).toContain('⚙ Read failed');

      // Should NOT have error status (renderStatus: null)
      expect(output).not.toContain('ENOENT');
      expect(output).not.toContain('└─');
    });

    it('should handle permission denied error', () => {
      const toolError = createMockToolError('file_read', 'EACCES: permission denied');
      const resultMessage = createMockToolResultMessage(toolError, 80);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="error" messageId="msg-1" />,
      );

      const output = lastFrame();

      expect(output).toContain('⚙ Read failed');
      expect(output).not.toContain('permission denied');
      expect(output).not.toContain('└─');
    });
  });

  describe('State: denied', () => {
    it('should render header only (no denied status due to renderStatus: null)', () => {
      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="denied" messageId="msg-1" />,
      );

      const output = lastFrame();

      // Should have header
      expect(output).toContain('⚙ Read');

      // Should NOT have denied status (renderStatus: null)
      expect(output).not.toContain('Denied');
      expect(output).not.toContain('└─');
    });
  });

  describe('State: edited', () => {
    it('should render header only (no edited status due to renderStatus: null)', () => {
      const toolResult = createMockToolResult('file_read', 'Original content');
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="edited" messageId="msg-1" />,
      );

      const output = lastFrame();

      // Should have header
      expect(output).toContain('⚙ Read');

      // Should NOT have edited status (renderStatus: null)
      expect(output).not.toContain('Edited');
      expect(output).not.toContain('└─');
    });
  });

  describe('State: aborted', () => {
    it('should render header only (no aborted status due to renderStatus: null)', () => {
      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="aborted" messageId="msg-1" />,
      );

      const output = lastFrame();

      // Should have header
      expect(output).toContain('⚙ Read');

      // Should NOT have aborted status (renderStatus: null)
      expect(output).not.toContain('Aborted');
      expect(output).not.toContain('└─');
    });
  });

  describe('State: timeout', () => {
    it('should render header only (no timeout status due to renderStatus: null)', () => {
      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="timeout" messageId="msg-1" />,
      );

      const output = lastFrame();

      // Should have header
      expect(output).toContain('⚙ Read');

      // Should NOT have timeout status (renderStatus: null)
      expect(output).not.toContain('Timeout');
      expect(output).not.toContain('└─');
    });
  });

  describe('State Transition Scenarios', () => {
    it('should transition from running to success', () => {
      const { lastFrame, rerender } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      // Initial: running state - should show "Reading"
      let output = lastFrame();
      expect(output).toContain('⚙ Reading');
      expect(output).not.toContain('└─');

      // Transition to success - should show "Read"
      const toolResult = createMockToolResult('file_read', 'File content here');
      const resultMessage = createMockToolResultMessage(toolResult, 120);

      rerender(<ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />);

      output = lastFrame();
      expect(output).toContain('⚙ Read');
      expect(output).not.toContain('⚙ Reading');
      expect(output).not.toContain('└─');
    });

    it('should transition from running to error', () => {
      const { lastFrame, rerender } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      // Initial: running state - should show "Reading"
      let output = lastFrame();
      expect(output).toContain('⚙ Reading');

      // Transition to error - should show "Read failed"
      const toolError = createMockToolError('file_read', 'File not found');
      const resultMessage = createMockToolResultMessage(toolError, 100);

      rerender(<ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="error" messageId="msg-1" />);

      output = lastFrame();
      expect(output).toContain('⚙ Read failed');
      expect(output).not.toContain('└─');
    });

    it('should transition from running to denied', () => {
      const { lastFrame, rerender } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      // Initial: running state - should show "Reading"
      expect(lastFrame()).toContain('⚙ Reading');

      // Transition to denied - should show "Read"
      rerender(<ToolCallViewer toolCall={toolCall} toolResult={undefined} toolState="denied" messageId="msg-1" />);

      const output = lastFrame();
      expect(output).toContain('⚙ Read');
      expect(output).not.toContain('Denied');
    });
  });

  describe('Edge Cases', () => {
    it('should handle file with special characters in path', () => {
      const specialPathCall = createMockToolCall('file_read', {
        path: '/test/my file (copy) [1].ts',
      });

      const { lastFrame } = render(
        <ToolCallViewer toolCall={specialPathCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Read');
      expect(output).toContain('my file (copy) [1].ts');
    });

    it('should handle file with very long path', () => {
      const longPathCall = createMockToolCall('file_read', {
        path: '/very/long/path/with/many/nested/directories/leading/to/a/file/that/has/a/long/name/example.ts',
      });

      const { lastFrame } = render(
        <ToolCallViewer toolCall={longPathCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Read');
    });

    it('should handle file without line range', () => {
      const noLinesCall = createMockToolCall('file_read', {
        path: '/test/example.ts',
      });

      const { lastFrame } = render(
        <ToolCallViewer toolCall={noLinesCall} toolResult={undefined} toolState="running" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Read');
      expect(output).toContain('example.ts');
    });

    it('should handle binary file content', () => {
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]).toString();
      const toolResult = createMockToolResult('file_read', binaryContent);
      const resultMessage = createMockToolResultMessage(toolResult, 80);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();
      expect(output).toContain('⚙ Read');
    });
  });

  describe('Configuration Validation', () => {
    it('should respect collapsedByDefault config', () => {
      const toolResult = createMockToolResult('file_read', 'Some file content\nLine 2\nLine 3');
      const resultMessage = createMockToolResultMessage(toolResult, 100);

      const { lastFrame } = render(
        <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
      );

      const output = lastFrame();

      // collapsedByDefault: true means result should not be shown
      expect(output).not.toContain('Some file content');
      expect(output).not.toContain('Line 2');
    });

    it('should respect renderStatus: null in all states', () => {
      const states: ComputedToolState[] = ['running', 'success', 'error', 'denied', 'edited', 'aborted', 'timeout'];

      states.forEach((state) => {
        const toolResult = createMockToolResult('file_read', 'Content');
        const resultMessage = createMockToolResultMessage(toolResult, 100);

        const { lastFrame } = render(
          <ToolCallViewer
            toolCall={toolCall}
            toolResult={state === 'running' ? undefined : resultMessage}
            toolState={state}
            messageId="msg-1"
          />,
        );

        const output = lastFrame();

        // Should have header
        expect(output).toContain('⚙ Read');

        // Should NOT have any status line (└─)
        expect(output).not.toContain('└─');
      });
    });
  });
});
