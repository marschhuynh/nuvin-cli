import type { MessageLine, LineMetadata } from '@/adapters/index.js';

export type UIHandlers = {
  appendLine: (line: MessageLine) => void;
  updateLine: (id: string, content: string) => void;
  updateLineMetadata: (id: string, metadata: Partial<LineMetadata>) => void;
  handleError: (message: string) => void;
};
