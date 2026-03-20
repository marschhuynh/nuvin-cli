# Message Flow Research - Nuvin CLI

**Research Date:** March 19, 2026
**Domain:** Message processing pipeline in Nuvin CLI
**Confidence:** HIGH

## Executive Summary

The Nuvin CLI implements a sophisticated message flow that handles user input from submission through LLM processing to persistent storage. The architecture follows an event-driven pipeline pattern with clear separation of concerns:

1. **User Input Layer** - Captures and validates user messages (including attachments)
2. **Processing Pipeline** - Transforms messages through multiple middleware stages
3. **LLM Integration** - Manages API communication with streaming support
4. **Event System** - Coordinates components through typed events
5. **Storage Layer** - Persists conversations to JSON files with metadata

**Key Insight:** The system uses a dual-path architecture where events flow both to the UI (for real-time display) and to persistent storage (for conversation history), with the orchestrator coordinating the entire flow.

---

## 1. Message Submission Entry Point

### 1.1 User Input Capture

**Location:** `packages/nuvin-cli/source/components/InteractionArea.tsx`

The user input journey begins in the `InteractionArea` component, which provides the input interface:

```typescript
// User types in the input field
// Input is captured by the InputContext system
// Location: packages/nuvin-cli/source/contexts/InputContext/
```

### 1.2 Input Submission Handler

**Location:** `packages/nuvin-cli/source/hooks/useHandleSubmit.ts:45-120`

When the user submits input (presses Enter), the `handleSubmit` function is invoked:

```typescript
const handleSubmit = useCallback(
  async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    // Check if it's a command (starts with /)
    if (trimmed.startsWith('/')) {
      const commandId = trimmed.split(' ')[0];
      const def = commandRegistry.get(commandId);
      
      // Handle commands differently
      if (def) {
        await executeCommand(trimmed);
        return;
      }
    }

    // Prepare user submission (handle attachments, images, etc.)
    let submission: UserMessagePayload;
    try {
      const clipboardFiles = globalThis.__clipboardFiles ?? [];
      submission = await prepareUserSubmission(value, clipboardFiles);
      globalThis.__clipboardFiles = undefined;
    } catch (err) {
      handleError(message);
      return;
    }

    // Process the message
    await processMessage(submission);
  },
  [appendLine, handleError, executeCommand, processMessage],
);
```

### 1.3 User Submission Preparation

**Location:** `packages/nuvin-cli/source/utils/userSubmission.ts:1-180`

The `prepareUserSubmission` function handles:

1. **Clipboard Files** - Images copied to clipboard
2. **Inline Data URIs** - Base64-encoded images in text
3. **File References** - Paths to image files using `@` syntax

```typescript
export async function prepareUserSubmission(
  raw: string, 
  clipboardFiles?: Buffer[]
): Promise<UserMessagePayload> {
  const attachments: PendingAttachment[] = [];
  
  // Handle clipboard files
  if (clipboardFiles && clipboardFiles.length > 0) {
    clipboardFiles.forEach((buffer) => {
      const token = createToken(tokenIndex);
      const dataUri = `data:image/png;base64,${buffer.toString('base64')}`;
      attachments.push({ kind: 'inline', token, label, dataUri });
    });
  }
  
  // Parse inline data URIs (regex: data:image/...;base64,...)
  DATA_URI_REGEX.lastIndex = 0;
  while ((match = DATA_URI_REGEX.exec(raw)) !== null) {
    // Extract and tokenize inline images
  }
  
  // Parse file references (@"/path/to/image.png")
  FILE_REF_REGEX.lastIndex = 0;
  while ((fileMatch = FILE_REF_REGEX.exec(text)) !== null) {
    // Resolve file paths and read images
  }
  
  return {
    text: textWithTokens,
    displayText: displayOutput,
    attachments: preparedAttachments,
  };
}
```

**Output Structure:**
```typescript
type UserMessagePayload = {
  text: string;              // Text with attachment tokens
  displayText?: string;      // Human-readable display text
  attachments?: UserAttachment[];  // Array of images
};

type UserAttachment = {
  type: 'image';
  token: string;             // Token like <<nuvin-attachment-1>>
  mimeType: string;          // e.g., 'image/png'
  data: string;              // Base64-encoded image data
  altText?: string;
  source?: 'inline' | 'file';
  name?: string;
};
```

---

## 2. Message Processing Pipeline

### 2.1 Process Message Entry Point

**Location:** `packages/nuvin-cli/source/app.tsx:220-260`

The `processMessage` function in the main App component:

```typescript
const processMessage = useCallback(
  async (submission: UserMessagePayload) => {
    // Display user message in UI
    const displayContent = typeof submission === 'string' 
      ? submission 
      : (submission.displayText ?? submission.text ?? '');

    appendLine({
      id: crypto.randomUUID(),
      type: 'user',
      content: displayContent,
      metadata: { timestamp: new Date().toISOString() },
      color: 'cyan',
    });

    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (!send) throw new Error('Agent not initialized');
      
      // Send to orchestrator
      const sendPromise = send(submission, {
        conversationId: 'default',
        stream: true,
        signal: controller.signal,
      });

      // Update topic asynchronously
      if (displayContent) {
        orchestratorManager
          .analyzeAndUpdateTopic(displayContent, conversationId)
          .then((topic) => {
            process.stdout.write(`\x1b]0;Nuvin | ${topic}\x07`);
          });
      }

      await sendPromise;
    } catch (err: unknown) {
      // Handle errors
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  },
  [send, appendLine, handleError],
);
```

### 2.2 Send Pipeline

**Location:** `packages/nuvin-cli/source/services/SendPipeline.ts:60-130`

The `SendPipeline` implements a middleware pattern with pre-send and post-send hooks:

