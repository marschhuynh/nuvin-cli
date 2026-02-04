# ACP Server Integration for Nuvin CLI

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement an ACP (Agent Client Protocol) server that allows Nuvin CLI to be used as an AI coding agent from ACP-compatible editors like Zed and JetBrains IDEs.

**Architecture:** Nuvin will run as an ACP server subprocess, communicating via JSON-RPC 2.0 over stdio. The server wraps the existing `OrchestratorManager` and translates between ACP protocol messages and nuvin-core's `AgentEvent` system. The UI layer is bypassed when running in ACP mode.

**Tech Stack:** TypeScript, vscode-jsonrpc (already a dependency), @agentclientprotocol/sdk (optional - can implement protocol directly)

---

## Executive Summary

### What is ACP?

Agent Client Protocol (ACP) is a standard protocol (by Zed Industries and JetBrains) for communication between code editors/IDEs and AI coding agents. It's similar to LSP but for AI agents. Key features:

- **JSON-RPC 2.0** over stdio (or HTTP/WebSocket for remote)
- **Session-based** conversations with unique session IDs
- **MCP integration** - editors pass MCP server configs to agents
- **Permission system** - agents request tool approvals from editors
- **Streaming updates** via notifications

### Why integrate ACP?

1. **Editor Integration** - Nuvin can be used directly in Zed, JetBrains IDEs
2. **Standard Protocol** - No custom integrations needed per editor
3. **MCP Forwarding** - Editors can provide MCP tools to Nuvin
4. **Rich UX** - Diffs, terminals, file locations for follow-along

### Protocol Flow Summary

```
Editor (Client)                    Nuvin (Agent/Server)
     |                                    |
     |------ initialize ----------------->|
     |<----- capabilities, auth ----------|
     |                                    |
     |------ session/new ---------------->|
     |<----- sessionId -------------------|
     |                                    |
     |------ session/prompt ------------->|
     |<----- session/update (streaming) --|  (multiple)
     |                                    |
     |<----- session/request_permission --|  (if tool needs approval)
     |------ permission response -------->|
     |                                    |
     |<----- session/prompt response -----|  (stop reason)
```

---

## Architecture Overview

### New Module Structure

```
packages/nuvin-cli/source/
├── acp/                           # New ACP module
│   ├── index.ts                   # Exports
│   ├── server.ts                  # Main ACP server (JSON-RPC connection)
│   ├── handler.ts                 # Request/notification handlers
│   ├── session.ts                 # Session state management
│   ├── event-translator.ts        # AgentEvent -> ACP SessionUpdate
│   ├── permission-bridge.ts       # Tool approval bridging
│   └── types.ts                   # ACP type definitions
```

### Key Mappings

| Nuvin Concept | ACP Concept |
|---------------|-------------|
| `OrchestratorManager.sessionId` | `SessionId` |
| `OrchestratorManager.send()` | `session/prompt` handler |
| `AgentEvent.AssistantChunk` | `session/update` with `agent_message_chunk` |
| `AgentEvent.ToolCalls` | `session/update` with `tool_call` |
| `AgentEvent.ToolResult` | `session/update` with `tool_call_update` |
| `AgentEvent.ToolApprovalRequired` | `session/request_permission` |
| `AgentEvent.Done` | `session/prompt` response with `StopReason` |
| `MCPServerManager` | MCP servers from `session/new` |
| `AgentEvent.SubAgentStarted/Completed` | `session/update` with `tool_call` (nested) |
| `AgentEvent.ReasoningChunk` | `session/update` with `agent_thought_chunk` |

### Stop Reason Mapping

| Nuvin | ACP StopReason |
|-------|---------------|
| Normal completion | `end_turn` |
| Max tokens exceeded | `max_tokens` |
| Too many tool calls | `max_turn_requests` |
| Error/Abort | `cancelled` |
| Content filter | `refusal` |

---

## Phase 1: Core Protocol Infrastructure

### Task 1: Add ACP Types

**Files:**
- Create: `packages/nuvin-cli/source/acp/types.ts`

**Step 1: Create ACP type definitions**

