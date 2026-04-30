import type { Message } from '@nuvin/nuvin-core';
import type { CompressionStats } from './types.js';
import { analyzeFileOperations, isStaleFileRead, isStaleFileEdit } from './file-operations.js';
import { analyzeBashOperations, isStaleBashCommand, hasErrors } from './bash-operations.js';

export function compressConversation(messages: Message[]): {
  compressed: Message[];
  stats: CompressionStats;
} {
  const { reads, edits, creates } = analyzeFileOperations(messages);
  const bashOps = analyzeBashOperations(messages);

  const messagesToRemove = new Set<string>();
  let staleReadsCount = 0;
  let staleEditsCount = 0;
  let failedBashCount = 0;
  let staleBashCount = 0;

  reads.forEach((readOp) => {
    if (isStaleFileRead(readOp, edits, creates)) {
      messagesToRemove.add(readOp.message.id);

      const toolResultMsg = messages.find(
        (m) => m.role === 'tool' && readOp.message.tool_calls?.some((tc) => tc.id === m.tool_call_id),
      );
      if (toolResultMsg) {
        messagesToRemove.add(toolResultMsg.id);
      }

      staleReadsCount++;
    }
  });

  edits.forEach((editOp) => {
    if (isStaleFileEdit(editOp, edits)) {
      messagesToRemove.add(editOp.message.id);

      const toolResultMsg = messages.find(
        (m) => m.role === 'tool' && editOp.message.tool_calls?.some((tc) => tc.id === m.tool_call_id),
      );
      if (toolResultMsg) {
        messagesToRemove.add(toolResultMsg.id);
      }

      staleEditsCount++;
    }
  });

  bashOps.forEach((bashOp) => {
    const hasError = bashOp.toolResultMessage && hasErrors(bashOp.toolResultMessage);
    const isStale = isStaleBashCommand(bashOp, bashOps);

    if (hasError || isStale) {
      messagesToRemove.add(bashOp.message.id);

      if (bashOp.toolResultMessage) {
        messagesToRemove.add(bashOp.toolResultMessage.id);
      }

      if (hasError) {
        failedBashCount++;
      } else if (isStale) {
        staleBashCount++;
      }
    }
  });

  const compressedMessages = messages.filter((msg) => !messagesToRemove.has(msg.id));

  return {
    compressed: compressedMessages,
    stats: {
      original: messages.length,
      compressed: compressedMessages.length,
      removed: messagesToRemove.size,
      staleReads: staleReadsCount,
      staleEdits: staleEditsCount,
      failedBash: failedBashCount,
      staleBash: staleBashCount,
    },
  };
}
