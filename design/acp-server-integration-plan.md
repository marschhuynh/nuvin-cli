# ACP Server Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make nuvin-cli operate as an ACP-compliant agent server so IDEs like Zed and JetBrains can launch it as a subprocess and interact via the Agent Client Protocol over stdio.

**Architecture:** Add an `--acp` CLI flag that boots nuvin in headless ACP server mode (no Ink/React UI). The ACP server **reuses the exact same config pipeline** as the normal CLI mode: `ConfigManager` loads global/local/explicit/env/direct scopes, `processEnvironmentVariables()` reads env vars, CLI flag overrides apply, and the final merged `CLIConfig` is passed to `OrchestratorManager.init()`. This guarantees identical provider, model, API key, MCP servers, skills, hooks, and tool approval settings whether running interactively or as an ACP agent. An `ACPServer` class handles the JSON-RPC stdio transport, translates ACP methods into `OrchestratorManager` calls, and maps `AgentEvent` emissions from nuvin-core's `EventPort` back to ACP `session/update` notifications. The existing `TypedEventBus` is NOT used for ACP transport — instead we tap directly into nuvin-core's `EventPort` interface for a clean, typed event stream.

**Tech Stack:** `@agentclientprotocol/sdk` (TypeScript SDK), `vscode-jsonrpc` (already installed), nuvin-core `AgentOrchestrator` + `EventPort`

**Critical Design Constraint:** The ACP server MUST use the same config as nuvin CLI. No separate config files, no hardcoded defaults, no divergent resolution chains.

---

## Analysis: Event Bus Suitability for ACP

### Should we use the existing `TypedEventBus` for ACP integration?

**No.** The `TypedEventBus` (`source/services/EventBus.ts`) is a UI-layer pub/sub system designed for React component coordination. It has these problems for ACP:

1. **Wrong abstraction level** — Events like `ui:line`, `ui:toolCalls`, `ui:keyboard:ctrlc` are UI-specific. ACP needs agent-level events (tool calls, message chunks, plans).
2. **Lossy transform** — By the time events reach the EventBus, they've been processed by `eventProcessor.ts` into `MessageLine` objects (a UI rendering type), losing the structured data ACP needs.
3. **Missing events** — The EventBus doesn't carry reasoning chunks, raw tool arguments/output, or stop reasons — all required by ACP.

### What to use instead: `EventPort` from nuvin-core

The `EventPort` interface (`packages/nuvin-core/src/ports.ts`) is the correct integration point:

```
EventPort.emit(event: AgentEvent) → ACP session/update notifications
```

**Mapping:**
| nuvin-core `AgentEvent` | ACP `session/update` |
|---|---|
| `AssistantChunk` | `agent_message_chunk` (text content) |
| `ReasoningChunk` | `agent_thought_chunk` (text content) |
| `ToolCalls` | `tool_call` (per tool, with kind/status/rawInput) |
| `ToolResult` | `tool_call_update` (completed/failed + content) |
| `ToolApprovalRequired` | `session/request_permission` (agent→client method) |
| `Done` | `session/prompt` response with `end_turn` stop reason |
| `Error` | `session/prompt` response with error / `refusal` |
| `SubAgentStarted` | `tool_call` (kind: other, for assign_task) |
| `SubAgentCompleted` | `tool_call_update` (completed) |
| `UserQuestionRequired` | Custom extension or mapped to permission request |
| `todo_write` calls | `plan` update |

This gives us a clean, typed, 1:1 mapping without touching the UI event bus at all.

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│  IDE (Zed / JetBrains)  — ACP Client                        │
│  Spawns: `nuvin --acp [--provider X] [--model Y] [--config Z]`│
└───────────┬─────────────────────────────────────┬────────────┘
            │ stdin (JSON-RPC requests)           │ stdout (JSON-RPC responses/notifications)
            ▼                                     ▲
┌───────────────────────────────────────────────────────────────┐
│  cli.tsx (SAME entry point as interactive mode)               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Config Pipeline (identical for both modes):             │  │
│  │  1. runConfigMigration()                                 │  │
│  │  2. meow() — parse --acp, --provider, --model, etc.     │  │
│  │  3. ConfigManager.load() — global/local/explicit files   │  │
│  │  4. processEnvironmentVariables() — env scope            │  │
│  │  5. CLI overrides → direct scope                         │  │
│  │  6. mergedConfig = configManager.getConfig()             │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  if (--acp) → startACPServer(mergedConfig)  ← BRANCH HERE    │
│  else       → React/Ink render (normal CLI) ← BRANCH HERE    │
└───────────────────────────────────────────────────────────────┘
                       │
            ┌──────────▼──────────┐
            │  ACPServer           │
            │  ┌────────────────┐  │
            │  │ ACPTransport   │  │  JSON-RPC over stdio (newline-delimited)
            │  └────────────────┘  │
            │  ┌────────────────┐  │
            │  │ ACPSessionMgr  │  │  sessionId → OrchestratorManager
            │  │ (has config)   │  │  Uses ConfigManager singleton (already loaded)
            │  └────────┬───────┘  │
            │           │          │
            │  ┌────────▼────────┐ │
            │  │ ACPEventAdapter │ │  AgentEvent → ACP session/update
            │  │ (EventPort)     │ │
            │  └────────┬────────┘ │
            │           │          │
            │  ┌────────▼────────┐ │
            │  │ ToolApproval    │ │  ToolApprovalRequired → session/request_permission
            │  │ Handler         │ │
            │  └─────────────────┘ │
            └──────────┬───────────┘
                       │
        ┌──────────────▼──────────────┐
        │  OrchestratorManager         │
        │  .init() reads from          │
        │  ConfigManager.getConfig()   │  ← Same merged CLIConfig
        │  ├── LLMFactory.createLLM()  │  ← Same provider/model/apiKey
        │  ├── MCPServerManager        │  ← Same MCP servers
        │  ├── SkillsService           │  ← Same skills
        │  ├── HookPort               │  ← Same hooks
        │  └── AgentOrchestrator       │  ← Same agentConfig
        └─────────────────────────────┘
