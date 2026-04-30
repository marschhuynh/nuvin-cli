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
  useAltMode: vi.fn().mockReturnValue({ altMode: false }),
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

describe('ChatDisplay - 4x file_read in one message (running → partial → done)', () => {
  const userMessage: MessageLineType = {
    id: 'msg-user',
    type: 'user',
    content: 'Read all config files',
  };

  const toolMessage: MessageLineType = {
    id: 'msg-tool',
    type: 'tool',
    content: 'file_read',
    metadata: {
      toolCalls: [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'file_read',
            arguments: JSON.stringify({ path: 'src/config.ts' }),
          },
        },
        {
          id: 'call-2',
          type: 'function',
          function: {
            name: 'file_read',
            arguments: JSON.stringify({ path: 'src/database.ts' }),
          },
        },
        {
          id: 'call-3',
          type: 'function',
          function: {
            name: 'file_read',
            arguments: JSON.stringify({ path: 'src/routes.ts' }),
          },
        },
        {
          id: 'call-4',
          type: 'function',
          function: {
            name: 'file_read',
            arguments: JSON.stringify({ path: 'src/middleware.ts' }),
          },
        },
      ],
    },
  };

  const toolResult1: MessageLineType = {
    id: 'msg-tool-result-1',
    type: 'tool_result',
    content: '',
    metadata: {
      toolResult: {
        id: 'call-1',
        name: 'file_read',
        status: 'success',
        type: 'text',
        result: 'export const port = 3000;',
      },
      duration: 10,
    },
  };

  const toolResult2: MessageLineType = {
    id: 'msg-tool-result-2',
    type: 'tool_result',
    content: '',
    metadata: {
      toolResult: {
        id: 'call-2',
        name: 'file_read',
        status: 'success',
        type: 'text',
        result: 'export const dbUrl = "postgres://localhost/app";',
      },
      duration: 15,
    },
  };

  const toolResult3: MessageLineType = {
    id: 'msg-tool-result-3',
    type: 'tool_result',
    content: '',
    metadata: {
      toolResult: {
        id: 'call-3',
        name: 'file_read',
        status: 'success',
        type: 'text',
        result: 'export const routes = ["/api", "/health"];',
      },
      duration: 12,
    },
  };

  const toolResult4: MessageLineType = {
    id: 'msg-tool-result-4',
    type: 'tool_result',
    content: '',
    metadata: {
      toolResult: {
        id: 'call-4',
        name: 'file_read',
        status: 'success',
        type: 'text',
        result: 'export const cors = { origin: "*" };',
      },
      duration: 8,
    },
  };

  it('snapshot: all running (no results yet)', () => {
    const messages = [userMessage, toolMessage];

    const { lastFrame } = render(
      <ChatDisplay key="test" messages={messages} headerKey={1} />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('snapshot: partial (2 of 4 done)', () => {
    const messages = [userMessage, toolMessage];

    const { lastFrame, rerender } = render(
      <ChatDisplay key="test" messages={messages} headerKey={1} />,
    );

    rerender(
      <ChatDisplay key="test" messages={[...messages, toolResult1, toolResult2]} headerKey={1} />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('snapshot: all done (4 of 4 results)', () => {
    const messages = [userMessage, toolMessage];

    const { lastFrame, rerender } = render(
      <ChatDisplay key="test" messages={messages} headerKey={1} />,
    );

    rerender(
      <ChatDisplay key="test" messages={[...messages, toolResult1, toolResult2, toolResult3, toolResult4]} headerKey={1} />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });
});
