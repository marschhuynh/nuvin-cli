import type { MessageLine } from '@/adapters/index.js';

/**
 * Given a target MessageLine ID, returns all MessageLine IDs that should be
 * deleted together.
 *
 * Rules:
 * 1. All lines sharing the same `metadata.messageId` (same stored Message) are grouped.
 * 2. If the group contains a `tool` line, its `tool_result` lines (linked via
 *    toolCall ID) are also included — even though they have different stored Message IDs.
 * 3. If the target is a `tool_result`, the parent `tool` line's group is also included
 *    (reverse of rule 2).
 */
export function findMessagesToDelete(msgs: readonly MessageLine[], messageId: string): string[] {
  const target = msgs.find((m) => m.id === messageId);
  if (!target) return [messageId];

  const storedMsgId = target.metadata?.messageId;
  if (!storedMsgId) return [messageId];

  // Step 1: collect all lines from the same stored Message
  const ids: string[] = [];
  const toolCallIds = new Set<string>();

  for (const msg of msgs) {
    if (msg.metadata?.messageId === storedMsgId) {
      ids.push(msg.id);
      // Step 2: gather tool call IDs from tool lines in this group
      if (msg.type === 'tool') {
        for (const tc of msg.metadata?.toolCalls ?? []) {
          toolCallIds.add((tc as { id: string }).id);
        }
      }
    }
  }

  // Step 2 (cont): collect tool_result lines belonging to these tool calls
  if (toolCallIds.size > 0) {
    for (const msg of msgs) {
      if (msg.type === 'tool_result' && toolCallIds.has(msg.metadata?.toolResult?.id ?? '')) {
        if (!ids.includes(msg.id)) {
          ids.push(msg.id);
        }
      }
    }
  }

  // Step 3: if target is a tool_result, also pull in the parent tool group
  if (target.type === 'tool_result') {
    const resultId = target.metadata?.toolResult?.id;
    if (resultId) {
      const parentTool = msgs.find(
        (m) =>
          m.type === 'tool' &&
          (m.metadata?.toolCalls ?? []).some((tc: { id: string }) => tc.id === resultId),
      );
      if (parentTool?.metadata?.messageId && parentTool.metadata.messageId !== storedMsgId) {
        const parentIds = findMessagesToDelete(msgs, parentTool.id);
        for (const id of parentIds) {
          if (!ids.includes(id)) ids.push(id);
        }
      }
    }
  }

  return ids;
}
