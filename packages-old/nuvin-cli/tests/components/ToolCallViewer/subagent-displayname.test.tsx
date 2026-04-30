import { vi, describe, it, expect } from 'vitest';

// Mock all contexts and hooks
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

import { render } from 'ink-testing-library';
import { SubAgentActivity } from '@/components/ToolCallViewer/ToolResultView/SubAgentActivity.js';
import type { ToolCall, SubAgentState } from '@nuvin/nuvin-core';

describe('SubAgentActivity - Tool Display Names', () => {
  it('should display "Read" for successful file_read tool', () => {
    const toolCall: ToolCall = {
      id: 'test-1',
      type: 'function',
      function: {
        name: 'assign_task',
        arguments: JSON.stringify({
          agent: 'code-reviewer',
          description: 'Review React components',
          task: 'Review the code',
        }),
      },
    };

    const subAgentState: SubAgentState = {
      status: 'active',
      toolCalls: [
        {
          id: 'tool-1',
          name: 'file_read',
          arguments: JSON.stringify({ path: '/src/App.tsx' }),
          status: 'success',
        },
      ],
      totalDurationMs: 1000,
    };

    const { lastFrame } = render(
      <SubAgentActivity toolCall={toolCall} subAgentState={subAgentState} messageId="msg-1" />,
    );

    const output = lastFrame();

    // Should display "Read" (not "file_read" or "Reading")
    expect(output).toContain('Read');
    expect(output).toContain('/src/App.tsx');
    expect(output).not.toContain('file_read');
  });

  it('should display "Reading" for running file_read tool', () => {
    const toolCall: ToolCall = {
      id: 'test-1',
      type: 'function',
      function: {
        name: 'assign_task',
        arguments: JSON.stringify({
          agent: 'code-reviewer',
          description: 'Review React components',
        }),
      },
    };

    const subAgentState: SubAgentState = {
      status: 'active',
      toolCalls: [
        {
          id: 'tool-1',
          name: 'file_read',
          arguments: JSON.stringify({ path: '/src/App.tsx' }),
          status: 'running',
        },
      ],
      totalDurationMs: 500,
    };

    const { lastFrame } = render(
      <SubAgentActivity toolCall={toolCall} subAgentState={subAgentState} messageId="msg-1" />,
    );

    const output = lastFrame();

    // Should display "Reading" for running state
    expect(output).toContain('Reading');
    expect(output).toContain('/src/App.tsx');
  });

  it('should display "Read failed" for error file_read tool', () => {
    const toolCall: ToolCall = {
      id: 'test-1',
      type: 'function',
      function: {
        name: 'assign_task',
        arguments: JSON.stringify({
          agent: 'code-reviewer',
          description: 'Review React components',
        }),
      },
    };

    const subAgentState: SubAgentState = {
      status: 'active',
      toolCalls: [
        {
          id: 'tool-1',
          name: 'file_read',
          arguments: JSON.stringify({ path: '/nonexistent.ts' }),
          status: 'error',
        },
      ],
      totalDurationMs: 200,
    };

    const { lastFrame } = render(
      <SubAgentActivity toolCall={toolCall} subAgentState={subAgentState} messageId="msg-1" />,
    );

    const output = lastFrame();

    // Should display "Read failed" for error state
    expect(output).toContain('Read failed');
    expect(output).toContain('/nonexistent.ts');
  });

  it('should display "Run" for bash_tool', () => {
    const toolCall: ToolCall = {
      id: 'test-1',
      type: 'function',
      function: {
        name: 'assign_task',
        arguments: JSON.stringify({
          agent: 'software-engineer',
          description: 'Run tests',
        }),
      },
    };

    const subAgentState: SubAgentState = {
      status: 'active',
      toolCalls: [
        {
          id: 'tool-1',
          name: 'bash_tool',
          arguments: JSON.stringify({ cmd: 'npm test' }),
          status: 'success',
        },
      ],
      totalDurationMs: 3000,
    };

    const { lastFrame } = render(
      <SubAgentActivity toolCall={toolCall} subAgentState={subAgentState} messageId="msg-1" />,
    );

    const output = lastFrame();

    // Should display "Run" (not "bash_tool")
    expect(output).toContain('Run');
    expect(output).toContain('npm test');
    expect(output).not.toContain('bash_tool');
  });

  it('should display "Edit" for file_edit tool', () => {
    const toolCall: ToolCall = {
      id: 'test-1',
      type: 'function',
      function: {
        name: 'assign_task',
        arguments: JSON.stringify({
          agent: 'software-engineer',
          description: 'Fix bug',
        }),
      },
    };

    const subAgentState: SubAgentState = {
      status: 'active',
      toolCalls: [
        {
          id: 'tool-1',
          name: 'file_edit',
          arguments: JSON.stringify({ file_path: '/src/bug.ts', old_text: 'bug', new_text: 'fix' }),
          status: 'success',
        },
      ],
      totalDurationMs: 500,
    };

    const { lastFrame } = render(
      <SubAgentActivity toolCall={toolCall} subAgentState={subAgentState} messageId="msg-1" />,
    );

    const output = lastFrame();

    // Should display "Edit" (not "file_edit")
    expect(output).toContain('Edit');
    expect(output).toContain('/src/bug.ts');
    expect(output).not.toContain('file_edit');
  });

  it('should display "Search" for grep_tool', () => {
    const toolCall: ToolCall = {
      id: 'test-1',
      type: 'function',
      function: {
        name: 'assign_task',
        arguments: JSON.stringify({
          agent: 'code-reviewer',
          description: 'Find TODOs',
        }),
      },
    };

    const subAgentState: SubAgentState = {
      status: 'active',
      toolCalls: [
        {
          id: 'tool-1',
          name: 'grep_tool',
          arguments: JSON.stringify({ pattern: 'TODO', path: '/src' }),
          status: 'success',
        },
      ],
      totalDurationMs: 800,
    };

    const { lastFrame } = render(
      <SubAgentActivity toolCall={toolCall} subAgentState={subAgentState} messageId="msg-1" />,
    );

    const output = lastFrame();

    // Should display "Search" (not "grep_tool")
    expect(output).toContain('Search');
    expect(output).toContain('TODO');
    expect(output).not.toContain('grep_tool');
  });

  it('should display multiple tool calls with correct names', () => {
    const toolCall: ToolCall = {
      id: 'test-1',
      type: 'function',
      function: {
        name: 'assign_task',
        arguments: JSON.stringify({
          agent: 'code-reviewer',
          description: 'Comprehensive review',
        }),
      },
    };

    const subAgentState: SubAgentState = {
      status: 'active',
      toolCalls: [
        {
          id: 'tool-1',
          name: 'file_read',
          arguments: JSON.stringify({ path: '/src/App.tsx' }),
          status: 'success',
        },
        {
          id: 'tool-2',
          name: 'grep_tool',
          arguments: JSON.stringify({ pattern: 'TODO' }),
          status: 'running',
        },
        {
          id: 'tool-3',
          name: 'bash_tool',
          arguments: JSON.stringify({ cmd: 'npm test' }),
          status: 'error',
        },
      ],
      totalDurationMs: 2000,
    };

    const { lastFrame } = render(
      <SubAgentActivity toolCall={toolCall} subAgentState={subAgentState} messageId="msg-1" />,
    );

    const output = lastFrame();

    // Should display all three tools with correct names
    expect(output).toContain('Read'); // file_read success
    expect(output).toContain('Search'); // grep_tool running
    expect(output).toContain('Run'); // bash_tool error

    // Should not contain raw tool names
    expect(output).not.toContain('file_read');
    expect(output).not.toContain('grep_tool');
    expect(output).not.toContain('bash_tool');
  });
});