```typescript
async execute(
  content: UserMessagePayload,
  opts: SendMessageOptions = {},
  agentConfigOverrides: Partial<AgentConfig> = {},
) {
  const orchestrator = this.deps.getRuntime()?.orchestrator ?? null;
  const currentConfig = this.deps.getCurrentConfig();
  const conversationId = opts.conversationId ?? 
    this.deps.getConversationContext().getActiveConversationId();

  const ctx: SendContext = {
    orchestrator,
    content,
    opts,
    agentConfigOverrides,
    agentConfig: {
      model: currentConfig.model,
      reasoningEffort: currentConfig.reasoningEffort,
      thinking: currentConfig.thinking,
      ...agentConfigOverrides,
    },
    conversationId,
    currentConfig,
  };

  // Pre-send hooks (in order)
  for (const hook of this.preSendHooks) {
    await hook(ctx);
  }

  // Core send to orchestrator
  ctx.result = await orchestrator.send(content, {
    ...opts,
    conversationId: ctx.conversationId,
  });

  // Post-send hooks (in order)
  for (const hook of this.postSendHooks) {
    await hook(ctx);
  }

  return ctx.result;
}
```

### 2.3 Pre-Send Hooks

**Location:** `packages/nuvin-cli/source/services/SendPipeline.ts:135-175`

1. **lazySessionInit** - Initialize persisted session if needed
2. **refreshLLM** - Create fresh LLM instance with HTTP logging if configured
3. **injectMemory** - Inject long-term memory into system prompt
4. **applyConfig** - Apply agent configuration overrides
5. **ensureContextWindowLimit** - Check and manage context window size

```typescript
private async injectMemory(ctx: SendContext): Promise<void> {
  const memoryService = this.deps.memoryToolWiring.getMemoryService();
  if (!memoryService) return;

  const memoryBlock = await memoryService.buildCoreMemoryInjection({
    workspaceId: this.deps.memoryToolWiring.getWorkspaceContext().workspaceId,
    injectTokenBudget: memoryConfig?.retrieval?.coreInjectTokenBudget ?? 
                      memoryConfig?.maxInjectionTokens,
    candidateLimit: memoryConfig?.retrieval?.activeCandidateLimit ?? 
                    memoryConfig?.retrieval?.candidateLimit,
  });

  const currentSystemPrompt = ctx.orchestrator.getConfig().systemPrompt ?? '';
  const cleanSystemPrompt = stripInjectedMemorySection(currentSystemPrompt);
  
  const memorySection = [
    '## Long-Term Memory',
    '',
    'You have a long-term memory system that persists across sessions.',
    // ... memory instructions
  ];
  
  if (memoryBlock) {
    memorySection.push('', 'Remembered from previous sessions:', '', memoryBlock);
  }
  
  ctx.agentConfig.systemPrompt = buildSystemPromptWithMemory(
    cleanSystemPrompt, 
    memorySection.join('\n')
  );
}
```

### 2.4 Post-Send Hooks

**Location:** `packages/nuvin-cli/source/services/SendPipeline.ts:180-200`

1. **updateMetadata** - Record token usage, cost, and timing metadata
2. **checkContextWindow** - Check if context window needs summarization

---

## 3. LLM Request Flow

### 3.1 Orchestrator Send Method

**Location:** `packages/nuvin-core/src/orchestrator.ts:650-850`

The core `send` method in `AgentOrchestrator`:

```typescript
async send(content: UserMessagePayload, opts: SendMessageOptions = {}): Promise<MessageResponse> {
  const convo = opts.conversationId ?? 'default';
  const t0 = this.clock.now();
  const msgId = this.ids.uuid();

  // 1. Load conversation history
  const history = await this.memory.get(convo);

  // 2. Normalize user input
  const normalized = typeof content === 'string'
    ? { text: content, displayText: content, attachments: [] }
    : {
        text: content.text ?? '',
        displayText: content.displayText,
        attachments: Array.isArray(content.attachments) ? content.attachments : [],
      };

  // 3. Build message parts (text + images)
  const messageParts = buildMessageParts(enhancedCombined, attachments);
  
  // 4. Create user content
  let userContent: MessageContent;
  if (attachments.length > 0 || messageParts.some((part) => part.type === 'image')) {
    userContent = { type: 'parts', parts: messageParts };
  } else if (messageParts.length === 1 && messageParts[0]?.type === 'text') {
    userContent = messageParts[0].text;
  } else {
    userContent = enhancedCombined;
  }

  // 5. Convert to provider format
  providerMsgs = this.context.toProviderMessages(
    history, 
    this.cfg.systemPrompt, 
    [userContent]
  );

  // 6. Save user message to memory
  userMessages = [{
    id: this.ids.uuid(),
    role: 'user',
    content: userContent,
    timestamp: this.clock.iso(),
  }];
  await this.memory.append(convo, userMessages);

  // 7. Emit MessageStarted event
  await this.events?.emit({
    type: AgentEventTypes.MessageStarted,
    conversationId: convo,
    messageId: msgId,
    userContent: userDisplay,
    enhanced,
    toolNames,
  });

  // 8. Build completion parameters
  const params: CompletionParams = {
    messages: providerMsgs,
    model: this.cfg.model,
    temperature: this.cfg.temperature,
    maxTokens: this.cfg.maxTokens,
    tools: toolDefs.length ? toolDefs : undefined,
    tool_choice: toolDefs.length ? 'auto' : 'none',
    reasoning: reasoningParam,
    thinking: thinkingParam,
  };

  // 9. Call LLM (streaming or non-streaming)
  let result: CompletionResult;
  if (opts.stream && typeof _llm.streamCompletion === 'function') {
    result = await _llm.streamCompletion(
      params,
      {
        onChunk: async (delta: string, usage?: UsageData) => {
          streamedAssistantContent += delta;
          await this.events?.emit({
            type: AgentEventTypes.AssistantChunk,
            conversationId: convo,
            messageId: msgId,
            delta: cleanDelta,
          });
        },
        onReasoningChunk: async (delta: string) => {
          await this.events?.emit({
            type: AgentEventTypes.ReasoningChunk,
            conversationId: convo,
            messageId: msgId,
            delta,
          });
        },
        onStreamFinish: async (finishReason?: string, usage?: UsageData) => {
          await this.events?.emit({
            type: AgentEventTypes.StreamFinish,
            conversationId: convo,
            messageId: msgId,
            finishReason,
            usage,
          });
        },
      },
      opts.signal,
    );
  } else {
    result = await _llm.generateCompletion(params, opts.signal);
  }

  // 10. Save assistant message
  if (!result.tool_calls?.length && result.content) {
    const assistantMsg: Message = {
      id: msgId,
      role: 'assistant',
      content: opts.stream ? streamedAssistantContent : result.content,
      timestamp: this.clock.iso(),
      usage: result.usage,
    };
    await this.memory.append(convo, [assistantMsg]);
  }

  // 11. Handle tool calls (if any)
  while (result.tool_calls?.length) {
    // Process tool calls with approval workflow
    // Execute tools
    // Get tool results
    // Make another LLM call with results
  }

  return { /* response */ };
}
```

