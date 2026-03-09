# Sub-Agent Run View — Unified Session Architecture

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Treat every agent execution (main or sub-agent) as a first-class **Session** with its own message stream and UI identity. The chat UI becomes a **session multiplexer** — users type `:sa` to switch to a sub-agent's session (same `ChatDisplay`, same `MessageLine` rendering) and Esc to return. Footer shows breadcrumb navigation.

**Architecture:**

1. **Enriched Sub-Agent Events** — Extend the existing `SubAgent*` event types to carry full data (assistant messages, tool output content). One event pipe, richer data. No new event ports.

2. **Session Registry** — New `SessionRegistry` singleton that tracks all sessions (main + sub-agents). Each session has its own `MessageLine[]` array built from the enriched events by the `eventProcessor`.

3. **Session Multiplexer UI** — `app.tsx` swaps which session's `MessageLine[]` array `ChatDisplay` renders. View stack tracks navigation. Footer shows breadcrumb path. `:sa` command to navigate.

**Key principle: Single event port, enriched events.** The existing `eventCallback` in `AgentManager` emits `SubAgent*` events to the parent's `UIEventAdapter`. We enrich these events to carry enough data for the `eventProcessor` to populate both the compact inline `SubAgentState` AND full `MessageLine[]` in `SessionRegistry`.

**Tech Stack:** React (Ink), TypeScript, nuvin-core event system, nuvin-cli SessionRegistry + eventProcessor

---

## Phase 1: Enrich Sub-Agent Events (nuvin-core)

### Task 1: Add SubAgentAssistantMessage and SubAgentStreamChunk Event Types

The sub-agent's assistant text and streaming content needs to flow through the existing event pipe.

**Files:**
- Modify: `packages/nuvin-core/src/ports.ts` — add new event types to enum and union
- Modify: `packages/nuvin-core/src/agent-manager.ts` — emit new events in the eventPort wrapper

**Step 1: Add enum entries in `ports.ts`**

Add to `AgentEventTypes` enum (after existing SubAgent entries):

```typescript
  SubAgentAssistantMessage: 'sub_agent_assistant_message',
  SubAgentStreamChunk: 'sub_agent_stream_chunk',
```

**Step 2: Add event union members in `ports.ts`**

Add to `AgentEvent` union (after SubAgentMetrics):

```typescript
  | {
      type: typeof AgentEventTypes.SubAgentAssistantMessage;
      conversationId: string;
      messageId: string;
      agentId: string;
      content: string;
      thinking?: string;
    }
  | {
      type: typeof AgentEventTypes.SubAgentStreamChunk;
      conversationId: string;
      messageId: string;
      agentId: string;
      chunk: string;
      isReasoning?: boolean;
    }
```

**Step 3: Enrich `SubAgentToolResult` with tool output**

Find the existing `SubAgentToolResult` union member and add `result` field:

```typescript
  | {
      type: typeof AgentEventTypes.SubAgentToolResult;
      conversationId: string;
      messageId: string;
      agentId: string;
      toolCallId: string;
      toolName: string;
      durationMs: number;
      status: 'success' | 'error';
      result?: string; // ADD: actual tool output content
    }
```

**Step 4: Forward new events in `agent-manager.ts`**

In the `eventPort.emit()` wrapper inside `executeTask()`, add handlers for `AssistantMessage`, `AssistantChunk`, and `ReasoningChunk`:

```typescript
const eventPort = {
  emit: async (event: AgentEvent) => {
    events.push(event);

    // Existing: forward ToolCalls → SubAgentToolCall
    if (event.type === AgentEventTypes.ToolCalls) {
      for (const toolCall of event.toolCalls) {
        await this.eventCallback?.({
          type: AgentEventTypes.SubAgentToolCall, ...
        });
      }
    }
    // Existing: forward ToolResult → SubAgentToolResult (now with result content)
    else if (event.type === AgentEventTypes.ToolResult) {
      await this.eventCallback?.({
        type: AgentEventTypes.SubAgentToolResult,
        // ... existing fields ...
        result: typeof event.result.result === 'string'
          ? event.result.result
          : event.result.result != null
            ? JSON.stringify(event.result.result)
            : undefined,
      });
    }
    // NEW: forward AssistantMessage → SubAgentAssistantMessage
    else if (event.type === AgentEventTypes.AssistantMessage) {
      await this.eventCallback?.({
        type: AgentEventTypes.SubAgentAssistantMessage,
        conversationId: config.conversationId ?? 'default',
        messageId: config.messageId ?? '',
        agentId: config.agentId,
        content: event.content || '',
        thinking: event.thinking,
      });
    }
    // NEW: forward AssistantChunk → SubAgentStreamChunk
    else if (event.type === AgentEventTypes.AssistantChunk) {
      await this.eventCallback?.({
        type: AgentEventTypes.SubAgentStreamChunk,
        conversationId: config.conversationId ?? 'default',
        messageId: config.messageId ?? '',
        agentId: config.agentId,
        chunk: event.content || '',
      });
    }
    // NEW: forward ReasoningChunk → SubAgentStreamChunk (marked as reasoning)
    else if (event.type === AgentEventTypes.ReasoningChunk) {
      await this.eventCallback?.({
        type: AgentEventTypes.SubAgentStreamChunk,
        conversationId: config.conversationId ?? 'default',
        messageId: config.messageId ?? '',
        agentId: config.agentId,
        chunk: event.content || '',
        isReasoning: true,
      });
    }
  },
};
```

**Step 5: Run type check**

Run: `cd packages/nuvin-core && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add packages/nuvin-core/src/ports.ts packages/nuvin-core/src/agent-manager.ts
git commit -m "feat(core): enrich sub-agent events with assistant messages, stream chunks, and tool output"
```

---

## Phase 2: Session Registry & Event Processing (nuvin-cli)

### Task 2: Create SessionRegistry

The centralized store for all agent sessions and their message streams.

**Files:**
- Create: `packages/nuvin-cli/source/services/SessionRegistry.ts`

**Step 1: Implement SessionRegistry**

```typescript
import type { MessageLine, LineMetadata } from '@/adapters/ui-event-adapter.js';
import type { MetricsSnapshot } from '@nuvin/nuvin-core';

export type SessionStatus = 'starting' | 'running' | 'completed' | 'error';

export type SessionEntry = {
  id: string;
  parentId: string | null;
  agentId: string;
  agentName: string;
  taskDescription?: string;
  status: SessionStatus;
  messages: MessageLine[];
  scrollPosition?: number;
  metrics?: MetricsSnapshot;
  startedAt: number;
  completedAt?: number;
  parentToolCallId?: string;
};

export class SessionRegistry {
  private sessions = new Map<string, SessionEntry>();
  private snapshotVersion = 0;
  private cachedSnapshot: Map<string, SessionEntry> | null = null;
  private listeners = new Set<() => void>();

  registerMain(id: string): SessionEntry {
    const entry: SessionEntry = {
      id, parentId: null, agentId: 'cli', agentName: 'Main',
      status: 'running', messages: [], startedAt: Date.now(),
    };
    this.sessions.set(id, entry);
    this.notify();
    return entry;
  }

  registerSubAgent(config: {
    id: string; parentId: string; agentId: string; agentName: string;
    taskDescription?: string; parentToolCallId?: string;
  }): SessionEntry {
    const entry: SessionEntry = {
      ...config, parentId: config.parentId, status: 'starting',
      messages: [], startedAt: Date.now(),
    };
    this.sessions.set(config.id, entry);
    this.notify();
    return entry;
  }

  get(id: string): SessionEntry | undefined {
    return this.sessions.get(id);
  }

  getChildren(parentId: string): SessionEntry[] {
    return [...this.sessions.values()].filter(s => s.parentId === parentId);
  }

  updateStatus(id: string, status: SessionStatus, metrics?: MetricsSnapshot): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.status = status;
    if (metrics) session.metrics = metrics;
    if (status === 'completed' || status === 'error') session.completedAt = Date.now();
    this.notify();
  }

  appendMessage(id: string, line: MessageLine): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.messages = [...session.messages, line];
    this.notify();
  }

  updateMessage(id: string, lineId: string, content: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.messages = session.messages.map(m =>
      m.id === lineId ? { ...m, content } : m
    );
    this.notify();
  }

  updateMessageMetadata(id: string, lineId: string, metadata: Partial<LineMetadata>): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.messages = session.messages.map(m =>
      m.id === lineId ? { ...m, metadata: { ...m.metadata, ...metadata } } : m
    );
    this.notify();
  }

  saveScrollPosition(id: string, position: number): void {
    const session = this.sessions.get(id);
    if (session) session.scrollPosition = position;
  }

  list(): SessionEntry[] {
    return [...this.sessions.values()];
  }

  listSubAgents(): SessionEntry[] {
    return [...this.sessions.values()].filter(s => s.parentId !== null);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): Map<string, SessionEntry> {
    if (!this.cachedSnapshot) {
      this.cachedSnapshot = new Map(this.sessions);
    }
    return this.cachedSnapshot;
  }

  private notify(): void {
    this.snapshotVersion++;
    this.cachedSnapshot = null;
    for (const listener of this.listeners) listener();
  }
}

// Singleton
let instance: SessionRegistry | null = null;
export function getSessionRegistry(): SessionRegistry {
  if (!instance) instance = new SessionRegistry();
  return instance;
}
```