```

---

## Config Sharing Guarantee

The ACP server MUST use the same configuration as interactive CLI mode. This is enforced architecturally:

### How it works

1. **Single entry point** — Both `nuvin` and `nuvin --acp` enter through `cli.tsx`
2. **Config loaded before branching** — The `--acp` check happens AFTER the complete config pipeline runs
3. **ConfigManager singleton** — `OrchestratorManager.init()` calls `ConfigManager.getInstance().getConfig()` internally. Since `cli.tsx` already populated all 5 scopes (global, local, explicit, env, direct), the singleton returns the same merged result.
4. **No separate ACP config** — There is no `.nuvin/acp-config.yaml` or similar. ACP uses the same files.

### Config keys guaranteed to be shared

| Config Key | Source | Effect |
|---|---|---|
| `activeProvider` | `--provider` flag or config file | Same LLM provider |
| `model` | `--model` flag or config file | Same model |
| `providers[*].auth` | Config file, `--api-key`, or env vars | Same API credentials |
| `providers[*].baseUrl` | Config file | Same custom endpoints |
| `mcp.servers` | Config file | Same MCP tool servers |
| `skills.*` | Config file | Same skill directories and permissions |
| `hooks.*` | Config file | Same lifecycle hooks |
| `requireToolApproval` | Config file | Same tool approval setting |
| `thinking` | `--reasoning-effort` flag or config | Same reasoning level |
| `session.memPersist` | Config/default | Same session persistence |
| `agentsEnabled` | Config file | Same specialist agents |

### Verification test

```bash
# These two commands MUST resolve identical config:
nuvin --provider anthropic --model claude-sonnet-4-5      # Interactive
nuvin --acp --provider anthropic --model claude-sonnet-4-5 # ACP server

# With profile:
nuvin --profile work --acp    # Uses ~/.nuvin/profiles/work/config.yaml

# With explicit config:
nuvin --config ./my-config.yaml --acp   # Uses ./my-config.yaml

# With env vars:
ANTHROPIC_API_KEY=sk-xxx nuvin --acp    # Picks up env var
```

---

## Task 1: Install ACP SDK and Add `--acp` CLI Flag

**Files:**
- Modify: `packages/nuvin-cli/package.json` — add `@agentclientprotocol/sdk` dependency
- Modify: `packages/nuvin-cli/source/cli.tsx` — add `--acp` flag and early-exit into ACP mode

**Step 1: Install the ACP TypeScript SDK**

```bash
cd packages/nuvin-cli
pnpm add @agentclientprotocol/sdk
```

**Step 2: Add `--acp` flag to CLI**

In `source/cli.tsx`, add the flag to the `meow` config. The `--acp` check MUST come **AFTER** the full config loading pipeline (phases 3-7 in cli.tsx) but **BEFORE** the React/Ink render. This ensures the ACP server receives the exact same merged `CLIConfig` as interactive mode.

```typescript
// In meow flags (around line 82):
acp: {
  type: 'boolean',
  default: false,
  description: 'Run as ACP (Agent Client Protocol) server over stdio',
},
```

The ACP branch placement in cli.tsx is critical. It goes AFTER:
1. `runConfigMigration()` (line ~68)
2. `meow()` flag parsing (line ~82)
3. `ConfigManager.load({ explicitPath, profile })` (line ~235)
4. `processEnvironmentVariables()` → `configManager.loadConfig(envConfig, 'env')` (line ~300)
5. CLI overrides → `configManager.loadConfig(directConfig, 'direct')` (line ~307)
6. `const mergedConfig = configManager.getConfig()` (line ~318)

But BEFORE the React render tree (line ~351):

```typescript
// After line ~322, where mergedConfig, thinkingSetting, etc. are ready:
if (cli.flags.acp) {
  const { startACPServer } = await import('./acp/server.js');
  // Pass the SAME mergedConfig that the React app would receive
  await startACPServer({
    config: mergedConfig,
    memPersist: finalMemPersist,
    thinkingSetting,
    requireToolApproval: finalRequireToolApproval,
  });
  // startACPServer never returns (keeps process alive for stdio)
}
```

This guarantees:
- Same `activeProvider` / `model` / auth resolution
- Same MCP server configs
- Same skills directories & permissions
- Same hooks
- Same tool approval setting
- Same profile (if `--profile` was passed alongside `--acp`)
- Same `--config` explicit file (if passed alongside `--acp`)
- Same env var overrides (ANTHROPIC_API_KEY, etc.)

**Step 3: Verify build compiles**

```bash
pnpm build
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(acp): add --acp flag and ACP SDK dependency"
```

---

## Task 2: ACP Transport Layer (JSON-RPC over stdio)

**Files:**
- Create: `packages/nuvin-cli/source/acp/transport.ts`
- Test: `packages/nuvin-cli/tests/acp/transport.test.ts`

**Step 1: Write transport tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ACPTransport } from '../../source/acp/transport.js';
import { PassThrough } from 'node:stream';

describe('ACPTransport', () => {
  let stdin: PassThrough;
  let stdout: PassThrough;
  let transport: ACPTransport;

  beforeEach(() => {
    stdin = new PassThrough();
    stdout = new PassThrough();
    transport = new ACPTransport(stdin as any, stdout as any);
  });

  it('should parse newline-delimited JSON-RPC messages from stdin', async () => {
    const handler = vi.fn();
    transport.onMessage(handler);
    transport.start();

    const msg = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };
    stdin.write(JSON.stringify(msg) + '\n');

    await new Promise((r) => setTimeout(r, 10));
    expect(handler).toHaveBeenCalledWith(msg);
  });

  it('should write JSON-RPC messages to stdout with newline delimiter', () => {
    const msg = { jsonrpc: '2.0', id: 1, result: { protocolVersion: 1 } };
    transport.send(msg);

    const output = stdout.read()?.toString();
    expect(output).toBe(JSON.stringify(msg) + '\n');
  });

  it('should handle multiple messages in sequence', async () => {
    const handler = vi.fn();
    transport.onMessage(handler);
    transport.start();

    const msg1 = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };
    const msg2 = { jsonrpc: '2.0', id: 2, method: 'session/new', params: {} };
    stdin.write(JSON.stringify(msg1) + '\n' + JSON.stringify(msg2) + '\n');

    await new Promise((r) => setTimeout(r, 10));
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
pnpm vitest run tests/acp/transport.test.ts
```

