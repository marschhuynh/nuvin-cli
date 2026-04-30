/**
 * Test delete grouping against a real session history.
 * Source: /Users/marsch/.nuvin/sessions/1773946477636/history.cli.json
 *
 * Stored messages:
 *  1. user       "let run test then run build"
 *  2. assistant  reasoning + file_read tool_call
 *  3. tool       file_read result
 *  4. assistant  reasoning + bash_tool tool_call (pnpm test)
 *  5. tool       bash_tool result
 *  6. assistant  reasoning + bash_tool tool_call (pnpm build)
 *  7. tool       bash_tool result
 *  8. assistant  final answer (reasoning, no tool_calls)
 */
import { describe, it, expect } from 'vitest';
import { processMessageToUILines } from '../source/utils/messageProcessor.js';
import { findMessagesToDelete } from '../source/utils/findMessagesToDelete.js';
import type { MessageLine } from '../source/adapters/index.js';

/* ─── Load stored messages from the real history ─── */

const storedMessages = [
  {
    id: '67991c19-4fd3-4ad0-a253-d72d213546b8',
    role: 'user' as const,
    content: 'let run test then run build',
    timestamp: '2026-03-19T18:54:37.665Z',
  },
  {
    id: '5b6ad4be-e0e5-4950-a7a0-19c59262890c',
    role: 'assistant' as const,
    content: "I'll run the tests first, then the build. Let me check the available scripts first.",
    timestamp: '2026-03-19T18:54:40.596Z',
    tool_calls: [
      {
        id: 'call_88096774124043ff94ccd494',
        type: 'function' as const,
        function: {
          name: 'file_read',
          arguments: '{"path":"/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/package.json"}',
        },
      },
    ],
    reasoning: 'The user wants me to run tests first...',
  },
  {
    id: 'call_88096774124043ff94ccd494',
    role: 'tool' as const,
    content: '{ "name": "@nuvin/nuvin-cli" }',
    timestamp: '2026-03-19T18:54:40.597Z',
    tool_call_id: 'call_88096774124043ff94ccd494',
    name: 'file_read',
    status: 'success' as const,
    durationMs: 11,
  },
  {
    id: '3089a3e6-47d7-4404-8a7c-6a1bd5a76b5d',
    role: 'assistant' as const,
    content: '',
    timestamp: '2026-03-19T18:55:05.917Z',
    tool_calls: [
      {
        id: 'call_ab94bb08962a47cdb09f64db',
        type: 'function' as const,
        function: { name: 'bash_tool', arguments: '{"cmd":"pnpm test"}' },
      },
    ],
    reasoning: 'Now I\'ll run the tests first.',
  },
  {
    id: 'call_ab94bb08962a47cdb09f64db',
    role: 'tool' as const,
    content: 'Tests passed...',
    timestamp: '2026-03-19T18:55:05.917Z',
    tool_call_id: 'call_ab94bb08962a47cdb09f64db',
    name: 'bash_tool',
    status: 'success' as const,
    durationMs: 24025,
  },
  {
    id: '68bcb33c-c4a6-4ec8-81bb-9fa2edf33e04',
    role: 'assistant' as const,
    content: 'Tests passed ✓ Now running build:',
    timestamp: '2026-03-19T18:55:15.378Z',
    tool_calls: [
      {
        id: 'call_b5429b58f94a479b96e4aba2',
        type: 'function' as const,
        function: { name: 'bash_tool', arguments: '{"cmd":"pnpm build"}' },
      },
    ],
    reasoning: 'Great! The tests passed. Now I\'ll run the build command.',
  },
  {
    id: 'call_b5429b58f94a479b96e4aba2',
    role: 'tool' as const,
    content: 'Build complete!',
    timestamp: '2026-03-19T18:55:15.378Z',
    tool_call_id: 'call_b5429b58f94a479b96e4aba2',
    name: 'bash_tool',
    status: 'success' as const,
    durationMs: 7653,
  },
  {
    id: '2dd9be5f-b669-497f-956e-fab1242f0f0b',
    role: 'assistant' as const,
    content: '✓ **Tests passed** (all 1000+ tests)\n✓ **Build completed** successfully',
    timestamp: '2026-03-19T18:55:17.504Z',
    reasoning: 'Perfect! Both the tests and build completed successfully.',
  },
];