**Step 2: Run type check**

Run: `cd packages/nuvin-cli && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/services/SessionRegistry.ts
git commit -m "feat(cli): add SessionRegistry for unified session model"
```

---

### Task 3: Create React Hook for SessionRegistry

**Files:**
- Create: `packages/nuvin-cli/source/hooks/useSessionRegistry.ts`

**Step 1: Create hook**

```typescript
import { useSyncExternalStore } from 'react';
import { getSessionRegistry, type SessionEntry } from '@/services/SessionRegistry.js';
import type { MessageLine } from '@/adapters/ui-event-adapter.js';

const registry = getSessionRegistry();

export { registry as sessionRegistry };

export function useSessionRegistry() {
  const sessions = useSyncExternalStore(
    (cb) => registry.subscribe(cb),
    () => registry.getSnapshot(),
  );
  return { sessions, registry };
}

export function useSession(sessionId: string | undefined): SessionEntry | undefined {
  const { sessions } = useSessionRegistry();
  return sessionId ? sessions.get(sessionId) : undefined;
}

export function useSessionMessages(sessionId: string | undefined): MessageLine[] {
  const session = useSession(sessionId);
  return session?.messages ?? [];
}
```

**Step 2: Run type check**

Run: `cd packages/nuvin-cli && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/hooks/useSessionRegistry.ts
git commit -m "feat(cli): add useSessionRegistry React hook"
```

---

### Task 4: Extend Event Processor to Populate SessionRegistry

The event processor already handles `SubAgent*` events for the compact inline view. Now it also needs to build `MessageLine[]` arrays in the `SessionRegistry` from the enriched events.

**Files:**
- Modify: `packages/nuvin-cli/source/utils/eventProcessor.ts` — add SessionRegistry population
- Modify: `packages/nuvin-core/src/sub-agent-types.ts` — add `sessionId` to SubAgentState

**Step 1: Add sessionId to SubAgentState**

In `packages/nuvin-core/src/sub-agent-types.ts`:

```typescript
export type SubAgentState = {
  // ... existing fields ...
  sessionId?: string; // Link to session in SessionRegistry
};
```

**Step 2: Update SubAgentStarted handler**

Register a new session in the registry and set `sessionId`:

```typescript
case AgentEventTypes.SubAgentStarted: {
  const toolCallMessageId = state.toolCallToMessageMap.get(event.toolCallId);
  if (!toolCallMessageId) return state;

  // Register session in registry
  const sessionRegistry = getSessionRegistry();
  sessionRegistry.registerSubAgent({
    id: event.agentId,
    parentId: 'main', // or derive from state
    agentId: event.agentId,
    agentName: event.agentName,
    parentToolCallId: event.toolCallId,
  });

  const subAgentState: SubAgentState = {
    agentId: event.agentId,
    agentName: event.agentName,
    status: 'starting',
    toolCalls: [],
    toolCallMessageId,
    sessionId: event.agentId, // Link to SessionRegistry
  };

  // ... rest unchanged
}
```

**Step 3: Handle SubAgentAssistantMessage**

Add new case that creates a `MessageLine` in the session:

```typescript
case AgentEventTypes.SubAgentAssistantMessage: {
  const subAgent = state.subAgents.get(event.agentId);
  if (!subAgent) return state;

  const sessionRegistry = getSessionRegistry();
  sessionRegistry.appendMessage(event.agentId, {
    id: crypto.randomUUID(),
    type: 'assistant',
    content: event.content,
    metadata: {
      timestamp: new Date().toISOString(),
      ...(event.thinking && { thinking: event.thinking }),
    },
  });

  return state; // No change to compact inline state
}
```

**Step 4: Handle SubAgentStreamChunk**

Add streaming support for sub-agent sessions:

```typescript
case AgentEventTypes.SubAgentStreamChunk: {
  const subAgent = state.subAgents.get(event.agentId);
  if (!subAgent) return state;

  const sessionRegistry = getSessionRegistry();

  // Use a streaming message pattern similar to main agent
  // Track streaming message ID per sub-agent in state
  const streamKey = `subAgentStreaming_${event.agentId}`;
  let streamingId = (state as any)[streamKey] as string | undefined;

  if (!streamingId) {
    streamingId = crypto.randomUUID();
    sessionRegistry.appendMessage(event.agentId, {
      id: streamingId,
      type: event.isReasoning ? 'thinking' : 'assistant',
      content: event.chunk,
      metadata: { isStreaming: true, timestamp: new Date().toISOString() },
    });
    return { ...state, [streamKey]: streamingId };
  }

  // Update existing streaming message
  const session = sessionRegistry.get(event.agentId);
  const existing = session?.messages.find(m => m.id === streamingId);
  if (existing) {
    sessionRegistry.updateMessage(event.agentId, streamingId, existing.content + event.chunk);
  }

  return state;
}
```

When a `SubAgentAssistantMessage` arrives (final message), clear the streaming ID:

```typescript
// In SubAgentAssistantMessage handler, also clear streaming state:
const streamKey = `subAgentStreaming_${event.agentId}`;
return { ...state, [streamKey]: undefined };
```

**Step 5: Enhance SubAgentToolCall handler to add MessageLine**

```typescript
case AgentEventTypes.SubAgentToolCall: {
  // ... existing compact state update ...

  // Also add tool call MessageLine to session
  const sessionRegistry = getSessionRegistry();
  sessionRegistry.appendMessage(event.agentId, {
    id: event.toolCallId,
    type: 'tool',
    content: '',
    metadata: {
      timestamp: new Date().toISOString(),
      toolName: event.toolName,
      toolCall: {
        id: event.toolCallId,
        type: 'function',
        function: { name: event.toolName, arguments: event.toolArguments ?? '' },
      },
      toolCalls: [{
        id: event.toolCallId,
        type: 'function',
        function: { name: event.toolName, arguments: event.toolArguments ?? '' },
      }],
    },
  });

  return { ...state, subAgents: newSubAgents };
}
```

**Step 6: Enhance SubAgentToolResult handler to add MessageLine**

```typescript
case AgentEventTypes.SubAgentToolResult: {
  // ... existing compact state update ...

  // Also add tool result MessageLine to session
  const sessionRegistry = getSessionRegistry();
  sessionRegistry.appendMessage(event.agentId, {
    id: `${event.toolCallId}-result`,
    type: 'tool_result',
    content: event.result ?? '',
    metadata: {
      timestamp: new Date().toISOString(),
      toolName: event.toolName,
      status: event.status,
      duration: event.durationMs,
      toolResult: {
        id: event.toolCallId,
        name: event.toolName,
        status: event.status,
        result: event.result,
        durationMs: event.durationMs,
      },
    },
  });

  return { ...state, subAgents: newSubAgents };
}
```

**Step 7: Enhance SubAgentCompleted handler to update session**

```typescript
case AgentEventTypes.SubAgentCompleted: {
  // ... existing compact state update ...

  const sessionRegistry = getSessionRegistry();
  sessionRegistry.updateStatus(
    event.agentId,
    event.status === 'success' ? 'completed' : 'error',
    updatedSubAgent.metrics,
  );

  return { ...state, subAgents: newSubAgents };
}
```

**Step 8: Run type check**

Run: `cd packages/nuvin-cli && npx tsc --noEmit`

**Step 9: Commit**

```bash
git add packages/nuvin-cli/source/utils/eventProcessor.ts packages/nuvin-core/src/sub-agent-types.ts
git commit -m "feat(cli): event processor populates SessionRegistry from enriched sub-agent events"
```