### 3.2 Message Building

**Location:** `packages/nuvin-core/src/orchestrator.ts:50-120`

The `buildMessageParts` function constructs the message content:

```typescript
function buildMessageParts(text: string, attachments: UserAttachment[]): MessageContentPart[] {
  if (attachments.length === 0) {
    return text ? [{ type: 'text', text }] : [];
  }

  let remainder = text;
  const parts: MessageContentPart[] = [];
  const deferred: UserAttachment[] = [];

  // Replace attachment tokens with actual attachments
  for (const attachment of attachments) {
    const token = attachment.token;
    if (!token) {
      deferred.push(attachment);
      continue;
    }

    const idx = remainder.indexOf(token);
    if (idx === -1) {
      deferred.push(attachment);
      continue;
    }

    // Text before token
    const before = removeAttachmentTokens(remainder.slice(0, idx), attachments);
    if (before.length > 0) {
      parts.push({ type: 'text', text: before });
    }

    // Image part
    parts.push({
      type: 'image',
      data: attachment.data,
      mimeType: attachment.mimeType,
      altText: attachment.altText,
      source: attachment.source,
      name: attachment.name,
    });

    remainder = remainder.slice(idx + token.length);
  }

  // Remaining text
  const tail = removeAttachmentTokens(remainder, attachments);
  if (tail.length > 0) {
    parts.push({ type: 'text', text: tail });
  }

  // Deferred attachments (no token found)
  for (const attachment of deferred) {
    parts.push({
      type: 'image',
      data: attachment.data,
      mimeType: attachment.mimeType,
      altText: attachment.altText,
      source: attachment.source,
      name: attachment.name,
    });
  }

  return parts;
}
```

### 3.3 Provider Message Conversion

**Location:** `packages/nuvin-core/src/context.ts` (SimpleContextBuilder)

Messages are converted to provider-specific format:

```typescript
// Input: Message[] (internal format)
// Output: ChatMessage[] (provider format)

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null | ProviderContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

type ProviderContentPart = 
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' }; }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' }; };
```

Images are converted to data URIs:
```typescript
function partsToProviderContent(parts: Array<TextContentPart | ImageContentPart>): ProviderContentPart[] {
  const result: ProviderContentPart[] = [];
  for (const part of parts) {
    if (part.type === 'text') {
      if (part.text.length > 0) {
        result.push({ type: 'text', text: part.text });
      }
    } else {
      const url = `data:${part.mimeType};base64,${part.data}`;
      result.push({ 
        type: 'image_url', 
        image_url: { url } 
      });
    }
  }
  return result;
}
```

### 3.4 LLM Transport Layer

**Location:** `packages/nuvin-core/src/transports/`

The LLM transport layer handles provider-specific API calls:

- `anthropic-transport.ts` - Anthropic API implementation
- `base-bearer-auth-transport.ts` - Base class for bearer auth
- `retry-transport.ts` - Retry logic with exponential backoff
- `llm-error-transport.ts` - Error classification and handling

**Key Interface:**
```typescript
interface LLMPort {
  generateCompletion(params: CompletionParams, signal?: AbortSignal): Promise<CompletionResult>;
  streamCompletion?(params: CompletionParams, handlers: StreamHandlers, signal?: AbortSignal): Promise<CompletionResult>;
}
```

---

## 4. Message Storage

### 4.1 Memory Port Interface

**Location:** `packages/nuvin-core/src/ports.ts:400-450`

```typescript
interface MemoryPort<T> {
  get(key: string): Promise<T[]>;
  set(key: string, items: T[]): Promise<void>;
  append(key: string, items: T[]): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}
```

### 4.2 In-Memory Implementation

**Location:** `packages/nuvin-core/src/persistent/memory.ts:1-50`

```typescript
export class InMemoryMemory<T = unknown> implements MemoryPort<T> {
  private store = new Map<string, T[]>();

  async get(key: string): Promise<T[]> {
    return this.store.get(key) ?? [];
  }

  async set(key: string, items: T[]): Promise<void> {
    this.store.set(key, [...items]);
  }

  async append(key: string, items: T[]): Promise<void> {
    const existing = this.store.get(key) ?? [];
    this.store.set(key, [...existing, ...items]);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
}
```

### 4.3 Persisted Memory Implementation

**Location:** `packages/nuvin-core/src/persistent/memory.ts:80-130`

```typescript
export class PersistedMemory<T = unknown> implements MemoryPort<T> {
  private inner = new InMemoryMemory<T>();
  private initialized = false;

  constructor(private persistence: MemoryPersistence<T>) {}

  private async ensureInitialized() {
    if (this.initialized) return;
    const snap = await this.persistence.load();
    if (snap && typeof snap === 'object') {
      await this.inner.importSnapshot(snap);
    }
    this.initialized = true;
  }

  private async save() {
    const snap = await this.inner.exportSnapshot();
    await this.persistence.save(snap);
  }

  async append(key: string, items: T[]): Promise<void> {
    await this.ensureInitialized();
    await this.inner.append(key, items);
    await this.save();  // Write to file on every append
  }
}
```

