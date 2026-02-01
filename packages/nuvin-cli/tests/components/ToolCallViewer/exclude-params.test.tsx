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

describe('Tool excludeParams', () => {
  it('should exclude cmd and cwd from bash_tool params display', () => {
    const toolCall = createMockToolCall('bash_tool', {
      cmd: 'echo hello',
      cwd: '/home/user',
      timeoutMs: 5000,
    });
    const result = 'hello';
    const toolResult = createMockToolResult('bash_tool', result);
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />
    );

    const output = lastFrame();

    // Should show cmd in header
    expect(output).toContain('echo hello');

    // Should NOT show cmd and cwd in params section
    expect(output).not.toMatch(/│\s+cmd:/);
    expect(output).not.toMatch(/│\s+cwd:/);

    // Should show timeoutMs since it's not excluded
    expect(output).toContain('timeoutMs: 5000');
  });

  it('should exclude path from file_read params display', () => {
    const toolCall = createMockToolCall('file_read', {
      path: '/etc/hosts',
      lineStart: 1,
      lineEnd: 10,
    });
    const result = '127.0.0.1 localhost';
    const toolResult = createMockToolResult('file_read', result);
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />
    );

    const output = lastFrame();

    // Should show path in header
    expect(output).toContain('/etc/hosts');

    // Should NOT show path, lineStart, lineEnd in params section (they're excluded)
    expect(output).not.toMatch(/│\s+path:/);
    expect(output).not.toMatch(/│\s+lineStart:/);
    expect(output).not.toMatch(/│\s+lineEnd:/);
  });

  it('should exclude pattern and path from grep_tool params display', () => {
    const toolCall = createMockToolCall('grep_tool', {
      pattern: 'TODO',
      path: '/src',
      include: '*.ts',
      limit: 100,
    });
    const result = { matches: [] };
    const toolResult = createMockToolResult('grep_tool', JSON.stringify(result), {
      matchCount: 0,
      fileCount: 0,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />
    );

    const output = lastFrame();

    // Should show pattern in header
    expect(output).toContain('TODO');

    // Should NOT show pattern, path, include in params (already handled by header/custom renderer)
    expect(output).not.toMatch(/│\s+pattern:/);
    expect(output).not.toMatch(/│\s+path:/);
    expect(output).not.toMatch(/│\s+include:/);

    // Limit is also excluded (shown in header)
    expect(output).not.toMatch(/│\s+limit:/);
  });

  it('should exclude file_path, old_text, new_text from file_edit params', () => {
    const toolCall = createMockToolCall('file_edit', {
      file_path: '/src/app.ts',
      old_text: 'const x = 1;',
      new_text: 'const x = 2;',
      dry_run: false,
    });
    const result = 'File edited successfully';
    const toolResult = createMockToolResult('file_edit', result, { bytesWritten: 100 });
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />
    );

    const output = lastFrame();

    // Should show file_path in header
    expect(output).toContain('/src/app.ts');

    // file_edit has custom params renderer that shows diff, not standard key-value params
    // So we verify the diff is shown instead
    expect(output).toContain('const x = 1');
    expect(output).toContain('const x = 2');

    // Should NOT show raw parameter names in default params format
    expect(output).not.toMatch(/file_path:/);
    expect(output).not.toMatch(/old_text:/);
    expect(output).not.toMatch(/new_text:/);
    expect(output).not.toMatch(/dry_run:/);
  });

  it('should exclude query from web_search params display', () => {
    const toolCall = createMockToolCall('web_search', {
      query: 'typescript best practices',
      count: 10,
      lang: 'en',
    });
    const result = { count: 5, results: [] };
    const toolResult = createMockToolResult('web_search', JSON.stringify(result));
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />
    );

    const output = lastFrame();

    // Should show query in header
    expect(output).toContain('typescript best practices');

    // Should NOT show query in params (shown in header)
    expect(output).not.toMatch(/│\s+query:/);

    // Should show count and lang
    expect(output).toContain('count: 10');
    expect(output).toContain('lang: en');
  });

  it('should handle tools with no excludeParams configuration', () => {
    // Using a tool that doesn't exist in registry, will use default config
    const toolCall = createMockToolCall('custom_tool', {
      param1: 'value1',
      param2: 'value2',
    });
    const result = 'Custom tool result';
    const toolResult = createMockToolResult('custom_tool', result);
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />
    );

    const output = lastFrame();

    // Should show all params since no excludeParams configured
    expect(output).toContain('param1: value1');
    expect(output).toContain('param2: value2');
  });
});
