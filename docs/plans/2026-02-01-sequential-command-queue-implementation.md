# Sequential Command Queue Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace polling-based command completion detection with Promise-based callbacks to ensure all messages and custom commands execute sequentially.

**Architecture:** Custom command handlers emit events with `onComplete`/`onError` callbacks. The app event listener awaits `handleSubmit` and invokes callbacks. The queue in InteractionArea simply awaits `onInputSubmit` for all items without polling.

**Tech Stack:** React, TypeScript, EventBus pattern

---

## Task 1: Update EventBus Types

**Files:**
- Modify: `packages/nuvin-cli/source/services/EventBus.ts`

**Step 1: Add callback types to custom-command:execute event**

In `EventBus.ts`, find the `custom-command:execute` type definition and add the callback fields:

```typescript
// Find this line (around line 43):
'custom-command:execute': { commandId: string; renderedPrompt: string; userInput: string };

// Replace with:
'custom-command:execute': {
  commandId: string;
  renderedPrompt: string;
  userInput: string;
  onComplete?: () => void;
  onError?: (error: Error) => void;
};
```

**Step 2: Run type check to verify no errors**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No errors (callbacks are optional)

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/services/EventBus.ts
git commit -m "feat(events): add completion callbacks to custom-command:execute event"
```

---

## Task 2: Update CustomCommandLoader to Use Promise Pattern

**Files:**
- Modify: `packages/nuvin-cli/source/services/CustomCommandLoader.ts`

**Step 1: Wrap event emission in Promise**

Find the handler function (around line 71-82) and update it:

```typescript
// Find this code:
handler: async (ctx) => {
  if (!customCommandRegistry) return;

  const userInput = ctx.rawInput.replace(commandId, '').trim();
  const renderedPrompt = customCommandRegistry.renderPrompt(cmd.id, userInput);

  eventBus.emit('custom-command:execute', {
    commandId: cmd.id,
    renderedPrompt,
    userInput,
  });
},

// Replace with:
handler: async (ctx) => {
  if (!customCommandRegistry) return;

  const userInput = ctx.rawInput.replace(commandId, '').trim();
  const renderedPrompt = customCommandRegistry.renderPrompt(cmd.id, userInput);

  return new Promise<void>((resolve, reject) => {
    eventBus.emit('custom-command:execute', {
      commandId: cmd.id,
      renderedPrompt,
      userInput,
      onComplete: resolve,
      onError: reject,
    });
  });
},
```

**Step 2: Run type check**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/services/CustomCommandLoader.ts
git commit -m "feat(commands): make custom command handler await completion via callbacks"
```

---

## Task 3: Update App Event Handler

**Files:**
- Modify: `packages/nuvin-cli/source/app.tsx`

**Step 1: Update onCustomCommandExecute to await and call callbacks**

Find `onCustomCommandExecute` (around line 291-295) and update:

```typescript
// Find this code:
const onCustomCommandExecute = (payload: { commandId: string; renderedPrompt: string; userInput: string }) => {
  if (payload.renderedPrompt) {
    void handleSubmit(payload.renderedPrompt);
  }
};

// Replace with:
const onCustomCommandExecute = async (payload: {
  commandId: string;
  renderedPrompt: string;
  userInput: string;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}) => {
  if (payload.renderedPrompt) {
    try {
      await handleSubmit(payload.renderedPrompt);
      payload.onComplete?.();
    } catch (error) {
      payload.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  } else {
    payload.onComplete?.();
  }
};
```

