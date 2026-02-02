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
import { createMockToolResult, createMockToolResultMessage } from '../../helpers/toolMocks.js';

describe('SubAgentActivity - Error Status Display', () => {
  it('should show "Sub-agent execution aborted by user" in status line when aborted', () => {
    const toolCall: ToolCall = {
      id: 'test-1',
      type: 'function',
      function: {
        name: 'assign_task',
        arguments: JSON.stringify({
          agent: 'software-engineer',
          description: 'Architecture review',
          task: 'Review the architecture',
        }),
      },
    };

    const subAgentState: SubAgentState = {
      status: 'completed',
      finalStatus: 'error',
      toolCalls: [
        {
          id: 'tool-1',
          name: 'ls_tool',
          arguments: JSON.stringify({ path: '/src' }),
          status: 'success',
        },
      ],
      totalDurationMs: 5000,
    };

    const result = 'Sub-agent execution aborted by user';
    // Create error result, not success
    const toolResult = {
      id: 'test-1',
      name: 'assign_task',
      status: 'error' as const,
      type: 'text' as const,
      result,
      durationMs: 5000,
    };
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <SubAgentActivity
        toolCall={toolCall}
        subAgentState={subAgentState}
        toolResult={resultMessage}
        messageId="msg-1"
      />,
    );

    const output = lastFrame();

    // Should show the abort message in the status line
    expect(output).toContain('└─ Sub-agent execution aborted by user');

    // Should NOT show the abort message as a separate content line
    const lines = output.split('\n');
    const contentLines = lines.filter(
      (line) => !line.includes('└─') && line.trim().length > 0 && !line.includes('»') && !line.includes('│'),
    );
    const hasAbortMessageInContent = contentLines.some((line) => line.includes('Sub-agent execution aborted'));
    expect(hasAbortMessageInContent).toBe(false);
  });

  it('should show timeout message in status line when timed out', () => {
    const toolCall: ToolCall = {
      id: 'test-1',
      type: 'function',
      function: {
        name: 'assign_task',
        arguments: JSON.stringify({
          agent: 'code-reviewer',
          description: 'Review code',
        }),
      },
    };

    const subAgentState: SubAgentState = {
      status: 'completed',
      finalStatus: 'error',
      toolCalls: [],
      totalDurationMs: 50000,
    };

    const result = 'Task execution timeout after 50000ms';
    const toolResult = {
      id: 'test-1',
      name: 'assign_task',
      status: 'error' as const,
      type: 'text' as const,
      result,
      durationMs: 50000,
    };
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <SubAgentActivity
        toolCall={toolCall}
        subAgentState={subAgentState}
        toolResult={resultMessage}
        messageId="msg-1"
      />,
    );

    const output = lastFrame();

    // Should show the timeout message in the status line
    expect(output).toContain('└─ Task execution timeout');
  });

  it('should show result content for successful completion', () => {
    const toolCall: ToolCall = {
      id: 'test-1',
      type: 'function',
      function: {
        name: 'assign_task',
        arguments: JSON.stringify({
          agent: 'code-reviewer',
          description: 'Review code',
        }),
      },
    };

    const subAgentState: SubAgentState = {
      status: 'completed',
      finalStatus: 'success',
      toolCalls: [
        {
          id: 'tool-1',
          name: 'file_read',
          arguments: JSON.stringify({ path: '/src/app.ts' }),
          status: 'success',
        },
      ],
      totalDurationMs: 3000,
      metrics: {
        llmCallCount: 5,
        totalTokens: 1000,
        totalCost: 0.05,
      },
    };

    const result = 'Code review completed successfully. All files look good.';
    const toolResult = createMockToolResult('assign_task', result, {
      executionTimeMs: 3000,
      toolCallsExecuted: 1,
      tokensUsed: 1000,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <SubAgentActivity
        toolCall={toolCall}
        subAgentState={subAgentState}
        toolResult={resultMessage}
        messageId="msg-1"
      />,
    );

    const output = lastFrame();

    // Should show the actual result content
    expect(output).toContain('Code review completed successfully');

    // Should show metrics in status line
    expect(output).toContain('└─ Done • 5 calls');
  });

  it('should NOT show result content for error cases', () => {
    const toolCall: ToolCall = {
      id: 'test-1',
      type: 'function',
      function: {
        name: 'assign_task',
        arguments: JSON.stringify({
          agent: 'test-agent',
          description: 'Test task',
        }),
      },
    };

    const subAgentState: SubAgentState = {
      status: 'completed',
      finalStatus: 'error',
      toolCalls: [],
      totalDurationMs: 1000,
    };

    const result = 'Agent "test-agent" not found in registry';
    const toolResult = {
      id: 'test-1',
      name: 'assign_task',
      status: 'error' as const,
      type: 'text' as const,
      result,
      durationMs: 1000,
    };
    const resultMessage = createMockToolResultMessage(toolResult, 100);

    const { lastFrame } = render(
      <SubAgentActivity
        toolCall={toolCall}
        subAgentState={subAgentState}
        toolResult={resultMessage}
        messageId="msg-1"
      />,
    );

    const output = lastFrame();

    // Should show error in status line
    expect(output).toContain('└─ Agent "test-agent" not found');

    // Should NOT show a separate result content section
    const hasResultBorder = output.includes('│  Agent "test-agent"');
    expect(hasResultBorder).toBe(false);
  });
});
