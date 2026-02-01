import { vi } from 'vitest';

// Mock all contexts and hooks used by ToolCallViewer
vi.mock('@/hooks/useStdoutDimensions.ts', () => ({
  useStdoutDimensions: vi.fn().mockReturnValue({ cols: 100, rows: 30 }),
}));

vi.mock('@/contexts/ThemeContext.js', () => ({
  useTheme: vi.fn().mockReturnValue({
    theme: {
      messageTypes: { tool: 'blue' },
      status: { success: 'green', error: 'red', idle: 'yellow', warning: 'yellow' },
      colors: { warning: 'yellow', muted: 'gray', textDim: 'gray' },
      tokens: { gray: 'gray', red: 'red' },
    },
  }),
}));

vi.mock('@/contexts/ToolApprovalContext.js', () => ({
  useToolApproval: vi.fn().mockReturnValue({ pendingApprovalTools: [] }),
}));

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { ToolCallViewer } from '@/components/ToolCallViewer/index.js';
import { createMockToolCall, createMockToolResult, createMockToolResultMessage } from '../../../helpers/toolMocks.js';

describe('assign_task - Snapshot Tests', () => {
  it('renders successful task delegation with metrics', () => {
    const result = 'Task completed successfully. Implemented the feature as requested.';

    const toolCall = createMockToolCall('assign_task', {
      instructions: 'Implement a new user authentication feature with JWT tokens',
      context: 'Working on the backend API',
    });
    const toolResult = createMockToolResult('assign_task', result, {
      executionTimeMs: 45678,
      toolCallsExecuted: 12,
      tokensUsed: 8543,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 45678);

    const { lastFrame } = render(
      <ToolCallViewer
        toolCall={toolCall}
        toolResult={resultMessage}
        toolState="success"
        messageId="msg-1"
      />
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders task delegation with minimal metrics', () => {
    const result = 'Simple task completed.';

    const toolCall = createMockToolCall('assign_task', {
      instructions: 'Fix typo in README',
    });
    const toolResult = createMockToolResult('assign_task', result, {
      executionTimeMs: 1234,
      toolCallsExecuted: 2,
      tokensUsed: 256,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 1234);

    const { lastFrame } = render(
      <ToolCallViewer
        toolCall={toolCall}
        toolResult={resultMessage}
        toolState="success"
        messageId="msg-1"
      />
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders task delegation without metrics', () => {
    const result = 'Task completed.';

    const toolCall = createMockToolCall('assign_task', {
      instructions: 'Run the tests',
    });
    const toolResult = createMockToolResult('assign_task', result);
    const resultMessage = createMockToolResultMessage(toolResult, 5000);

    const { lastFrame } = render(
      <ToolCallViewer
        toolCall={toolCall}
        toolResult={resultMessage}
        toolState="success"
        messageId="msg-1"
      />
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders task delegation with long instructions', () => {
    const result = 'Complex task completed with multiple steps executed successfully.';

    const toolCall = createMockToolCall('assign_task', {
      instructions: 'Refactor the authentication module to use a new provider pattern. Update all existing tests to work with the new structure. Add integration tests for the new flow. Update documentation to reflect the changes.',
      context: 'Part of the Q1 2024 architecture refactor initiative',
    });
    const toolResult = createMockToolResult('assign_task', result, {
      executionTimeMs: 123456,
      toolCallsExecuted: 45,
      tokensUsed: 25678,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 123456);

    const { lastFrame } = render(
      <ToolCallViewer
        toolCall={toolCall}
        toolResult={resultMessage}
        toolState="success"
        messageId="msg-1"
      />
    );

    expect(lastFrame()).toMatchSnapshot();
  });
});
