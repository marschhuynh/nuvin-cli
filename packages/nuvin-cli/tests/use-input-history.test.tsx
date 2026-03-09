import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { useEffect } from 'react';
import type { MemoryPort, Message } from '@nuvin/nuvin-core';
import delay from 'delay';
import { useInputHistory } from '../source/hooks/useInputHistory.js';

// Mock dependencies
vi.mock('../source/hooks/useNotification.js', () => ({
  useNotification: () => ({ setNotification: vi.fn() }),
}));

vi.mock('../source/hooks/useSessionManagement.js', () => ({
  scanAvailableSessions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../source/config/manager.js', () => ({
  ConfigManager: {
    getInstance: () => ({
      getCurrentProfile: () => 'default',
    }),
  },
}));

vi.mock('../source/utils/file-logger.js', () => ({
  logger: {
    debug: vi.fn(),
  },
}));

interface UseInputHistoryProps {
  memory: MemoryPort<Message>;
  currentInput: string;
  onRecall: (message: string) => void;
}

interface UseInputHistoryResult {
  addMessage: (message: string) => void;
  handleUpArrow: (lineInfo: { lineIndex: number; lines: string[] }) => void;
  handleDownArrow: (lineInfo: { lineIndex: number; lines: string[] }) => void;
}

// Helper component to expose hook internals
function HookWrapper({
  hookProps,
  onRender,
}: {
  hookProps: UseInputHistoryProps;
  onRender: (result: UseInputHistoryResult) => void;
}) {
  const result = useInputHistory(hookProps);
  useEffect(() => {
    onRender(result);
  });
  return null;
}

describe('useInputHistory Hook', () => {
  let mockMemory: MemoryPort<Message>;
  let storedMessages: Message[];

  beforeEach(() => {
    storedMessages = [];

    mockMemory = {
      get: vi.fn().mockImplementation(async () => [...storedMessages]),
      set: vi.fn().mockImplementation(async (_key: string, messages: Message[]) => {
        storedMessages = messages;
      }),
      append: vi.fn().mockImplementation(async (_key: string, messages: Message[]) => {
        storedMessages.push(...messages);
      }),
      delete: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockResolvedValue(['cli']),
      clear: vi.fn().mockResolvedValue(undefined),
      exportSnapshot: vi.fn().mockResolvedValue({}),
      importSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    vi.clearAllMocks();
  });

  const getHookResult = (props: UseInputHistoryProps): UseInputHistoryResult => {
    let result: UseInputHistoryResult | undefined;
    render(
      <HookWrapper
        hookProps={props}
        onRender={(r) => {
          result = r;
        }}
      />,
    );
    return result as UseInputHistoryResult;
  };

  it('should NOT write user messages to memory (orchestrator handles persistence)', () => {
    const props = {
      memory: mockMemory,
      currentInput: '',
      onRecall: vi.fn(),
    };

    const { addMessage } = getHookResult(props);
    addMessage('test message');

    expect(mockMemory.set).not.toHaveBeenCalled();
    expect(mockMemory.append).not.toHaveBeenCalled();
  });

  describe('Local State Management', () => {
    it('should prevent duplicate consecutive messages in local state', async () => {
      let hookResult: UseInputHistoryResult;
      const props = {
        memory: mockMemory,
        currentInput: '',
        onRecall: vi.fn(),
      };

      render(
        <HookWrapper
          hookProps={props}
          onRender={(r) => {
            hookResult = r;
          }}
        />,
      );

      // Add same message 3 times
      hookResult.addMessage('same message');
      await delay(10);

      hookResult.addMessage('same message');
      await delay(10);

      hookResult.addMessage('same message');
      await delay(10);

      // Verify via navigation (since we can't inspect state directly easily without more exposure)
      // Navigating Up (prev) should recall the message once.
      // If it was added 3 times, we'd have 3 entries.
      // Current index starts at -1 (empty/new).
      // navigatePrev -> index 0 (last item).

      // We must mock onRecall to verify what is recalled
      const onRecall = props.onRecall;

      // Simulate Up Arrow
      // NOTE: handleUpArrow checks lineInfo. Usually expects { lineIndex: 0, lines: [...] }
      hookResult.handleUpArrow({ lineIndex: 0, lines: [''] });
      expect(onRecall).toHaveBeenCalledWith('same message');

      onRecall.mockClear();
      await delay(10); // Wait for index state update

      // If there was only 1 message, another Up Arrow should do nothing (if at top) or stay at same?
      // navigatePrev implementation:
      // if index=0, returns null (early return).

      hookResult.handleUpArrow({ lineIndex: 0, lines: [''] });
      // Should NOT recall again if we reached the top
      expect(onRecall).not.toHaveBeenCalled();
    });

    it('should ignore empty messages', () => {
      let hookResult: UseInputHistoryResult | undefined;
      const onRecall = vi.fn();
      const props = { memory: mockMemory, currentInput: '', onRecall };

      render(
        <HookWrapper
          hookProps={props}
          onRender={(r) => {
            hookResult = r;
          }}
        />,
      );

      if (hookResult) {
        hookResult.addMessage('');
        hookResult.addMessage('   ');

        // Navigate Up
        hookResult.handleUpArrow({ lineIndex: 0, lines: [''] });
      }

      // Should handle empty history gracefully (navigatePrev returns null)
      expect(onRecall).not.toHaveBeenCalled();
    });
  });
});
