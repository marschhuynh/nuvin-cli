import { EventEmitter } from 'node:events';
import type { MessageLine } from '@/adapters/index.js';
import type { ToolCall, AgentEvent } from '@nuvin/nuvin-core';
import type { Diagnostic } from 'vscode-languageserver-types';

export type LspServerStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface LspStatusInfo {
  serverId: string;
  status: LspServerStatus;
  root?: string;
}

type EventMap = {
  'ui:line': MessageLine;
  'ui:error': string;
  'ui:toolCalls': {
    toolCalls: ToolCall[];
  };
  'ui:keyboard:ctrlc': undefined;
  'ui:keyboard:paste': undefined;
  'ui:focus:cycle': 'forward' | 'backward';
  'ui:input:toggleVimMode': undefined;
  'ui:input:edit': { content: string };
  'ui:input:retry': { content: string };
  'ui:history:selected': {
    sessionId: string;
    timestamp: string;
    lastMessage: string;
    messageCount: number;
  };
  'ui:lines:clear': undefined;
  'ui:lines:set': MessageLine[];
  'ui:clear:complete': undefined;
  'ui:exit:start': undefined;
  'conversation:created': { memPersist: boolean };
  'ui:mcp:toolPermissionChanged': { serverId: string; toolName: string; allowed: boolean };
  'ui:mcp:batchToolPermissionChanged': { serverId: string; config: Record<string, Record<string, boolean>> };
  'mcp:serversChanged': undefined;
  'ui:header:refresh': undefined;
  'command:sudo:toggle': string;
  'ui:command:activated': string;
  'ui:command:deactivated': string;
  'ui:commands:refresh': undefined;
  'custom-command:execute': {
    commandId: string;
    renderedPrompt: string;
    userInput: string;
    onComplete?: () => void;
    onError?: (error: Error) => void;
  };
  'lsp:status': LspStatusInfo;
  'lsp:diagnostics': { path: string; serverId: string; diagnostics: Diagnostic[] };
  'agent:event': AgentEvent;
  'agent:swapped': {
    type: 'agent:swapped';
    previousAgentId: string;
    agentId: string;
    agentName: string;
    timestamp: string;
  };
};

export class TypedEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(30);
  }

  on<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void | Promise<void>) {
    this.emitter.on(event, handler);
  }

  off<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void) {
    this.emitter.off(event, handler);
  }

  once<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void) {
    this.emitter.once(event, handler);
  }

  emit<K extends keyof EventMap>(event: K, payload?: EventMap[K]) {
    this.emitter.emit(event, payload);
  }
}

export const eventBus = new TypedEventBus();