Expected: FAIL — module not found

**Step 3: Implement the transport**

```typescript
// source/acp/transport.ts
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

type JsonRpcMessage = {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export class ACPTransport {
  private messageHandler?: (msg: JsonRpcMessage) => void;

  constructor(
    private input: Readable,
    private output: Writable,
  ) {}

  onMessage(handler: (msg: JsonRpcMessage) => void): void {
    this.messageHandler = handler;
  }

  start(): void {
    const rl = createInterface({ input: this.input, crlfDelay: Infinity });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed) as JsonRpcMessage;
        this.messageHandler?.(msg);
      } catch {
        this.sendError(null, -32700, 'Parse error');
      }
    });
  }

  send(msg: JsonRpcMessage): void {
    this.output.write(JSON.stringify(msg) + '\n');
  }

  sendResult(id: number | string, result: unknown): void {
    this.send({ jsonrpc: '2.0', id, result });
  }

  sendError(id: number | string | null, code: number, message: string, data?: unknown): void {
    this.send({ jsonrpc: '2.0', id: id ?? undefined, error: { code, message, data } } as JsonRpcMessage);
  }

  sendNotification(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params } as JsonRpcMessage);
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm vitest run tests/acp/transport.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(acp): implement JSON-RPC transport layer"
```

---

## Task 3: ACP Event Adapter (AgentEvent → ACP Notifications)

**Files:**
- Create: `packages/nuvin-cli/source/acp/event-adapter.ts`
- Test: `packages/nuvin-cli/tests/acp/event-adapter.test.ts`

This is the core translation layer. It implements `EventPort` from nuvin-core and translates `AgentEvent` into ACP `session/update` notifications.

**Step 1: Write event adapter tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ACPEventAdapter } from '../../source/acp/event-adapter.js';
import { AgentEventTypes } from '@nuvin/nuvin-core';

