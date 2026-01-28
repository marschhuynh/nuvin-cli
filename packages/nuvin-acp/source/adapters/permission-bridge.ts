// packages/nuvin-acp/source/adapters/permission-bridge.ts
import type { ToolCall } from '@nuvin/nuvin-core';
import type {
  SessionId,
  ToolKind,
  RequestPermissionParams,
  RequestPermissionResult,
  PermissionOption,
} from '../protocol/types.js';
import type { StdioTransport } from '../transport/stdio.js';
import type { JsonRpcResponse } from '../jsonrpc/types.js';
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const logsDir = join(homedir(), '.nuvin', 'logs');
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}
type PendingRequest = {
  resolve: (value: RequestPermissionResult | PromiseLike<RequestPermissionResult>) => void;
  reject: (reason?: Error) => void;
};

export class PermissionBridge {
  private pendingRequests = new Map<number, PendingRequest>();
  private nextRequestId = 1;

  constructor(private transport: StdioTransport) {}

  async requestPermission(sessionId: SessionId, toolCall: ToolCall): Promise<'approve' | 'approve_always' | 'deny'> {
    const requestId = this.nextRequestId++;

    const params: RequestPermissionParams = {
      sessionId,
      toolCall: {
        toolCallId: toolCall.id,
        title: toolCall.function.name,
        kind: this.mapToolKind(toolCall.function.name),
        rawInput: this.safeParseJson(toolCall.function.arguments),
      },
      options: this.getDefaultOptions(),
    };

    const result = await this.sendRequest(requestId, params);

    if (result.outcome.outcome === 'selected') {
      if (result.outcome.optionId === 'allow-always') {
        return 'approve_always';
      }
      return result.outcome.optionId.startsWith('allow') ? 'approve' : 'deny';
    }

    return 'deny'; // Cancelled
  }

  handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id as number);
    if (!pending) return;

    this.pendingRequests.delete(response.id as number);

    if ('error' in response) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result as RequestPermissionResult);
    }
  }

  private sendRequest(id: number, params: RequestPermissionParams): Promise<RequestPermissionResult> {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      this.transport
        .send({
          jsonrpc: '2.0',
          id,
          method: 'session/request_permission',
          params,
        })
        .catch(reject);
    });
  }

  private getDefaultOptions(): PermissionOption[] {
    return [
      { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
      { optionId: 'allow-always', name: 'Allow always', kind: 'allow_always' },
      { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
    ];
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
