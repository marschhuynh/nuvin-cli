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

describe('file_read - Snapshot Tests', () => {
  it('renders successful file read with TypeScript content', () => {
    const content = `import React from 'react';\nimport { Box, Text } from 'ink';\n\nexport const MyComponent = () => {\n  return <Box><Text>Hello World</Text></Box>;\n};`;

    const toolCall = createMockToolCall('file_read', {
      path: 'src/components/MyComponent.tsx',
      lineStart: 1,
      lineEnd: 6
    });
    const toolResult = createMockToolResult('file_read', content);
    const resultMessage = createMockToolResultMessage(toolResult, 45);

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

  it('renders file read with empty file', () => {
    const toolCall = createMockToolCall('file_read', { path: 'empty.txt' });
    const toolResult = createMockToolResult('file_read', '');
    const resultMessage = createMockToolResultMessage(toolResult, 12);

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

  it('renders file read with long content (50+ lines)', () => {
    const longContent = Array(50).fill(0).map((_, i) => `Line ${i + 1}: This is a line of text in the file`).join('\n');

    const toolCall = createMockToolCall('file_read', { path: 'long-file.txt' });
    const toolResult = createMockToolResult('file_read', longContent);
    const resultMessage = createMockToolResultMessage(toolResult, 230);

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

  it('renders file read with special characters', () => {
    const content = '// Special chars: 你好 世界 🚀 ✨\n// Symbols: @#$%^&*()_+-={}[]|\\:";\'<>?,./';

    const toolCall = createMockToolCall('file_read', { path: 'special.txt' });
    const toolResult = createMockToolResult('file_read', content);
    const resultMessage = createMockToolResultMessage(toolResult, 18);

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