describe('ACPEventAdapter', () => {
  let sendNotification: ReturnType<typeof vi.fn>;
  let adapter: ACPEventAdapter;

  beforeEach(() => {
    sendNotification = vi.fn();
    adapter = new ACPEventAdapter('sess_123', sendNotification);
  });

  it('should translate AssistantChunk to agent_message_chunk', () => {
    adapter.emit({
      type: AgentEventTypes.AssistantChunk,
      conversationId: 'conv1',
      messageId: 'msg1',
      delta: 'Hello world',
    });

    expect(sendNotification).toHaveBeenCalledWith('session/update', {
      sessionId: 'sess_123',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'Hello world' },
      },
    });
  });

  it('should translate ReasoningChunk to agent_thought_chunk', () => {
    adapter.emit({
      type: AgentEventTypes.ReasoningChunk,
      conversationId: 'conv1',
      messageId: 'msg1',
      delta: 'Let me think...',
    });

    expect(sendNotification).toHaveBeenCalledWith('session/update', {
      sessionId: 'sess_123',
      update: {
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: 'Let me think...' },
      },
    });
  });

  it('should translate ToolCalls to individual tool_call notifications', () => {
    adapter.emit({
      type: AgentEventTypes.ToolCalls,
      conversationId: 'conv1',
      messageId: 'msg1',
      toolCalls: [
        {
          id: 'call_1',
          function: { name: 'file_read', arguments: '{"path":"/foo.ts"}' },
        },
      ],
    });

    expect(sendNotification).toHaveBeenCalledWith('session/update', {
      sessionId: 'sess_123',
      update: expect.objectContaining({
        sessionUpdate: 'tool_call',
        toolCallId: 'call_1',
        title: 'file_read',
        kind: 'read',
        status: 'pending',
        rawInput: { path: '/foo.ts' },
      }),
    });
  });

  it('should translate ToolResult to tool_call_update', () => {
    adapter.emit({
      type: AgentEventTypes.ToolResult,
      conversationId: 'conv1',
      messageId: 'msg1',
      result: {
        toolCallId: 'call_1',
        toolName: 'file_read',
        result: 'file contents here',
        durationMs: 42,
        status: 'success',
      },
    });

    expect(sendNotification).toHaveBeenCalledWith('session/update', {
      sessionId: 'sess_123',
      update: expect.objectContaining({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'call_1',
        status: 'completed',
      }),
    });
  });

  it('should translate ToolResult with error to failed status', () => {
    adapter.emit({
      type: AgentEventTypes.ToolResult,
      conversationId: 'conv1',
      messageId: 'msg1',
      result: {
        toolCallId: 'call_2',
        toolName: 'bash_tool',
        result: 'command failed',
        durationMs: 100,
        status: 'error',
      },
    });

    expect(sendNotification).toHaveBeenCalledWith('session/update', {
      sessionId: 'sess_123',
      update: expect.objectContaining({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'call_2',
        status: 'failed',
      }),
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
pnpm vitest run tests/acp/event-adapter.test.ts
```

**Step 3: Implement the event adapter**

```typescript
// source/acp/event-adapter.ts
import { AgentEventTypes, type AgentEvent, type EventPort } from '@nuvin/nuvin-core';

const TOOL_KIND_MAP: Record<string, string> = {
  file_read: 'read',
  file_new: 'edit',
  file_edit: 'edit',
  bash_tool: 'execute',
  ls_tool: 'read',
  glob_tool: 'search',
  grep_tool: 'search',
  web_search: 'search',
  web_fetch: 'fetch',
  lsp: 'read',
  todo_write: 'think',
  assign_task: 'other',
  skill: 'other',
  ask_user_tool: 'other',
};

export class ACPEventAdapter implements EventPort {
  private doneResolver?: (stopReason: string) => void;
  private donePromise?: Promise<string>;

  constructor(
    private sessionId: string,
    private sendNotification: (method: string, params: unknown) => void,
  ) {}

  waitForDone(): Promise<string> {
    if (!this.donePromise) {
      this.donePromise = new Promise((resolve) => {
        this.doneResolver = resolve;
      });
    }
    return this.donePromise;
  }

  resetDone(): void {
    this.donePromise = undefined;
    this.doneResolver = undefined;
  }

  emit(event: AgentEvent): void {
    switch (event.type) {
      case AgentEventTypes.AssistantChunk:
        this.sendNotification('session/update', {
          sessionId: this.sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: event.delta },
          },
        });
        break;

      case AgentEventTypes.ReasoningChunk:
        this.sendNotification('session/update', {
          sessionId: this.sessionId,
          update: {
            sessionUpdate: 'agent_thought_chunk',
            content: { type: 'text', text: event.delta },
          },
        });
        break;

      case AgentEventTypes.ToolCalls:
        for (const tc of event.toolCalls) {
          let rawInput: unknown = undefined;
          try {
            rawInput = JSON.parse(tc.function.arguments);
          } catch {}

          const locations = this.extractLocations(tc.function.name, rawInput);

          this.sendNotification('session/update', {
            sessionId: this.sessionId,
            update: {
              sessionUpdate: 'tool_call',
              toolCallId: tc.id,
              title: tc.function.name,
              kind: TOOL_KIND_MAP[tc.function.name] ?? 'other',
              status: 'pending',
              rawInput,
              ...(locations.length > 0 ? { locations } : {}),
            },
          });
        }
        break;

      case AgentEventTypes.ToolApprovalRequired:
        // Handled separately via ACPToolApprovalHandler
        break;

      case AgentEventTypes.ToolResult:
        this.sendNotification('session/update', {
          sessionId: this.sessionId,
          update: {
            sessionUpdate: 'tool_call_update',
            toolCallId: event.result.toolCallId,
            status: event.result.status === 'success' ? 'completed' : 'failed',
            content: [
              {
                type: 'content',
                content: {
                  type: 'text',
                  text: typeof event.result.result === 'string'
                    ? event.result.result
                    : JSON.stringify(event.result.result),
                },
              },
            ],
            rawOutput: typeof event.result.result === 'string'
              ? { output: event.result.result }
              : event.result.result,
          },
        });
        break;

      case AgentEventTypes.Done:
        this.doneResolver?.('end_turn');
        break;

      case AgentEventTypes.Error:
        this.doneResolver?.('refusal');
        break;

      case AgentEventTypes.SubAgentStarted:
        this.sendNotification('session/update', {
          sessionId: this.sessionId,
          update: {
            sessionUpdate: 'tool_call',
            toolCallId: event.toolCallId,
            title: `Sub-agent: ${event.agentName}`,
            kind: 'other',
            status: 'in_progress',
          },
        });
        break;

      case AgentEventTypes.SubAgentCompleted:
        // Find the matching toolCallId from SubAgentStarted
        // SubAgentCompleted doesn't carry toolCallId directly, so use agentId tracking
        break;

      default:
        break;
    }
  }

  private extractLocations(toolName: string, args: unknown): Array<{ path: string; line?: number }> {
    if (!args || typeof args !== 'object') return [];
    const a = args as Record<string, unknown>;

    if (toolName === 'file_read' || toolName === 'file_new' || toolName === 'file_edit') {
      const path = a.path ?? a.file_path;
      if (typeof path === 'string') {
        return [{ path, ...(typeof a.lineStart === 'number' ? { line: a.lineStart } : {}) }];
      }
    }
    return [];
  }
}
```

**Step 4: Run tests**

```bash
pnpm vitest run tests/acp/event-adapter.test.ts
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(acp): implement AgentEvent → ACP notification adapter"
```

---

## Task 4: ACP Session Manager

**Files:**
- Create: `packages/nuvin-cli/source/acp/session-manager.ts`
- Test: `packages/nuvin-cli/tests/acp/session-manager.test.ts`

Manages the mapping from ACP sessionId to OrchestratorManager instances. Each session gets its own OrchestratorManager initialized with the **same merged CLIConfig** from the CLI pipeline.

**Step 1: Implement session manager**

```typescript
// source/acp/session-manager.ts
import { randomUUID } from 'node:crypto';
import { OrchestratorManager } from '../services/OrchestratorManager.js';
import { ACPEventAdapter } from './event-adapter.js';
import type { CLIConfig } from '../config/types.js';

export interface ACPServerConfig {
  config: CLIConfig;           // The full merged config from ConfigManager
  memPersist: boolean;
  thinkingSetting?: string;
  requireToolApproval: boolean;
}

interface ACPSession {
  sessionId: string;
  cwd: string;
  orchestratorManager: OrchestratorManager;
  eventAdapter: ACPEventAdapter;
  cancelled: boolean;
}

export class ACPSessionManager {
  private sessions = new Map<string, ACPSession>();

  constructor(private serverConfig: ACPServerConfig) {}

  async createSession(
    cwd: string,
    sendNotification: (method: string, params: unknown) => void,
  ): Promise<string> {
    const sessionId = `sess_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const eventAdapter = new ACPEventAdapter(sessionId, sendNotification);

    // Create a new OrchestratorManager using the SAME config the CLI loaded.
    // This is a separate instance (ACP supports concurrent sessions),
    // but initialized with identical config — same provider, model, API keys,
    // MCP servers, skills, hooks, etc.
    const orchestratorManager = new OrchestratorManager();

    this.sessions.set(sessionId, {
      sessionId,
      cwd,
      orchestratorManager,
      eventAdapter,
      cancelled: false,
    });

    return sessionId;
  }

  getSession(sessionId: string): ACPSession | undefined {
    return this.sessions.get(sessionId);
  }

  getServerConfig(): ACPServerConfig {
    return this.serverConfig;
  }

  cancelSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.cancelled = true;
    }
  }
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat(acp): implement ACP session manager with shared config"
```

---

## Task 5: ACP Server — Main Entry Point

**Files:**
- Create: `packages/nuvin-cli/source/acp/server.ts`
- Create: `packages/nuvin-cli/source/acp/index.ts`
- Test: `packages/nuvin-cli/tests/acp/server.test.ts`

**Step 1: Write server integration test**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';

describe('ACPServer', () => {
  let stdin: PassThrough;
  let stdout: PassThrough;
  let collected: string[];

  beforeEach(() => {
    stdin = new PassThrough();
    stdout = new PassThrough();
    collected = [];
    stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      collected.push(...lines);
    });
  });

  function sendMessage(msg: object) {
    stdin.write(JSON.stringify(msg) + '\n');
  }

  function getResponses(): object[] {
    return collected.map((line) => JSON.parse(line));
  }

  it('should respond to initialize with agent capabilities', async () => {
    // This will be filled in once the server is more complete
    // For now, verify the message flow shape
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
        },
        clientInfo: { name: 'test-client', title: 'Test', version: '1.0.0' },
      },
    };

    expect(initRequest.params.protocolVersion).toBe(1);
  });
});
```

**Step 2: Implement the ACP server**

```typescript
// source/acp/server.ts
import { ACPTransport } from './transport.js';
import { ACPSessionManager, type ACPServerConfig } from './session-manager.js';
import type { CLIConfig } from '../config/types.js';