### 4.4 JSON File Persistence

**Location:** `packages/nuvin-core/src/persistent/memory.ts:52-78`

```typescript
export class JsonFileMemoryPersistence<T = unknown> implements MemoryPersistence<T> {
  constructor(private filename: string = 'history.json') {}

  async load(): Promise<MemorySnapshot<T>> {
    try {
      const fs = await import('node:fs');
      if (!fs.existsSync(this.filename)) return {};
      const text = fs.readFileSync(this.filename, 'utf-8');
      const data = JSON.parse(text);
      return typeof data === 'object' && data ? data : {};
    } catch {
      console.warn(`Failed to load memory from ${this.filename}`);
      return {};
    }
  }

  async save(snapshot: MemorySnapshot<T>): Promise<void> {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const dir = path.dirname(this.filename);
      if (dir && dir !== '.' && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filename, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`Failed to save memory to ${this.filename}`, err);
    }
  }
}
```

### 4.5 Storage Format

**File Structure:**
```
~/.nuvin/sessions/
  ├── {sessionId}/
  │   ├── history.cli.json          # Main CLI conversation messages
  │   ├── history.agent:{type}:{id}.json  # Sub-agent conversation messages (if any)
  │   ├── events.json               # Event log
  │   └── http-log.json             # HTTP request log (if enabled)
  └── ...
```

**history.cli.json Format:**
```json
{
  "default": [
    {
      "id": "uuid-1",
      "role": "user",
      "content": "Hello, how are you?",
      "timestamp": "2026-03-19T00:00:00.000Z"
    },
    {
      "id": "uuid-2",
      "role": "assistant",
      "content": "I'm doing well, thank you!",
      "timestamp": "2026-03-19T00:00:01.000Z",
      "usage": {
        "prompt_tokens": 10,
        "completion_tokens": 5,
        "total_tokens": 15
      }
    }
  ],
  "__metadata__default": {
    "topic": "Greeting",
    "createdAt": "2026-03-19T00:00:00.000Z",
    "updatedAt": "2026-03-19T00:00:01.000Z",
    "messageCount": 2,
    "totalTokens": 15
  }
}
```

### 4.6 Conversation Store

**Location:** `packages/nuvin-core/src/conversation-store.ts:1-150`

The `ConversationStore` provides a higher-level API for managing conversations:

```typescript
export class ConversationStore {
  private metadataMemory: MetadataPort<ConversationMetadata>;

  constructor(
    private memory: MemoryPort<Message>,
    metadataMemory?: MetadataPort<ConversationMetadata>,
  ) {
    this.metadataMemory = metadataMemory ?? 
      new MemoryPortMetadataAdapter<ConversationMetadata>(memory);
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    const messages = await this.memory.get(conversationId);
    const metadata = await this.metadataMemory.get(conversationId);

    return {
      messages,
      metadata: metadata ?? {
        createdAt: messages[0]?.timestamp,
        updatedAt: messages[messages.length - 1]?.timestamp,
        messageCount: messages.length,
      },
    };
  }

  async appendMessages(conversationId: string, messages: Message[]): Promise<void> {
    if (messages.length === 0) return;

    // Append to message history
    await this.memory.append(conversationId, messages);

    // Update metadata
    const allMessages = await this.memory.get(conversationId);
    const metadata = await this.metadataMemory.get(conversationId);
    const updatedMetadata: ConversationMetadata = {
      ...metadata,
      updatedAt: messages[messages.length - 1]?.timestamp ?? new Date().toISOString(),
      messageCount: allMessages.length,
    };

    await this.metadataMemory.set(conversationId, updatedMetadata);
  }

  async recordRequestMetrics(
    conversationId: string,
    metrics: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      toolCalls?: number;
      responseTimeMs?: number;
      cost?: number;
    },
  ): Promise<ConversationMetadata> {
    const metadata = await this.metadataMemory.get(conversationId);

    const updatedMetadata: ConversationMetadata = {
      ...metadata,
      promptTokens: (metadata?.promptTokens ?? 0) + (metrics.promptTokens ?? 0),
      completionTokens: (metadata?.completionTokens ?? 0) + (metrics.completionTokens ?? 0),
      totalTokens: (metadata?.totalTokens ?? 0) + (metrics.totalTokens ?? 0),
      requestCount: (metadata?.requestCount ?? 0) + 1,
      toolCallCount: (metadata?.toolCallCalls ?? 0) + (metrics.toolCalls ?? 0),
      totalTimeMs: (metadata?.totalTimeMs ?? 0) + (metrics.responseTimeMs ?? 0),
      totalPrice: (metadata?.totalPrice ?? 0) + (metrics.cost ?? 0),
      contextWindow: {
        promptTokens: metrics.promptTokens,
        completionTokens: metrics.completionTokens,
        totalTokens: metrics.totalTokens,
      },
      updatedAt: new Date().toISOString(),
    };

    await this.metadataMemory.set(conversationId, updatedMetadata);
    return updatedMetadata;
  }
}
```

---

## 5. Event Flow

### 5.1 Event Bus Architecture

**Location:** `packages/nuvin-cli/source/services/EventBus.ts:1-80`

The system uses a typed event bus for component communication:

```typescript
export class TypedEventBus {
  private emitter = new EventEmitter();

  on<K extends keyof EventMap>(
    event: K, 
    handler: (payload: EventMap[K]) => void
  ) {
    this.emitter.on(event, handler);
  }

  off<K extends keyof EventMap>(
    event: K, 
    handler: (payload: EventMap[K]) => void
  ) {
    this.emitter.off(event, handler);
  }

  emit<K extends keyof EventMap>(
    event: K, 
    payload?: EventMap[K]
  ) {
    this.emitter.emit(event, payload);
  }
}

export const eventBus = new TypedEventBus();
```

### 5.2 Event Types

