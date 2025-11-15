import { EventEmitter } from 'node:events';
import type { MessageLine, MessageMetadata } from '@/adapters/index.js';
import type { ToolCall } from '@nuvin/nuvin-core';

type EventMap = {
  'ui:line': MessageLine;
  'ui:lastMetadata': MessageMetadata | null;
  'ui:error': string;
  'ui:toolApprovalRequired': {
    toolCalls: ToolCall[];
    approvalId: string;
    conversationId: string;
    messageId: string;
  };
  'ui:keyboard:ctrlc': undefined;
  'ui:keyboard:paste': undefined;
  'ui:keyboard:explainToggle': string;
  'ui:input:toggleVimMode': undefined;
  'ui:history:selected': {
    sessionId: string;
    timestamp: string;
    lastMessage: string;
    messageCount: number;
  };
  'ui:lines:clear': undefined;
  'ui:lines:set': MessageLine[];
  'ui:clear:complete': undefined;
  'ui:new:conversation': { memPersist: boolean };
  'ui:mcp:toolPermissionChanged': { serverId: string; toolName: string; allowed: boolean };
  'ui:mcp:batchToolPermissionChanged': { serverId: string; config: Record<string, Record<string, boolean>> };
  'ui:header:refresh': undefined;
  'command:sudo:toggle': string;
  'ui:command:activated': string;
  'ui:command:deactivated': string;
};

export class TypedEventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Increase max listeners to accommodate multiple components using useStdoutDimensions
    this.emitter.setMaxListeners(30);
  }

  on<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void) {
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
