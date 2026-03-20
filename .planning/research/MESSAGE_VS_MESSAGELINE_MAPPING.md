# Message vs MessageLine Mapping Analysis

**Date:** March 19, 2026
**Question:** Is stored message 1:1 mapped with UI message line?

**Answer:** ❌ **NO - Not 1:1 mapping**

---

## Executive Summary

The relationship between **stored Messages** and **displayed MessageLines** is **1-to-many** or **many-to-1**, depending on direction:

- **1 Message → Multiple MessageLines** (common)
- **Some MessageLines → No stored Message** (UI-only messages)

---

## Type Definitions

### Stored Message (`packages/nuvin-core/src/ports.ts:167-180`)

```typescript
export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: MessageContent;  // string | { type: 'parts'; parts: [...] }
  timestamp?: string;
  tool_calls?: ToolCall[];   // For assistant messages
  tool_call_id?: string;     // For tool messages
  name?: string;             // Tool name for tool messages
  usage?: UsageData;         // Token usage for assistant messages
  status?: 'success' | 'error';  // For tool messages
  durationMs?: number;       // For tool messages
  metadata?: Record<string, unknown>;
};
```

**Purpose:** Persistent storage in `history.{agentId}.json`

### Displayed MessageLine (`packages/nuvin-cli/source/types.ts:3-17`)

```typescript
export type MessageLine = {
  id: string;
  type: 'user' | 'assistant' | 'tool' | 'tool_result' | 'system' | 'error' | 'info' | 'thinking';
  content: string;  // Always string, never complex objects
  metadata?: {
    timestamp?: string;
    toolName?: string;
    status?: 'success' | 'error';
    duration?: number;
    toolCallCount?: number;
    toolCalls?: ToolCall[];
    toolResult?: ToolExecutionResult;
  };
  color?: string;
};
```

**Purpose:** UI display in terminal

---

## Mapping Scenarios

### Scenario 1: Assistant Message with Tool Calls (1 Message → 2 MessageLines)

**Stored Message:**
```json
{
  "id": "msg-123",
  "role": "assistant",
  "content": "I'll help you with that task.",
  "timestamp": "2026-03-19T00:00:00.000Z",
  "tool_calls": [
    {
      "id": "call_1",
      "type": "function",
      "function": {
        "name": "bash_tool",
        "arguments": "{\"cmd\": \"ls -la\"}"
      }
    }
  ]
}
```

**Displayed as 2 MessageLines:**
```typescript
// Line 1: Assistant text
{
  id: "line-1",
  type: "assistant",
  content: "I'll help you with that task.",
  metadata: { timestamp: "..." }
}

// Line 2: Tool call summary
{
  id: "line-2",
  type: "tool",
  content: "bash_tool(ls -la)",
  metadata: {
    toolCallCount: 1,
    toolCalls: [...]
  },
  color: "blue"
}
```

**Conversion:** `messageProcessor.ts:processMessageToUILines()`

---

### Scenario 2: Tool Result Message (1 Message → 1 MessageLine)

**Stored Message:**
```json
{
  "id": "msg-456",
  "role": "tool",
  "tool_call_id": "call_1",
  "name": "bash_tool",
  "content": "total 42\ndrwxr-xr-x ...",
  "timestamp": "2026-03-19T00:00:01.000Z",
  "status": "success",
  "durationMs": 150
}
```

**Displayed as 1 MessageLine:**
```typescript
{
  id: "line-3",
  type: "tool_result",
  content: "bash_tool: [+] success (150ms)",
  metadata: {
    toolName: "bash_tool",
    status: "success",
    duration: 150,
    toolResult: { ... }
  },
  color: "green"
}
```

---

### Scenario 3: User Message (1 Message → 1 MessageLine)

**Stored Message:**
```json
{
  "id": "msg-789",
  "role": "user",
  "content": "List files in current directory",
  "timestamp": "2026-03-19T00:00:00.000Z"
}
```

**Displayed as 1 MessageLine:**
```typescript
{
  id: "line-4",
  type: "user",
  content: "List files in current directory",
  metadata: { timestamp: "..." },
  color: "cyan"
}
```

---

### Scenario 4: UI-Only Messages (0 Messages → 1 MessageLine)

**These MessageLines are NEVER stored:**

```typescript
// Info messages
{
  id: "line-5",
  type: "info",
  content: "Chat history cleared. Ready for new conversation.",
  color: "green"
}

// Error messages
{
  id: "line-6",
  type: "error",
  content: "Failed to load history: File not found",
  color: "red"
}

// System messages
{
  id: "line-7",
  type: "system",
  content: "Resumed session from Mar 19, 2026 (42 messages loaded)"
}

// Thinking messages (during reasoning)
{
  id: "line-8",
  type: "thinking",
  content: "Analyzing request..."
}
```