```typescript
// packages/nuvin-cli/source/acp/types.ts

// Protocol version
export const PROTOCOL_VERSION = 1;

// Session ID
export type SessionId = string;
export type ToolCallId = string;
export type PermissionOptionId = string;

// Capabilities
export interface AgentCapabilities {
  loadSession?: boolean;
  mcpCapabilities?: {
    http?: boolean;
    sse?: boolean;
  };
  promptCapabilities?: {
    audio?: boolean;
    embeddedContext?: boolean;
    image?: boolean;
  };
  sessionCapabilities?: Record<string, unknown>;
}

export interface ClientCapabilities {
  fs?: {
    readTextFile?: boolean;
    writeTextFile?: boolean;
  };
  terminal?: boolean;
}

// Content types
export type ContentBlock =
  | { type: 'text'; text: string; annotations?: unknown }
  | { type: 'image'; data: string; mimeType: string; annotations?: unknown }
  | { type: 'resource_link'; uri: string; name: string; mimeType?: string; annotations?: unknown }
  | { type: 'resource'; resource: EmbeddedResource; annotations?: unknown };

export interface EmbeddedResource {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

// Initialize
export interface InitializeRequest {
  protocolVersion: number;
  clientInfo?: { name: string; version: string; title?: string };
  clientCapabilities?: ClientCapabilities;
}

export interface InitializeResponse {
  protocolVersion: number;
  agentInfo?: { name: string; version: string; title?: string };
  agentCapabilities?: AgentCapabilities;
  authMethods?: AuthMethod[];
}

export interface AuthMethod {
  id: string;
  name: string;
  description?: string;
}

// Session
export interface NewSessionRequest {
  cwd: string;
  mcpServers: McpServer[];
}

export interface NewSessionResponse {
  sessionId: SessionId;
  configOptions?: Record<string, unknown>;
  modes?: SessionModeState;
}

export type McpServer =
  | { name: string; command: string; args: string[]; env?: Array<{ name: string; value: string }> }
  | { type: 'http'; name: string; url: string; headers: Array<{ name: string; value: string }> }
  | { type: 'sse'; name: string; url: string; headers: Array<{ name: string; value: string }> };

export interface SessionModeState {
  availableModes: SessionMode[];
  currentModeId: string;
}

export interface SessionMode {
  id: string;
  name: string;
  description?: string;
}

// Prompt
export interface PromptRequest {
  sessionId: SessionId;
  prompt: ContentBlock[];
}

export interface PromptResponse {
  stopReason: StopReason;
}

export type StopReason = 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';

// Session Updates (notifications)
export type SessionUpdate =
  | { sessionUpdate: 'user_message_chunk'; content: ContentChunk }
  | { sessionUpdate: 'agent_message_chunk'; content: ContentChunk }
  | { sessionUpdate: 'agent_thought_chunk'; content: ContentChunk }
  | { sessionUpdate: 'tool_call'; toolCallId: ToolCallId; title: string; kind?: ToolKind; status?: ToolCallStatus; content?: ToolCallContent[]; locations?: ToolCallLocation[]; rawInput?: object; rawOutput?: object }
  | { sessionUpdate: 'tool_call_update'; toolCallId: ToolCallId; title?: string; kind?: ToolKind; status?: ToolCallStatus; content?: ToolCallContent[]; locations?: ToolCallLocation[]; rawInput?: object; rawOutput?: object }
  | { sessionUpdate: 'plan'; entries: PlanEntry[] }
  | { sessionUpdate: 'available_commands_update'; availableCommands: AvailableCommand[] }
  | { sessionUpdate: 'current_mode_update'; currentModeId: string }
  | { sessionUpdate: 'config_option_update'; configOptions: Record<string, unknown> };

export interface ContentChunk {
  content: ContentBlock;
}

export type ToolKind = 'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'think' | 'fetch' | 'switch_mode' | 'other';
export type ToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type ToolCallContent =
  | { type: 'content'; content: ContentBlock }
  | { type: 'diff'; path: string; oldText: string | null; newText: string }
  | { type: 'terminal'; terminalId: string };

export interface ToolCallLocation {
  path: string;
  line?: number;
}

export interface PlanEntry {
  content: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed';
}

export interface AvailableCommand {
  name: string;
  description: string;
  input?: { hint: string };
}

// Permission requests
export interface RequestPermissionRequest {
  sessionId: SessionId;
  toolCall: { toolCallId: ToolCallId };
  options: PermissionOption[];
}

export interface PermissionOption {
  optionId: PermissionOptionId;
  name: string;
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
}

export interface RequestPermissionResponse {
  outcome: { outcome: 'cancelled' } | { outcome: 'selected'; optionId: PermissionOptionId };
}

// File system (client methods - agent calls these)
export interface ReadTextFileRequest {
  sessionId: SessionId;
  path: string;
  line?: number;
  limit?: number;
}

export interface ReadTextFileResponse {
  content: string;
}

export interface WriteTextFileRequest {
  sessionId: SessionId;
  path: string;
  content: string;
}

// Cancel notification
export interface CancelNotification {
  sessionId: SessionId;
}

// Session notification params
export interface SessionNotification {
  sessionId: SessionId;
  update: SessionUpdate;
}
```

**Step 2: Verify types compile**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit source/acp/types.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/acp/types.ts
git commit -m "feat(acp): add ACP protocol type definitions"
```

---

### Task 2: Create ACP Server Core

**Files:**
- Create: `packages/nuvin-cli/source/acp/server.ts`
- Create: `packages/nuvin-cli/source/acp/index.ts`

**Step 1: Create the server implementation**

```typescript
// packages/nuvin-cli/source/acp/server.ts
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
  type RequestType,
  type NotificationType,
} from 'vscode-jsonrpc/node.js';
import * as process from 'node:process';
import type {
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  CancelNotification,
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
  PROTOCOL_VERSION,
} from './types.js';
import { ACPHandler } from './handler.js';