**UI Events:**
- `ui:line` - Add a message line to the display
- `ui:error` - Display an error message
- `ui:toolCalls` - Tool calls waiting for approval
- `ui:lines:clear` - Clear all message lines
- `ui:lines:set` - Replace all message lines
- `ui:header:refresh` - Refresh the header display
- `ui:exit:start` - Application exit started

**Agent Events:**
- `agent:event` - Generic agent event (forwarded from EventPort)
- `agent:swapped` - Agent was swapped

**Command Events:**
- `command:sudo:toggle` - Toggle sudo mode
- `ui:command:activated` - Command activated
- `ui:command:deactivated` - Command deactivated
- `custom-command:execute` - Execute custom command

**MCP Events:**
- `mcp:serversChanged` - MCP servers changed
- `ui:mcp:toolPermissionChanged` - Tool permission changed

### 5.3 Agent Event Flow

**Location:** `packages/nuvin-core/src/ports.ts` (AgentEventTypes)

The orchestrator emits events throughout the message lifecycle:

```typescript
enum AgentEventTypes {
  MessageStarted = 'message-started',        // User message processing started
  AssistantChunk = 'assistant-chunk',        // Streaming response chunk
  AssistantMessage = 'assistant-message',    // Complete assistant message
  ToolCalls = 'tool-calls',                  // Tool calls generated
  ToolResult = 'tool-result',                // Tool execution result
  ToolOutputChunk = 'tool-output-chunk',     // Tool output streaming
  ReasoningChunk = 'reasoning-chunk',        // Reasoning/thinking chunk
  StreamFinish = 'stream-finish',            // Stream completed
  Done = 'done',                             // Turn completed
  Error = 'error',                           // Error occurred
  
  // Sub-agent events
  SubAgentStarted = 'sub-agent-started',
  SubAgentToolCall = 'sub-agent-tool-call',
  SubAgentToolResult = 'sub-agent-tool-result',
  SubAgentCompleted = 'sub-agent-completed',
  SubAgentMetrics = 'sub-agent-metrics',
}
```

### 5.4 Event Processing Pipeline

**Location:** `packages/nuvin-cli/source/utils/eventProcessor.ts:1-400`

Events are processed by the `processAgentEvent` function:

```typescript
export function processAgentEvent(
  event: AgentEvent,
  state: EventProcessorState,
  callbacks: EventProcessorCallbacks,
): EventProcessorState | Promise<EventProcessorState> {
  switch (event.type) {
    case AgentEventTypes.MessageStarted: {
      // Display user message if configured
      if (callbacks.renderUserMessages && event.userContent) {
        callbacks.appendLine({
          id: crypto.randomUUID(),
          type: 'user',
          content: event.userContent,
          metadata: { timestamp: now() },
          color: theme.tokens.cyan,
        });
      }
      return { /* reset state for new turn */ };
    }

    case AgentEventTypes.AssistantChunk: {
      if (!callbacks.streamingEnabled) return state;

      const chunk = event.delta || '';

      // First chunk: create new message line
      if (!state.streamingMessageId) {
        const messageId = crypto.randomUUID();
        callbacks.appendLine({
          id: messageId,
          type: 'assistant',
          content: chunk,
          metadata: { timestamp: now(), isStreaming: true },
        });

        return {
          ...state,
          streamingMessageId: messageId,
          streamingContent: chunk,
        };
      }

      // Subsequent chunks: update existing line
      const newContent = state.streamingContent + chunk;
      callbacks.updateLine?.(state.streamingMessageId, newContent);

      return {
        ...state,
        streamingContent: newContent,
      };
    }

    case AgentEventTypes.ToolCalls: {
      const messageId = crypto.randomUUID();
      const enrichedToolCalls = await enrichToolCallsWithLineNumbers(event.toolCalls);

      callbacks.appendLine({
        id: messageId,
        type: 'tool',
        content: `${enrichedToolCalls.map(renderToolCall).join(', ')}`,
        metadata: {
          toolCallCount: enrichedToolCalls.length,
          timestamp: now(),
          toolCalls: enrichedToolCalls,
        },
        color: theme.tokens.blue,
      });

      // Emit for ToolApprovalContext
      callbacks.onToolCalls?.({ toolCalls: enrichedToolCalls });

      return {
        ...state,
        toolCallCount: state.toolCallCount + enrichedToolCalls.length,
        recentToolCalls: new Map(state.recentToolCalls),
        lastToolCallMessageId: messageId,
      };
    }

    case AgentEventTypes.ToolResult: {
      const tool = event.result;
      const statusIcon = tool.status === 'success' ? '[+]' : '[!]';
      const durationText = tool.durationMs ? ` (${tool.durationMs}ms)` : '';

      callbacks.appendLine({
        id: crypto.randomUUID(),
        type: 'tool_result',
        content: tool.status === 'success'
          ? `${tool.name}: ${statusIcon} ${tool.status}${durationText}`
          : `error: ${flattenError(tool).slice(0, 1000)}`,
        metadata: {
          toolName: tool.name,
          status: tool.status,
          duration: tool.durationMs,
          timestamp: now(),
          toolResult: tool,
        },
        color: tool.status === 'success' ? theme.tokens.green : theme.tokens.red,
      });

      // Clean up tracking
      const nextRecentToolCalls = new Map(state.recentToolCalls);
      nextRecentToolCalls.delete(tool.id);

      return {
        ...state,
        recentToolCalls: nextRecentToolCalls,
      };
    }

    case AgentEventTypes.Done: {
      // Clear streaming flags
      if (state.streamingMessageId) {
        callbacks.updateLineMetadata?.(state.streamingMessageId, { isStreaming: false });
      }
      return {
        ...state,
        streamingMessageId: null,
      };
    }

    case AgentEventTypes.Error: {
      callbacks.appendLine({
        id: crypto.randomUUID(),
        type: 'error',
        content: `error: ${flattenError(event.error)}`,
        metadata: { timestamp: now() },
        color: theme.tokens.red,
      });
      return state;
    }
  }
}
```

