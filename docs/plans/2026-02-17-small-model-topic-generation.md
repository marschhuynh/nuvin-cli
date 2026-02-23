# Small Model for Topic Generation — Implementation Plan

> **For Nuvin:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a per-provider `smallModel` config field with sensible defaults, and use it for conversation topic generation instead of the main (expensive) model.

**Architecture:** Each provider in the config gets an optional `smallModel` field. A `defaultSmallModels` map provides fallback values. The `analyzeTopic()` method is simplified from a full AgentOrchestrator to a direct `llm.generateCompletion()` call using the small model. The call site in `app.tsx` is re-enabled as fire-and-forget.

**Tech Stack:** TypeScript, nuvin-core LLM abstractions

---

### Task 1: Add `smallModel` to ProviderConfig type

**Files:**
- Modify: `packages/nuvin-cli/source/config/types.ts:24-55`

**Step 1: Add the field**

In the `ProviderConfig` interface, add `smallModel` after the existing `defaultModel` field:

```typescript
  /** Small/cheap model for utility tasks (topic generation, summaries) */
  smallModel?: string;
```

The field goes after line 32 (`defaultModel?: string;`).

**Step 2: Verify no type errors**

Run: `cd packages/nuvin-cli && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/config/types.ts
git commit -m "feat: add smallModel field to ProviderConfig type"
```

---

### Task 2: Add default small models map

**Files:**
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts:63-70`

**Step 1: Add the defaults map**

After the existing `defaultModels` map (line 70), add:

```typescript
const defaultSmallModels: Record<ProviderKey, string> = {
  openrouter: 'openai/gpt-4.1-mini',
  deepinfra: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
  github: 'gpt-4.1-mini',
  zai: 'glm-5',
  anthropic: 'claude-haiku-3-5',
  moonshot: 'moonshot-v1-8k',
};
```

**Step 2: Expose small model in `getCurrentConfig()`**

In the `getCurrentConfig()` method (line 192), resolve the small model. After line 195 (`const model = ...`), add:

```typescript
const providerConfig = config.providers?.[provider];
const smallModel = providerConfig?.smallModel || defaultSmallModels[provider] || model;
```

Then add `smallModel` to the return object (after `model` on line 208):

```typescript
return {
  config,
  provider,
  model,
  smallModel,
  // ... rest unchanged
};
```

**Step 3: Verify no type errors**

Run: `cd packages/nuvin-cli && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

**Step 4: Commit**

```bash
git add packages/nuvin-cli/source/services/OrchestratorManager.ts
git commit -m "feat: add defaultSmallModels map and resolve in getCurrentConfig"
```

---

### Task 3: Simplify `analyzeTopic()` to use small model with direct LLM call

**Files:**
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts:1282-1365`

**Step 1: Rewrite `analyzeTopic()`**

Replace the current implementation (lines 1282-1365) that creates a full `AgentOrchestrator` with a direct `llm.generateCompletion()` call. The new implementation:

```typescript
async analyzeTopic(userMessage: string, conversationId?: string): Promise<string> {
  const actualConversationId = conversationId ?? this.conversationContext.getActiveConversationId();

  let conversationHistory = '';
  if (this.memory) {
    try {
      const messages = await this.memory.get(actualConversationId);
      if (messages && messages.length > 0) {
        const userMessages = messages.filter((msg) => msg.role === 'user');
        if (userMessages.length > 0) {
          conversationHistory = userMessages
            .map((msg) => {
              let content = '';
              if (typeof msg.content === 'string') {
                content = msg.content;
              } else if (Array.isArray(msg.content)) {
                content = msg.content
                  .map((part: { type: string; text?: string }) => {
                    if (part.type === 'text') {
                      return part.text;
                    }
                    return '[non-text content]';
                  })
                  .join('\n');
              }
              return content;
            })
            .join('\n\n');
        }
      }
    } catch {
      // If we can't get history, continue with just the current message
    }
  }

  const topicPrompt = conversationHistory
    ? `Analyze the following user messages and extract the main topic or intent in 5-10 words. Be concise and descriptive.\n\nPrevious user messages:\n${conversationHistory}\n\nCurrent user message: ${userMessage}\n\nRespond with only the topic, no explanation.`
    : `Analyze the following user message and extract the main topic or intent in 5-10 words. Be concise and descriptive.\n\nUser message: ${userMessage}\n\nRespond with only the topic, no explanation.`;

  const currentConfig = this.getCurrentConfig();
  const llm = this.createLLM();

  try {
    const response = await llm.generateCompletion({
      model: currentConfig.smallModel,
      systemPrompt: 'You are a topic analyzer. Extract the main topic from user messages concisely.',
      messages: [{ role: 'user', content: topicPrompt }],
      temperature: 0.3,
      tools: [],
    });

    const text = response.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('')
      .trim();

    return text || userMessage.substring(0, 50);
  } catch {
    return userMessage.length < 50 ? userMessage : userMessage.substring(0, 50);
  }
}
```

Key changes:
- Uses `currentConfig.smallModel` instead of the main model
- Direct `llm.generateCompletion()` instead of creating an `AgentOrchestrator`
- Removes `InMemoryMemory`, `ToolRegistry`, `AgentRegistry` imports if no longer used elsewhere

**Step 2: Check if removed imports are still used elsewhere**

Search for `InMemoryMemory` usage in this file — if only used by the old `analyzeTopic`, the import can be cleaned up. Same for `AgentOrchestrator` if it's imported solely for this. Use grep to verify before removing.

**Step 3: Verify no type errors**

Run: `cd packages/nuvin-cli && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