interface ClientCapabilities {
  fs?: { readTextFile?: boolean; writeTextFile?: boolean };
  terminal?: boolean;
}

interface ClientInfo {
  name: string;
  title?: string;
  version: string;
}

export class ACPServer {
  private transport: ACPTransport;
  private sessionManager: ACPSessionManager;
  private clientCapabilities: ClientCapabilities = {};
  private initialized = false;

  constructor(
    private serverConfig: ACPServerConfig,
    input: NodeJS.ReadableStream = process.stdin,
    output: NodeJS.WritableStream = process.stdout,
  ) {
    this.transport = new ACPTransport(input as any, output as any);
    this.sessionManager = new ACPSessionManager(serverConfig);
  }

  start(): void {
    this.transport.onMessage((msg) => this.handleMessage(msg));
    this.transport.start();
    process.stderr.write('[ACP] Server started, waiting for initialization...\n');
    process.stderr.write(`[ACP] Provider: ${this.serverConfig.config.activeProvider ?? 'openrouter'}\n`);
    process.stderr.write(`[ACP] Model: ${this.serverConfig.config.model ?? '(default)'}\n`);
  }

  private async handleMessage(msg: any): Promise<void> {
    const { id, method, params } = msg;

    // Notifications (no id) vs requests (have id)
    if (method && id !== undefined) {
      try {
        const result = await this.handleRequest(method, params);
        this.transport.sendResult(id, result);
      } catch (err: any) {
        this.transport.sendError(id, err.code ?? -32603, err.message);
      }
    } else if (method) {
      await this.handleNotification(method, params);
    }
  }

  private async handleRequest(method: string, params: any): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return this.handleInitialize(params);
      case 'authenticate':
        return this.handleAuthenticate(params);
      case 'session/new':
        return this.handleSessionNew(params);
      case 'session/load':
        return this.handleSessionLoad(params);
      case 'session/prompt':
        return this.handleSessionPrompt(params);
      case 'session/set_mode':
        return this.handleSetMode(params);
      default:
        throw { code: -32601, message: `Method not found: ${method}` };
    }
  }

  private async handleNotification(method: string, params: any): Promise<void> {
    switch (method) {
      case 'session/cancel':
        this.handleSessionCancel(params);
        break;
      default:
        break;
    }
  }

  private handleInitialize(params: any): unknown {
    this.clientCapabilities = params.clientCapabilities ?? {};
    this.initialized = true;

    // Read version from package.json or fallback
    const version = '1.0.0'; // TODO: read from package.json at build time

    return {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: {
          image: false,
          audio: false,
          embeddedContext: true,
        },
        mcpCapabilities: {
          http: true,
          sse: false,
        },
        sessionCapabilities: {},
      },
      agentInfo: {
        name: 'nuvin',
        title: 'Nuvin',
        version,
      },
      authMethods: [],
    };
  }

  private handleAuthenticate(_params: any): unknown {
    return {};
  }

  private async handleSessionNew(params: any): Promise<unknown> {
    if (!this.initialized) {
      throw { code: -32000, message: 'Not initialized' };
    }

    // The session manager already has the full merged config from serverConfig.
    // The cwd from the ACP client overrides process.cwd() for this session.
    const sessionId = await this.sessionManager.createSession(
      params.cwd,
      (method, notifParams) => this.transport.sendNotification(method, notifParams),
    );

    return { sessionId };
  }

  private async handleSessionLoad(_params: any): Promise<unknown> {
    // TODO: Implement session loading with history replay
    throw { code: -32601, message: 'session/load not yet implemented' };
  }

  private async handleSessionPrompt(params: any): Promise<unknown> {
    const { sessionId, prompt } = params;
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw { code: -32002, message: `Session not found: ${sessionId}` };
    }

    // Extract text from prompt content blocks
    const userMessage = prompt
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n');

    session.eventAdapter.resetDone();

    // Send the message through the orchestrator.
    // OrchestratorManager uses the same config (provider, model, API keys,
    // MCP servers, skills, hooks) as the interactive CLI.
    try {
      await session.orchestratorManager.send(userMessage);
      const stopReason = await session.eventAdapter.waitForDone();
      return { stopReason };
    } catch (err: any) {
      return { stopReason: 'refusal' };
    }
  }

  private handleSetMode(_params: any): unknown {
    // Nuvin doesn't currently support modes, return empty
    return {};
  }

  private handleSessionCancel(params: any): void {
    const { sessionId } = params;
    this.sessionManager.cancelSession(sessionId);
  }
}

