# ACP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a headless ACP server to Nuvin CLI that uses the same config resolution as the CLI, streams session updates via eventBus, supports session/new, session/load (history replay), session/prompt, session/cancel, and tool permission prompts, using local Nuvin tools for filesystem/terminal.

**Architecture:** Implement a newline-delimited JSON-RPC transport and ACP server in `packages/nuvin-cli/source/acp`, wire it into `cli.tsx` via `--acp`, and bridge orchestrator events to ACP `session/update` notifications. Reuse ConfigManager for all config resolution and add a small history replay helper for session/load.

**Tech Stack:** TypeScript, Node.js streams, Vitest, Nuvin CLI services (`ConfigManager`, `OrchestratorManager`, `eventBus`).

---

### Task 1: Add ACP JSON-RPC transport (newline-delimited)

**Files:**
Create: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/jsonrpc.ts`
Test: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/jsonrpc.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { decodeJsonRpcLines, encodeJsonRpcMessage } from '../../source/acp/jsonrpc.js';

describe('ACP JSON-RPC newline framing', () => {
  it('decodes newline-delimited JSON-RPC messages with partial chunks', () => {
    const { messages, remainder } = decodeJsonRpcLines('{"jsonrpc":"2.0","id":1,"method":"ping"}\n{"jsonrpc":"2.0",',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].method).toBe('ping');
    expect(remainder).toBe('{"jsonrpc":"2.0",');
  });

  it('encodes JSON-RPC messages without embedded newlines', () => {
    const msg = encodeJsonRpcMessage({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect(msg.endsWith('\n')).toBe(true);
    expect(msg.includes('\n\n')).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/jsonrpc.test.ts`
Expected: FAIL with "Cannot find module .../acp/jsonrpc.js" or missing exports.

**Step 3: Write minimal implementation**

```ts
export type JsonRpcMessage = { jsonrpc: '2.0'; id?: number | string; method?: string; params?: unknown; result?: unknown; error?: unknown };

export function decodeJsonRpcLines(input: string): { messages: JsonRpcMessage[]; remainder: string } {
  const lines = input.split('\n');
  const remainder = lines.pop() ?? '';
  const messages = lines.filter(Boolean).map((line) => JSON.parse(line) as JsonRpcMessage);
  return { messages, remainder };
}

export function encodeJsonRpcMessage(message: JsonRpcMessage): string {
  return `${JSON.stringify(message)}\n`;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/jsonrpc.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/jsonrpc.ts \
  /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/jsonrpc.test.ts
git commit -m "feat(acp): add newline JSON-RPC transport helpers"
```

---

### Task 2: Add ACP content mapping helpers

**Files:**
Create: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/content.ts`
Test: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/content.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { toUserMessagePayload, toTextContentBlock } from '../../source/acp/content.js';

describe('ACP content mapping', () => {
  it('maps ACP text blocks to user payload text', () => {
    const payload = toUserMessagePayload([{ type: 'text', text: 'Hello' }]);
    expect(payload.text).toBe('Hello');
  });

  it('wraps tool output into text content blocks', () => {
    const block = toTextContentBlock('Result');
    expect(block).toEqual({ type: 'text', text: 'Result' });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/content.test.ts`
Expected: FAIL with missing module/exports.

**Step 3: Write minimal implementation**

```ts
export type AcpContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string; altText?: string }
  | { type: 'resource'; resource: { uri: string; mimeType?: string; text?: string } };

export function toUserMessagePayload(blocks: AcpContentBlock[]) {
  const textParts: string[] = [];
  const attachments: Array<{ mimeType: string; data: string; altText?: string }> = [];

  for (const block of blocks) {
    if (block.type === 'text') textParts.push(block.text);
    if (block.type === 'resource') {
      const label = block.resource.uri ? `Resource: ${block.resource.uri}` : 'Resource';
      textParts.push(`${label}\n${block.resource.text ?? ''}`.trim());
    }
    if (block.type === 'image') attachments.push({ mimeType: block.mimeType, data: block.data, altText: block.altText });
  }

  return {
    text: textParts.join('\n\n'),
    attachments,
  };
}

export function toTextContentBlock(text: string): AcpContentBlock {
  return { type: 'text', text };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/content.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/content.ts \
  /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/content.test.ts
git commit -m "feat(acp): add content block mapping helpers"
```

---

### Task 3: Add session history replay helper

