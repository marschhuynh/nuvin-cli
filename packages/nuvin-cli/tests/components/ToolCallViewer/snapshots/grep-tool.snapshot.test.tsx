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

describe('grep_tool - Snapshot Tests', () => {
  it('renders successful grep search with matches', () => {
    const matches = `src/components/App.tsx:15:  const [count, setCount] = useState(0);
src/components/Button.tsx:8:  const [isActive, setIsActive] = useState(false);
src/hooks/useData.ts:23:  const [data, setData] = useState(null);
src/utils/state.ts:12:  const [value, setValue] = useState(initial);`;

    const toolCall = createMockToolCall('grep_tool', {
      pattern: 'useState',
      path: '/Users/user/project',
      include: '*.{ts,tsx}',
    });
    const toolResult = createMockToolResult('grep_tool', matches, {
      matchCount: 4,
      fileCount: 4,
      truncated: false,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 345);

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

  it('renders grep search with no matches', () => {
    const toolCall = createMockToolCall('grep_tool', {
      pattern: 'nonexistent_pattern_xyz123',
      path: '/Users/user/project',
    });
    const toolResult = createMockToolResult('grep_tool', '', {
      matchCount: 0,
      fileCount: 0,
      truncated: false,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 123);

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

  it('renders grep search with many matches (truncated)', () => {
    const matches = Array(100).fill(0).map((_, i) => 
      `src/file${i + 1}.ts:${i + 1}:  const value = "test";`
    ).join('\n');

    const toolCall = createMockToolCall('grep_tool', {
      pattern: 'const value',
      path: '/Users/user/large-project',
      limit: 100,
    });
    const toolResult = createMockToolResult('grep_tool', matches, {
      matchCount: 100,
      fileCount: 100,
      truncated: true,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 678);

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

  it('renders grep search with multiple matches in same file', () => {
    const matches = `src/api/client.ts:12:  // TODO: Add error handling
src/api/client.ts:45:  // TODO: Implement retry logic
src/api/client.ts:89:  // TODO: Add caching
src/utils/helpers.ts:23:  // TODO: Optimize performance
src/utils/helpers.ts:67:  // TODO: Add tests`;

    const toolCall = createMockToolCall('grep_tool', {
      pattern: 'TODO',
      path: '/Users/user/project/src',
    });
    const toolResult = createMockToolResult('grep_tool', matches, {
      matchCount: 5,
      fileCount: 2,
      truncated: false,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 234);

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
