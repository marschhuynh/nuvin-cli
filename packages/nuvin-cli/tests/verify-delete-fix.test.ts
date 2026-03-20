import { describe, it, expect } from 'vitest';
import type { MessageLine } from '../source/types.js';
import { findMessagesToDelete } from '../source/utils/findMessagesToDelete.js';

/* ─── helpers ─────────────────────────────────────────────── */

const tool = (id: string, msgId: string, tcIds: string[]): MessageLine => ({
  id,
  type: 'tool',
  content: tcIds.join(', '),
  metadata: {
    messageId: msgId,
    toolCalls: tcIds.map((tcId) => ({ id: tcId, type: 'function' as const, function: { name: `tool_${tcId}`, arguments: '{}' } })),
  },
});

const toolResult = (id: string, msgId: string, tcId: string): MessageLine => ({
  id,
  type: 'tool_result',
  content: 'ok',
  metadata: {
    messageId: msgId,
    toolResult: { id: tcId, name: `tool_${tcId}`, type: 'text', result: '', status: 'success' },
  },
});

const line = (id: string, type: MessageLine['type'], msgId: string): MessageLine => ({
  id,
  type,
  content: type,
  metadata: { messageId: msgId },
});

/* ─── tests ───────────────────────────────────────────────── */

describe('findMessagesToDelete', () => {
  // ── Scenario 1: simple user + assistant (no tools) ──
  describe('simple conversation (no tools)', () => {
    const msgs: MessageLine[] = [
      line('user-1', 'user', 'stored-u1'),
      line('asst-1', 'assistant', 'stored-a1'),
      line('user-2', 'user', 'stored-u2'),
      line('asst-2', 'assistant', 'stored-a2'),
    ];

    it('delete user → only that user line', () => {
      expect(findMessagesToDelete(msgs, 'user-1')).toEqual(['user-1']);
    });

    it('delete assistant → only that assistant line', () => {
      expect(findMessagesToDelete(msgs, 'asst-1')).toEqual(['asst-1']);
    });
  });

  // ── Scenario 2: single tool call round ──
  // Stored messages: assistant(tool_calls) + tool_result
  // Lines: tool + tool_result — both linked by tool call ID
  describe('single tool call round', () => {
    const msgs: MessageLine[] = [
      line('user-1', 'user', 'stored-u1'),
      tool('tool-1', 'stored-a1', ['tc-1']),
      toolResult('tr-1', 'stored-tr1', 'tc-1'),
      line('asst-1', 'assistant', 'stored-a2'),
    ];

    it('delete tool line → tool + tool_result', () => {
      const ids = findMessagesToDelete(msgs, 'tool-1');
      expect(ids).toContain('tool-1');
      expect(ids).toContain('tr-1');
      expect(ids).toHaveLength(2);
    });

    it('delete tool_result → tool + tool_result (via parent lookup)', () => {
      const ids = findMessagesToDelete(msgs, 'tr-1');
      expect(ids).toContain('tool-1');
      expect(ids).toContain('tr-1');
      expect(ids).toHaveLength(2);
    });

    it('delete assistant → only assistant', () => {
      expect(findMessagesToDelete(msgs, 'asst-1')).toEqual(['asst-1']);
    });
  });

  // ── Scenario 3: multiple tool calls in one assistant message ──
  describe('multiple tool calls in one message', () => {
    const msgs: MessageLine[] = [
      line('user-1', 'user', 'stored-u1'),
      tool('tool-1', 'stored-a1', ['tc-1', 'tc-2', 'tc-3']),
      toolResult('tr-1', 'stored-tr1', 'tc-1'),
      toolResult('tr-2', 'stored-tr2', 'tc-2'),
      toolResult('tr-3', 'stored-tr3', 'tc-3'),
      line('asst-1', 'assistant', 'stored-a2'),
    ];

    it('delete tool line → tool + all 3 tool_results', () => {
      const ids = findMessagesToDelete(msgs, 'tool-1');
      expect(ids).toContain('tool-1');
      expect(ids).toContain('tr-1');
      expect(ids).toContain('tr-2');
      expect(ids).toContain('tr-3');
      expect(ids).toHaveLength(4);
    });

    it('delete any tool_result → same group (tool + all 3 results)', () => {
      for (const trId of ['tr-1', 'tr-2', 'tr-3']) {
        const ids = findMessagesToDelete(msgs, trId);
        expect(ids).toContain('tool-1');
        expect(ids).toContain('tr-1');
        expect(ids).toContain('tr-2');
        expect(ids).toContain('tr-3');
        expect(ids).toHaveLength(4);
      }
    });
  });

  // ── Scenario 4: thinking + tool from same stored message ──
  describe('thinking + tool from same stored message', () => {
    const msgs: MessageLine[] = [
      line('user-1', 'user', 'stored-u1'),
      line('think-1', 'thinking', 'stored-a1'),
      tool('tool-1', 'stored-a1', ['tc-1']),
      toolResult('tr-1', 'stored-tr1', 'tc-1'),
      line('asst-1', 'assistant', 'stored-a2'),
    ];

    it('delete thinking → thinking + tool + tool_result', () => {
      const ids = findMessagesToDelete(msgs, 'think-1');
      expect(ids).toContain('think-1');
      expect(ids).toContain('tool-1');
      expect(ids).toContain('tr-1');
      expect(ids).toHaveLength(3);
    });

    it('delete tool → thinking + tool + tool_result', () => {
      const ids = findMessagesToDelete(msgs, 'tool-1');
      expect(ids).toContain('think-1');
      expect(ids).toContain('tool-1');
      expect(ids).toContain('tr-1');
      expect(ids).toHaveLength(3);
    });

    it('delete tool_result → thinking + tool + tool_result (via parent)', () => {
      const ids = findMessagesToDelete(msgs, 'tr-1');
      expect(ids).toContain('think-1');
      expect(ids).toContain('tool-1');
      expect(ids).toContain('tr-1');
      expect(ids).toHaveLength(3);
    });

    it('delete assistant → only assistant (different stored message)', () => {
      expect(findMessagesToDelete(msgs, 'asst-1')).toEqual(['asst-1']);
    });
  });

  // ── Scenario 5: multi-round tool loop ──
  // Two tool loop iterations, each with its own stored message
  describe('multi-round tool loop', () => {
    const msgs: MessageLine[] = [
      line('user-1', 'user', 'stored-u1'),
      // Round 1
      tool('tool-1', 'stored-a1', ['tc-1']),
      toolResult('tr-1', 'stored-tr1', 'tc-1'),
      // Round 2
      tool('tool-2', 'stored-a2', ['tc-2']),
      toolResult('tr-2', 'stored-tr2', 'tc-2'),
      // Final answer
      line('asst-1', 'assistant', 'stored-a3'),
    ];

    it('delete round 1 tool → only round 1 lines', () => {
      const ids = findMessagesToDelete(msgs, 'tool-1');
      expect(ids).toContain('tool-1');
      expect(ids).toContain('tr-1');
      expect(ids).not.toContain('tool-2');
      expect(ids).not.toContain('tr-2');
      expect(ids).not.toContain('asst-1');
      expect(ids).toHaveLength(2);
    });

    it('delete round 2 tool → only round 2 lines', () => {
      const ids = findMessagesToDelete(msgs, 'tool-2');
      expect(ids).toContain('tool-2');
      expect(ids).toContain('tr-2');
      expect(ids).not.toContain('tool-1');
      expect(ids).not.toContain('tr-1');
      expect(ids).toHaveLength(2);
    });

    it('delete round 1 tool_result → only round 1 lines', () => {
      const ids = findMessagesToDelete(msgs, 'tr-1');
      expect(ids).toContain('tool-1');
      expect(ids).toContain('tr-1');
      expect(ids).not.toContain('tool-2');
      expect(ids).toHaveLength(2);
    });
  });

  // ── Scenario 6: assistant text + tool calls from same stored message ──
  // During session resume, one assistant Message with content + tool_calls
  // produces both an 'assistant' line and a 'tool' line with the same messageId
  describe('assistant + tool from same stored message (session resume)', () => {
    const msgs: MessageLine[] = [
      line('user-1', 'user', 'stored-u1'),
      line('asst-1', 'assistant', 'stored-a1'),   // content from Message
      tool('tool-1', 'stored-a1', ['tc-1']),       // tool_calls from same Message
      toolResult('tr-1', 'stored-tr1', 'tc-1'),
    ];

    it('delete assistant → assistant + tool + tool_result', () => {
      const ids = findMessagesToDelete(msgs, 'asst-1');
      expect(ids).toContain('asst-1');
      expect(ids).toContain('tool-1');
      expect(ids).toContain('tr-1');
      expect(ids).toHaveLength(3);
    });

    it('delete tool → same group', () => {
      const ids = findMessagesToDelete(msgs, 'tool-1');
      expect(ids).toContain('asst-1');
      expect(ids).toContain('tool-1');
      expect(ids).toContain('tr-1');
      expect(ids).toHaveLength(3);
    });
  });

  // ── Edge cases ──
  describe('edge cases', () => {
    it('unknown line ID → returns [id]', () => {
      expect(findMessagesToDelete([], 'nonexistent')).toEqual(['nonexistent']);
    });

    it('line without metadata.messageId → returns [id]', () => {
      const msgs: MessageLine[] = [{ id: 'info-1', type: 'info', content: 'hello' }];
      expect(findMessagesToDelete(msgs, 'info-1')).toEqual(['info-1']);
    });

    it('orphan tool_result (no parent tool line) → returns [id]', () => {
      const msgs: MessageLine[] = [
        toolResult('tr-orphan', 'stored-x', 'tc-missing'),
      ];
      expect(findMessagesToDelete(msgs, 'tr-orphan')).toEqual(['tr-orphan']);
    });

    it('error line without metadata → returns [id]', () => {
      const msgs: MessageLine[] = [{ id: 'err-1', type: 'error', content: 'fail' }];
      expect(findMessagesToDelete(msgs, 'err-1')).toEqual(['err-1']);
    });

    it('does not duplicate IDs when tool_result shares messageId with parent', () => {
      // Edge: tool_result has same storedMsgId as parent tool (shouldn't happen,
      // but verify no duplicates)
      const msgs: MessageLine[] = [
        tool('tool-1', 'stored-a1', ['tc-1']),
        toolResult('tr-1', 'stored-a1', 'tc-1'),  // same messageId as tool
      ];
      const ids = findMessagesToDelete(msgs, 'tr-1');
      const unique = new Set(ids);
      expect(ids.length).toBe(unique.size);
    });
  });
});
