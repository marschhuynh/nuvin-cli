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

describe('todo_write - Snapshot Tests', () => {
  it('renders successful todo list update with progress', () => {
    const todos = [
      {
        id: '1',
        content: 'Implement feature X',
        status: 'completed' as const,
        priority: 'high' as const,
        createdAt: '2024-01-31T10:00:00Z',
      },
      {
        id: '2',
        content: 'Write tests for feature X',
        status: 'in_progress' as const,
        priority: 'high' as const,
        createdAt: '2024-01-31T10:05:00Z',
      },
      {
        id: '3',
        content: 'Update documentation',
        status: 'pending' as const,
        priority: 'medium' as const,
        createdAt: '2024-01-31T10:10:00Z',
      },
    ];

    const toolCall = createMockToolCall('todo_write', {
      todos,
    });
    const toolResult = createMockToolResult('todo_write', 'Todo list updated successfully', {
      items: todos,
      stats: {
        completed: 1,
        total: 3,
      },
      progress: '33%',
    });
    const resultMessage = createMockToolResultMessage(toolResult, 156);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders todo list with all completed tasks', () => {
    const todos = [
      {
        id: '1',
        content: 'Task 1',
        status: 'completed' as const,
        priority: 'high' as const,
        createdAt: '2024-01-31T10:00:00Z',
      },
      {
        id: '2',
        content: 'Task 2',
        status: 'completed' as const,
        priority: 'medium' as const,
        createdAt: '2024-01-31T10:05:00Z',
      },
    ];

    const toolCall = createMockToolCall('todo_write', {
      todos,
    });
    const toolResult = createMockToolResult('todo_write', 'Todo list updated successfully', {
      items: todos,
      stats: {
        completed: 2,
        total: 2,
      },
      progress: '100%',
    });
    const resultMessage = createMockToolResultMessage(toolResult, 89);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders empty todo list', () => {
    const toolCall = createMockToolCall('todo_write', {
      todos: [],
    });
    const toolResult = createMockToolResult('todo_write', 'Todo list updated successfully', {
      items: [],
      stats: {
        completed: 0,
        total: 0,
      },
      progress: '0%',
    });
    const resultMessage = createMockToolResultMessage(toolResult, 45);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders todo list without metadata', () => {
    const todos = [
      {
        id: '1',
        content: 'Simple task',
        status: 'pending' as const,
        priority: 'low' as const,
        createdAt: '2024-01-31T10:00:00Z',
      },
    ];

    const toolCall = createMockToolCall('todo_write', {
      todos,
    });
    const toolResult = createMockToolResult('todo_write', 'Todo list updated successfully', {
      items: todos,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 67);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });
});
