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

describe('web_search - Snapshot Tests', () => {
  it('renders successful web search with results', () => {
    const searchResults = {
      count: 3,
      results: [
        {
          title: 'React Documentation',
          url: 'https://react.dev',
          snippet: 'The library for web and native user interfaces',
        },
        {
          title: 'React Tutorial',
          url: 'https://react.dev/learn',
          snippet: 'Learn React step by step with interactive examples',
        },
        {
          title: 'React Hooks',
          url: 'https://react.dev/reference/react',
          snippet: 'Built-in React Hooks for state and effects',
        },
      ],
    };

    const toolCall = createMockToolCall('web_search', {
      query: 'React documentation',
      count: 3,
    });
    const toolResult = createMockToolResult('web_search', searchResults);
    const resultMessage = createMockToolResultMessage(toolResult, 567);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders web search with no results', () => {
    const searchResults = {
      count: 0,
      results: [],
    };

    const toolCall = createMockToolCall('web_search', {
      query: 'asdfjkl123xyz999',
    });
    const toolResult = createMockToolResult('web_search', searchResults);
    const resultMessage = createMockToolResultMessage(toolResult, 234);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders web search with many results', () => {
    const searchResults = {
      count: 10,
      results: Array(10)
        .fill(0)
        .map((_, i) => ({
          title: `Result ${i + 1}: TypeScript Best Practices`,
          url: `https://example.com/result-${i + 1}`,
          snippet: `This is a detailed snippet for result ${i + 1} about TypeScript best practices and patterns.`,
        })),
    };

    const toolCall = createMockToolCall('web_search', {
      query: 'TypeScript best practices',
      count: 10,
    });
    const toolResult = createMockToolResult('web_search', searchResults);
    const resultMessage = createMockToolResultMessage(toolResult, 892);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders web search with special characters in query', () => {
    const searchResults = {
      count: 2,
      results: [
        {
          title: 'C++ Programming Guide',
          url: 'https://example.com/cpp',
          snippet: 'Learn C++ with examples: pointers, references & templates',
        },
        {
          title: 'C++ Best Practices',
          url: 'https://example.com/cpp-best',
          snippet: 'Modern C++ (C++17/C++20) best practices',
        },
      ],
    };

    const toolCall = createMockToolCall('web_search', {
      query: 'C++ programming "best practices"',
    });
    const toolResult = createMockToolResult('web_search', searchResults);
    const resultMessage = createMockToolResultMessage(toolResult, 456);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });
});