---

## Phase 3: UI Layer

### Task 5: Create ViewStackContext and Breadcrumb Footer

**Files:**
- Create: `packages/nuvin-cli/source/contexts/ViewStackContext.tsx`

**Step 1: Implement ViewStackContext**

```typescript
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type ViewStackEntry =
  | { type: 'main'; sessionId: string }
  | { type: 'subagent'; sessionId: string; agentName: string };

interface ViewStackContextValue {
  stack: ViewStackEntry[];
  currentView: ViewStackEntry;
  pushSubAgent: (sessionId: string, agentName: string) => void;
  popView: () => void;
  isViewingSubAgent: boolean;
  breadcrumbs: Array<{ label: string; sessionId: string }>;
}

const ViewStackContext = createContext<ViewStackContextValue | null>(null);

export function ViewStackProvider({
  mainSessionId,
  children,
}: {
  mainSessionId: string;
  children: ReactNode;
}) {
  const [stack, setStack] = useState<ViewStackEntry[]>([
    { type: 'main', sessionId: mainSessionId },
  ]);

  const currentView = stack[stack.length - 1]!;

  const pushSubAgent = useCallback((sessionId: string, agentName: string) => {
    setStack(prev => [...prev, { type: 'subagent', sessionId, agentName }]);
  }, []);

  const popView = useCallback(() => {
    setStack(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const breadcrumbs = stack.map(entry =>
    entry.type === 'main'
      ? { label: 'Main', sessionId: entry.sessionId }
      : { label: entry.agentName, sessionId: entry.sessionId },
  );

  return (
    <ViewStackContext.Provider value={{
      stack, currentView, pushSubAgent, popView,
      isViewingSubAgent: currentView.type === 'subagent',
      breadcrumbs,
    }}>
      {children}
    </ViewStackContext.Provider>
  );
}

export function useViewStack() {
  const ctx = useContext(ViewStackContext);
  if (!ctx) throw new Error('useViewStack must be used within ViewStackProvider');
  return ctx;
}
```

**Step 2: Run type check**

Run: `cd packages/nuvin-cli && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/contexts/ViewStackContext.tsx
git commit -m "feat(cli): add ViewStackContext for session navigation"
```

---

### Task 6: Integrate Session Multiplexer into App

Wire the ViewStack and SessionRegistry into `app.tsx` so `ChatDisplay` renders the active session's messages.

**Files:**
- Modify: `packages/nuvin-cli/source/app.tsx` — swap message source, add footer breadcrumb, handle Esc
- Modify: `packages/nuvin-cli/source/services/EventBus.ts` — add `ui:viewSubAgent` event type

**Step 1: Add EventBus event type**

In `EventBus.ts`, add to `EventMap`:

```typescript
'ui:viewSubAgent': { sessionId: string; agentName: string };
```

**Step 2: Wrap app in ViewStackProvider**

In `app.tsx`, wrap the component tree:

```typescript
<ViewStackProvider mainSessionId={sessionId}>
  {/* existing app content */}
</ViewStackProvider>
```

**Step 3: Swap ChatDisplay message source**

```typescript
const { currentView, isViewingSubAgent, breadcrumbs, popView } = useViewStack();
const sessionMessages = useSessionMessages(currentView.sessionId);

// When viewing main session: use existing messages (from useMessages hook)
// When viewing sub-agent: use SessionRegistry messages
const displayMessages = isViewingSubAgent ? sessionMessages : messages;

<ChatDisplay messages={displayMessages} ... />
```

**Step 4: Show breadcrumbs in footer**

Modify the footer component to include breadcrumbs when viewing a sub-agent:

```tsx
// In footer area:
{isViewingSubAgent && (
  <Box>
    {breadcrumbs.map((crumb, i) => (
      <Box key={crumb.sessionId}>
        {i > 0 && <Text dimColor> → </Text>}
        <Text bold={i === breadcrumbs.length - 1} dimColor={i < breadcrumbs.length - 1}>
          {crumb.label}
        </Text>
      </Box>
    ))}
    <Text dimColor>  ESC back</Text>
  </Box>
)}
```

**Step 5: Handle Esc to pop and scroll preservation**