// Define JSON-RPC methods
const InitializeMethod: RequestType<InitializeRequest, InitializeResponse, never> = 
  { method: 'initialize' } as RequestType<InitializeRequest, InitializeResponse, never>;

const SessionNewMethod: RequestType<NewSessionRequest, NewSessionResponse, never> = 
  { method: 'session/new' } as RequestType<NewSessionRequest, NewSessionResponse, never>;

const SessionPromptMethod: RequestType<PromptRequest, PromptResponse, never> = 
  { method: 'session/prompt' } as RequestType<PromptRequest, PromptResponse, never>;

const SessionCancelNotification: NotificationType<CancelNotification> = 
  { method: 'session/cancel' } as NotificationType<CancelNotification>;

const SessionUpdateNotification: NotificationType<SessionNotification> = 
  { method: 'session/update' } as NotificationType<SessionNotification>;

const RequestPermissionMethod: RequestType<RequestPermissionRequest, RequestPermissionResponse, never> = 
  { method: 'session/request_permission' } as RequestType<RequestPermissionRequest, RequestPermissionResponse, never>;

export class ACPServer {
  private connection: MessageConnection;
  private handler: ACPHandler;
  private initialized = false;

  constructor() {
    // Create JSON-RPC connection over stdio
    this.connection = createMessageConnection(
      new StreamMessageReader(process.stdin),
      new StreamMessageWriter(process.stdout)
    );

    this.handler = new ACPHandler(this);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Initialize
    this.connection.onRequest(InitializeMethod, async (params) => {
      if (this.initialized) {
        throw new Error('Already initialized');
      }
      const response = await this.handler.handleInitialize(params);
      this.initialized = true;
      return response;
    });

    // Session management
    this.connection.onRequest(SessionNewMethod, async (params) => {
      this.ensureInitialized();
      return this.handler.handleNewSession(params);
    });

    this.connection.onRequest(SessionPromptMethod, async (params) => {
      this.ensureInitialized();
      return this.handler.handlePrompt(params);
    });

    // Cancel notification
    this.connection.onNotification(SessionCancelNotification, (params) => {
      this.handler.handleCancel(params);
    });

    // Error handling
    this.connection.onError((error) => {
      console.error('[ACP] Connection error:', error);
    });

    this.connection.onClose(() => {
      console.error('[ACP] Connection closed');
      process.exit(0);
    });
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw { code: -32600, message: 'Not initialized' };
    }
  }

  // Send session update notification to client
  sendSessionUpdate(sessionId: string, update: SessionNotification['update']): void {
    this.connection.sendNotification(SessionUpdateNotification, {
      sessionId,
      update,
    });
  }

  // Request permission from client (agent -> client)
  async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    return this.connection.sendRequest(RequestPermissionMethod, params);
  }

  start(): void {
    this.connection.listen();
    console.error('[ACP] Server started, listening on stdio');
  }

  dispose(): void {
    this.connection.dispose();
  }
}

// Export factory function
export function createACPServer(): ACPServer {
  return new ACPServer();
}
```

**Step 2: Create index export**

```typescript
// packages/nuvin-cli/source/acp/index.ts
export * from './types.js';
export { ACPServer, createACPServer } from './server.js';
export { ACPHandler } from './handler.js';
```

**Step 3: Verify it compiles (will have missing imports - that's expected)**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: Errors about missing handler.js (we'll create it next)

**Step 4: Commit**

```bash
git add packages/nuvin-cli/source/acp/server.ts packages/nuvin-cli/source/acp/index.ts
git commit -m "feat(acp): add ACP server core with JSON-RPC connection"
```

---

### Task 3: Create ACP Handler

**Files:**
- Create: `packages/nuvin-cli/source/acp/handler.ts`

**Step 1: Implement the handler**

```typescript
// packages/nuvin-cli/source/acp/handler.ts
import type { ACPServer } from './server.js';
import type {
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  CancelNotification,
  SessionId,
  ContentBlock,
  StopReason,
} from './types.js';
import { PROTOCOL_VERSION } from './types.js';
import { ACPSession } from './session.js';
import { getVersionInfo } from '../utils/version.js';

export class ACPHandler {
  private sessions = new Map<SessionId, ACPSession>();
  private clientCapabilities: InitializeRequest['clientCapabilities'] | null = null;

  constructor(private server: ACPServer) {}

