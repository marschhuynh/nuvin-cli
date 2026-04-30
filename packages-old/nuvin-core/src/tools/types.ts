import type { ToolDefinition, EventPort, ErrorReason, TextContentPart, ImageContentPart } from '../ports.js';

export type ExecResultSuccess =
  | {
      status: 'success';
      type: 'text';
      result: string;
      metadata?: Record<string, unknown>;
    }
  | {
      status: 'success';
      type: 'json';
      result: Record<string, unknown> | unknown[];
      metadata?: Record<string, unknown>;
    }
  | {
      status: 'success';
      type: 'mixed';
      result: Array<TextContentPart | ImageContentPart>;
      metadata?: Record<string, unknown>;
    };

export type ExecResultError = {
  status: 'error';
  type: 'text';
  result: string;
  metadata?: Record<string, unknown> & {
    errorReason?: ErrorReason;
  };
};

export type ExecResult = ExecResultSuccess | ExecResultError;

export type ToolExecutionContext = {
  conversationId?: string;
  agentId?: string;
  sessionId?: string;
  sessionDir?: string;
  workspaceDir?: string;
  delegationDepth?: number;
  messageId?: string;
  toolCallId?: string;
  eventPort?: EventPort;
  signal?: AbortSignal;
  waitForUserQuestion?: (
    questionId: string,
    questions: Array<{
      id: string;
      question: string;
      header: string;
      options: Array<{ label: string; description: string }>;
      multiSelect: boolean;
    }>
  ) => Promise<Record<string, string | string[]>>;
} & Record<string, unknown>;

export interface FunctionTool<
  P = Record<string, unknown>,
  C = ToolExecutionContext,
  R extends ExecResult = ExecResult,
> {
  name: string;
  parameters: object;

  definition(): ToolDefinition['function'];

  execute(params: P, context?: C): Promise<R> | R;
}
