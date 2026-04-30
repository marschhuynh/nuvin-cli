import type { ToolCall } from '@nuvin/nuvin-core';
import * as crypto from 'node:crypto';
import type { MessageLine } from '@/adapters/index.js';
import { theme } from '@/theme';

/**
 * Flattens error object to string format 'key:"value"|key:"value"'
 * Handles nested objects, arrays, and primitive types
 */
export function flattenError(error: unknown): string {
  if (!error) return 'unknown error';

  if (typeof error === 'string') return error;

  if (error instanceof Error) {
    return flattenObject({
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  }

  if (typeof error === 'object' && error) {
    return flattenObject(error as Record<string, unknown>);
  }

  return String(error);
}

/**
 * Flattens object to 'key:"value"|key:"value"' format
 */
export function flattenObject(obj: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;

    let formattedValue: string;
    if (typeof value === 'string') {
      formattedValue = `"${value.replace(/"/g, '\\"')}"`;
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      formattedValue = String(value);
    } else if (Array.isArray(value)) {
      formattedValue = `[${value.map((v) => (typeof v === 'string' ? `"${v}"` : String(v))).join(',')}]`;
    } else if (typeof value === 'object' && value && !Array.isArray(value)) {
      formattedValue = `{${flattenObject(value as Record<string, unknown>)}}`;
    } else {
      formattedValue = String(value);
    }

    parts.push(`${key}:${formattedValue}`);
  }

  return parts.join('|');
}

/**
 * Format agent ID to human-readable name
 * Converts "code-reviewer" → "Code Reviewer"
 */
function formatAgentName(agentId: string): string {
  return agentId
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Renders tool call with arguments (shared logic between UIEventAdapter and messageProcessor)
 */
export function renderToolCall(tc: ToolCall): string {
  let argsStr = '';
  try {
    const args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;

    // Special handling for assign_task - show agent name instead of tool name
    if (tc.function.name === 'assign_task') {
      if (args.agent) {
        return `[${formatAgentName(args.agent)}]`;
      }
      return '[Sub-Agent]';
    }

    switch (tc.function.name) {
      case 'todo_write':
        if (args.todos && Array.isArray(args.todos)) {
          const count = args.todos.length;
          argsStr = `(${count} ${count === 1 ? 'item' : 'items'})`;
        } else {
          argsStr = '(...)';
        }
        break;

      case 'file_read':
      case 'file_edit':
      case 'file_new':
      case 'ls_tool':
      case 'web_fetch':
        if (args.path) {
          argsStr = `(${args.path})`;
        } else if (args.file_path) {
          argsStr = `(${args.file_path})`;
        } else if (args.url) {
          argsStr = `(${args.url})`;
        } else {
          argsStr = '(...)';
        }
        break;

      case 'bash_tool':
        if (args.cmd) {
          argsStr = `(${args.cmd})`;
        } else if (args.program) {
          const programArgs = args.args ? ` ${Array.isArray(args.args) ? args.args.join(' ') : args.args}` : '';
          argsStr = `(${args.program}${programArgs})`;
        } else if (args.action) {
          argsStr = `(${args.action}${args.sessionId ? `:${args.sessionId}` : ''})`;
        } else {
          argsStr = '(...)';
        }
        break;

      case 'web_search':
        if (args.query) {
          const queryWords = args.query.split(' ').slice(0, 3).join(' ');
          argsStr = `(${queryWords}${args.query.split(' ').length > 3 ? '...' : ''})`;
        } else {
          argsStr = '(...)';
        }
        break;

      default:
        argsStr = args ? `(${flattenObject(args)})` : '(...)';
        break;
    }
  } catch {
    argsStr = '(...)';
  }
  return `${tc.function.name}${argsStr}`;
}

/**
 * Processes a single message into UI message lines
 * This is the shared logic that both UI event adapter and session loading use
 */
export function processMessageToUILines(msg: {
  id: string; // Message ID for traceability
  role: 'user' | 'assistant' | 'tool';
  content?: string | null | { type: 'parts'; parts: unknown[] };
  timestamp?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string; // Tool name for tool messages
}): MessageLine[] {
  const lines: MessageLine[] = [];

  // Helper to extract text content from various content types
  const extractTextContent = (content: typeof msg.content): string => {
    if (!content) return '';
    if (typeof content === 'string') return content.replace(/^\n+/, '');
    if (typeof content === 'object' && content.type === 'parts') {
      // Extract text from parts
      const result = content.parts
        .map((part: unknown) => {
          if (typeof part === 'string') return part;
          if (typeof part === 'object' && part !== null && 'type' in part && 'text' in part) {
            const typedPart = part as { type: string; text: string };
            if (typedPart.type === 'text' && typedPart.text) return typedPart.text;
          }
          return '';
        })
        .filter(Boolean)
        .join(' ');
      // Only remove leading newlines from the final assembled content
      return result.replace(/^\n+/, '');
    }
    return '';
  };

  if (msg.role === 'user') {
    const textContent = extractTextContent(msg.content);
    if (textContent) {
      lines.push({
        id: crypto.randomUUID(),
        type: 'user',
        content: textContent,
        metadata: {
          messageId: msg.id,
          timestamp: msg.timestamp || new Date().toISOString(),
          isStreaming: false,
        },
        color: theme.tokens.cyan,
      });
    }
  } else if (msg.role === 'assistant') {
    // Handle assistant content first
    const textContent = extractTextContent(msg.content);
    if (textContent?.trim()) {
      lines.push({
        id: crypto.randomUUID(),
        type: 'assistant',
        content: textContent,
        metadata: {
          messageId: msg.id,
          timestamp: msg.timestamp || new Date().toISOString(),
          isStreaming: false,
        },
      });
    }

    // Handle tool calls after content
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      lines.push({
        id: crypto.randomUUID(),
        type: 'tool',
        content: `${msg.tool_calls.map(renderToolCall).join(', ')}`,
        metadata: {
          messageId: msg.id, // Same as content - tool calls are part of assistant message
          toolCallCount: msg.tool_calls.length,
          timestamp: msg.timestamp || new Date().toISOString(),
          toolCalls: msg.tool_calls,
        },
        color: theme.tokens.blue,
      });
    }
  } else if (msg.role === 'tool') {
    // Handle tool results
    const textContent = extractTextContent(msg.content);

    // Extract tool name from message (messages have a 'name' field)
    const toolName = msg.name || msg.tool_call_id || 'unknown';

    // Read status, durationMs, and full metadata from message if available (saved in history)
    const msgStatus = (msg as { status?: 'success' | 'error' }).status;
    const msgDurationMs = (msg as { durationMs?: number }).durationMs;
    const msgMetadata = (msg as { metadata?: Record<string, unknown> }).metadata;

    // Use status from history, default to success if not present
    const finalStatus: 'success' | 'error' = msgStatus || 'success';

    // Build toolResult with proper discriminated union types
    const baseResult = {
      id: msg.tool_call_id || 'unknown',
      name: toolName,
      type: 'text' as const,
      result: textContent || '',
      durationMs: msgDurationMs,
    };

    // Preserve full metadata for both success and error cases
    const toolResult =
      finalStatus === 'success'
        ? { ...baseResult, status: 'success' as const, metadata: msgMetadata }
        : {
            ...baseResult,
            status: 'error' as const,
            metadata: msgMetadata,
          };

    const statusIcon = toolResult.status === 'success' ? '[+]' : '[!]';
    const durationText =
      typeof toolResult.durationMs === 'number' && Number.isFinite(toolResult.durationMs)
        ? ` (${toolResult.durationMs}ms)`
        : '';

    lines.push({
      id: crypto.randomUUID(),
      type: 'tool_result',
      content:
        toolResult.status === 'success'
          ? `${toolResult.name}: ${statusIcon} ${toolResult.status}${durationText}`
          : `error: ${flattenError(toolResult).slice(0, 1000)}`,
      metadata: {
        messageId: msg.id,
        toolName: toolResult.name,
        status: toolResult.status,
        duration: toolResult.durationMs,
        timestamp: msg.timestamp || new Date().toISOString(),
        toolResult,
      },
      color: toolResult.status === 'success' ? theme.tokens.green : theme.tokens.red,
    });
  }

  return lines;
}
