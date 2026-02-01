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

describe('glob_tool - Snapshot Tests', () => {
  it('renders successful glob search with files found', () => {
    const files = `src/components/App.tsx
src/components/Button.tsx
src/components/Input.tsx
src/utils/helpers.ts
src/utils/validators.ts`;

    const toolCall = createMockToolCall('glob_tool', {
      pattern: '**/*.ts{,x}',
      path: '/Users/user/project',
    });
    const toolResult = createMockToolResult('glob_tool', files, {
      count: 5,
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

  it('renders glob search with no files found', () => {
    const toolCall = createMockToolCall('glob_tool', {
      pattern: '**/*.xyz',
      path: '/Users/user/project',
    });
    const toolResult = createMockToolResult('glob_tool', '', {
      count: 0,
      truncated: false,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 89);

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

  it('renders glob search with truncated results', () => {
    const files = Array(100).fill(0).map((_, i) => `src/file${i + 1}.ts`).join('\n');

    const toolCall = createMockToolCall('glob_tool', {
      pattern: '**/*.ts',
      path: '/Users/user/large-project',
    });
    const toolResult = createMockToolResult('glob_tool', files, {
      count: 100,
      truncated: true,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 456);

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

  it('renders glob search with nested paths', () => {
    const files = `src/components/ui/Button/Button.tsx
src/components/ui/Button/Button.test.tsx
src/components/ui/Input/Input.tsx
src/components/ui/Input/Input.test.tsx
src/components/layout/Header/Header.tsx
src/components/layout/Footer/Footer.tsx`;

    const toolCall = createMockToolCall('glob_tool', {
      pattern: 'src/components/**/*.tsx',
    });
    const toolResult = createMockToolResult('glob_tool', files, {
      count: 6,
      truncated: false,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 178);

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
