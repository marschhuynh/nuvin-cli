import { EventEmitter } from 'node:events';
import type { MessageLine, MessageMetadata } from '@/adapters/index.js';

type EventMap = {
  'ui:line': MessageLine;
  'ui:lastMetadata': MessageMetadata | null;
  'ui:error': string;
  'ui:toolApprovalRequired': {
    toolCalls: unknown[];
    approvalId: string;
    conversationId: string;
    messageId: string;
  };
  // Stdout events
  'ui:stdout:resize': { cols: number; rows: number };
  // Keyboard intents (emitted by hooks, handled in App)
  'ui:keyboard:ctrlc': undefined;
  'ui:keyboard:help': undefined;
  'ui:keyboard:paste': undefined;
  // Input area events
  'ui:input:clear': undefined;
  'ui:input:setForRecall': { value: string };
  'ui:input:append': string;
  'ui:input:toggleVimMode': undefined;
  'ui:input:vimModeChanged': 'insert' | 'normal';
  'ui:help:close': string;
  'ui:history:selected': {
    sessionId: string;
    timestamp: string;
    lastMessage: string;
    messageCount: number;
  };
  'ui:history:close': string;
  'ui:lines:clear': undefined;
  'ui:lines:set': MessageLine[];
  'ui:clear:complete': undefined;
  'ui:new:conversation': { memPersist: boolean };
  'ui:thinking:set': boolean;
  'ui:mcp:toolPermissionChanged': { serverId: string; toolName: string; allowed: boolean };
  'ui:mcp:batchToolPermissionChanged': { serverId: string; config: Record<string, Record<string, boolean>> };
  'ui:mcp:close': undefined;
  'ui:header:refresh': undefined;

  // Auth modal flow
  'ui:auth:close': undefined;
  'ui:auth:github:device': undefined;
  'ui:auth:token:prompt': { provider: 'github' | 'openrouter' | 'zai' };
  'ui:auth:token:submit': {
    provider: 'github' | 'openrouter' | 'zai' | 'echo';
    token: string;
    method: 'token' | 'device-flow';
  };

  // GitHub login modal flow
  'ui:loginGithub:start': undefined; // deprecated, avoid duplicate show
  'ui:loginGithub:show': { userCode: string; verificationUri: string };
  'ui:loginGithub:success': undefined;
  'ui:loginGithub:error': { error: string };
  'ui:loginGithub:close': undefined;

  'orchestrator:ready': {
    orchestrator: unknown | null;
    memory: unknown | null;
    providerDisplay: string;
    model: string;
    sessionId: string | null;
    sessionDir: string | null;
  };
  'orchestrator:error': string;
  'command:sudo:toggle': string;
};

export class TypedEventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Increase max listeners to accommodate multiple components using useStdoutDimensions
    this.emitter.setMaxListeners(30);
  }

  on<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void) {
    this.emitter.on(event as string, handler);
  }

  off<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void) {
    this.emitter.off(event as string, handler);
  }

  once<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void) {
    this.emitter.once(event as string, handler);
  }

  emit<K extends keyof EventMap>(event: K, payload?: EventMap[K]) {
    this.emitter.emit(event as string, payload);
  }
}

export const eventBus = new TypedEventBus();