/**
 * Start nuvin as an ACP server over stdio.
 *
 * IMPORTANT: `serverConfig` contains the SAME merged CLIConfig that the
 * interactive CLI would use. It was built by the same ConfigManager pipeline:
 *   global config → local config → explicit config → env vars → CLI flags
 *
 * This means `nuvin --acp --provider anthropic --model claude-sonnet-4-5`
 * uses the exact same config resolution as `nuvin --provider anthropic --model claude-sonnet-4-5`.
 */
export async function startACPServer(serverConfig: ACPServerConfig): Promise<void> {
  const server = new ACPServer(serverConfig);
  server.start();

  // Keep process alive — ACP uses stdio, so we block forever
  await new Promise(() => {});
}
```

**Step 3: Create barrel export**

```typescript
// source/acp/index.ts
export { ACPServer, startACPServer } from './server.js';
export { ACPTransport } from './transport.js';
export { ACPEventAdapter } from './event-adapter.js';
export { ACPSessionManager } from './session-manager.js';
```

**Step 4: Run build and tests**

```bash
pnpm build
pnpm vitest run tests/acp/
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(acp): implement ACP server with initialize, session/new, session/prompt"
```

---

## Task 6: Tool Approval → ACP Permission Requests

**Files:**
- Create: `packages/nuvin-cli/source/acp/tool-approval.ts`
- Test: `packages/nuvin-cli/tests/acp/tool-approval.test.ts`

When the orchestrator requires tool approval, the ACP server must call `session/request_permission` (a request TO the client) and wait for the client's response.

**Step 1: Implement tool approval handler**

```typescript
// source/acp/tool-approval.ts
import type { ToolCall } from '@nuvin/nuvin-core';

type PendingApproval = {
  approvalId: string;
  resolve: (decision: { outcome: string; optionId?: string }) => void;
};

export class ACPToolApprovalHandler {
  private pendingApprovals = new Map<number, PendingApproval>();
  private nextRequestId = 1000;

  constructor(
    private sessionId: string,
    private sendRequest: (id: number, method: string, params: unknown) => void,
  ) {}

  async requestPermission(approvalId: string, toolCalls: ToolCall[]): Promise<string> {
    const requestId = this.nextRequestId++;

    // Build the permission request per ACP spec
    const toolCall = toolCalls[0]; // Permission is per-call in ACP

    this.sendRequest(requestId, 'session/request_permission', {
      sessionId: this.sessionId,
      toolCall: {
        toolCallId: toolCall.id,
        title: toolCall.function.name,
        status: 'pending',
      },
      options: [
        { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'allow-always', name: 'Allow always', kind: 'allow_always' },
        { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
      ],
    });

    return new Promise((resolve) => {
      this.pendingApprovals.set(requestId, {
        approvalId,
        resolve: (result) => {
          if (result.outcome === 'cancelled') {
            resolve('deny');
          } else if (result.optionId === 'reject-once' || result.optionId === 'reject-always') {
            resolve('deny');
          } else if (result.optionId === 'allow-always') {
            resolve('approve_all');
          } else {
            resolve('approve');
          }
        },
      });
    });
  }

  handleResponse(requestId: number, result: any): void {
    const pending = this.pendingApprovals.get(requestId);
    if (pending) {
      this.pendingApprovals.delete(requestId);
      pending.resolve(result.outcome);
    }
  }

  cancelAll(): void {
    for (const [id, pending] of this.pendingApprovals) {
      pending.resolve({ outcome: 'cancelled' });
      this.pendingApprovals.delete(id);
    }
  }
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat(acp): implement tool approval → ACP permission request bridge"
```

---

## Task 7: Plan Updates (todo_write → ACP Plan)

**Files:**
- Modify: `packages/nuvin-cli/source/acp/event-adapter.ts` — add plan tracking

When the agent calls `todo_write`, the result includes the full todo list. We intercept this in the event adapter and emit an ACP `plan` session update.

**Step 1: Add plan tracking to event adapter**

In `ACPEventAdapter.emit()`, when a `ToolResult` comes in for `todo_write`, parse the result and emit a plan update:

```typescript
case AgentEventTypes.ToolResult:
  // Check if this is a todo_write result
  if (event.result.toolName === 'todo_write') {
    this.emitPlanUpdate(event.result);
  }
  // ... existing tool_call_update logic
  break;

private emitPlanUpdate(result: ToolExecutionResult): void {
  try {
    const todos = JSON.parse(typeof result.result === 'string' ? result.result : '[]');
    const entries = todos.map((todo: any) => ({
      content: todo.content,
      priority: todo.priority ?? 'medium',
      status: todo.status === 'completed' ? 'completed'
        : todo.status === 'in_progress' ? 'in_progress'
        : 'pending',
    }));

    this.sendNotification('session/update', {
      sessionId: this.sessionId,
      update: {
        sessionUpdate: 'plan',
        entries,
      },
    });
  } catch {}
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat(acp): map todo_write to ACP plan updates"
```

---

## Task 8: Headless OrchestratorManager Initialization

**Files:**
- Modify: `packages/nuvin-cli/source/acp/session-manager.ts` — full OrchestratorManager wiring
- Possibly modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts` — if needed to support headless mode

The hardest part: initializing `OrchestratorManager` without the React/Ink UI. We need to provide headless `UIHandlers` that route to the ACP event adapter instead of rendering to terminal. The config must be the SAME merged CLIConfig.

**Config Flow:**
```
cli.tsx:
  ConfigManager.load() → processEnvironmentVariables() → CLI flag overrides
    → mergedConfig (CLIConfig)
    → startACPServer({ config: mergedConfig, memPersist, thinkingSetting, requireToolApproval })

server.ts:
  ACPServer(serverConfig) → ACPSessionManager(serverConfig)

session-manager.ts:
  createSession(cwd, sendNotification):
    → orchestratorManager = new OrchestratorManager()
    → ConfigManager.getInstance() already has all scopes loaded from cli.tsx
    → orchestratorManager.init({
        memPersist: serverConfig.memPersist,
        streamingChunks: true,
      }, headlessHandlers)
    → Inside init(), getCurrentConfig() calls configManager.getConfig()
       which returns the SAME merged config from cli.tsx
```

**Key insight:** `ConfigManager` is a singleton. The config scopes loaded in `cli.tsx` (global, local, explicit, env, direct) are already present when `OrchestratorManager.init()` calls `configManager.getConfig()`. We do NOT need to pass config explicitly — the singleton carries it.

However, we need to ensure `process.cwd()` is overridden for the ACP session's `cwd` parameter, since the ACP client specifies the working directory per-session.

**Step 1: Wire up headless orchestrator in session-manager.ts**

```typescript
// In session-manager.ts createSession():

async createSession(
  cwd: string,
  sendNotification: (method: string, params: unknown) => void,
): Promise<string> {
  const sessionId = `sess_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const eventAdapter = new ACPEventAdapter(sessionId, sendNotification);
  const orchestratorManager = new OrchestratorManager();

  // Headless UI handlers — no terminal rendering.
  // Tool calls and results flow through EventPort (ACPEventAdapter), not UIHandlers.
  const headlessHandlers: UIHandlers = {
    appendLine: () => {},
    updateLine: () => {},
    updateLineMetadata: () => {},
    handleError: (msg: string) => {
      sendNotification('session/update', {
        sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: `Error: ${msg}` },
        },
      });
    },
  };