### 5.5 UI Event Adapter

**Location:** `packages/nuvin-cli/source/adapters/ui-event-adapter.tsx:59-108`

The `UIEventAdapter` bridges agent events to UI updates:

```typescript
export class UIEventAdapter extends PersistingConsoleEventPort {
  private state: EventProcessorState = resetEventProcessorState();
  private streamingEnabled: boolean;
  private readonly callbacks: EventProcessorCallbacks;

  constructor(
    private appendLine: (line: MessageLine) => void,
    private updateLine: (id: string, content: string) => void,
    private updateLineMetadata: (id: string, metadata: Partial<LineMetadata>) => void,
    opts?: { filename?: string; streamingEnabled?: boolean },
  ) {
    // Persist events to file if filename provided
    super(opts?.filename 
      ? { filename: opts.filename } 
      : { memory: new InMemoryMemory<AgentEvent>() }
    );
    
    this.streamingEnabled = opts?.streamingEnabled ?? false;
    this.callbacks = {
      appendLine: this.appendLine,
      updateLine: this.updateLine,
      updateLineMetadata: this.updateLineMetadata,
      streamingEnabled: this.streamingEnabled,
      onToolCalls: (event) => {
        eventBus.emit('ui:toolCalls', event);
      },
    };
  }

  async emit(event: AgentEvent): Promise<void> {
    try {
      // Persist non-chunk events
      const shouldPersist = event.type !== AgentEventTypes.ToolOutputChunk;
      if (shouldPersist) {
        await super.emit(event);
      }
      
      // Process event for UI
      this.state = await this.processEventSafely(event);
      
      // Forward to event bus
      if (shouldPersist) {
        eventBus.emit('agent:event', event);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      eventBus.emit('ui:error', `[EventAdapter] Failed to process ${event.type}: ${errorMsg}`);
    }
  }

  private async processEventSafely(event: AgentEvent): Promise<EventProcessorState> {
    this.callbacks.streamingEnabled = this.streamingEnabled;
    const result = processAgentEvent(event, this.state, this.callbacks);
    return result instanceof Promise ? await result : result;
  }
}
```

---

## 6. Complete Message Flow Sequence

### 6.1 Sequence Diagram

```
User                    InteractionArea    useHandleSubmit    prepareUserSubmission    processMessage    SendPipeline    AgentOrchestrator    Memory    LLM    EventPort    UIEventAdapter    EventBus    UI
 |                            |                  |                    |                    |               |                |         |        |           |              |          |
 |-- type message ------------>|                  |                    |                    |               |                |         |        |           |              |          |
 |-- press Enter ------------->|                  |                    |                    |               |                |         |        |           |              |          |
 |                            |-- handleSubmit ->|                    |                    |               |                |         |        |           |              |          |
 |                            |                  |-- parse input --->|                    |               |                |         |        |           |              |          |
 |                            |                  |<-- submission ----|                    |               |                |         |        |           |              |          |
 |                            |                  |-- processMessage >|                    |               |                |         |        |           |              |          |
 |                            |                  |                    |-- append user --->|---------------|---------------->|         |        |           |              |          |
 |                            |                  |                    |                    |               |-- send ------>|         |        |           |              |          |
 |                            |                  |                    |                    |               |                |-- get ->|         |        |           |              |          |
 |                            |                  |                    |                    |               |                |<-- history -------|        |           |              |          |
 |                            |                  |                    |                    |               |                |-- append user -->|        |           |              |          |
 |                            |                  |                    |                    |               |                |         |        |-- emit(MessageStarted) ->|           |              |          |
 |                            |                  |                    |                    |               |                |         |        |           |<-- process --|              |          |
 |                            |                  |                    |                    |               |                |         |        |           |              |-- emit(ui:line) ->|
 |                            |                  |                    |                    |               |                |         |        |           |              |              |-- display user message
 |                            |                  |                    |                    |               |                |         |        |-- generateCompletion ---->|         |              |          |
 |                            |                  |                    |                    |               |                |         |        |<-- stream chunks ---------|         |              |          |
 |                            |                  |                    |                    |               |                |         |        |-- emit(AssistantChunk) ->|           |              |          |
 |                            |                  |                    |                    |               |                |         |        |           |<-- process --|              |          |
 |                            |                  |                    |                    |               |                |         |        |           |              |-- emit(ui:line) ->|
 |                            |                  |                    |                    |               |                |         |        |           |              |              |-- update assistant message
 |                            |                  |                    |                    |               |                |         |        |<-- result --------------|         |              |          |
 |                            |                  |                    |                    |               |                |         |        |-- emit(AssistantMessage) ->|           |              |          |
 |                            |                  |                    |                    |               |                |         |        |           |<-- process --|              |          |
 |                            |                  |                    |                    |               |                |         |        |           |              |-- emit(ui:line) ->|
 |                            |                  |                    |                    |               |                |         |        |           |              |              |-- finalize assistant message
 |                            |                  |                    |                    |               |                |-- append assistant ->|        |           |              |          |
 |                            |                  |                    |                    |               |                |         |        |           |              |              |-- save to history.json
 |                            |                  |                    |                    |               |<-- return ------|         |        |           |              |          |
 |                            |                  |                    |<-- return ---------|               |                |         |        |           |              |          |
```

### 6.2 Step-by-Step Flow

1. **User Input** (InteractionArea)
   - User types message in input field
   - Presses Enter to submit

2. **Input Validation** (useHandleSubmit.ts:45-120)
   - Check if command (starts with `/`)
   - If command: execute command handler
   - If message: continue to submission preparation

3. **Submission Preparation** (userSubmission.ts:1-180)
   - Parse clipboard files (images)
   - Parse inline data URIs
   - Parse file references (`@"/path/to/image.png"`)
   - Create `UserMessagePayload` with attachments
   - Generate display text with `[image:label]` placeholders