**Files:**
Create: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/history.ts`
Test: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/history.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import * as fsp from 'node:fs/promises';
import { loadSessionHistoryUpdates } from '../../source/acp/history.js';

vi.mock('node:fs/promises');

describe('ACP history replay', () => {
  it('replays user and assistant messages as ACP updates', async () => {
    const history = JSON.stringify({
      cli: [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Hi' },
      ],
    });
    vi.mocked(fsp.readFile).mockResolvedValue(history as never);

    const updates = await loadSessionHistoryUpdates('/tmp/history.cli.json');
    expect(updates).toHaveLength(2);
    expect(updates[0].update.sessionUpdate).toBe('user_message_chunk');
    expect(updates[1].update.sessionUpdate).toBe('agent_message_chunk');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/history.test.ts`
Expected: FAIL with missing module/exports.

**Step 3: Write minimal implementation**

```ts
import * as fsp from 'node:fs/promises';

export async function loadSessionHistoryUpdates(historyFile: string) {
  const raw = await fsp.readFile(historyFile, 'utf-8');
  const parsed = JSON.parse(raw) as { cli?: Array<{ role: string; content: unknown }> };
  const messages = parsed.cli ?? [];

  return messages.map((msg) => ({
    update: {
      sessionUpdate: msg.role === 'user' ? 'user_message_chunk' : 'agent_message_chunk',
      content: { type: 'text', text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) },
    },
  }));
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/history.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/history.ts \
  /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/history.test.ts
git commit -m "feat(acp): add session history replay helper"
```

---

### Task 4: Implement ACP server core and eventBus bridge

**Files:**
Create: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/server.ts`
Modify: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/services/EventBus.ts`
Test: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/server.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { AcpServer } from '../../source/acp/server.js';

const mockTransport = {
  send: vi.fn(),
};

const mockOrchestrator = {
  init: vi.fn(),
  send: vi.fn().mockResolvedValue({ id: 'msg', content: 'ok', role: 'assistant', timestamp: new Date().toISOString() }),
  getConfig: vi.fn(),
  getStatus: vi.fn(),
  getSession: vi.fn().mockReturnValue({ sessionId: 'sess_1', sessionDir: '/tmp/sess_1' }),
};

