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

describe('ChatDisplay - 10x file_read in one message altMode (results arrive one-by-one)', () => {
  const userMessage: MessageLineType = {
    id: 'msg-user',
    type: 'user',
    content: 'Read all source files',
  };

  const files = [
    'src/config.ts', 'src/database.ts', 'src/routes.ts', 'src/middleware.ts', 'src/utils.ts',
    'src/types.ts', 'src/api.ts', 'src/auth.ts', 'src/logger.ts', 'src/index.ts',
  ];

  const toolMessage: MessageLineType = {
    id: 'msg-tool',
    type: 'tool',
    content: 'file_read',
    metadata: {
      toolCalls: files.map((path, i) => ({
        id: `call-${i + 1}`,
        type: 'function' as const,
        function: { name: 'file_read', arguments: JSON.stringify({ path }) },
      })),
    },
  };

  const makeResult = (i: number): MessageLineType => ({
    id: `msg-tool-result-${i + 1}`,
    type: 'tool_result',
    content: '',
    metadata: {
      toolResult: {
        id: `call-${i + 1}`,
        name: 'file_read',
        status: 'success',
        type: 'text',
        result: `// content of ${files[i]}`,
      },
      duration: 10,
    },
  });

  const allResults = files.map((_, i) => makeResult(i));

  it('snapshot: user → all running → results arrive one-by-one → all done', () => {
    // 1. User message only
    const { lastFrame, rerender } = render(
      <ChatDisplay key="test" messages={[userMessage]} headerKey={1} />,
    );
    expect(lastFrame()).toMatchSnapshot();

    // 2. Tool message arrives (all 10 running)
    rerender(<ChatDisplay key="test" messages={[userMessage, toolMessage]} headerKey={1} />);
    expect(lastFrame()).toMatchSnapshot();

    // 3–11. Results arrive one at a time
    for (let i = 1; i <= 10; i++) {
      rerender(<ChatDisplay key="test" messages={[userMessage, toolMessage, ...allResults.slice(0, i)]} headerKey={1} />);
      expect(lastFrame()).toMatchSnapshot();
    }
  });
});