4. **Message Display** (app.tsx:220-260)
   - Append user message to UI immediately
   - Set busy state
   - Create abort controller

5. **Send Pipeline** (SendPipeline.ts:60-130)
   - **Pre-send hooks:**
     - Initialize session if needed
     - Refresh LLM instance
     - Inject long-term memory into system prompt
     - Apply configuration overrides
     - Check context window limits
   - **Core send:** Call orchestrator.send()
   - **Post-send hooks:**
     - Update metadata (tokens, cost, timing)
     - Check context window usage

6. **Orchestrator Processing** (orchestrator.ts:650-850)
   - Load conversation history from memory
   - Normalize user input
   - Build message parts (text + images)
   - Convert to provider format
   - Save user message to memory
   - Emit `MessageStarted` event
   - Build completion parameters
   - Call LLM (streaming or non-streaming)

7. **LLM Communication** (transports/)
   - Make API request to provider
   - Stream response chunks
   - Emit `AssistantChunk` events for each chunk
   - Emit `StreamFinish` event when complete

8. **Event Processing** (eventProcessor.ts)
   - Receive events from EventPort
   - Update UI state
   - Append/update message lines
   - Track streaming state

9. **Response Storage** (orchestrator.ts:805-832)
   - Save assistant message to memory
   - Emit `AssistantMessage` event
   - Trigger file write (if persisted)

10. **Tool Execution** (if tool calls)
    - Emit `ToolCalls` event
    - Wait for user approval (if required)
    - Execute tools
    - Emit `ToolResult` events
    - Make another LLM call with results
    - Repeat until no more tool calls

11. **Completion** (orchestrator.ts)
    - Emit `Done` event
    - Return response to caller

12. **Final UI Update** (eventProcessor.ts)
    - Clear streaming flags
    - Update message metadata
    - Display final state

---

## 7. Key Data Structures

### 7.1 Message Types

**Internal Message Format:**
```typescript
type Message = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: MessageContent;
  timestamp: string;
  usage?: UsageData;
  reasoning?: string;
  thinking_blocks?: unknown[];
};

type MessageContent =
  | string
  | null
  | {
      type: 'parts';
      parts: MessageContentPart[];
    };

type MessageContentPart =
  | { type: 'text'; text: string }
  | { 
      type: 'image'; 
      mimeType: string; 
      data: string;  // base64
      altText?: string;
      source?: string;
      name?: string;
    };
```

**Provider ChatMessage Format:**
```typescript
type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null | ProviderContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

type ProviderContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };
```

### 7.2 UI Message Line

**Location:** `packages/nuvin-cli/source/adapters/ui-event-adapter.tsx:51-57`

```typescript
type MessageLine = {
  id: string;
  type: 'user' | 'assistant' | 'tool' | 'tool_result' | 'system' | 'error' | 'warning' | 'info' | 'thinking';
  content: string;
  metadata?: LineMetadata;
  color?: string;
};

type LineMetadata = {
  timestamp?: string;
  toolName?: string;
  status?: 'success' | 'error';
  duration?: number;
  toolCallCount?: number;
  toolCalls?: ToolCall[];
  toolResult?: ToolExecutionResult;
  toolCall?: ToolCall;
  isStreaming?: boolean;
  subAgentState?: SubAgentState;
};
```

### 7.3 Tool Call Structure

**Location:** `packages/nuvin-core/src/ports.ts:36-47`

```typescript
type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON string
  };
  editInstruction?: string;
  approvalId?: string;
  requiresApproval?: boolean;
};

type ToolExecutionResult = {
  id: string;
  name: string;
  status: 'success' | 'error';
  type: 'text' | 'image' | 'composite';
  result: string;
  metadata?: ToolErrorMetadata;
  durationMs: number;
};
```

---

## 8. File Organization

### 8.1 Core Components

| Component | Location | Purpose |
|-----------|----------|---------|
| App | `packages/nuvin-cli/source/app.tsx` | Main application component |
| InteractionArea | `packages/nuvin-cli/source/components/InteractionArea.tsx` | Input UI component |
| OrchestratorManager | `packages/nuvin-cli/source/services/OrchestratorManager.ts` | Orchestrator lifecycle management |
| SendPipeline | `packages/nuvin-cli/source/services/SendPipeline.ts` | Message processing pipeline |
| EventBus | `packages/nuvin-cli/source/services/EventBus.ts` | Typed event bus |
| UIEventAdapter | `packages/nuvin-cli/source/adapters/ui-event-adapter.tsx` | Event-to-UI bridge |

### 8.2 Core Logic

| Component | Location | Purpose |
|-----------|----------|---------|
| AgentOrchestrator | `packages/nuvin-core/src/orchestrator.ts` | Core message orchestration |
| ConversationStore | `packages/nuvin-core/src/conversation-store.ts` | Conversation management |
| Memory Ports | `packages/nuvin-core/src/persistent/memory.ts` | Storage abstraction |
| LLM Transports | `packages/nuvin-core/src/transports/` | Provider API implementations |

### 8.3 Utilities

| Component | Location | Purpose |
|-----------|----------|---------|
| useHandleSubmit | `packages/nuvin-cli/source/hooks/useHandleSubmit.ts` | Input submission handler |
| prepareUserSubmission | `packages/nuvin-cli/source/utils/userSubmission.ts` | Input parsing and attachment handling |
| eventProcessor | `packages/nuvin-cli/source/utils/eventProcessor.ts` | Event-to-UI conversion |
| messageProcessor | `packages/nuvin-cli/source/utils/messageProcessor.ts` | Message formatting |

---

## 9. Configuration and Session Management

### 9.1 Session Initialization

**Location:** `packages/nuvin-cli/source/services/orchestrator-modules/SessionManager.ts`

Sessions are created with:
- Unique session ID (timestamp-based)
- Session directory in `~/.nuvin/sessions/{sessionId}/`
- Memory instance (persisted or in-memory)
- Event adapter (persisted or in-memory)
- Conversation store

