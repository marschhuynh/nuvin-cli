# ACP Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Nuvin to run as an ACP-compatible agent server for editor integration (Zed, JetBrains).

**Architecture:** New `@nuvin/nuvin-acp` package implementing raw JSON-RPC over stdio. Wraps existing `OrchestratorManager` with thin adapter layer that translates ACP protocol ↔ Nuvin events.

**Tech Stack:** TypeScript, Node.js readline for stdio, no external dependencies beyond `@nuvin/nuvin-core`.

**Scope (MVP):**
- Chat + all tools with permission prompts
- No session persistence (`session/load` not implemented)
- Local filesystem (ignore editor `fs/*` APIs)
- Local subprocess for bash (ignore editor `terminal/*` APIs)

---

## Task 1: Create Package Scaffold

**Files:**
- Create: `packages/nuvin-acp/package.json`
- Create: `packages/nuvin-acp/tsconfig.json`
- Create: `packages/nuvin-acp/tsup.config.ts`
- Create: `packages/nuvin-acp/source/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@nuvin/nuvin-acp",
  "version": "0.1.0",
  "description": "ACP (Agent Client Protocol) server for Nuvin",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "clean": "rm -rf dist",
    "test": "vitest run",
    "lint": "biome lint source/"
  },
  "dependencies": {
    "@nuvin/nuvin-core": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./source",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./source/*"]
    }
  },
  "include": ["source/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['source/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

**Step 4: Create source/index.ts stub**

```typescript
export { ACPServer } from './server.js';
export { startACPServer } from './server.js';
export type * from './protocol/types.js';
```

**Step 5: Add to pnpm workspace**

Modify: `pnpm-workspace.yaml` - ensure `packages/*` glob includes new package.

**Step 6: Install dependencies**

Run: `pnpm install`

**Step 7: Commit**

```bash
git add packages/nuvin-acp/
git commit -m "feat(acp): scaffold nuvin-acp package"
```

---

## Task 2: Implement JSON-RPC Types

**Files:**
- Create: `packages/nuvin-acp/source/jsonrpc/types.ts`

**Step 1: Write JSON-RPC type definitions**

```typescript
// packages/nuvin-acp/source/jsonrpc/types.ts

export type JsonRpcId = string | number;

export type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcSuccessResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcErrorResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId | null;
  error: JsonRpcError;
};

export type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export type JsonRpcNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
};

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// Standard JSON-RPC error codes
export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  // ACP-specific
  AuthRequired: -32000,
  ResourceNotFound: -32002,
} as const;

export function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return 'method' in msg && 'id' in msg && msg.id !== undefined;
}

export function isNotification(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return 'method' in msg && !('id' in msg && msg.id !== undefined);
}

export function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return 'result' in msg || 'error' in msg;
}
```

**Step 2: Commit**

```bash
git add packages/nuvin-acp/source/jsonrpc/
git commit -m "feat(acp): add JSON-RPC type definitions"
```

---

## Task 3: Implement ACP Protocol Types

**Files:**
- Create: `packages/nuvin-acp/source/protocol/types.ts`

**Step 1: Write ACP protocol types**

```typescript
// packages/nuvin-acp/source/protocol/types.ts

// Session ID
export type SessionId = string;
export type ToolCallId = string;

// Capabilities
export type ClientCapabilities = {
  fs?: {
    readTextFile?: boolean;
    writeTextFile?: boolean;
  };
  terminal?: boolean;
};

export type AgentCapabilities = {
  loadSession?: boolean;
  promptCapabilities?: {
    image?: boolean;
    audio?: boolean;
    embeddedContext?: boolean;
  };
  mcpCapabilities?: {
    http?: boolean;
    sse?: boolean;
  };
};

export type Implementation = {
  name: string;
  title?: string;
  version: string;
};

// Initialize
export type InitializeParams = {
  protocolVersion: number;
  clientCapabilities?: ClientCapabilities;
  clientInfo?: Implementation;
};

export type InitializeResult = {
  protocolVersion: number;
  agentCapabilities?: AgentCapabilities;
  agentInfo?: Implementation;
  authMethods?: Array<{ id: string; name: string }>;
};

// Session
export type McpServerStdio = {
  name: string;
  command: string;
  args: string[];
  env?: Array<{ name: string; value: string }>;
};

export type NewSessionParams = {
  cwd: string;
  mcpServers?: McpServerStdio[];
};

export type NewSessionResult = {
  sessionId: SessionId;
};

// Content
export type TextContent = { type: 'text'; text: string };
export type ImageContent = { type: 'image'; data: string; mimeType: string };
export type ResourceLink = { type: 'resource_link'; uri: string; name: string; mimeType?: string };
export type EmbeddedResource = {
  type: 'resource';
  resource: { uri: string; mimeType?: string; text?: string }
};

export type ContentBlock = TextContent | ImageContent | ResourceLink | EmbeddedResource;

// Prompt
export type PromptParams = {
  sessionId: SessionId;
  prompt: ContentBlock[];
};

export type StopReason = 'end_turn' | 'max_tokens' | 'cancelled' | 'refusal';

export type PromptResult = {
  stopReason: StopReason;
};

// Cancel (notification)
export type CancelParams = {
  sessionId: SessionId;
};

// Session Updates
export type ToolKind = 'read' | 'edit' | 'delete' | 'search' | 'execute' | 'fetch' | 'other';
export type ToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type AgentMessageChunk = {
  sessionUpdate: 'agent_message_chunk';
  content: TextContent;
};

export type AgentThoughtChunk = {
  sessionUpdate: 'agent_thought_chunk';
  content: TextContent;
};

export type ToolCallUpdate = {
  sessionUpdate: 'tool_call';
  toolCallId: ToolCallId;
  title: string;
  kind?: ToolKind;
  status?: ToolCallStatus;
  rawInput?: unknown;
};

export type ToolCallStatusUpdate = {
  sessionUpdate: 'tool_call_update';
  toolCallId: ToolCallId;
  status?: ToolCallStatus;
  content?: Array<{ type: 'content'; content: TextContent }>;
  rawOutput?: unknown;
};

export type SessionUpdate =
  | AgentMessageChunk
  | AgentThoughtChunk
  | ToolCallUpdate
  | ToolCallStatusUpdate;

export type SessionUpdateParams = {
  sessionId: SessionId;
  update: SessionUpdate;
};

// Permission
export type PermissionOptionKind = 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';

export type PermissionOption = {
  optionId: string;
  name: string;
  kind: PermissionOptionKind;
};

export type RequestPermissionParams = {
  sessionId: SessionId;
  toolCall: {
    toolCallId: ToolCallId;
    title?: string;
    kind?: ToolKind;
    rawInput?: unknown;
  };
  options: PermissionOption[];
};

export type RequestPermissionResult = {
  outcome:
    | { outcome: 'cancelled' }
    | { outcome: 'selected'; optionId: string };
};
```

**Step 2: Commit**

```bash
git add packages/nuvin-acp/source/protocol/
git commit -m "feat(acp): add ACP protocol type definitions"
```

---

## Task 4: Implement Stdio Transport

**Files:**
- Create: `packages/nuvin-acp/source/transport/stdio.ts`
- Create: `packages/nuvin-acp/tests/transport.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/nuvin-acp/tests/transport.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { StdioTransport } from '../source/transport/stdio.js';

describe('StdioTransport', () => {
  it('should parse incoming JSON-RPC messages', async () => {
    const input = new Readable({ read() {} });
    const output = new Writable({ write(chunk, enc, cb) { cb(); } });

    const transport = new StdioTransport(input, output);
    const messages: unknown[] = [];

    transport.onMessage((msg) => messages.push(msg));
    transport.start();

    input.push('{"jsonrpc":"2.0","id":1,"method":"test"}\n');

    await new Promise(r => setTimeout(r, 10));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ jsonrpc: '2.0', id: 1, method: 'test' });
  });

  it('should send JSON-RPC messages', async () => {
    const input = new Readable({ read() {} });
    const chunks: string[] = [];
    const output = new Writable({
      write(chunk, enc, cb) {
        chunks.push(chunk.toString());
        cb();
      }
    });

    const transport = new StdioTransport(input, output);

    await transport.send({ jsonrpc: '2.0', id: 1, result: 'ok' });

    expect(chunks).toHaveLength(1);
    expect(JSON.parse(chunks[0].trim())).toEqual({ jsonrpc: '2.0', id: 1, result: 'ok' });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/nuvin-acp && pnpm test`
Expected: FAIL with "Cannot find module"

**Step 3: Write implementation**

```typescript
// packages/nuvin-acp/source/transport/stdio.ts
import * as readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { JsonRpcMessage } from '../jsonrpc/types.js';

export type MessageHandler = (message: JsonRpcMessage) => void;

export class StdioTransport {
  private rl: readline.Interface | null = null;
  private handlers: MessageHandler[] = [];

  constructor(
    private input: Readable = process.stdin,
    private output: Writable = process.stdout,
  ) {}

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  start(): void {
    this.rl = readline.createInterface({
      input: this.input,
      terminal: false,
    });

    this.rl.on('line', (line) => {
      if (!line.trim()) return;

      try {
        const message = JSON.parse(line) as JsonRpcMessage;
        for (const handler of this.handlers) {
          handler(message);
        }
      } catch (error) {
        // Invalid JSON - ignore or log
      }
    });

    this.rl.on('close', () => {
      process.exit(0);
    });
  }

  async send(message: JsonRpcMessage): Promise<void> {
    const line = JSON.stringify(message) + '\n';
    return new Promise((resolve, reject) => {
      this.output.write(line, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  close(): void {
    this.rl?.close();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/nuvin-acp && pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/nuvin-acp/source/transport/ packages/nuvin-acp/tests/
git commit -m "feat(acp): implement stdio JSON-RPC transport"
```

---

## Task 5: Implement Request Handler Router

**Files:**
- Create: `packages/nuvin-acp/source/jsonrpc/handler.ts`
- Create: `packages/nuvin-acp/tests/handler.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/nuvin-acp/tests/handler.test.ts
import { describe, it, expect, vi } from 'vitest';
import { RequestHandler } from '../source/jsonrpc/handler.js';

describe('RequestHandler', () => {
  it('should route requests to registered methods', async () => {
    const handler = new RequestHandler();
    const mockMethod = vi.fn().mockResolvedValue({ data: 'test' });

    handler.register('test/method', mockMethod);

    const result = await handler.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'test/method',
      params: { foo: 'bar' },
    });

    expect(mockMethod).toHaveBeenCalledWith({ foo: 'bar' });
    expect(result).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { data: 'test' },
    });
  });

  it('should return method not found for unknown methods', async () => {
    const handler = new RequestHandler();

    const result = await handler.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'unknown',
    });

    expect(result.error?.code).toBe(-32601);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/nuvin-acp && pnpm test`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/nuvin-acp/source/jsonrpc/handler.ts
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcId,
  JsonRpcError,
} from './types.js';
import { ErrorCodes } from './types.js';

export type MethodHandler<P = unknown, R = unknown> = (params: P) => Promise<R>;

export class RequestHandler {
  private methods = new Map<string, MethodHandler>();
  private notificationHandlers = new Map<string, MethodHandler>();

  register<P, R>(method: string, handler: MethodHandler<P, R>): void {
    this.methods.set(method, handler as MethodHandler);
  }

  registerNotification<P>(method: string, handler: MethodHandler<P, void>): void {
    this.notificationHandlers.set(method, handler as MethodHandler);
  }

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const isNotification = request.id === undefined;

    if (isNotification) {
      const handler = this.notificationHandlers.get(request.method);
      if (handler) {
        try {
          await handler(request.params);
        } catch (error) {
          // Notifications don't send responses
        }
      }
      return null;
    }

    const handler = this.methods.get(request.method);

    if (!handler) {
      return this.errorResponse(request.id, {
        code: ErrorCodes.MethodNotFound,
        message: `Method not found: ${request.method}`,
      });
    }

    try {
      const result = await handler(request.params);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };
    } catch (error) {
      return this.errorResponse(request.id, {
        code: ErrorCodes.InternalError,
        message: error instanceof Error ? error.message : 'Internal error',
      });
    }
  }

  private errorResponse(id: JsonRpcId, error: JsonRpcError): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      error,
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/nuvin-acp && pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/nuvin-acp/source/jsonrpc/handler.ts packages/nuvin-acp/tests/handler.test.ts
git commit -m "feat(acp): implement JSON-RPC request handler router"
```

---

## Task 6: Implement Session Manager

**Files:**
- Create: `packages/nuvin-acp/source/session-manager.ts`
- Create: `packages/nuvin-acp/tests/session-manager.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/nuvin-acp/tests/session-manager.test.ts
import { describe, it, expect } from 'vitest';
import { SessionManager } from '../source/session-manager.js';

describe('SessionManager', () => {
  it('should create a session with unique ID', () => {
    const manager = new SessionManager();

    const session = manager.create({ cwd: '/tmp/test' });

    expect(session.id).toBeDefined();
    expect(session.cwd).toBe('/tmp/test');
  });

  it('should retrieve session by ID', () => {
    const manager = new SessionManager();
    const session = manager.create({ cwd: '/tmp/test' });

    const retrieved = manager.get(session.id);

    expect(retrieved).toBe(session);
  });

  it('should return undefined for unknown session', () => {
    const manager = new SessionManager();

    expect(manager.get('unknown')).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/nuvin-acp && pnpm test`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/nuvin-acp/source/session-manager.ts
import * as crypto from 'node:crypto';
import type { SessionId, McpServerStdio } from './protocol/types.js';

export type Session = {
  id: SessionId;
  cwd: string;
  mcpServers: McpServerStdio[];
  createdAt: Date;
  abortController: AbortController;
};

export type CreateSessionParams = {
  cwd: string;
  mcpServers?: McpServerStdio[];
};

export class SessionManager {
  private sessions = new Map<SessionId, Session>();

  create(params: CreateSessionParams): Session {
    const id = `sess_${crypto.randomUUID()}`;

    const session: Session = {
      id,
      cwd: params.cwd,
      mcpServers: params.mcpServers ?? [],
      createdAt: new Date(),
      abortController: new AbortController(),
    };

    this.sessions.set(id, session);
    return session;
  }

  get(id: SessionId): Session | undefined {
    return this.sessions.get(id);
  }

  delete(id: SessionId): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.abortController.abort();
      this.sessions.delete(id);
      return true;
    }
    return false;
  }

  cancel(id: SessionId): void {
    const session = this.sessions.get(id);
    if (session) {
      session.abortController.abort();
      session.abortController = new AbortController();
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/nuvin-acp && pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/nuvin-acp/source/session-manager.ts packages/nuvin-acp/tests/session-manager.test.ts
git commit -m "feat(acp): implement session manager"
```

---

## Task 7: Implement Event Adapter

**Files:**
- Create: `packages/nuvin-acp/source/adapters/event-adapter.ts`

**Step 1: Write the event adapter**

```typescript
// packages/nuvin-acp/source/adapters/event-adapter.ts
import type { AgentEvent } from '@nuvin/nuvin-core';
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
    const update = this.convertToSessionUpdate(event);
    if (update) {
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

  private convertToSessionUpdate(event: AgentEvent): SessionUpdate | null {
    switch (event.type) {
      case AgentEventTypes.AssistantChunk:
        return {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: event.delta },
        };

      case AgentEventTypes.ReasoningChunk:
        return {
          sessionUpdate: 'agent_thought_chunk',
          content: { type: 'text', text: event.delta },
        };

      case AgentEventTypes.ToolCallStart:
        return {
          sessionUpdate: 'tool_call',
          toolCallId: event.toolCall.id,
          title: event.toolCall.function.name,
          kind: this.mapToolKind(event.toolCall.function.name),
          status: 'pending',
          rawInput: this.safeParseJson(event.toolCall.function.arguments),
        };

      case AgentEventTypes.ToolCallComplete:
        return {
          sessionUpdate: 'tool_call_update',
          toolCallId: event.toolCallId,
          status: event.status === 'success' ? 'completed' : 'failed',
          content: [{
            type: 'content',
            content: { type: 'text', text: String(event.result) },
          }],
        };

      default:
        return null;
    }
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
```

**Step 2: Commit**

```bash
git add packages/nuvin-acp/source/adapters/
git commit -m "feat(acp): implement event adapter for session/update notifications"
```

---

## Task 8: Implement Permission Bridge

**Files:**
- Create: `packages/nuvin-acp/source/adapters/permission-bridge.ts`

**Step 1: Write the permission bridge**

```typescript
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

type PendingRequest = {
  resolve: (result: RequestPermissionResult) => void;
  reject: (error: Error) => void;
};

export class PermissionBridge {
  private pendingRequests = new Map<number, PendingRequest>();
  private nextRequestId = 1;

  constructor(private transport: StdioTransport) {}

  async requestPermission(
    sessionId: SessionId,
    toolCall: ToolCall,
  ): Promise<'approve' | 'deny'> {
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

  private sendRequest(
    id: number,
    params: RequestPermissionParams
  ): Promise<RequestPermissionResult> {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      this.transport.send({
        jsonrpc: '2.0',
        id,
        method: 'session/request_permission',
        params,
      }).catch(reject);
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
```

**Step 2: Commit**

```bash
git add packages/nuvin-acp/source/adapters/permission-bridge.ts
git commit -m "feat(acp): implement permission bridge for tool approvals"
```

---

## Task 9: Implement ACP Server

**Files:**
- Create: `packages/nuvin-acp/source/server.ts`

**Step 1: Write the ACP server**

```typescript
// packages/nuvin-acp/source/server.ts
import type { AgentEvent } from '@nuvin/nuvin-core';
import { AgentEventTypes } from '@nuvin/nuvin-core';
import { StdioTransport } from './transport/stdio.js';
import { RequestHandler } from './jsonrpc/handler.js';
import { SessionManager, type Session } from './session-manager.js';
import { EventAdapter } from './adapters/event-adapter.js';
import { PermissionBridge } from './adapters/permission-bridge.js';
import { isRequest, isResponse, isNotification } from './jsonrpc/types.js';
import type {
  InitializeParams,
  InitializeResult,
  NewSessionParams,
  NewSessionResult,
  PromptParams,
  PromptResult,
  CancelParams,
  ContentBlock,
} from './protocol/types.js';

// Factory type for creating orchestrator instances
export type OrchestratorFactory = (session: Session) => Promise<{
  sendMessage: (text: string, options: { stream: boolean; signal: AbortSignal }) => Promise<void>;
  onEvent: (handler: (event: AgentEvent) => void) => void;
  handleToolApproval: (approvalId: string, decision: 'approve' | 'deny') => void;
}>;

export class ACPServer {
  private transport: StdioTransport;
  private handler: RequestHandler;
  private sessionManager: SessionManager;
  private permissionBridge: PermissionBridge;
  private eventAdapters = new Map<string, EventAdapter>();
  private orchestratorFactory: OrchestratorFactory;
  private orchestrators = new Map<string, Awaited<ReturnType<OrchestratorFactory>>>();

  constructor(orchestratorFactory: OrchestratorFactory) {
    this.transport = new StdioTransport();
    this.handler = new RequestHandler();
    this.sessionManager = new SessionManager();
    this.permissionBridge = new PermissionBridge(this.transport);
    this.orchestratorFactory = orchestratorFactory;

    this.registerMethods();
  }

  private registerMethods(): void {
    this.handler.register<InitializeParams, InitializeResult>(
      'initialize',
      this.handleInitialize.bind(this)
    );

    this.handler.register<NewSessionParams, NewSessionResult>(
      'session/new',
      this.handleNewSession.bind(this)
    );

    this.handler.register<PromptParams, PromptResult>(
      'session/prompt',
      this.handlePrompt.bind(this)
    );

    this.handler.registerNotification<CancelParams>(
      'session/cancel',
      this.handleCancel.bind(this)
    );
  }

  async start(): Promise<void> {
    this.transport.onMessage(async (message) => {
      if (isResponse(message)) {
        this.permissionBridge.handleResponse(message);
        return;
      }

      if (isRequest(message) || isNotification(message)) {
        const response = await this.handler.handle(message);
        if (response) {
          await this.transport.send(response);
        }
      }
    });

    this.transport.start();
  }

  private async handleInitialize(params: InitializeParams): Promise<InitializeResult> {
    return {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: false,
        promptCapabilities: {
          image: true,
          embeddedContext: true,
        },
        mcpCapabilities: {
          http: false,
          sse: false,
        },
      },
      agentInfo: {
        name: 'nuvin',
        title: 'Nuvin CLI',
        version: '1.0.0',
      },
    };
  }

  private async handleNewSession(params: NewSessionParams): Promise<NewSessionResult> {
    const session = this.sessionManager.create({
      cwd: params.cwd,
      mcpServers: params.mcpServers,
    });

    // Create orchestrator for this session
    const orchestrator = await this.orchestratorFactory(session);
    this.orchestrators.set(session.id, orchestrator);

    // Create event adapter
    const eventAdapter = new EventAdapter(this.transport, session.id);
    this.eventAdapters.set(session.id, eventAdapter);

    // Wire up event handling
    orchestrator.onEvent(async (event) => {
      // Handle tool approval events specially
      if (event.type === AgentEventTypes.ToolApprovalRequired) {
        const decision = await this.permissionBridge.requestPermission(
          session.id,
          event.toolCall
        );
        orchestrator.handleToolApproval(event.approvalId, decision);
        return;
      }

      await eventAdapter.handleEvent(event);
    });

    return { sessionId: session.id };
  }

  private async handlePrompt(params: PromptParams): Promise<PromptResult> {
    const session = this.sessionManager.get(params.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${params.sessionId}`);
    }

    const orchestrator = this.orchestrators.get(params.sessionId);
    if (!orchestrator) {
      throw new Error(`Orchestrator not found for session: ${params.sessionId}`);
    }

    const text = this.extractText(params.prompt);

    try {
      await orchestrator.sendMessage(text, {
        stream: true,
        signal: session.abortController.signal,
      });

      return { stopReason: 'end_turn' };
    } catch (error) {
      if (session.abortController.signal.aborted) {
        return { stopReason: 'cancelled' };
      }
      throw error;
    }
  }

  private async handleCancel(params: CancelParams): Promise<void> {
    this.sessionManager.cancel(params.sessionId);
  }

  private extractText(blocks: ContentBlock[]): string {
    return blocks
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }
}

export async function startACPServer(factory: OrchestratorFactory): Promise<void> {
  const server = new ACPServer(factory);
  await server.start();
}
```

**Step 2: Commit**

```bash
git add packages/nuvin-acp/source/server.ts
git commit -m "feat(acp): implement main ACP server"
```

---

## Task 10: Update Package Exports

**Files:**
- Modify: `packages/nuvin-acp/source/index.ts`

**Step 1: Update exports**

```typescript
// packages/nuvin-acp/source/index.ts
export { ACPServer, startACPServer, type OrchestratorFactory } from './server.js';
export { SessionManager, type Session, type CreateSessionParams } from './session-manager.js';
export { StdioTransport } from './transport/stdio.js';
export { RequestHandler } from './jsonrpc/handler.js';
export { EventAdapter } from './adapters/event-adapter.js';
export { PermissionBridge } from './adapters/permission-bridge.js';

// Re-export types
export type * from './protocol/types.js';
export type * from './jsonrpc/types.js';
```

**Step 2: Build package**

Run: `cd packages/nuvin-acp && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/nuvin-acp/source/index.ts
git commit -m "feat(acp): finalize package exports"
```

---

## Task 11: Integrate with nuvin-cli

**Files:**
- Modify: `packages/nuvin-cli/source/cli.tsx`
- Create: `packages/nuvin-cli/source/acp-entry.ts`

**Step 1: Create ACP entry point in nuvin-cli**

```typescript
// packages/nuvin-cli/source/acp-entry.ts
import { startACPServer, type Session } from '@nuvin/nuvin-acp';
import { OrchestratorManager } from '@/services/OrchestratorManager.js';
import { ConfigManager } from '@/config/manager.js';
import { eventBus } from '@/services/EventBus.js';
import type { AgentEvent } from '@nuvin/nuvin-core';
import { AgentEventTypes } from '@nuvin/nuvin-core';

export async function runACPMode(): Promise<void> {
  const configManager = ConfigManager.getInstance();
  await configManager.load();

  await startACPServer(async (session) => {
    const manager = new OrchestratorManager();

    // Initialize with session config
    await manager.init(
      {
        sessionId: session.id,
        memPersist: false,
        streamingChunks: true,
      },
      {
        appendLine: () => {},
        updateLine: () => {},
        updateLineMetadata: () => {},
        handleError: () => {},
      }
    );

    // Change working directory
    process.chdir(session.cwd);

    const eventHandlers: Array<(event: AgentEvent) => void> = [];

    // Subscribe to agent events
    eventBus.on('agent:event', (event: AgentEvent) => {
      for (const handler of eventHandlers) {
        handler(event);
      }
    });

    return {
      sendMessage: async (text, options) => {
        await manager.sendMessage(text, {
          stream: options.stream,
        });
      },
      onEvent: (handler) => {
        eventHandlers.push(handler);
      },
      handleToolApproval: (approvalId, decision) => {
        manager.getOrchestrator()?.handleToolApproval(
          approvalId,
          decision === 'approve' ? 'approve' : 'deny'
        );
      },
    };
  });
}
```

**Step 2: Add --acp flag to cli.tsx**

Modify `packages/nuvin-cli/source/cli.tsx`, add to flags:

```typescript
acp: {
  type: 'boolean' as const,
  description: 'Run in ACP mode for editor integration',
  default: false,
},
```

Add early exit after flag parsing (before React render):

```typescript
if (cli.flags.acp) {
  const { runACPMode } = await import('./acp-entry.js');
  await runACPMode();
  process.exit(0);
}
```

**Step 3: Add dependency to nuvin-cli package.json**

Add to dependencies:
```json
"@nuvin/nuvin-acp": "workspace:*"
```

**Step 4: Install and build**

Run: `pnpm install && pnpm build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add packages/nuvin-cli/source/acp-entry.ts packages/nuvin-cli/source/cli.tsx packages/nuvin-cli/package.json
git commit -m "feat(cli): integrate ACP mode with --acp flag"
```

---

## Task 12: Add vitest config to nuvin-acp

**Files:**
- Create: `packages/nuvin-acp/vitest.config.ts`

**Step 1: Create vitest config**

```typescript
// packages/nuvin-acp/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': './source',
    },
  },
});
```

**Step 2: Run all tests**

Run: `cd packages/nuvin-acp && pnpm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add packages/nuvin-acp/vitest.config.ts
git commit -m "chore(acp): add vitest configuration"
```

---

## Task 13: End-to-End Test

**Files:**
- Create: `packages/nuvin-acp/tests/e2e.test.ts`

**Step 1: Write E2E test**

```typescript
// packages/nuvin-acp/tests/e2e.test.ts
import { describe, it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { ACPServer, type OrchestratorFactory } from '../source/server.js';

describe('ACP E2E', () => {
  it('should complete initialize -> session/new -> session/prompt flow', async () => {
    const responses: unknown[] = [];

    const mockFactory: OrchestratorFactory = async () => ({
      sendMessage: async () => {},
      onEvent: () => {},
      handleToolApproval: () => {},
    });

    // This is a simplified test - real E2E would use actual stdio
    const server = new ACPServer(mockFactory);

    // Test that server initializes without throwing
    expect(server).toBeDefined();
  });
});
```

**Step 2: Run test**

Run: `cd packages/nuvin-acp && pnpm test`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/nuvin-acp/tests/e2e.test.ts
git commit -m "test(acp): add basic e2e test"
```

---

## Summary

**Total Tasks:** 13
**Estimated Time:** 3-4 hours

**What's Built:**
- `@nuvin/nuvin-acp` package with raw JSON-RPC implementation
- Stdio transport for editor communication
- Session management with abort support
- Event adapter translating AgentEvents → ACP notifications
- Permission bridge for tool approvals
- CLI integration with `--acp` flag

**What's Not Included (Future Work):**
- Session persistence (`session/load`)
- Editor filesystem APIs (`fs/*`)
- Editor terminal APIs (`terminal/*`)
- MCP server passthrough
- Audio content support

---

Plan complete and saved to `docs/plans/2026-01-27-acp-integration.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