**Source:** `app.tsx:135-141`, `eventBus.emit('ui:line', ...)`

---

## Conversion Function

**Location:** `packages/nuvin-cli/source/utils/messageProcessor.ts:177-310`

```typescript
export function processMessageToUILines(msg: Message): MessageLine[] {
  const lines: MessageLine[] = [];

  if (msg.role === 'user') {
    // 1 user message → 1 user line
    lines.push({ type: 'user', content: extractTextContent(msg.content), ... });
  }

  else if (msg.role === 'assistant') {
    // Assistant with content → 1 assistant line
    if (textContent) {
      lines.push({ type: 'assistant', content: textContent, ... });
    }
    // Assistant with tool calls → +1 tool line
    if (msg.tool_calls?.length > 0) {
      lines.push({ type: 'tool', content: renderToolCalls(msg.tool_calls), ... });
    }
    // Total: 1-2 lines per assistant message
  }

  else if (msg.role === 'tool') {
    // 1 tool message → 1 tool_result line
    lines.push({ type: 'tool_result', content: formatToolResult(msg), ... });
  }

  return lines;
}
```

---

## Key Differences

| Aspect | Message (Stored) | MessageLine (Displayed) |
|--------|------------------|-------------------------|
| **Content Type** | `string \| { type: 'parts'; parts: [...] }` | Always `string` |
| **Roles** | `user \| assistant \| tool` | `user \| assistant \| tool \| tool_result \| system \| error \| info \| thinking` |
| **Tool Calls** | Embedded in `assistant` message | Separate `tool` line |
| **Tool Results** | `role: 'tool'` | `type: 'tool_result'` |
| **Metadata** | Structured (usage, tool_calls, etc.) | Flattened for display |
| **Color** | N/A | Optional (for terminal styling) |
| **Persistence** | ✅ Saved to `history.{agentId}.json` | ❌ Not persisted (UI-only) |
| **ID** | Stable (from orchestrator) | Generated fresh on load |

---

## Mapping Summary

```
Stored Messages (history.cli.json)
│
├─ User Message (1)
│  └─→ 1 User MessageLine
│
├─ Assistant Message with Content (1)
│  └─→ 1 Assistant MessageLine
│
├─ Assistant Message with Tool Calls (1)
│  ├─→ 1 Assistant MessageLine (content)
│  └─→ 1 Tool MessageLine (tool call summary)
│
└─ Tool Result Message (1)
   └─→ 1 Tool_Result MessageLine

UI-Only MessageLines (not stored)
│
├─ Info messages (system notifications)
├─ Error messages (errors/warnings)
├─ System messages (session info)
└─ Thinking messages (reasoning display)
```

---

## Real-World Example

**Conversation in storage (4 Messages):**
```json
[
  { "role": "user", "content": "What files are in current dir?" },
  { "role": "assistant", "content": "I'll check.", "tool_calls": [...] },
  { "role": "tool", "name": "bash_tool", "content": "file1.txt\nfile2.txt", "status": "success" },
  { "role": "assistant", "content": "Found 2 files." }
]
```

**Displayed in UI (5 MessageLines):**
```
[cyan] What files are in current dir?
[white] I'll check.
[blue] bash_tool(ls -la)
[green] bash_tool: [+] success (50ms)
[white] Found 2 files.
```

Plus possible UI-only lines:
```
[green] Chat history cleared. Ready for new conversation.  ← Not stored
```

---

## Implications

### For Loading History
- **File:** `useSessionManagement.ts:271-305`
- **Process:** Read Messages → Convert to MessageLines via `processMessageToUILines()`
- **Result:** More MessageLines than Messages

### For Storage
- Only `user`, `assistant`, `tool` messages are stored
- `info`, `error`, `system`, `thinking` lines are transient

### For UI Display
- MessageLines are the source of truth
- Each line is rendered independently
- Lines can be added/removed without affecting storage

---

## Conclusion

**❌ NOT 1:1 mapping**

- **1 Message** can produce **1-2 MessageLines**
- **Some MessageLines** have **no corresponding Message** (UI-only)
- **Conversion happens** during history loading via `processMessageToUILines()`
- **MessageLines are ephemeral** (except when reconstructed from Messages)

**Key Takeaway:** The UI displays a richer, more granular view than what's stored in the history file.