```typescript
useInput((_input, key) => {
  if (key.escape && isViewingSubAgent) {
    // Save scroll position
    const scrollPos = scrollBoxRef.current?.getScrollInfo()?.scrollY;
    if (scrollPos !== undefined) {
      getSessionRegistry().saveScrollPosition(currentView.sessionId, scrollPos);
    }
    popView();
  }
}, { isActive: isViewingSubAgent });

// Restore scroll on view change
useEffect(() => {
  const session = getSessionRegistry().get(currentView.sessionId);
  if (session?.scrollPosition !== undefined) {
    scrollBoxRef.current?.scrollToPosition(session.scrollPosition);
  }
}, [currentView.sessionId]);
```

**Step 6: Listen for viewSubAgent events**

```typescript
useEffect(() => {
  const handler = ({ sessionId, agentName }: { sessionId: string; agentName: string }) => {
    pushSubAgent(sessionId, agentName);
  };
  eventBus.on('ui:viewSubAgent', handler);
  return () => { eventBus.off('ui:viewSubAgent', handler); };
}, [pushSubAgent]);
```

**Step 7: Disable input area when viewing sub-agent**

When viewing a sub-agent session, the user shouldn't be able to type (the sub-agent is autonomous). Either hide the input or show a read-only indicator:

```tsx
{isViewingSubAgent ? (
  <Box paddingX={1}>
    <Text dimColor>Viewing sub-agent session (read-only) • ESC to go back • :sa to switch</Text>
  </Box>
) : (
  <InteractionArea ... />
)}
```

**Step 8: Run type check**

Run: `cd packages/nuvin-cli && npx tsc --noEmit`

**Step 9: Commit**

```bash
git add packages/nuvin-cli/source/app.tsx packages/nuvin-cli/source/services/EventBus.ts
git commit -m "feat(cli): integrate session multiplexer with breadcrumb footer"
```

---

### Task 7: Create `:sa` Command for Session Navigation

**Files:**
- Create: `packages/nuvin-cli/source/modules/commands/definitions/subagent.tsx`
- Modify: `packages/nuvin-cli/source/modules/commands/definitions/index.ts` — register command
- Modify: `packages/nuvin-cli/source/components/ToolCallViewer/ToolResultView/SubAgentActivity.tsx` — add hint

**Step 1: Create the `:sa` command**

A `ComponentCommand` that:
1. Reads all sub-agent sessions from `SessionRegistry`
2. If only one: drill in directly (emit `ui:viewSubAgent`)
3. If multiple: show `AppModal` with selectable list (agent name, status, task, metrics)
4. If none: show "No sub-agent sessions" info message and close

```typescript
import { Box, Text } from 'ink';
import { useState } from 'react';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { AppModal } from '@/components/AppModal.js';
import { useInput } from '@/contexts/InputContext/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { getSessionRegistry } from '@/services/SessionRegistry.js';
import { eventBus } from '@/services/EventBus.js';
import { formatDuration, formatTokens, formatCost } from '@/utils/formatters.js';

const SubAgentCommand = ({ context, deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();
  const sessions = getSessionRegistry().listSubAgents();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // If no sessions, close immediately
  if (sessions.length === 0) {
    context.eventBus.emit('ui:line', {
      id: crypto.randomUUID(),
      type: 'info',
      content: 'No sub-agent sessions.',
      metadata: { timestamp: new Date().toISOString() },
    });
    deactivate();
    return null;
  }

  // If single session, drill in directly
  if (sessions.length === 1) {
    const session = sessions[0]!;
    eventBus.emit('ui:viewSubAgent', {
      sessionId: session.id,
      agentName: session.agentName,
    });
    deactivate();
    return null;
  }

  useInput((_input, key) => {
    if (key.escape) { deactivate(); return; }
    if (key.upArrow || _input === 'k') { setSelectedIndex(i => Math.max(0, i - 1)); return; }
    if (key.downArrow || _input === 'j') { setSelectedIndex(i => Math.min(sessions.length - 1, i + 1)); return; }
    if (key.return) {
      const session = sessions[selectedIndex]!;
      eventBus.emit('ui:viewSubAgent', {
        sessionId: session.id,
        agentName: session.agentName,
      });
      deactivate();
    }
  }, { isActive: true });

  return (
    <AppModal visible title="Sub-Agent Sessions" onClose={deactivate} closeOnEscape>
      <Box flexDirection="column">
        {sessions.map((session, i) => {
          const isSelected = i === selectedIndex;
          const statusIcon = session.status === 'completed' ? '✓' :
                             session.status === 'error' ? '✗' : '●';
          const statusColor = session.status === 'completed' ? theme.status.success :
                              session.status === 'error' ? theme.status.error : theme.colors.textDim;
          const metricsStr = session.metrics
            ? `${formatTokens(session.metrics.totalTokens)} tokens`
            : '';

          return (
            <Box key={session.id}>
              <Text color={isSelected ? theme.colors.accent : undefined}>
                {isSelected ? '▸ ' : '  '}
                <Text color={statusColor}>{statusIcon} </Text>
                <Text bold={isSelected}>{session.agentName}</Text>
                {session.taskDescription && <Text dimColor> — {session.taskDescription}</Text>}
                {metricsStr && <Text dimColor> ({metricsStr})</Text>}
              </Text>
            </Box>
          );
        })}
      </Box>
    </AppModal>
  );
};

export function registerSubAgentCommand(registry: CommandRegistry) {
  registry.register({
    id: 'sa',
    type: 'component',
    description: 'View sub-agent sessions',
    category: 'ui',
    keywords: ['subagent', 'sub-agent', 'delegate', 'sa'],
    component: SubAgentCommand,
  });
}
```