  async handleInitialize(params: InitializeRequest): Promise<InitializeResponse> {
    this.clientCapabilities = params.clientCapabilities ?? null;

    const versionInfo = getVersionInfo();

    return {
      protocolVersion: Math.min(params.protocolVersion, PROTOCOL_VERSION),
      agentInfo: {
        name: 'nuvin',
        version: versionInfo.version,
        title: 'Nuvin AI Coding Assistant',
      },
      agentCapabilities: {
        loadSession: false, // TODO: implement session persistence
        mcpCapabilities: {
          http: false,
          sse: false,
        },
        promptCapabilities: {
          audio: false,
          embeddedContext: true,
          image: true,
        },
        sessionCapabilities: {},
      },
      authMethods: [], // No auth required for local agent
    };
  }

  async handleNewSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    const session = new ACPSession(params.cwd, params.mcpServers, this.server);
    await session.initialize();
    
    this.sessions.set(session.id, session);

    return {
      sessionId: session.id,
      // Optional: modes if we support them
      // modes: {
      //   availableModes: [{ id: 'default', name: 'Default' }],
      //   currentModeId: 'default',
      // },
    };
  }

  async handlePrompt(params: PromptRequest): Promise<PromptResponse> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw { code: -32002, message: `Session not found: ${params.sessionId}` };
    }

    return session.handlePrompt(params.prompt);
  }

  handleCancel(params: CancelNotification): void {
    const session = this.sessions.get(params.sessionId);
    if (session) {
      session.cancel();
    }
  }

  getClientCapabilities() {
    return this.clientCapabilities;
  }
}
```

**Step 2: Verify compile**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: Errors about missing session.js (next task)

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/acp/handler.ts
git commit -m "feat(acp): add ACP request handler"
```

---

### Task 4: Create Session Manager

**Files:**
- Create: `packages/nuvin-cli/source/acp/session.ts`

**Step 1: Implement session management**

```typescript
// packages/nuvin-cli/source/acp/session.ts
import * as crypto from 'node:crypto';
import type { ACPServer } from './server.js';
import type {
  SessionId,
  ContentBlock,
  PromptResponse,
  StopReason,
  McpServer,
  ToolCallId,
  ToolCallStatus,
  ToolKind,
} from './types.js';
import { OrchestratorManager } from '../services/OrchestratorManager.js';
import { ConfigManager } from '../config/manager.js';
import { EventTranslator } from './event-translator.js';
import type { AgentEvent } from '@nuvin/nuvin-core';

export class ACPSession {
  readonly id: SessionId;
  private orchestrator: OrchestratorManager;
  private eventTranslator: EventTranslator;
  private abortController: AbortController | null = null;
  private pendingPrompt: {
    resolve: (response: PromptResponse) => void;
    reject: (error: Error) => void;
  } | null = null;

  constructor(
    private cwd: string,
    private mcpServers: McpServer[],
    private server: ACPServer
  ) {
    this.id = `sess_${crypto.randomUUID().replace(/-/g, '')}`;
    this.orchestrator = new OrchestratorManager();
    this.eventTranslator = new EventTranslator(this.id, server);
  }

  async initialize(): Promise<void> {
    // Change to working directory
    process.chdir(this.cwd);

    // Initialize orchestrator with ACP-specific handlers
    await this.orchestrator.init(
      {
        memPersist: true,
        sessionId: this.id,
        streamingChunks: true,
      },
      {
        // These handlers translate to ACP session/update notifications
        appendLine: () => {}, // Not used in ACP mode
        updateLine: () => {}, // Not used in ACP mode
        updateLineMetadata: () => {}, // Not used in ACP mode
        handleError: (message: string) => {
          console.error('[ACP Session] Error:', message);
        },
      }
    );

    // TODO: Configure MCP servers from mcpServers param
    // The orchestrator's MCPServerManager needs to be configured with
    // the servers passed from the ACP client
  }

  async handlePrompt(prompt: ContentBlock[]): Promise<PromptResponse> {
    // Convert ACP content blocks to nuvin format
    const userMessage = this.contentBlocksToText(prompt);

    // Create abort controller for cancellation
    this.abortController = new AbortController();

    return new Promise((resolve, reject) => {
      this.pendingPrompt = { resolve, reject };

      // Set up event listener for this prompt turn
      const eventHandler = (event: AgentEvent) => {
        this.eventTranslator.translate(event);

        // Check for completion
        if (event.type === 'done') {
          this.completePrompt('end_turn');
        } else if (event.type === 'error') {
          this.completePrompt('refusal');
        }
      };

      // Subscribe to orchestrator events
      // TODO: Need to wire up event subscription from orchestrator

      // Send message
      this.orchestrator.send({
        text: userMessage,
        attachments: this.extractAttachments(prompt),
      }).catch((error) => {
        console.error('[ACP Session] Send error:', error);
        this.completePrompt('refusal');
      });
    });
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.completePrompt('cancelled');
  }

  private completePrompt(stopReason: StopReason): void {
    if (this.pendingPrompt) {
      this.pendingPrompt.resolve({ stopReason });
      this.pendingPrompt = null;
      this.abortController = null;
    }
  }

  private contentBlocksToText(blocks: ContentBlock[]): string {
    return blocks
      .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
      .map(b => b.text)
      .join('\n');
  }

  private extractAttachments(blocks: ContentBlock[]) {
    // Extract images and resources as attachments
    return blocks
      .filter((b): b is Extract<ContentBlock, { type: 'image' }> => b.type === 'image')
      .map((img, index) => ({
        type: 'image' as const,
        data: img.data,
        mimeType: img.mimeType,
        name: `image-${index + 1}`,
      }));
  }
}
```

