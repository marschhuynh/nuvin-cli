import { vi } from 'vitest';

// Mock contexts and hooks used by ChatDisplay → MessageLine → ToolCallViewer
vi.mock('@/hooks/useStdoutDimensions.ts', () => ({
  useStdoutDimensions: vi.fn().mockReturnValue({ cols: 100, rows: 30 }),
}));

vi.mock('@/contexts/ThemeContext.js', () => ({
  useTheme: vi.fn().mockReturnValue({
    theme: {
      messageTypes: { tool: 'blue', assistant: 'yellow', user: 'cyan', tool_result: 'green', system: 'gray', warning: 'yellow', error: 'red', info: 'cyan', thinking: 'gray' },
      status: { success: 'green', error: 'red', idle: 'yellow', warning: 'yellow' },
      colors: { warning: 'yellow', muted: 'gray', textDim: 'gray', text: 'white', accent: 'orange' },
      tokens: { gray: 'gray', red: 'red', green: 'green', cyan: 'cyan', yellow: 'yellow', blue: 'blue', dim: 'gray' },
    },
  }),
}));

vi.mock('@/contexts/AltModeContext', () => ({
  useAltMode: vi.fn().mockReturnValue({ altMode: true }),
}));

vi.mock('@/contexts/ToolApprovalContext.js', () => ({
  useToolApproval: vi.fn().mockReturnValue({ pendingApprovalTools: [] }),
}));

vi.mock('@/contexts/InputContext/index.js', () => ({
  useFocus: vi.fn().mockReturnValue({ id: 'mock', isFocused: false, focus: vi.fn(), clearFocus: vi.fn() }),
  useInput: vi.fn(),
  useMouse: vi.fn(),
}));

vi.mock('../../source/components/RecentSessions.js', () => ({
  WelcomeLogo: () => null,
}));

vi.mock('../../source/utils/file-logger.js', () => ({
  getDefaultLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { ChatDisplay } from '../../source/components/ChatDisplay.js';
import type { MessageLine as MessageLineType } from '../../source/adapters/index.js';

describe('ChatDisplay - assign_task tool call snapshot altMode (running → done)', () => {
  const userMessage: MessageLineType = {
    id: 'msg-user',
    type: 'user',
    content: 'Delegate the auth module work',
  };

  const toolMessage: MessageLineType = {
    id: 'msg-tool',
    type: 'tool',
    content: 'assign_task',
    metadata: {
      toolCalls: [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'assign_task',
            arguments: JSON.stringify({
              agent: 'software-engineer',
              task: 'Implement the auth module',
              description: 'Build auth module',
            }),
          },
        },
      ],
    },
  };

  const toolResultMessage: MessageLineType = {
    id: 'msg-tool-result',
    type: 'tool_result',
    content: '',
    metadata: {
      toolResult: {
        id: 'call-1',
        name: 'assign_task',
        status: 'success',
        type: 'text',
        result: 'Task completed successfully.',
        metadata: {
          executionTimeMs: 15000,
          toolCallsExecuted: 5,
          tokensUsed: 2500,
        },
      },
      duration: 15000,
    },
  };

  it('snapshot: running state (no result yet)', () => {
    const messages = [userMessage, toolMessage];

    const { lastFrame } = render(
      <ChatDisplay key="test" messages={messages} headerKey={1} />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('snapshot: done state (result appended)', () => {
    const messages = [userMessage, toolMessage];

    const { lastFrame, rerender } = render(
      <ChatDisplay key="test" messages={messages} headerKey={1} />,
    );

    // Append tool result → transitions from running to done
    rerender(
      <ChatDisplay key="test" messages={[...messages, toolResultMessage]} headerKey={1} />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });
});
