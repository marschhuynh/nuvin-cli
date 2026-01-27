// packages/nuvin-acp/source/adapters/event-adapter.ts
import type { AgentEvent, ToolCall } from '@nuvin/nuvin-core';
import { AgentEventTypes } from '@nuvin/nuvin-core';
import type {
  SessionId,
  SessionUpdate,
  ToolKind,
  SessionUpdateParams,
} from '../protocol/types.js';
import type { StdioTransport } from '../transport/stdio.js';

export class EventAdapter {
  constructor(
    private transport: StdioTransport,
    private sessionId: SessionId,
  ) {}

  async handleEvent(event: AgentEvent): Promise<void> {
    const updates = this.convertToSessionUpdates(event);
    for (const update of updates) {
      await this.sendUpdate(update);
    }
  }

  private async sendUpdate(update: SessionUpdate): Promise<void> {
    const params: SessionUpdateParams = {
      sessionId: this.sessionId,
      update,
    };

    await this.transport.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params,
    });
  }

  private convertToSessionUpdates(event: AgentEvent): SessionUpdate[] {
    switch (event.type) {
      case AgentEventTypes.AssistantChunk:
        return [{
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: event.delta },
        }];

      case AgentEventTypes.ReasoningChunk:
        return [{
          sessionUpdate: 'agent_thought_chunk',
          content: { type: 'text', text: event.delta },
        }];

      case AgentEventTypes.ToolCalls:
        // Map each tool call to a tool_call update
        return event.toolCalls.map((toolCall) => ({
          sessionUpdate: 'tool_call',
          toolCallId: toolCall.id,
          title: toolCall.function.name,
          kind: this.mapToolKind(toolCall.function.name),
          status: 'pending',
          rawInput: this.safeParseJson(toolCall.function.arguments),
        }));

      case AgentEventTypes.ToolResult:
        return [{
          sessionUpdate: 'tool_call_update',
          toolCallId: event.result.id,
          status: event.result.status === 'success' ? 'completed' : 'failed',
          content: [{
            type: 'content',
            content: { type: 'text', text: this.formatToolResult(event.result) },
          }],
        }];

      default:
        return [];
    }
  }

  private formatToolResult(result: {
    status: 'success' | 'error';
    type?: 'text' | 'json';
    result: string | Record<string, unknown> | unknown[];
  }): string {
    if (typeof result.result === 'string') {
      return result.result;
    }
    return JSON.stringify(result.result, null, 2);
  }

  private mapToolKind(toolName: string): ToolKind {
    const kindMap: Record<string, ToolKind> = {
      file_read: 'read',
      file_edit: 'edit',
      file_new: 'edit',
      bash_tool: 'execute',
      grep_tool: 'search',
      glob_tool: 'search',
      ls_tool: 'read',
      web_search: 'fetch',
      web_fetch: 'fetch',
    };
    return kindMap[toolName] ?? 'other';
  }

  private safeParseJson(str: string): unknown {
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  }
}
