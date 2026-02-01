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

describe('web_fetch - Snapshot Tests', () => {
  it('renders successful web fetch with markdown content', () => {
    const markdown = `# Documentation\n\nThis is a documentation page.\n\n## Features\n\n- Feature 1\n- Feature 2\n- Feature 3\n\n## Usage\n\n\`\`\`javascript\nconst example = "code";\n\`\`\``;

    const toolCall = createMockToolCall('web_fetch', {
      url: 'https://example.com/docs',
    });
    const toolResult = createMockToolResult('web_fetch', markdown, {
      size: 156,
      statusCode: 200,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 789);

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

  it('renders web fetch with large content', () => {
    const largeMarkdown = Array(50).fill(0).map((_, i) => `## Section ${i + 1}\n\nContent for section ${i + 1}.`).join('\n\n');

    const toolCall = createMockToolCall('web_fetch', {
      url: 'https://example.com/large-page',
    });
    const toolResult = createMockToolResult('web_fetch', largeMarkdown, {
      size: 2456,
      statusCode: 200,
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

  it('renders web fetch with minimal content', () => {
    const toolCall = createMockToolCall('web_fetch', {
      url: 'https://example.com/empty',
    });
    const toolResult = createMockToolResult('web_fetch', '', {
      size: 0,
      statusCode: 200,
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

  it('renders web fetch without metadata', () => {
    const markdown = '# Simple Page\n\nJust some content.';

    const toolCall = createMockToolCall('web_fetch', {
      url: 'https://example.com/simple',
    });
    const toolResult = createMockToolResult('web_fetch', markdown);
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
});
