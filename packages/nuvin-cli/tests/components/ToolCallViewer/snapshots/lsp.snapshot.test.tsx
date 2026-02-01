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

describe('lsp - Snapshot Tests', () => {
  it('renders successful LSP goToDefinition operation', () => {
    const result = JSON.stringify({
      uri: 'file:///Users/user/project/src/utils/helpers.ts',
      range: {
        start: { line: 42, character: 8 },
        end: { line: 42, character: 23 },
      },
    });

    const toolCall = createMockToolCall('lsp', {
      operation: 'goToDefinition',
      filePath: 'src/components/App.tsx',
      line: 15,
      character: 10,
    });
    const toolResult = createMockToolResult('lsp', result);
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

  it('renders successful LSP hover operation', () => {
    const result = JSON.stringify({
      contents: {
        kind: 'markdown',
        value: '```typescript\nfunction useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>]\n```\n\nReturns a stateful value, and a function to update it.',
      },
    });

    const toolCall = createMockToolCall('lsp', {
      operation: 'hover',
      filePath: 'src/components/Button.tsx',
      line: 8,
      character: 15,
    });
    const toolResult = createMockToolResult('lsp', result);
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

  it('renders successful LSP findReferences operation', () => {
    const result = JSON.stringify([
      {
        uri: 'file:///Users/user/project/src/components/App.tsx',
        range: { start: { line: 15, character: 10 }, end: { line: 15, character: 23 } },
      },
      {
        uri: 'file:///Users/user/project/src/components/Button.tsx',
        range: { start: { line: 8, character: 5 }, end: { line: 8, character: 18 } },
      },
      {
        uri: 'file:///Users/user/project/src/hooks/useData.ts',
        range: { start: { line: 23, character: 12 }, end: { line: 23, character: 25 } },
      },
    ]);

    const toolCall = createMockToolCall('lsp', {
      operation: 'findReferences',
      filePath: 'src/utils/helpers.ts',
      line: 42,
      character: 15,
    });
    const toolResult = createMockToolResult('lsp', result);
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

  it('renders successful LSP diagnostics operation', () => {
    const result = JSON.stringify([
      {
        range: { start: { line: 10, character: 5 }, end: { line: 10, character: 15 } },
        severity: 1,
        message: "Property 'value' does not exist on type 'User'",
        source: 'typescript',
      },
      {
        range: { start: { line: 23, character: 8 }, end: { line: 23, character: 12 } },
        severity: 2,
        message: 'Unused variable',
        source: 'typescript',
      },
    ]);

    const toolCall = createMockToolCall('lsp', {
      operation: 'diagnostics',
      filePath: 'src/types/user.ts',
      line: 1,
      character: 1,
    });
    const toolResult = createMockToolResult('lsp', result);
    const resultMessage = createMockToolResultMessage(toolResult, 156);

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
