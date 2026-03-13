import { describe, it, expect } from 'vitest';
import { mergeToolCallsWithResultsCached, type MergeCache } from '../../source/components/ChatDisplay.js';
import type { MessageLine as MessageLineType } from '../../source/adapters/index.js';

/**
 * Regression test: In alt mode, FlexLayout uses VirtualizedList which caches
 * item heights by key (= message ID). mergeToolCallsWithResultsCached changes
 * the merged tool message ID from "msg-tool:streaming" to "msg-tool:completed"
 * when the last result arrives. This causes VirtualizedList to:
 *   1. Evict the height cache entry for the old key
 *   2. Create a new entry with estimated height=1 for the new key
 *   3. Render only 1 line instead of all 10 tool calls until remeasurement
 *
 * The fix is to keep a stable ID across the streaming→completed transition.
 */

const files = [
  'src/config.ts', 'src/database.ts', 'src/routes.ts', 'src/middleware.ts', 'src/utils.ts',
  'src/types.ts', 'src/api.ts', 'src/auth.ts', 'src/logger.ts', 'src/index.ts',
];

const userMessage: MessageLineType = {
  id: 'msg-user',
  type: 'user',
  content: 'Read all source files',
};

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

describe('mergeToolCallsWithResultsCached — position and results across streaming→completed', () => {
  it('running tool is at end, completed tool is at natural position', () => {
    const cache: MergeCache = new Map();
    const assistant: MessageLineType = { id: 'msg-assistant', type: 'assistant', content: 'Let me read those files' };

    // Running: tool is deferred to end (after assistant)
    const running = mergeToolCallsWithResultsCached(
      [userMessage, toolMessage, assistant],
      cache,
    );
    expect(running.map((m) => m.type)).toEqual(['user', 'assistant', 'tool']);

    // Completed: tool is at its natural position (before assistant)
    const completed = mergeToolCallsWithResultsCached(
      [userMessage, toolMessage, ...allResults, assistant],
      cache,
    );
    expect(completed.map((m) => m.type)).toEqual(['user', 'tool', 'assistant']);

    // Results are present on the completed message
    const toolMsg = completed.find((m) => m.type === 'tool')!;
    const resultsByCallId = toolMsg.metadata?.toolResultsByCallId as Map<string, MessageLineType>;
    expect(resultsByCallId.size).toBe(10);
  });
});

describe('mergeToolCallsWithResultsCached — ID stability across streaming→completed', () => {
  it('merged tool message ID must NOT change when the last result arrives', () => {
    const cache: MergeCache = new Map();

    // 4 of 10 done → still streaming
    const partial = mergeToolCallsWithResultsCached(
      [userMessage, toolMessage, ...allResults.slice(0, 4)],
      cache,
    );
    const streamingMsg = partial.find((m) => m.type === 'tool')!;
    expect(streamingMsg).toBeDefined();
    const streamingId = streamingMsg.id;

    // All 10 done → completed
    const complete = mergeToolCallsWithResultsCached(
      [userMessage, toolMessage, ...allResults],
      cache,
    );
    const completedMsg = complete.find((m) => m.type === 'tool')!;
    expect(completedMsg).toBeDefined();
    const completedId = completedMsg.id;

    // FIX: IDs are now stable — "msg-tool" in both states
    // This prevents VirtualizedList from losing its height cache for the item.
    expect(completedId).toBe(streamingId);
    expect(streamingId).toBe('msg-tool');
    expect(completedId).toBe('msg-tool');
  });

  it('all 10 tool calls have results in the completed merged message', () => {
    const cache: MergeCache = new Map();

    const complete = mergeToolCallsWithResultsCached(
      [userMessage, toolMessage, ...allResults],
      cache,
    );
    const toolMsg = complete.find((m) => m.type === 'tool')!;
    const resultsByCallId = toolMsg.metadata?.toolResultsByCallId as Map<string, MessageLineType>;

    expect(resultsByCallId.size).toBe(10);
    for (let i = 1; i <= 10; i++) {
      expect(resultsByCallId.has(`call-${i}`)).toBe(true);
    }
  });

  it('merged output has exactly [user, tool] — no stray tool_result messages', () => {
    const cache: MergeCache = new Map();

    // Streaming
    const partial = mergeToolCallsWithResultsCached(
      [userMessage, toolMessage, ...allResults.slice(0, 4)],
      cache,
    );
    expect(partial.map((m) => m.type)).toEqual(['user', 'tool']);

    // Completed
    const complete = mergeToolCallsWithResultsCached(
      [userMessage, toolMessage, ...allResults],
      cache,
    );
    expect(complete.map((m) => m.type)).toEqual(['user', 'tool']);
  });
});