  // Override process.cwd() for this session's scope.
  // The ACP client specifies cwd per session (e.g., the project the user opened).
  // This affects tool operations (file_read, bash_tool, etc.)
  process.chdir(cwd);

  // OrchestratorManager.init() reads from ConfigManager singleton internally.
  // Since cli.tsx already loaded all config scopes into ConfigManager,
  // the OrchestratorManager gets the same provider, model, API keys,
  // MCP servers, skills, hooks, and tool approval settings.
  const initResult = await orchestratorManager.init(
    {
      memPersist: this.serverConfig.memPersist,
      streamingChunks: true,
    },
    headlessHandlers,
  );

  // Override the EventPort to use ACPEventAdapter instead of UIEventAdapter.
  // This routes AgentEvent → ACP session/update notifications.
  // Check if AgentOrchestrator supports setEventPort() or if we need to
  // pass it during construction.
  const orchestrator = orchestratorManager.getOrchestrator();
  // orchestrator.setEventPort(eventAdapter); // TODO: verify API
  // OR if EventPort must be set during init, modify OrchestratorManager
  // to accept an optional eventPort parameter.

  this.sessions.set(sessionId, {
    sessionId,
    cwd,
    orchestratorManager,
    eventAdapter,
    cancelled: false,
  });

  process.stderr.write(`[ACP] Session ${sessionId} created (cwd: ${cwd}, model: ${initResult.model})\n`);

  return sessionId;
}
```

**Step 2: Verify config keys are identical**

After implementing, verify by logging config in both modes:
```bash
# Interactive mode:
nuvin --provider anthropic --model claude-sonnet-4-5

# ACP mode (should show same provider/model in stderr):
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{}}}' | nuvin --acp --provider anthropic --model claude-sonnet-4-5
```

Both should resolve the same provider, model, and API key because they use the same ConfigManager singleton loaded by the same cli.tsx pipeline.

**Step 3: Handle cwd per-session for concurrent sessions**

`process.chdir(cwd)` is process-global and won't work for concurrent sessions. For multi-session support, we need to either:
- Track `cwd` per session and pass it to tool implementations
- Or limit ACP to single-session initially (simpler, matches typical editor usage)

For v1, start with single-session (cwd set once at session creation). Document the limitation.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(acp): wire headless OrchestratorManager with shared config from ConfigManager singleton"
```

---

## Task 9: File Diff Content for File Operations

**Files:**
- Modify: `packages/nuvin-cli/source/acp/event-adapter.ts`

When `file_edit` or `file_new` tool results come in, emit ACP diff content instead of plain text:

```typescript
// In ToolResult handling:
if (event.result.toolName === 'file_edit' || event.result.toolName === 'file_new') {
  const args = this.getToolArgs(event.result.toolCallId);
  if (args) {
    content = [{
      type: 'diff',
      path: args.file_path || args.path,
      oldText: args.old_text ?? null,
      newText: args.new_text ?? args.content,
    }];
  }
}
```

**Commit:**

```bash
git add -A
git commit -m "feat(acp): emit ACP diff content for file operations"
```

---

## Task 10: Client Capability Proxying (fs/terminal)

**Files:**
- Create: `packages/nuvin-cli/source/acp/client-capabilities.ts`

When the ACP client advertises `fs.readTextFile` and `terminal` capabilities, the ACP server can optionally proxy file reads and terminal commands through the client instead of executing them directly. This is optional — nuvin already has its own file and terminal tools.

For the initial implementation, we **skip client capability proxying** and let nuvin use its own tool implementations directly (it already has full filesystem and terminal access as a subprocess). This matches how Gemini CLI implements ACP.

**Step 1: Document the decision**

```typescript
// source/acp/client-capabilities.ts

/**
 * ACP Client Capability Handling
 *
 * The ACP spec allows agents to delegate file reads and terminal commands
 * to the client via fs/* and terminal/* methods. However, since nuvin
 * runs as a subprocess with direct filesystem access, we use our own
 * tool implementations instead.
 *
 * If a future use case requires accessing the client's unsaved editor
 * state, we can implement fs/read_text_file proxying here.
 */

export interface ACPClientCapabilities {
  fs?: {
    readTextFile?: boolean;
    writeTextFile?: boolean;
  };
  terminal?: boolean;
}

export function shouldUseClientFS(caps: ACPClientCapabilities): boolean {
  // For now, always use nuvin's own file tools
  return false;
}
```

