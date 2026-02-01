# Sequential Command Queue Design

**Date:** 2026-02-01  
**Status:** Approved  
**Author:** AI Assistant with user collaboration

## Problem Statement

When the agent is busy processing a request and the user submits a custom command, the command executes immediately instead of being queued. This causes two concurrent requests, leading to inconsistent state and race conditions.

The current implementation attempts to solve this by:
1. Queueing messages and custom commands in `InteractionArea`
2. Using `setInterval` polling (50ms) to detect when custom commands complete by watching busy state transitions

This polling approach is:
- Race-prone (fast commands may complete before first poll)
- Complex (~60 lines of interval/timeout logic)
- Fragile (relies on detecting state transitions)

## Solution Overview

Replace the polling-based completion detection with a **Promise-based callback pattern**. The key insight is that `handleSubmit` already returns a `Promise<void>` - we just need to await it properly throughout the chain.

### Architecture Change

```
BEFORE:
  Queue → executeCommand() → emits event → returns immediately
                                    ↓
                            App listens → void handleSubmit()
  Queue polls busy state with setInterval 😬

AFTER:
  Custom command handler → emits event with callbacks → waits for callback
                                    ↓
                            App listens → await handleSubmit() → calls callback
  Queue awaits onInputSubmit() for all items ✓
```

## Detailed Design

### 1. Event Type Update (`EventBus.ts`)

Add completion callbacks to the custom command event:

```typescript
'custom-command:execute': {
  commandId: string;
  renderedPrompt: string;
  userInput: string;
  onComplete?: () => void;      // NEW: called when processing completes
  onError?: (error: Error) => void;  // NEW: called on error
};
```

### 2. Custom Command Handler (`CustomCommandLoader.ts`)

Wrap event emission in a Promise that resolves via callbacks:

```typescript
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
}
```

### 3. App Event Handler (`app.tsx`, `app-virtualized.tsx`)

Await handleSubmit and call the completion callbacks:

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

### 4. Simplified QueuedItem Type (`useHandleSubmit.ts`)

```typescript
export type QueuedItem = {
  type: 'message' | 'command';
  content: string;
};
```

Removed fields:
- `rawInput` - no longer needed since all items go through `onInputSubmit`
- `commandId` - only used for display, can derive from content if needed

### 5. Simplified Queue Processing (`InteractionArea.tsx`)

Remove:
- `busyRef` and the effect that updates it
- `executeCommand` prop
- All polling logic (setInterval, timeouts, busyStarted tracking)
- The separate handling for `custom-command` type

Simplified processing:

```typescript
useEffect(() => {
  if (!busy && queuedMessages.length > 0 && !isProcessingQueueRef.current) {
    isProcessingQueueRef.current = true;
    const [itemToProcess, ...remaining] = queuedMessages;
    setQueuedMessages(remaining);

    // Simple: just await onInputSubmit for everything
    onInputSubmit?.(itemToProcess.content).finally(() => {
      isProcessingQueueRef.current = false;
    });
  }
}, [busy, queuedMessages, onInputSubmit]);
```

### 6. Simplified shouldQueueItem (`useHandleSubmit.ts`)

```typescript
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
    }

    // Queue messages and custom commands
    return { 
      shouldQueue: true, 
      queueItem: { 
        type: trimmed.startsWith('/') ? 'command' : 'message', 
        content: trimmed 
      } 
    };
  },
  [],
);
```

## Files to Modify

| File | Changes |
|------|---------|
| `packages/nuvin-cli/source/services/EventBus.ts` | Add `onComplete` and `onError` to event type |
| `packages/nuvin-cli/source/services/CustomCommandLoader.ts` | Wrap event emit in Promise |
| `packages/nuvin-cli/source/app.tsx` | Await handleSubmit, call callbacks |
| `packages/nuvin-cli/source/app-virtualized.tsx` | Same as app.tsx |
| `packages/nuvin-cli/source/hooks/useHandleSubmit.ts` | Simplify types and shouldQueueItem |
| `packages/nuvin-cli/source/components/InteractionArea.tsx` | Remove polling, simplify queue processing |

## Impact Analysis

### Lines of Code
- **Removed:** ~60 lines (polling logic, busyRef, timeouts, complex branching)
- **Added:** ~15 lines (callback handling)
- **Net:** ~45 lines simpler

### Benefits
1. ✅ **Reliable** - Promise-based waiting has no race conditions
2. ✅ **Simpler** - Removes complex polling logic
3. ✅ **Consistent** - Messages and commands use the same code path
4. ✅ **Proper error handling** - Errors propagate correctly through Promise chain
5. ✅ **Testable** - Easier to unit test without timing dependencies

### Risks
- Low risk: Changes are isolated to the command execution flow
- The callback pattern is well-established and widely used

## Testing Strategy

1. **Unit tests** for `shouldQueueItem` function
2. **Integration test**: Queue a message while agent is busy, verify sequential execution
3. **Integration test**: Queue a custom command while agent is busy, verify sequential execution
4. **Edge case**: Queue multiple items, verify all execute in order
5. **Edge case**: Abort during queue processing, verify queue is cleared

## Implementation Order

1. Update `EventBus.ts` types
2. Update `CustomCommandLoader.ts` to use Promise pattern
3. Update `app.tsx` and `app-virtualized.tsx` event handlers
4. Simplify `useHandleSubmit.ts`
5. Simplify `InteractionArea.tsx`
6. Update/add tests
7. Remove unused code and props