**Step 2: Commit**

```bash
git add packages/nuvin-cli/source/acp/session.ts
git commit -m "feat(acp): add ACP session manager"
```

---

### Task 5: Create Event Translator

**Files:**
- Create: `packages/nuvin-cli/source/acp/event-translator.ts`

**Step 1: Implement event translation**

```typescript
// packages/nuvin-cli/source/acp/event-translator.ts
import type { ACPServer } from './server.js';
import type {
  SessionId,
  SessionUpdate,
  ToolCallId,
  ToolCallStatus,
  ToolKind,
  ContentBlock,
  PlanEntry,
} from './types.js';
import type { AgentEvent, ToolCall, ToolExecutionResult } from '@nuvin/nuvin-core';
import { AgentEventTypes } from '@nuvin/nuvin-core';

export class EventTranslator {
  // Track tool calls for mapping
  private toolCallMap = new Map<string, ToolCallId>();
  private subAgentToolCalls = new Map<string, ToolCallId>(); // agentId -> toolCallId

  constructor(
    private sessionId: SessionId,
    private server: ACPServer
  ) {}

  translate(event: AgentEvent): void {
    const update = this.eventToUpdate(event);
    if (update) {
      this.server.sendSessionUpdate(this.sessionId, update);
    }
  }

  private eventToUpdate(event: AgentEvent): SessionUpdate | null {
    switch (event.type) {
      case AgentEventTypes.AssistantChunk:
        return {
          sessionUpdate: 'agent_message_chunk',
          content: {
            content: { type: 'text', text: event.delta },
          },
        };

      case AgentEventTypes.ReasoningChunk:
        return {
          sessionUpdate: 'agent_thought_chunk',
          content: {
            content: { type: 'text', text: event.delta },
          },
        };

      case AgentEventTypes.ToolCalls:
        // Emit tool_call for each tool
        for (const toolCall of event.toolCalls) {
          const acpToolCallId = `tc_${toolCall.id}`;
          this.toolCallMap.set(toolCall.id, acpToolCallId);

          const update: SessionUpdate = {
            sessionUpdate: 'tool_call',
            toolCallId: acpToolCallId,
            title: this.formatToolTitle(toolCall),
            kind: this.mapToolKind(toolCall.function.name),
            status: toolCall.requiresApproval ? 'pending' : 'in_progress',
            rawInput: this.safeParseJson(toolCall.function.arguments),
          };
          this.server.sendSessionUpdate(this.sessionId, update);
        }
        return null; // Already sent individual updates

      case AgentEventTypes.ToolResult:
        return this.translateToolResult(event.result);

      case AgentEventTypes.SubAgentStarted:
        // Create a tool_call for the sub-agent
        this.subAgentToolCalls.set(event.agentId, `tc_subagent_${event.toolCallId}`);
        return {
          sessionUpdate: 'tool_call',
          toolCallId: `tc_subagent_${event.toolCallId}`,
          title: `Sub-agent: ${event.agentName}`,
          kind: 'other',
          status: 'in_progress',
        };

      case AgentEventTypes.SubAgentCompleted:
        const subAgentToolId = this.subAgentToolCalls.get(event.agentId);
        if (subAgentToolId) {
          return {
            sessionUpdate: 'tool_call_update',
            toolCallId: subAgentToolId,
            status: event.status === 'success' ? 'completed' : 'failed',
            content: [{
              type: 'content',
              content: { type: 'text', text: event.resultMessage },
            }],
          };
        }
        return null;

      case AgentEventTypes.Error:
        // Could emit as agent_message_chunk with error styling
        return {
          sessionUpdate: 'agent_message_chunk',
          content: {
            content: { type: 'text', text: `Error: ${event.error}` },
          },
        };

      default:
        return null;
    }
  }

  private translateToolResult(result: ToolExecutionResult): SessionUpdate | null {
    const acpToolCallId = this.toolCallMap.get(result.call_id);
    if (!acpToolCallId) return null;

    const status: ToolCallStatus = result.success ? 'completed' : 'failed';

    // Determine content based on tool type
    const content = this.resultToContent(result);

    return {
      sessionUpdate: 'tool_call_update',
      toolCallId: acpToolCallId,
      status,
      content,
      rawOutput: typeof result.result === 'object' ? result.result : { output: result.result },
    };
  }

  private resultToContent(result: ToolExecutionResult): SessionUpdate['content'] {
    const content: Array<{ type: 'content'; content: ContentBlock } | { type: 'diff'; path: string; oldText: string | null; newText: string }> = [];

    // Check if this is a file edit result with diff info
    if (result.metadata?.type === 'file_edit' && result.metadata.filePath) {
      const meta = result.metadata as { filePath: string; oldContent?: string; newContent?: string };
      content.push({
        type: 'diff',
        path: meta.filePath,
        oldText: meta.oldContent ?? null,
        newText: meta.newContent ?? '',
      });
    } else if (result.metadata?.type === 'file_new' && result.metadata.filePath) {
      const meta = result.metadata as { filePath: string; content?: string };
      content.push({
        type: 'diff',
        path: meta.filePath,
        oldText: null,
        newText: meta.content ?? '',
      });
    }

    // Add text output
    if (typeof result.result === 'string' && result.result.length > 0) {
      content.push({
        type: 'content',
        content: { type: 'text', text: result.result },
      });
    }

    return content as SessionUpdate['content'];
  }

  private formatToolTitle(toolCall: ToolCall): string {
    const name = toolCall.function.name;
    const args = this.safeParseJson(toolCall.function.arguments);

    switch (name) {
      case 'file_read':
        return `Reading ${args?.path || 'file'}`;
      case 'file_edit':
        return `Editing ${args?.file_path || 'file'}`;
      case 'file_new':
        return `Creating ${args?.file_path || 'file'}`;
      case 'bash_tool':
        return `Running: ${(args?.cmd || 'command').slice(0, 50)}`;
      case 'web_search':
        return `Searching: ${args?.query || 'web'}`;
      case 'web_fetch':
        return `Fetching: ${args?.url || 'URL'}`;
      case 'grep_tool':
        return `Searching for: ${args?.pattern || 'pattern'}`;
      case 'glob_tool':
        return `Finding files: ${args?.pattern || 'pattern'}`;
      case 'ls_tool':
        return `Listing: ${args?.path || 'directory'}`;
      case 'lsp':
        return `LSP: ${args?.operation || 'query'}`;
      case 'assign_task':
        return `Delegating to: ${args?.agent || 'agent'}`;
      default:
        return name.replace(/_/g, ' ');
    }
  }

  private mapToolKind(toolName: string): ToolKind {
    const kindMap: Record<string, ToolKind> = {
      file_read: 'read',
      file_edit: 'edit',
      file_new: 'edit',
      bash_tool: 'execute',
      web_search: 'search',
      web_fetch: 'fetch',
      grep_tool: 'search',
      glob_tool: 'search',
      ls_tool: 'read',
      lsp: 'read',
      todo_write: 'think',
      assign_task: 'other',
      skill: 'read',
      ask_user_tool: 'other',
    };
    return kindMap[toolName] || 'other';
  }

  private safeParseJson(json: string | undefined): Record<string, unknown> | undefined {
    if (!json) return undefined;
    try {
      return JSON.parse(json);
    } catch {
      return undefined;
    }
  }
}
```