### 9.2 Memory Persistence

**Configuration:**
```typescript
type SessionConfig = {
  memPersist?: boolean;  // Enable file persistence
  sessionId?: string;    // Resume existing session
  sessionDir?: string;   // Custom session directory
};
```

**Storage Locations:**
- Messages: `{sessionDir}/history.json`
- Events: `{sessionDir}/events.json`
- HTTP Log: `{sessionDir}/http-log.json` (if enabled)

### 9.3 Profile-Based Sessions

**Location:** `packages/nuvin-cli/source/config/profile-manager.ts`

Sessions can be organized by profiles:
```
~/.nuvin/
  ├── profiles/
  │   ├── default/
  │   │   └── sessions/
  │   └── work/
  │       └── sessions/
```

---

## 10. Error Handling

### 10.1 Error Flow

1. **Input Validation Errors** (useHandleSubmit)
   - Display error message in UI
   - Don't send to orchestrator

2. **Orchestrator Errors** (orchestrator.send)
   - Emit `Error` event
   - Display error in UI
   - Don't save partial state

3. **LLM Errors** (transports)
   - Retry with exponential backoff
   - Classify error type
   - Emit `Error` event if retries exhausted

4. **Tool Execution Errors**
   - Emit `ToolResult` with status='error'
   - Include error metadata
   - Continue with other tools

### 10.2 Error Events

**Location:** `packages/nuvin-cli/source/utils/eventProcessor.ts:400-420`

```typescript
case AgentEventTypes.Error: {
  if (state.streamingMessageId) {
    callbacks.updateLineMetadata?.(state.streamingMessageId, { isStreaming: false });
  }
  
  callbacks.appendLine({
    id: crypto.randomUUID(),
    type: 'error',
    content: `error: ${flattenError(event.error)}`,
    metadata: { timestamp: now() },
    color: theme.tokens.red,
  });
  
  return {
    ...state,
    streamingMessageId: null,
  };
}
```

---

## 11. Performance Considerations

### 11.1 Streaming

- **Enabled by default** for real-time feedback
- **Chunk events** bypass persistence to avoid excessive file I/O
- **UI updates** happen incrementally
- **Final message** saved once at completion

### 11.2 File I/O

- **Messages appended** to history.json on each turn
- **Events persisted** to events.json for replay
- **HTTP logging** optional (disabled by default)
- **Atomic writes** using `fs.writeFileSync`

### 11.3 Memory Management

- **In-memory cache** of conversation history
- **Lazy loading** of persisted sessions
- **Context window management** with automatic summarization
- **Metadata tracking** for efficient queries

---

## 12. Testing and Debugging

### 12.1 Event Replay

**Location:** `packages/nuvin-cli/source/utils/eventReplay.ts`

Events can be replayed from `events.json` for debugging:
```typescript
async function replayEvents(eventFile: string, handlers: EventProcessorCallbacks) {
  const events = await loadEvents(eventFile);
  for (const event of events) {
    await processAgentEvent(event, state, handlers);
  }
}
```

### 12.2 Session Export/Import

**Location:** `packages/nuvin-core/src/conversation-store.ts:130-150`

```typescript
async exportSnapshot(): Promise<ConversationSnapshot> {
  const snapshot: ConversationSnapshot = {};
  const conversations = await this.listConversations();

  for (const { id } of conversations) {
    const conversation = await this.getConversation(id);
    snapshot[id] = conversation;
  }

  return snapshot;
}

async importSnapshot(snapshot: ConversationSnapshot): Promise<void> {
  for (const [id, conversation] of Object.entries(snapshot)) {
    await this.setConversation(id, conversation);
  }
}
```

---

## 13. Open Questions and Future Work

### 13.1 Identified Gaps

1. **Message Deduplication** - No mechanism to detect and prevent duplicate messages
2. **Compression Strategy** - Context window compression uses simple summarization
3. **Concurrency Control** - Multiple simultaneous sends not explicitly prevented
4. **Recovery from Corruption** - Limited handling of corrupted history.{agentId}.json files

### 13.2 Potential Improvements

1. **Streaming Persistence** - Consider periodic checkpoints during long streams
2. **Indexing** - Add message indexing for faster queries on large histories
3. **Compression** - Implement more sophisticated context compression
4. **Validation** - Add schema validation for history.json on load

---

## 14. Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Entry Point Flow | HIGH | Traced from UI component through hooks |
| Message Processing | HIGH | Complete pipeline documented with code |
| LLM Integration | HIGH | Full flow from params to response |
| Storage Layer | HIGH | File format and persistence understood |
| Event System | HIGH | All event types and processors mapped |
| Tool Execution | MEDIUM | High-level flow clear, some details complex |
| Error Handling | MEDIUM | Main paths documented, edge cases less clear |

**Overall Confidence:** HIGH

The message flow is well-architected with clear separation of concerns. All major paths have been traced through the codebase with specific file:line references.

---

## 15. Key Takeaways

1. **Dual-Path Architecture:** Events flow to both UI (real-time) and storage (persistent), enabling responsive UX while maintaining complete history.

2. **Middleware Pipeline:** The SendPipeline provides a clean extension point for cross-cutting concerns (memory injection, context management, etc.).

3. **Typed Events:** Strong typing throughout the event system prevents runtime errors and enables better IDE support.

4. **Streaming-First:** The system is designed around streaming responses, with non-streaming as a fallback.

5. **Storage Abstraction:** The MemoryPort interface allows easy swapping between in-memory and file-based storage.

6. **Attachment Handling:** Sophisticated attachment parsing supports multiple input methods (clipboard, inline, file references).

7. **Metadata Tracking:** Rich metadata (tokens, cost, timing) is tracked for every interaction.

8. **Session Management:** Sessions provide isolation and persistence boundaries for conversations.

9. **Error Resilience:** Errors are handled at multiple layers with appropriate fallbacks.

10. **Extensibility:** The architecture supports adding new tools, providers, and event processors without modifying core logic.
