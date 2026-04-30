/**
 * Sub-agent related types
 * These types track the state and execution of delegated specialist agents
 */

import type { MetricsSnapshot } from './ports.js';

/**
 * Represents a tool call made by a sub-agent during execution
 */
export type SubAgentToolCall = {
  id: string;
  name: string;
  arguments?: string; // JSON string of arguments
  durationMs?: number;
  status?: 'success' | 'error';
  result?: string; // Tool result content
  metadata?: Record<string, unknown>; // Tool result metadata
};

/**
 * State tracking for a sub-agent execution
 * Used by UIs to display real-time sub-agent activity
 */
export type SubAgentState = {
  agentId: string;
  agentName: string;
  status: 'starting' | 'running' | 'completed';
  toolCalls: SubAgentToolCall[];
  resultMessage?: string;
  totalDurationMs?: number;
  finalStatus?: 'success' | 'error' | 'timeout';
  toolCallMessageId?: string;
  toolCallId?: string;
  metrics?: MetricsSnapshot;
};

/**
 * Parse tool call arguments from string to typed object
 */
export function parseSubAgentToolCallArguments(argsString?: string): Record<string, unknown> {
  if (!argsString) return {};
  try {
    return JSON.parse(argsString) as Record<string, unknown>;
  } catch {
    return {};
  }
}