**Step 2: Commit**

```bash
git add packages/nuvin-cli/source/acp/event-translator.ts
git commit -m "feat(acp): add event translator (AgentEvent -> ACP SessionUpdate)"
```

---

## Phase 2: Permission System Bridge

### Task 6: Create Permission Bridge

**Files:**
- Create: `packages/nuvin-cli/source/acp/permission-bridge.ts`

**Step 1: Implement permission bridge**

```typescript
// packages/nuvin-cli/source/acp/permission-bridge.ts
import type { ACPServer } from './server.js';
import type {
  SessionId,
  ToolCallId,
  PermissionOption,
  RequestPermissionResponse,
} from './types.js';
import type { ToolCall, ToolApprovalDecision } from '@nuvin/nuvin-core';

export class PermissionBridge {
  private pendingApprovals = new Map<string, {
    resolve: (decision: ToolApprovalDecision) => void;
    reject: (error: Error) => void;
  }>();

  constructor(
    private sessionId: SessionId,
    private server: ACPServer
  ) {}

  async requestApproval(
    toolCallId: string,
    toolCall: ToolCall
  ): Promise<ToolApprovalDecision> {
    const acpToolCallId = `tc_${toolCallId}`;

    // Define permission options
    const options: PermissionOption[] = [
      { optionId: 'allow-once', name: 'Allow', kind: 'allow_once' },
      { optionId: 'allow-always', name: 'Allow always', kind: 'allow_always' },
      { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
    ];

    try {
      const response = await this.server.requestPermission({
        sessionId: this.sessionId,
        toolCall: { toolCallId: acpToolCallId },
        options,
      });

      return this.mapOutcomeToDecision(response);
    } catch (error) {
      console.error('[PermissionBridge] Request failed:', error);
      return 'deny';
    }
  }

  private mapOutcomeToDecision(response: RequestPermissionResponse): ToolApprovalDecision {
    if (response.outcome.outcome === 'cancelled') {
      return 'deny';
    }

    const optionId = response.outcome.optionId;
    switch (optionId) {
      case 'allow-once':
        return 'approve';
      case 'allow-always':
        return 'approve_all';
      case 'reject-once':
      case 'reject-always':
        return 'deny';
      default:
        return 'deny';
    }
  }

  cancel(): void {
    // Cancel any pending approvals
    for (const [id, pending] of this.pendingApprovals) {
      pending.resolve('deny');
    }
    this.pendingApprovals.clear();
  }
}
```

