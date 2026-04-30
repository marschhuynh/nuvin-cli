import type { Message } from '@nuvin/nuvin-core';

export interface FileOperation {
  path: string;
  timestamp: Date;
  message: Message;
  operation: 'read' | 'edit' | 'new';
}

export interface BashOperation {
  command: string;
  timestamp: Date;
  message: Message;
  toolResultMessage: Message | null;
}

export interface CompressionStats {
  original: number;
  compressed: number;
  removed: number;
  staleReads: number;
  staleEdits: number;
  failedBash: number;
  staleBash: number;
}
