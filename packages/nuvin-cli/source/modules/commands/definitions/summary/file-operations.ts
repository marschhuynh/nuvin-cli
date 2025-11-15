import type { Message, ToolCall } from '@nuvin/nuvin-core';
import type { FileOperation } from './types.js';

export function extractFilePath(toolCall: ToolCall): string | null {
  try {
    const args = JSON.parse(toolCall.function.arguments) as { path?: string; file_path?: string };
    return args.path || args.file_path || null;
  } catch {
    return null;
  }
}

export function analyzeFileOperations(messages: Message[]): {
  reads: FileOperation[];
  edits: FileOperation[];
  creates: FileOperation[];
} {
  const reads: FileOperation[] = [];
  const edits: FileOperation[] = [];
  const creates: FileOperation[] = [];

  messages.forEach((msg) => {
    if (msg.tool_calls) {
      msg.tool_calls.forEach((tc) => {
        const path = extractFilePath(tc);
        if (!path) return;

        const timestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();

        if (tc.function.name === 'file_read') {
          reads.push({ path, timestamp, message: msg, operation: 'read' });
        } else if (tc.function.name === 'file_edit') {
          edits.push({ path, timestamp, message: msg, operation: 'edit' });
        } else if (tc.function.name === 'file_new') {
          creates.push({ path, timestamp, message: msg, operation: 'new' });
        }
      });
    }
  });

  return { reads, edits, creates };
}

export function isStaleFileRead(readOp: FileOperation, edits: FileOperation[], creates: FileOperation[]): boolean {
  const laterEdits = edits.filter((edit) => edit.path === readOp.path && edit.timestamp > readOp.timestamp);

  const laterCreates = creates.filter((create) => create.path === readOp.path && create.timestamp > readOp.timestamp);

  return laterEdits.length > 0 || laterCreates.length > 0;
}

export function isStaleFileEdit(editOp: FileOperation, edits: FileOperation[]): boolean {
  const laterEdits = edits.filter((edit) => edit.path === editOp.path && edit.timestamp > editOp.timestamp);

  return laterEdits.length > 0;
}