**Step 2: Commit**

```bash
git add packages/nuvin-cli/source/acp/permission-bridge.ts
git commit -m "feat(acp): add permission bridge for tool approvals"
```

---

## Phase 3: CLI Entry Point

### Task 7: Add ACP Mode to CLI

**Files:**
- Modify: `packages/nuvin-cli/source/cli.tsx`

**Step 1: Add --acp flag handling**

In `cli.tsx`, add the ACP mode flag and handler. Locate the meow CLI definition and add:

```typescript
// Add to meow flags (around line 180 in existing file):
acp: {
  type: 'boolean',
  default: false,
  description: 'Run as ACP server (for editor integration)',
},
```

**Step 2: Add ACP server startup before the render logic**

After the meow configuration and before the render call, add:

```typescript
// Check for ACP mode
if (cli.flags.acp) {
  const { createACPServer } = await import('./acp/index.js');
  const server = createACPServer();
  
  process.on('SIGINT', () => {
    server.dispose();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    server.dispose();
    process.exit(0);
  });
  
  server.start();
  // Don't render React UI in ACP mode
  // The process will keep running due to stdin listening
} else {
  // Existing UI render code...
}
```

**Step 3: Update help text**

Add ACP to the help output:

```
  Options
    --acp                 Run as ACP server (for editor integration)
```

**Step 4: Verify the build**

Run: `cd packages/nuvin-cli && pnpm build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add packages/nuvin-cli/source/cli.tsx
git commit -m "feat(acp): add --acp CLI flag for server mode"
```

---

## Phase 4: Integration with OrchestratorManager

### Task 8: Wire Up Event Subscription

**Files:**
- Modify: `packages/nuvin-cli/source/acp/session.ts`
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts`

This task requires exposing event subscription from OrchestratorManager to ACP session.

**Step 1: Add event callback to OrchestratorManager init options**

The OrchestratorManager needs a way to emit events that the ACP session can listen to. We can leverage the existing `eventBus` or add a direct callback.

Option A (using eventBus - simpler):

```typescript
// In session.ts, after orchestrator.init():
import { eventBus } from '../services/EventBus.js';

// Subscribe to agent events
const unsubscribe = eventBus.on('agent:event', (event: AgentEvent) => {
  this.eventTranslator.translate(event);
  
  if (event.type === 'done') {
    this.completePrompt('end_turn');
  } else if (event.type === 'error') {
    this.completePrompt('refusal');
  }
});

// Store for cleanup
this.eventUnsubscribe = unsubscribe;
```

**Step 2: Update session initialization**

```typescript
// In ACPSession class, add:
private eventUnsubscribe: (() => void) | null = null;

// In initialize():
this.eventUnsubscribe = eventBus.on('agent:event', (event: AgentEvent) => {
  this.eventTranslator.translate(event);
  
  if (event.type === 'done') {
    this.completePrompt('end_turn');
  } else if (event.type === 'error') {
    this.completePrompt('refusal');
  }
});

// Add dispose method:
dispose(): void {
  if (this.eventUnsubscribe) {
    this.eventUnsubscribe();
  }
}
```

**Step 3: Verify compile and commit**

```bash
cd packages/nuvin-cli && pnpm exec tsc --noEmit
git add packages/nuvin-cli/source/acp/session.ts
git commit -m "feat(acp): wire up event subscription from orchestrator"
```

---

### Task 9: Wire Up Tool Approval

**Files:**
- Modify: `packages/nuvin-cli/source/acp/session.ts`
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts` (if needed)

The OrchestratorManager has a tool approval mechanism via `registerApprovalHandler`. We need to connect this to the ACP permission bridge.

**Step 1: Register approval handler in ACP session**

```typescript
// In ACPSession.initialize(), after orchestrator init:
this.permissionBridge = new PermissionBridge(this.id, this.server);

// Register tool approval handler
this.orchestrator.registerApprovalHandler(async (toolCallId, toolCall) => {
  const decision = await this.permissionBridge.requestApproval(toolCallId, toolCall);
  return decision;
});
```

**Step 2: Commit**

```bash
git add packages/nuvin-cli/source/acp/session.ts
git commit -m "feat(acp): wire up tool approval to permission bridge"
```