describe('AcpServer', () => {
  it('responds to initialize with protocolVersion and capabilities', async () => {
    const server = new AcpServer({ transport: mockTransport, orchestratorManager: mockOrchestrator as never });
    const result = await server.handleInitialize({ protocolVersion: 1, clientCapabilities: {} });
    expect(result.protocolVersion).toBe(1);
    expect(result.agentCapabilities).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/server.test.ts`
Expected: FAIL with missing module/exports.

**Step 3: Write minimal implementation**

```ts
import type { TypedEventBus } from '../services/EventBus.js';
import { eventBus } from '../services/EventBus.js';
import { toUserMessagePayload, toTextContentBlock } from './content.js';
import { loadSessionHistoryUpdates } from './history.js';

export class AcpServer {
  constructor(private deps: { transport: { send: (msg: unknown) => void }; orchestratorManager: any; eventBus?: TypedEventBus }) {
    this.eventBus = deps.eventBus ?? eventBus;
  }

  private eventBus: TypedEventBus;
  private sessionId: string | null = null;
  private cancelController: AbortController | null = null;

  async handleInitialize(params: { protocolVersion: number; clientCapabilities: unknown }) {
    return {
      protocolVersion: params.protocolVersion,
      agentCapabilities: { loadSession: true, promptCapabilities: { image: true, embeddedContext: true } },
      agentInfo: { name: 'nuvin', title: 'Nuvin', version: '0.0.0' },
      authMethods: [],
    };
  }

  // Additional handlers: session/new, session/load, session/prompt, session/cancel, session/set_config_option, session/response_permission
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/server.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/server.ts \
  /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/server.test.ts
git commit -m "feat(acp): add core server skeleton"
```

---

### Task 5: Add ACP request routing and full session methods

**Files:**
Modify: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/server.ts`
Create: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/router.ts`
Test: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/router.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { routeAcpRequest } from '../../source/acp/router.js';

const server = {
  handleInitialize: async () => ({ protocolVersion: 1 }),
};

describe('ACP router', () => {
  it('routes initialize to server handler', async () => {
    const response = await routeAcpRequest(server as never, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(response.result.protocolVersion).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/router.test.ts`
Expected: FAIL with missing module/exports.

**Step 3: Write minimal implementation**

```ts
export async function routeAcpRequest(server: any, message: any) {
  if (message.method === 'initialize') {
    const result = await server.handleInitialize(message.params ?? {});
    return { jsonrpc: '2.0', id: message.id, result };
  }
  return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/router.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/router.ts \
  /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/router.test.ts
git commit -m "feat(acp): add request router"
```

---

### Task 6: Wire ACP mode into CLI

**Files:**
Modify: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/cli.tsx`
Create: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/start.ts`
Test: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/start.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { startAcpServer } from '../../source/acp/start.js';

const mockStdin = { on: vi.fn() } as any;
const mockStdout = { write: vi.fn() } as any;

const deps = { stdin: mockStdin, stdout: mockStdout, stderr: { write: vi.fn() } as any };

describe('ACP start', () => {
  it('creates an ACP server and starts reading stdin', async () => {
    await startAcpServer(deps);
    expect(mockStdin.on).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/start.test.ts`
Expected: FAIL with missing module/exports.

**Step 3: Write minimal implementation**

```ts
export async function startAcpServer({ stdin, stdout, stderr }: { stdin: NodeJS.ReadableStream; stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream }) {
  stderr.write('ACP server starting\n');
  stdin.on('data', () => {});
  stdout.write('');
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/start.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/start.ts \
  /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/start.test.ts
git commit -m "feat(acp): add ACP start entrypoint"
```

---

### Task 7: Complete ACP flows and add integration test

**Files:**
Modify: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/server.ts`
Modify: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/router.ts`
Modify: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/start.ts`
Modify: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/cli.tsx`
Create: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/integration.test.ts`

**Step 1: Write the failing integration test**

```ts
import { describe, it, expect } from 'vitest';
import { createInMemoryAcpHarness } from '../testUtils/acpHarness.js';

// The harness should send initialize + session/new + session/prompt and
// assert at least one agent_message_chunk and final stopReason.

describe('ACP integration', () => {
  it('streams responses and returns stopReason', async () => {
    const result = await createInMemoryAcpHarness().runPrompt('hello');
    expect(result.updates.some((u) => u.update.sessionUpdate === 'agent_message_chunk')).toBe(true);
    expect(result.final.stopReason).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/integration.test.ts`
Expected: FAIL because harness and full ACP flows are missing.

**Step 3: Implement missing ACP handlers and harness**

- Implement in `server.ts`:
  - `handleSessionNew`, `handleSessionLoad`, `handleSessionPrompt`, `handleSessionCancel`
  - `handleSessionSetConfigOption`, `handleSessionResponsePermission`
  - eventBus subscription and `session/update` emission
  - session state tracking + AbortController
- Implement in `router.ts` all ACP methods to handlers
- Implement in `start.ts`:
  - create transport from stdin/stdout
  - read line-delimited JSON-RPC, route requests
  - write responses + notifications
- Update `cli.tsx`:
  - add `--acp` flag in meow config
  - if `--acp`, bypass Ink UI and call `startAcpServer`
- Add `testUtils/acpHarness.js` to drive in-memory ACP messages without spawning

**Step 4: Run integration test to verify it passes**

Run: `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/integration.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/server.ts \
  /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/router.ts \
  /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/acp/start.ts \
  /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/source/cli.tsx \
  /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/integration.test.ts \
  /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/testUtils/acpHarness.ts
git commit -m "feat(acp): wire CLI mode and full session flow"
```

---

### Task 8: Document ACP mode in CLI README

**Files:**
Modify: `/Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/README.md`

**Step 1: Write the failing doc check (optional)**

Skip automated doc checks unless a doc lint exists.

**Step 2: Update README**

Add a short section for ACP mode usage and capabilities:

```md
## ACP Server Mode

Run Nuvin as an ACP server over stdio:

  nuvin --acp

Notes:
- Uses the same config resolution as the CLI
- Uses local Nuvin tools for filesystem/terminal operations (no ACP fs/terminal proxy)
```

**Step 3: Commit**

```bash
git add /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/README.md
git commit -m "docs(acp): document ACP server mode"
```

---

## Acceptance Checks
- `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/jsonrpc.test.ts`
- `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/content.test.ts`
- `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/history.test.ts`
- `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/server.test.ts`
- `pnpm test /Users/marsch/Projects/nuvin-space-public/packages/nuvin-cli/tests/acp/integration.test.ts`

## Notes
- Keep ACP stdout clean: no logs on stdout; use stderr for debugging.
- Ensure newline-delimited JSON-RPC framing and no embedded newlines in messages.
- Keep session/load replay faithful to ACP `user_message_chunk` / `agent_message_chunk` order.