**Step 4: Commit**

```bash
git add packages/nuvin-cli/source/services/OrchestratorManager.ts
git commit -m "refactor: simplify analyzeTopic to use small model with direct LLM call"
```

---

### Task 4: Re-enable topic generation in app.tsx

**Files:**
- Modify: `packages/nuvin-cli/source/app.tsx:237-240`

**Step 1: Uncomment and make fire-and-forget**

Replace the commented-out block (lines 237-240):

```typescript
// TODO: This feature is currently disabled
// if (orchestratorManager && displayContent) {
//   orchestratorManager.analyzeAndUpdateTopic(displayContent, 'cli');
// }
```

With a fire-and-forget call (no `await`, catch errors silently):

```typescript
if (orchestratorManager && displayContent) {
  orchestratorManager.analyzeAndUpdateTopic(displayContent).catch(() => {});
}
```

Note: removed the second argument `'cli'` — `analyzeAndUpdateTopic` already defaults to the active conversation ID. Verify the method signature at `OrchestratorManager.ts:1375` accepts this.

**Step 2: Verify `orchestratorManager` is in scope**

Check that `orchestratorManager` is accessible in the `processMessage` callback. Search for its declaration in app.tsx.

**Step 3: Verify no type errors**

Run: `cd packages/nuvin-cli && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

**Step 4: Commit**

```bash
git add packages/nuvin-cli/source/app.tsx
git commit -m "feat: re-enable conversation topic generation using small model"
```

---

### Task 5: Update tests

**Files:**
- Modify: `packages/nuvin-cli/tests/OrchestratorManager.topic.test.ts`

**Step 1: Unskip the test suite**

Change `describe.skip(` to `describe(` on line 24.

**Step 2: Update test expectations**

The tests mock `LLMFactory` and `generateCompletion`. Since we changed from `AgentOrchestrator` to direct `llm.generateCompletion()`, verify the mock setup still matches. The mock at lines 7-22 returns a completion response — this should still work since `generateCompletion` is the underlying call.

Review each test case and update if the call pattern changed (e.g., the mock may need to match the new `generateCompletion` argument shape instead of the orchestrator's `send()` method).

**Step 3: Run the tests**

Run: `cd packages/nuvin-cli && npx vitest run tests/OrchestratorManager.topic.test.ts`
Expected: All tests pass

**Step 4: Run full test suite**

Run: `cd packages/nuvin-cli && npx vitest run`
Expected: No regressions

**Step 5: Commit**

```bash
git add packages/nuvin-cli/tests/OrchestratorManager.topic.test.ts
git commit -m "test: unskip and update topic analysis tests for small model"
```

---

### Task 6: Final verification

**Step 1: Type check entire project**

Run: `cd packages/nuvin-cli && npx tsc --noEmit`
Expected: Clean

**Step 2: Run all tests**

Run: `cd packages/nuvin-cli && npx vitest run`
Expected: All pass

**Step 3: Manual smoke test**

Start the CLI, send a message, and verify:
- No errors in console
- Topic is generated (check session history with `/history`)
- The small model is used (check http log if `persistHttpLog` is enabled)
