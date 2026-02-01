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

describe('ask_user_tool - Snapshot Tests', () => {
  it('renders successful ask_user interaction with detailed answer', () => {
    const toolCall = createMockToolCall('ask_user_tool', {
      questions: [
        {
          question: 'What authentication strategy should we use for the new API?',
          header: 'Auth Strategy',
          multiSelect: false,
        },
      ],
    });
    const toolResult = createMockToolResult(
      'ask_user_tool',
      '',
      {
        answers: {
          q0: 'We should use JWT tokens with refresh token rotation. This provides good security while maintaining a stateless architecture.',
        },
      }
    );
    const resultMessage = createMockToolResultMessage(toolResult, 12345);

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

  it('renders successful ask_user interaction with short answer', () => {
    const toolCall = createMockToolCall('ask_user_tool', {
      questions: [
        {
          question: 'Should we proceed with the deployment?',
          header: 'Deployment',
          multiSelect: false,
        },
      ],
    });
    const toolResult = createMockToolResult(
      'ask_user_tool',
      '',
      {
        answers: {
          q0: 'Yes',
        },
      }
    );
    const resultMessage = createMockToolResultMessage(toolResult, 5678);

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

  it('renders successful ask_user interaction with multi-line answer', () => {
    const toolCall = createMockToolCall('ask_user_tool', {
      questions: [
        {
          question: 'Can you provide the requirements for the new feature?',
          header: 'Requirements',
          multiSelect: false,
        },
      ],
    });
    const toolResult = createMockToolResult(
      'ask_user_tool',
      '',
      {
        answers: {
          q0: `Here are the requirements:

1. Users should be able to create projects
2. Each project can have multiple tasks
3. Tasks can be assigned to team members
4. All changes should be tracked in an audit log
5. Email notifications for important events`,
        },
      }
    );
    const resultMessage = createMockToolResultMessage(toolResult, 8901);

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

  it('renders successful ask_user interaction with technical details', () => {
    const toolCall = createMockToolCall('ask_user_tool', {
      questions: [
        {
          question: 'What is the database connection string for production?',
          header: 'DB Connection',
          multiSelect: false,
        },
      ],
    });
    const toolResult = createMockToolResult(
      'ask_user_tool',
      '',
      {
        answers: {
          q0: 'postgresql://user:password@db.example.com:5432/production_db?sslmode=require',
        },
      }
    );
    const resultMessage = createMockToolResultMessage(toolResult, 3456);

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