/* ─── Convert stored messages → MessageLines (session resume path) ─── */

function buildMessageLines(): MessageLine[] {
  const lines: MessageLine[] = [];
  for (const msg of storedMessages) {
    lines.push(...processMessageToUILines(msg));
  }
  return lines;
}

/* ─── Tests ─── */

describe('findMessagesToDelete — real session history', () => {
  const lines = buildMessageLines();

  // First: verify processMessageToUILines produced the expected lines
  it('produces the expected line types from stored messages', () => {
    const _types = lines.map((l) => `${l.type}:${l.metadata?.messageId?.slice(0, 8) ?? 'none'}`);

    // msg1: user
    expect(lines[0].type).toBe('user');
    expect(lines[0].metadata?.messageId).toBe('67991c19-4fd3-4ad0-a253-d72d213546b8');

    // msg2: assistant with content + tool_calls → assistant line + tool line
    expect(lines[1].type).toBe('assistant');
    expect(lines[1].metadata?.messageId).toBe('5b6ad4be-e0e5-4950-a7a0-19c59262890c');
    expect(lines[2].type).toBe('tool');
    expect(lines[2].metadata?.messageId).toBe('5b6ad4be-e0e5-4950-a7a0-19c59262890c');

    // msg3: tool result
    expect(lines[3].type).toBe('tool_result');
    expect(lines[3].metadata?.messageId).toBe('call_88096774124043ff94ccd494');

    // msg4: assistant with empty content + tool_calls → only tool line
    expect(lines[4].type).toBe('tool');
    expect(lines[4].metadata?.messageId).toBe('3089a3e6-47d7-4404-8a7c-6a1bd5a76b5d');

    // msg5: tool result
    expect(lines[5].type).toBe('tool_result');
    expect(lines[5].metadata?.messageId).toBe('call_ab94bb08962a47cdb09f64db');

    // msg6: assistant with content + tool_calls → assistant line + tool line
    expect(lines[6].type).toBe('assistant');
    expect(lines[6].metadata?.messageId).toBe('68bcb33c-c4a6-4ec8-81bb-9fa2edf33e04');
    expect(lines[7].type).toBe('tool');
    expect(lines[7].metadata?.messageId).toBe('68bcb33c-c4a6-4ec8-81bb-9fa2edf33e04');

    // msg7: tool result
    expect(lines[8].type).toBe('tool_result');
    expect(lines[8].metadata?.messageId).toBe('call_b5429b58f94a479b96e4aba2');

    // msg8: final assistant
    expect(lines[9].type).toBe('assistant');
    expect(lines[9].metadata?.messageId).toBe('2dd9be5f-b669-497f-956e-fab1242f0f0b');
  });

  // ── Delete user message → only user line ──
  it('delete user message → only that line', () => {
    const ids = findMessagesToDelete(lines, lines[0].id);
    expect(ids).toHaveLength(1);
    expect(ids).toContain(lines[0].id);
  });

  // ── Delete assistant line from msg2 → assistant + tool + tool_result ──
  it('delete assistant (msg2) → assistant + tool line (same stored msg) + tool_result', () => {
    const ids = findMessagesToDelete(lines, lines[1].id);
    // lines[1] = assistant (stored-msg-2)
    // lines[2] = tool      (stored-msg-2) — same messageId
    // lines[3] = tool_result (tool call from stored-msg-2)
    expect(ids).toContain(lines[1].id); // assistant
    expect(ids).toContain(lines[2].id); // tool
    expect(ids).toContain(lines[3].id); // tool_result
    expect(ids).toHaveLength(3);
  });

  // ── Delete tool line from msg2 → same group ──
  it('delete tool line (msg2) → same group as deleting assistant', () => {
    const ids = findMessagesToDelete(lines, lines[2].id);
    expect(ids).toContain(lines[1].id); // assistant
    expect(ids).toContain(lines[2].id); // tool
    expect(ids).toContain(lines[3].id); // tool_result
    expect(ids).toHaveLength(3);
  });

  // ── Delete tool_result from msg3 → pulls in parent group ──
  it('delete tool_result (msg3) → itself + parent group (assistant + tool from msg2)', () => {
    const ids = findMessagesToDelete(lines, lines[3].id);
    expect(ids).toContain(lines[1].id); // parent assistant
    expect(ids).toContain(lines[2].id); // parent tool
    expect(ids).toContain(lines[3].id); // the tool_result itself
    expect(ids).toHaveLength(3);
  });

  // ── Delete tool line from msg4 (empty content assistant) → tool + tool_result ──
  it('delete tool line (msg4, no assistant text) → tool + tool_result', () => {
    const ids = findMessagesToDelete(lines, lines[4].id);
    expect(ids).toContain(lines[4].id); // tool
    expect(ids).toContain(lines[5].id); // tool_result
    expect(ids).toHaveLength(2);
    // Should NOT include lines from other stored messages
    expect(ids).not.toContain(lines[1].id);
    expect(ids).not.toContain(lines[2].id);
  });

  // ── Delete tool_result from msg5 → pulls in msg4 group ──
  it('delete tool_result (msg5) → itself + parent tool from msg4', () => {
    const ids = findMessagesToDelete(lines, lines[5].id);
    expect(ids).toContain(lines[4].id); // parent tool
    expect(ids).toContain(lines[5].id); // the tool_result
    expect(ids).toHaveLength(2);
  });

  // ── Delete assistant line from msg6 → assistant + tool + tool_result ──
  it('delete assistant (msg6) → assistant + tool + tool_result', () => {
    const ids = findMessagesToDelete(lines, lines[6].id);
    expect(ids).toContain(lines[6].id); // assistant
    expect(ids).toContain(lines[7].id); // tool
    expect(ids).toContain(lines[8].id); // tool_result
    expect(ids).toHaveLength(3);
  });

  // ── Delete final assistant (msg8, no tools) → only itself ──
  it('delete final assistant (msg8, no tools) → only that line', () => {
    const ids = findMessagesToDelete(lines, lines[9].id);
    expect(ids).toHaveLength(1);
    expect(ids).toContain(lines[9].id);
  });

  // ── Verify stored Message IDs to delete are correct for persistence ──
  it('collected stored Message IDs are correct for persistence deletion', () => {
    // Simulate the onDeleteMessage handler: delete msg2 group
    const lineIds = findMessagesToDelete(lines, lines[1].id);
    const storedMsgIds = [...new Set(
      lineIds
        .map((id) => lines.find((l) => l.id === id)?.metadata?.messageId)
        .filter((id): id is string => id !== undefined),
    )];

    // Should produce 2 unique stored Message IDs:
    // - 5b6ad4be... (assistant + tool lines)
    // - call_8809... (tool_result line)
    expect(storedMsgIds).toContain('5b6ad4be-e0e5-4950-a7a0-19c59262890c');
    expect(storedMsgIds).toContain('call_88096774124043ff94ccd494');
    expect(storedMsgIds).toHaveLength(2);
  });

  // ── Verify no cross-contamination between tool loop rounds ──
  it('deleting round 1 does not affect round 2 or round 3', () => {
    const round1Ids = findMessagesToDelete(lines, lines[2].id); // tool from msg2
    const round2Ids = findMessagesToDelete(lines, lines[4].id); // tool from msg4
    const round3Ids = findMessagesToDelete(lines, lines[7].id); // tool from msg6

    // No overlap between rounds
    for (const id of round1Ids) {
      expect(round2Ids).not.toContain(id);
      expect(round3Ids).not.toContain(id);
    }
    for (const id of round2Ids) {
      expect(round3Ids).not.toContain(id);
    }
  });
});