**Step 2: Register in index.ts**

```typescript
import { registerSubAgentCommand } from './subagent.js';
// In registerCommands():
registerSubAgentCommand(registry);
```

**Step 3: Add hint to SubAgentActivity**

In `SubAgentActivity.tsx`, add after the status line:

```tsx
<Text dimColor>  :sa to view session</Text>
```

**Step 4: Run type check**

Run: `cd packages/nuvin-cli && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(cli): add :sa command and drill-in hint for sub-agent session navigation"
```

---

## Phase 4: Testing

### Task 8: Integration Testing

**Step 1: Build**

```bash
cd packages/nuvin-core && pnpm build
cd packages/nuvin-cli && pnpm build
```

**Step 2: Run tests**

```bash
cd packages/nuvin-core && pnpm test
cd packages/nuvin-cli && pnpm test
```

**Step 3: Manual E2E test matrix**

| Scenario | Expected |
|----------|----------|
| Single sub-agent, `:sa` while running | Drills in directly (single session). Live streaming updates. |
| Single sub-agent, `:sa` after completion | Full history, scrollable, same rendering as main agent. |
| Multiple concurrent sub-agents | `:sa` shows list. j/k to navigate, Enter to select. |
| Nested sub-agents (A delegates to B) | `:sa` from A's view shows B. Breadcrumb: Main → A → B |
| Esc from sub-agent view | Returns to parent. Scroll position preserved. |
| Sub-agent error | Error visible in its session stream. |
| Compact inline view | No regression. Last 3 tool calls, metrics, `:sa` hint. |
| `:sa` with no sub-agents | Shows "No sub-agent sessions" info message. |
| Footer breadcrumb | Shows `Main → Code Reviewer` with ESC hint. |
| Input disabled when viewing | Read-only indicator, no typing. |

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: unified session architecture for sub-agent run view"
```

---

## Architecture Diagram

```
                     ┌───────────────────────────────┐
                     │        AgentManager            │
                     │     (nuvin-core)               │
                     │                                │
                     │  eventPort.emit(event) {       │
                     │    // Forward enriched events   │
                     │    // to parent's UIEventAdapter│
                     │    this.eventCallback?.({       │
                     │      SubAgentToolCall,          │
                     │      SubAgentToolResult+output, │
                     │      SubAgentAssistantMessage,  │  ← Single pipe,
                     │      SubAgentStreamChunk,       │    enriched data
                     │      SubAgentMetrics,           │
                     │      SubAgentCompleted,         │
                     │    });                          │
                     │  }                              │
                     └──────────────┬──────────────────┘
                                    │
                          SubAgent* events
                                    │
                     ┌──────────────▼──────────────────┐
                     │      Parent UIEventAdapter       │
                     │   → eventProcessor.ts            │
                     │                                  │
                     │   For each SubAgent* event:      │
                     │   ┌────────────────────────────┐│
                     │   │ 1. Update compact           ││
                     │   │    SubAgentState metadata   ││
                     │   │    (inline view)            ││
                     │   ├────────────────────────────┤│
                     │   │ 2. Append MessageLine to   ││
                     │   │    SessionRegistry          ││
                     │   │    (detail view)            ││
                     │   └────────────────────────────┘│
                     └──────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                      │
   ┌──────────▼──────────┐ ┌───────▼────────┐ ┌──────────▼───────┐
   │  Main messages[]    │ │ SessionRegistry│ │  EventBus        │
   │  (useMessages)      │ │                │ │  'agent:event'   │
   │                     │ │ main: msgs[]   │ │                  │
   │  → ChatDisplay      │ │ agent1: msgs[] │ │                  │
   │    (when main view) │ │ agent2: msgs[] │ │                  │
   └─────────────────────┘ └───────┬────────┘ └──────────────────┘
                                    │
                         ┌──────────▼──────────┐
                         │    ViewStack         │
                         │  [Main] → [Agent1]   │
                         │                      │
                         │  currentView.sessionId│
                         │  → picks messages[]  │
                         │  → ChatDisplay       │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼──────────┐
                         │   App Layout         │
                         │                      │
                         │  ┌────────────────┐  │
                         │  │  ChatDisplay   │  │
                         │  │  (messages)    │  │
                         │  └────────────────┘  │
                         │  ┌────────────────┐  │
                         │  │  Footer        │  │
                         │  │  Main → Agent1 │  │
                         │  │  ESC back      │  │
                         │  └────────────────┘  │
                         └──────────────────────┘