**Step 2: Run type check**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/app.tsx
git commit -m "feat(app): await handleSubmit and invoke completion callbacks"
```

---

## Task 4: Update App-Virtualized Event Handler

**Files:**
- Modify: `packages/nuvin-cli/source/app-virtualized.tsx`

**Step 1: Apply same changes as app.tsx**

Find `onCustomCommandExecute` (around line 291-295) and update with the same code:

```typescript
const onCustomCommandExecute = async (payload: {
  commandId: string;
  renderedPrompt: string;
  userInput: string;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}) => {
  if (payload.renderedPrompt) {
    try {
      await handleSubmit(payload.renderedPrompt);
      payload.onComplete?.();
    } catch (error) {
      payload.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  } else {
    payload.onComplete?.();
  }
};
```

**Step 2: Run type check**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/app-virtualized.tsx
git commit -m "feat(app-virtualized): await handleSubmit and invoke completion callbacks"
```

---

## Task 5: Simplify QueuedItem Type

**Files:**
- Modify: `packages/nuvin-cli/source/hooks/useHandleSubmit.ts`

**Step 1: Simplify the QueuedItem type**

Find the QueuedItem type (around line 13-18) and simplify:

```typescript
// Find this:
export type QueuedItem = {
  type: 'message' | 'custom-command';
  content: string;
  rawInput?: string;
  commandId?: string;
};

// Replace with:
export type QueuedItem = {
  type: 'message' | 'command';
  content: string;
};
```

**Step 2: Simplify shouldQueueItem function**

Find the shouldQueueItem callback (around line 28-51) and simplify:

```typescript
// Replace the entire shouldQueueItem callback with:
const shouldQueueItem = useCallback(
  (value: string, busy: boolean): { shouldQueue: boolean; queueItem: QueuedItem | null } => {
    if (!busy) {
      return { shouldQueue: false, queueItem: null };
    }

    const trimmed = value.trim();

    // Check if it's a built-in command that should execute immediately
    if (trimmed.startsWith('/')) {
      const commandId = trimmed.split(' ')[0];
      const def = commandRegistry.get(commandId);
      const isCustomCommand = !!(def as { isCustomCommand?: boolean } | undefined)?.isCustomCommand;

      // Only queue custom commands; built-in commands execute immediately
      if (!isCustomCommand) {
        return { shouldQueue: false, queueItem: null };
      }

      return {
        shouldQueue: true,
        queueItem: { type: 'command', content: trimmed },
      };
    }

    // Queue regular messages
    return {
      shouldQueue: true,
      queueItem: { type: 'message', content: trimmed },
    };
  },
  [],
);
```

**Step 3: Run type check**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/nuvin-cli/source/hooks/useHandleSubmit.ts
git commit -m "refactor(hooks): simplify QueuedItem type and shouldQueueItem logic"
```

---

## Task 6: Simplify InteractionArea Queue Processing

**Files:**
- Modify: `packages/nuvin-cli/source/components/InteractionArea.tsx`

**Step 1: Remove executeCommand prop from type and destructuring**

Find the props type (around line 14-33) and remove executeCommand:

```typescript
// Remove this line from InteractionAreaProps:
executeCommand?: (input: string) => Promise<void>;

// Remove from destructuring (around line 50):
// DELETE: executeCommand,
```

**Step 2: Remove busyRef and its effect**

Find and delete these lines (around line 67-70):

```typescript
// DELETE these lines:
const busyRef = useRef(busy);
useEffect(() => {
  busyRef.current = busy;
}, [busy]);
```

**Step 3: Replace the queue processing useEffect**

Find the useEffect that processes the queue (around line 72-140) and replace entirely:

```typescript
// Replace the entire useEffect with:
useEffect(() => {
  if (!busy && queuedMessages.length > 0 && !isProcessingQueueRef.current) {
    isProcessingQueueRef.current = true;
    const [itemToProcess, ...remaining] = queuedMessages;
    setQueuedMessages(remaining);

    onInputSubmit?.(itemToProcess.content).finally(() => {
      isProcessingQueueRef.current = false;
    });
  }
}, [busy, queuedMessages, onInputSubmit]);
```

**Step 4: Update the dependency array of handleInputSubmit**

Find handleInputSubmit (around line 142-165) and remove executeCommand from dependencies if present.

**Step 5: Update the queue display in renderDynamicContent**

Find the queue display (around line 324-334) and simplify:

```typescript
// Replace:
{queuedMessages[0].type === 'custom-command' ? (
  <>⌘ {queuedMessages[0].commandId}</>
) : (
  <>⟀ {queuedMessages[0].content.slice(0, 30)}{queuedMessages[0].content.length > 30 ? '...' : ''}</>
)}

// With:
{queuedMessages[0].type === 'command' ? (
  <>⌘ {queuedMessages[0].content.split(' ')[0]}</>
) : (
  <>⟀ {queuedMessages[0].content.slice(0, 30)}{queuedMessages[0].content.length > 30 ? '...' : ''}</>
)}
```

**Step 6: Run type check**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add packages/nuvin-cli/source/components/InteractionArea.tsx
git commit -m "refactor(InteractionArea): remove polling, simplify queue processing"
```

---

## Task 7: Remove executeCommand Prop from App Components

**Files:**
- Modify: `packages/nuvin-cli/source/app.tsx`
- Modify: `packages/nuvin-cli/source/app-virtualized.tsx`

**Step 1: Remove executeCommand prop from app.tsx**

Find where InteractionArea is rendered (around line 448) and remove the executeCommand prop:

```typescript
// Find and DELETE this line:
executeCommand={executeCommand}
```

**Step 2: Remove executeCommand prop from app-virtualized.tsx**

Find where InteractionArea is rendered (around line 391) and remove the executeCommand prop:

```typescript
// Find and DELETE this line:
executeCommand={executeCommand}
```

**Step 3: Run type check**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No errors

**Step 4: Run tests**

Run: `cd packages/nuvin-cli && pnpm test -- --run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/nuvin-cli/source/app.tsx packages/nuvin-cli/source/app-virtualized.tsx
git commit -m "refactor(app): remove executeCommand prop from InteractionArea"
```

---

## Task 8: Update Existing Tests

**Files:**
- Modify: `packages/nuvin-cli/tests/command-queue.test.ts` (if exists)

**Step 1: Check if command-queue tests exist**

Run: `ls packages/nuvin-cli/tests/ | grep -i queue`

If exists, update tests to match new QueuedItem type. If not, proceed to Task 9.

**Step 2: Run all CLI tests**

Run: `cd packages/nuvin-cli && pnpm test -- --run`
Expected: All tests pass

**Step 3: Commit if changes made**

```bash
git add packages/nuvin-cli/tests/
git commit -m "test: update queue tests for simplified QueuedItem type"
```

---

## Task 9: Final Verification

**Step 1: Run full test suite**

Run: `pnpm test -- --run`
Expected: All tests pass

**Step 2: Run type check on entire project**

Run: `pnpm exec tsc --noEmit`
Expected: No errors

**Step 3: Run linter**

Run: `pnpm lint`
Expected: No errors

**Step 4: Final commit if any formatting changes**

```bash
git add -A
git commit -m "chore: formatting and cleanup"
```

---

## Summary

After completing all tasks, the implementation will:

1. ✅ Use Promise-based callbacks instead of polling
2. ✅ Have ~45 fewer lines of code
3. ✅ Handle all queued items (messages + commands) uniformly
4. ✅ Have no race conditions in queue processing
5. ✅ Pass all existing tests