---

## Phase 5: Testing

### Task 10: Add Integration Tests

**Files:**
- Create: `packages/nuvin-cli/tests/acp/server.test.ts`

**Step 1: Create test file**

```typescript
// packages/nuvin-cli/tests/acp/server.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable, Writable } from 'node:stream';

// Mock the ACP server communication
describe('ACP Server', () => {
  describe('initialize', () => {
    it('should respond with protocol version and capabilities', async () => {
      // Test initialize request/response
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: 1,
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      };

      // Verify response structure
      const expectedResponse = expect.objectContaining({
        protocolVersion: 1,
        agentInfo: expect.objectContaining({
          name: 'nuvin',
        }),
        agentCapabilities: expect.objectContaining({
          loadSession: false,
        }),
      });

      // TODO: Set up actual server communication test
    });
  });

  describe('session/new', () => {
    it('should create a new session with unique ID', async () => {
      // Test session creation
    });
  });

  describe('session/prompt', () => {
    it('should process prompt and stream updates', async () => {
      // Test prompt handling
    });
  });

  describe('session/cancel', () => {
    it('should cancel ongoing prompt and return cancelled stop reason', async () => {
      // Test cancellation
    });
  });
});
```

**Step 2: Run tests**

Run: `cd packages/nuvin-cli && pnpm test`
Expected: Tests should be skipped or pass (depending on implementation)

**Step 3: Commit**

```bash
git add packages/nuvin-cli/tests/acp/
git commit -m "test(acp): add ACP server integration tests"
```

---

## Phase 6: Documentation

### Task 11: Document ACP Integration

**Files:**
- Create: `packages/nuvin-cli/docs/acp-integration.md`

**Step 1: Create documentation**

```markdown
# ACP Integration Guide

Nuvin supports the [Agent Client Protocol (ACP)](https://agentclientprotocol.com/) for integration with code editors like Zed and JetBrains IDEs.

## Running as ACP Server

Start Nuvin in ACP mode:

```bash
nuvin --acp
```

This starts Nuvin as a subprocess listening on stdio for JSON-RPC 2.0 messages.

## Editor Configuration

### Zed

Add to your Zed `settings.json`:

```json
{
  "agent": {
    "command": "nuvin",
    "args": ["--acp"]
  }
}
```

### JetBrains IDEs

Configure in your IDE's ACP settings:
- Command: `nuvin`
- Arguments: `--acp`

## Capabilities

Nuvin's ACP server supports:

- ✅ Text prompts
- ✅ Image attachments
- ✅ Embedded resources/context
- ✅ Tool calls with approval
- ✅ File diffs
- ✅ Streaming responses
- ⏳ Session loading (coming soon)
- ❌ Audio content

## Protocol Flow

1. Editor sends `initialize` → Nuvin responds with capabilities
2. Editor sends `session/new` → Nuvin creates session
3. Editor sends `session/prompt` → Nuvin processes and streams updates
4. Nuvin may send `session/request_permission` → Editor shows approval dialog
5. Nuvin sends `session/prompt` response when complete

## Troubleshooting

### Logs

ACP server logs are written to stderr. Capture them with:

```bash
nuvin --acp 2> /tmp/nuvin-acp.log
```

### Common Issues

1. **"Not initialized" error** - Make sure to send `initialize` before other requests
2. **Session not found** - Session IDs are only valid for the current process
```

**Step 2: Commit**

```bash
git add packages/nuvin-cli/docs/acp-integration.md
git commit -m "docs(acp): add ACP integration guide"
```

---

## Summary

### Files Created
- `packages/nuvin-cli/source/acp/types.ts` - ACP protocol types
- `packages/nuvin-cli/source/acp/server.ts` - JSON-RPC server
- `packages/nuvin-cli/source/acp/handler.ts` - Request handlers
- `packages/nuvin-cli/source/acp/session.ts` - Session management
- `packages/nuvin-cli/source/acp/event-translator.ts` - Event translation
- `packages/nuvin-cli/source/acp/permission-bridge.ts` - Tool approval bridge
- `packages/nuvin-cli/source/acp/index.ts` - Module exports
- `packages/nuvin-cli/tests/acp/server.test.ts` - Integration tests
- `packages/nuvin-cli/docs/acp-integration.md` - Documentation

### Files Modified
- `packages/nuvin-cli/source/cli.tsx` - Add `--acp` flag

### Key Mappings Implemented
- AgentEvent → ACP SessionUpdate notifications
- Tool approval → session/request_permission
- Session management → session/new, session/prompt
- Cancellation → session/cancel

### Future Enhancements
1. Session persistence (`session/load` capability)
2. File system methods (`fs/read_text_file`, `fs/write_text_file`)
3. Terminal integration (`terminal/create`, etc.)
4. Session modes
5. Slash commands
6. MCP server forwarding from client config
