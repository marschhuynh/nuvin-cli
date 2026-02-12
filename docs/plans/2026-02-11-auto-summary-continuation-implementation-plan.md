# Auto-Summary Continuation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When auto-summary triggers at context window threshold, automatically submit the generated summary context to the LLM and continue the task without waiting for a new user message.

**Architecture:** Keep summary/session-rotation behavior in `OrchestratorManager`, but add an explicit post-summary continuation turn for the auto-summary path only. Implement an internal guard so this continuation turn does not recursively trigger auto-summary again. Preserve existing `/summary` command behavior unless explicitly opted into continuation.

**Tech Stack:** TypeScript, Vitest, React/Ink event flow, `@nuvin/nuvin-core` orchestrator integration.

---

### Task 1: Add failing tests for post-summary continuation

**Files:**
- Modify: `packages/nuvin-cli/tests/context-window-auto-summary.test.ts`

**Step 1: Add a failing unit test for auto-summary continuation invocation**

```ts
it('should submit post-summary continuation turn after auto-summary', async () => {
  const sendSpy = vi.fn().mockResolvedValue({
    id: 'followup-1',
    role: 'assistant',
    content: 'Continuing from summary',
    timestamp: new Date().toISOString(),
    metadata: { promptTokens: 1200, completionTokens: 400, totalTokens: 1600 },
  });

  testableManager.send = sendSpy;
  // setup memory + summarize + createNewConversation mocks similar to existing >=95% tests

  await testableManager.checkContextWindowUsage('openrouter', 'openai/gpt-4o');

  expect(sendSpy).toHaveBeenCalledWith(
    expect.objectContaining({ text: expect.stringContaining('Previous conversation summary') }),
    expect.objectContaining({ conversationId: 'default' }),
    expect.objectContaining({ skipAutoSummaryCheck: true }),
  );
});
```

**Step 2: Add a failing unit test for recursion prevention**

```ts
it('should skip auto-summary check for internal post-summary continuation send', async () => {
  // call manager.send(...) with internal skipAutoSummaryCheck=true
  // assert checkContextWindowUsage is not invoked for this send path
});
```

**Step 3: Add a failing unit test for graceful continuation failure handling**

```ts
it('should emit warning and keep new summarized session if continuation send fails', async () => {
  // send mock rejects
  // expect auto-summary completion does not throw out of checkContextWindowUsage
  // expect warning ui:line was emitted
});
```

**Step 4: Run the targeted test file to verify failures**

Run: `cd packages/nuvin-cli && pnpm exec vitest run tests/context-window-auto-summary.test.ts`

Expected: New continuation tests fail before implementation.

**Step 5: Commit test-only changes**

```bash
git add packages/nuvin-cli/tests/context-window-auto-summary.test.ts
git commit -m "test(cli): add failing tests for auto-summary continuation"
```

### Task 2: Add internal send options for guarded continuation

**Files:**
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts`

**Step 1: Introduce manager-internal send option type**

```ts
type ManagerSendOptions = SendMessageOptions & {
  skipAutoSummaryCheck?: boolean;
};
```

**Step 2: Update `send()` signature to accept internal options**

```ts
async send(
  content: UserMessagePayload,
  opts: ManagerSendOptions = {},
  agentConfigOverrides: Partial<AgentConfig> = {},
)
```

**Step 3: Gate context-window check behind the internal flag**

```ts
if (result && this.conversationStore) {
  await this.updateConversationMetadataAfterSend(...);
  if (!opts.skipAutoSummaryCheck) {
    await this.checkContextWindowUsage(currentConfig.provider, currentConfig.model, {
      conversationId,
      signal: opts.signal,
    });
  }
}
```

**Step 4: Keep external call compatibility**

- Ensure all existing callsites that pass plain `SendMessageOptions` still compile.
- Do not expose `skipAutoSummaryCheck` in CLI user-facing APIs.

**Step 5: Commit**

```bash
git add packages/nuvin-cli/source/services/OrchestratorManager.ts
git commit -m "refactor(cli): add guarded internal send option for auto-summary continuation"
```

### Task 3: Implement auto-summary continuation flow in context-window handling

**Files:**
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts`

**Step 1: Expand `checkContextWindowUsage` inputs to include send context**

```ts
private async checkContextWindowUsage(
  provider: string,
  model: string,
  opts: { conversationId: string; signal?: AbortSignal },
): Promise<void>
```

**Step 2: Extend `summarizeAndCreateNewSession` return payload with continuation prompt**

```ts
const summaryPrompt = `Previous conversation summary:\n\n${summary}`;
return { summary, summaryPrompt, previousSessionId, newSessionId, newSessionDir };
```

**Step 3: In auto-summary branch, submit continuation turn after new session creation**

```ts
const summaryResult = await this.summarizeAndCreateNewSession();
await this.send(
  {
    text: `${summaryResult.summaryPrompt}\n\nContinue the task from where it left off. Do not ask me to repeat context unless required.`,
    displayText: summaryResult.summaryPrompt,
  },
  {
    conversationId: opts.conversationId,
    stream: true,
    signal: opts.signal,
    skipAutoSummaryCheck: true,
  },
);
```

**Step 4: Keep `/summary` command behavior unchanged**

- Manual `/summary` continues to summarize + create session + display summary, without automatic continuation.
- Auto-summary path is the only path that auto-resumes work.

**Step 5: Add robust failure handling for continuation send**

- If continuation send fails, keep the summarized session and emit a clear `ui:line` warning.
- Do not roll back to previous session.

**Step 6: Commit**

```bash
git add packages/nuvin-cli/source/services/OrchestratorManager.ts
git commit -m "feat(cli): continue task automatically after auto-summary"
```

### Task 4: Update tests to green and validate event behavior

**Files:**
- Modify: `packages/nuvin-cli/tests/context-window-auto-summary.test.ts`

**Step 1: Update existing tests that call `checkContextWindowUsage` directly**

- Pass new method arguments (e.g. `conversationId: 'default'`).
- Keep existing assertions for warning and summary event emissions.

**Step 2: Assert summary display + continuation behavior together**

- Verify summary user line appears.
- Verify follow-up assistant streaming/message events occur (or send was invoked with streaming).

**Step 3: Verify no duplicate user-summary storage events assumptions**

- Ensure tests reflect single summary prompt in memory semantics after refactor.

**Step 4: Run targeted tests**

Run: `cd packages/nuvin-cli && pnpm exec vitest run tests/context-window-auto-summary.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/nuvin-cli/tests/context-window-auto-summary.test.ts
git commit -m "test(cli): cover continuation and recursion guards for auto-summary"
```

### Task 5: Full verification and regression sweep

**Files:**
- No additional code changes expected

**Step 1: Run CLI test suite**

Run: `pnpm --filter @nuvin/nuvin-cli test`

Expected: PASS

**Step 2: Run monorepo tests (optional but recommended before merge)**

Run: `pnpm test`

Expected: PASS in both `nuvin-core` and `nuvin-cli`.

**Step 3: Smoke-run dev CLI flow**

Run: `pnpm run:dev`

Manual check:
- Drive conversation near threshold.
- Confirm auto-summary creates a new session, injects summary, and assistant continues automatically.
- Confirm no summary recursion loop.

**Step 4: Final commit for docs/changelog if needed**

```bash
git add -A
git commit -m "docs: note auto-summary continuation behavior"
```