**Commit:**

```bash
git add -A
git commit -m "feat(acp): document client capability strategy"
```

---

## Task 11: Integration Test with Real ACP Flow

**Files:**
- Modify: `packages/nuvin-cli/test-acp.js` — update to use newline-delimited JSON-RPC

**Step 1: Update the integration test script**

```javascript
#!/usr/bin/env node
/**
 * Integration test for ACP server
 * Tests the full initialize → session/new → session/prompt flow
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const server = spawn('node', ['dist/cli.js', '--acp'], {
  cwd: __dirname,
  stdio: ['pipe', 'pipe', 'pipe'],
});

server.stderr.on('data', (data) => {
  console.error('[STDERR]:', data.toString().trim());
});

const rl = createInterface({ input: server.stdout, crlfDelay: Infinity });
const responses = [];
const notifications = [];

rl.on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.id !== undefined) {
    responses.push(msg);
  } else {
    notifications.push(msg);
  }
});

function send(msg) {
  server.stdin.write(JSON.stringify(msg) + '\n');
}

function waitForResponse(id, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for response ${id}`)), timeoutMs);
    const check = setInterval(() => {
      const idx = responses.findIndex((r) => r.id === id);
      if (idx !== -1) {
        clearInterval(check);
        clearTimeout(timeout);
        resolve(responses.splice(idx, 1)[0]);
      }
    }, 50);
  });
}

async function main() {
  try {
    // 1. Initialize
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
      clientInfo: { name: 'test-client', title: 'Test Client', version: '1.0.0' },
    }});
    const init = await waitForResponse(1);
    console.log('✅ initialize:', init.result.agentInfo.name, 'v' + init.result.protocolVersion);

    // 2. Create session
    send({ jsonrpc: '2.0', id: 2, method: 'session/new', params: {
      cwd: process.cwd(),
      mcpServers: [],
    }});
    const session = await waitForResponse(2);
    console.log('✅ session/new:', session.result.sessionId);

    // 3. Send a simple prompt
    send({ jsonrpc: '2.0', id: 3, method: 'session/prompt', params: {
      sessionId: session.result.sessionId,
      prompt: [{ type: 'text', text: 'What is 2 + 2?' }],
    }});
    const prompt = await waitForResponse(3, 30000);
    console.log('✅ session/prompt stop reason:', prompt.result.stopReason);
    console.log('📨 Notifications received:', notifications.length);

    console.log('\n✅ All ACP integration tests passed!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    server.kill();
    process.exit(0);
  }
}

main();
```

**Step 2: Commit**

```bash
git add -A
git commit -m "test(acp): update integration test for newline-delimited JSON-RPC"
```

---

## Task 12: Slash Commands → ACP Available Commands

**Files:**
- Modify: `packages/nuvin-cli/source/acp/event-adapter.ts`

After session creation, advertise nuvin's slash commands as ACP available commands:

```typescript
// After session initialization:
sendNotification('session/update', {
  sessionId,
  update: {
    sessionUpdate: 'available_commands_update',
    availableCommands: [
      { name: 'new', description: 'Start a new conversation' },
      { name: 'clear', description: 'Clear the screen' },
      { name: 'compact', description: 'Compact conversation history' },
      // ... map from CommandRegistry
    ],
  },
});
```

**Commit:**

```bash
git add -A
git commit -m "feat(acp): advertise slash commands as ACP available commands"
```

---

## Summary: Implementation Order

| # | Task | Priority | Estimated Effort |
|---|------|----------|------------------|
| 1 | Install SDK + `--acp` flag | High | 15 min |
| 2 | Transport layer (JSON-RPC/stdio) | High | 30 min |
| 3 | Event adapter (AgentEvent → ACP) | High | 45 min |
| 4 | Session manager | High | 30 min |
| 5 | ACP server (main entry) | High | 45 min |
| 6 | Tool approval → permissions | High | 30 min |
| 7 | Plan updates (todo_write) | Medium | 15 min |
| 8 | Headless orchestrator init | High | 60 min |
| 9 | File diff content | Medium | 20 min |
| 10 | Client capabilities doc | Low | 10 min |
| 11 | Integration test | High | 30 min |
| 12 | Slash commands | Low | 15 min |

**Total estimated: ~5.5 hours**

## Key Risks & Open Questions

1. **OrchestratorManager headless init** (Task 8) is the riskiest — it's deeply coupled to React context. May need to extract a `HeadlessOrchestratorManager` or add a mode flag. But config loading is safe because `ConfigManager` is a singleton already populated by `cli.tsx`.
2. **EventPort injection** — Need to verify nuvin-core's `AgentOrchestrator` allows swapping the `EventPort` after construction. If not, `OrchestratorManager.init()` needs an optional `eventPort` parameter.
3. **Session concurrency & cwd** — ACP supports multiple concurrent sessions, each with a different `cwd`. `process.chdir()` is process-global, so concurrent sessions sharing one process will conflict. For v1, limit to single session. For v2, pass `cwd` per tool execution.
4. **`@agentclientprotocol/sdk` vs raw JSON-RPC** — The SDK provides `AgentSideConnection` which handles all the protocol boilerplate. Using it instead of raw transport could save significant effort, but adds a dependency. Recommend trying the SDK first.
5. **Streaming HTTP transport** — ACP's HTTP transport is still "draft proposal in progress". Stdio is the primary transport and what we implement first.
6. **ConfigManager singleton in concurrent sessions** — Since `ConfigManager` is a singleton and all sessions share the same config, runtime config changes (e.g., via `/config` command in one session) would affect all sessions. This is acceptable for v1 since ACP sessions don't have a `/config` command.
7. **MCP servers from ACP client** — The `session/new` request includes `mcpServers[]` from the IDE. These need to be MERGED with nuvin's own MCP config (from `~/.nuvin/config.yaml`). The ACP client's MCP servers are additive — they don't replace nuvin's configured servers.
