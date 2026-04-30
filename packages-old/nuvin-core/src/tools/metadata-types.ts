import type { ErrorReason, MetricsSnapshot } from '../ports.js';

export type FileMetadata = {
  path: string;
  created?: string;
  modified?: string;
  size?: number;
};

export type LineRangeMetadata = {
  lineStart: number;
  lineEnd: number;
  linesTotal?: number;
};

export type CommandMetadata = {
  cwd?: string;
  code?: number | null;
  signal?: string | null;
  timedOut?: boolean;
};

export type ErrorMetadata = {
  errorReason?: ErrorReason;
  code?: string | number;
  stackTrace?: string;
  retryable?: boolean;
};

export type DelegationMetadata = {
  agentId: string;
  agentName: string;
  delegationDepth: number;
  status?: 'success' | 'error' | 'timeout';

  executionTimeMs: number;
  toolCallsExecuted: number;
  tokensUsed?: number;

  metrics?: MetricsSnapshot;

  taskDescription: string;
  provider?: string;
  model?: string;
  conversationHistoryLength?: number;
  eventsEmitted?: number;

  sessionId?: string;
  runningInBackground?: boolean;
};