```

---

## Summary of Changes

| Layer | File | Change |
|-------|------|--------|
| **Core** | `ports.ts` | Add `SubAgentAssistantMessage`, `SubAgentStreamChunk` events; add `result` to `SubAgentToolResult` |
| **Core** | `agent-manager.ts` | Emit new event types in eventPort wrapper |
| **Core** | `sub-agent-types.ts` | Add `sessionId` to SubAgentState |
| **CLI** | `SessionRegistry.ts` | **NEW** — Centralized session store (singleton, useSyncExternalStore-compatible) |
| **CLI** | `useSessionRegistry.ts` | **NEW** — React hook for SessionRegistry |
| **CLI** | `ViewStackContext.tsx` | **NEW** — View stack context with push/pop/breadcrumbs |
| **CLI** | `eventProcessor.ts` | Handle new events; populate SessionRegistry from SubAgent* events |
| **CLI** | `EventBus.ts` | Add `ui:viewSubAgent` event type |
| **CLI** | `app.tsx` | ViewStackProvider, message source switching, footer breadcrumbs, Esc handler, read-only indicator |
| **CLI** | `subagent.tsx` | **NEW** — `:sa` command for session list/navigation |
| **CLI** | `commands/index.ts` | Register `:sa` command |
| **CLI** | `SubAgentActivity.tsx` | Add `:sa to view session` hint |

## Key Design Decisions

1. **Single event pipe, enriched data** — No new event ports. The existing `eventCallback` → `SubAgent*` events carry full data. The `eventProcessor` handles both compact state and SessionRegistry population from the same events.

2. **SessionRegistry as external store** — Not React state. Uses `useSyncExternalStore`. Populated from non-React code (eventProcessor), triggers React re-renders.

3. **Footer breadcrumbs** — Navigation indicator lives in the footer, not a header bar. Clean, non-intrusive.

4. **`:sa` command for navigation** — Works with existing command/focus model. Lists sessions for multiple, drills directly for single.

5. **Same ChatDisplay rendering** — Sub-agent session uses identical `MessageLine[]` format. No custom rendering.

## Open Questions

1. **Streaming fidelity**: Should `SubAgentStreamChunk` be rendered with the same streaming animation as the main agent? The eventProcessor needs to track per-sub-agent streaming state.

2. **Input area behavior**: When viewing a sub-agent, disable input entirely? Or allow `:sa`, `:help`, etc.?

3. **Session cleanup**: GC policy for completed sub-agent sessions. Options: never, on new session, configurable.

4. **History reload**: Future enhancement — load sub-agent session from persisted agent memory file on history view.
