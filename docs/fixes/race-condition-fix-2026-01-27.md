# Race Condition Fix: CommandsAvailable Event

**Date:** 2026-01-27  
**Commit:** 4c7e210d02c35660e7faf63f5a0b4ab3403b4398  
**Severity:** CRITICAL

## Problem

The original implementation had a critical race condition where the `CommandsAvailable` event was emitted **before** the ACP event handler was registered:

```typescript
// WRONG: Event emitted at line 74
eventBus.emit('agent:event', {
  type: AgentEventTypes.CommandsAvailable,
  commands: allCommands,
});

// Handler registered at line 93 (TOO LATE!)
onEvent: (handler) => {
  eventHandlers.push(handler);
}
```

**Impact:**
- Node's EventEmitter doesn't buffer events
- Event was lost because no handlers were registered
- ACP clients never received the `available_commands_update` notification
- Slash commands wouldn't appear in editors (Zed, JetBrains)

## Solution

Moved event emission to **inside** the `onEvent` callback using `setImmediate`:

```typescript
onEvent: (handler) => {
  eventHandlers.push(handler);

  // Emit AFTER first handler is registered
  if (eventHandlers.length === 1) {
    setImmediate(() => {
      eventBus.emit('agent:event', {
        type: AgentEventTypes.CommandsAvailable,
        commands: allCommands,
      });
    });
  }
}
```

**Why this works:**
1. ✅ Handler is registered **first**
2. ✅ `setImmediate` defers emission to next event loop tick
3. ✅ ACP server completes setup before event is sent
4. ✅ Event reaches the registered handler
5. ✅ ACP adapter converts and sends to client

## Additional Fixes

### 1. Error Handling (Important #2)
Added try-catch blocks around command gathering:
```typescript
try {
  const builtInCommands = commandRegistry.list({ includeHidden: false });
  // ... process commands
} catch (error) {
  console.warn('Failed to gather built-in commands:', error);
}
```

### 2. Documentation Comment (Important #4)
Added comment explaining inconsistent command ID formatting:
```typescript
// Note: Built-in commands use bare IDs (e.g., "help", "exit")
// while custom commands are prefixed with "/" (e.g., "/mycommand")
// This maintains consistency with existing command invocation patterns
```

### 3. Critical Comment
Added detailed comment explaining the race condition fix:
```typescript
// CRITICAL: Emit CommandsAvailable event AFTER the first handler is registered
// Node's EventEmitter doesn't buffer events, so emitting before registration
// causes the event to be lost. Using setImmediate ensures the event is sent
// on the next tick, after the ACP server completes its setup.
```

## Verification

✅ All ACP integration tests pass (21 tests)  
✅ All nuvin-core tests pass (808 tests)  
✅ Commit amended with `git commit --amend --no-edit`  
✅ Code formatted with Biome

## Files Changed

- `packages/nuvin-cli/source/acp-entry.ts`

## Testing Notes

No specific test exists for CommandsAvailable event yet. This should be added to the integration test suite to prevent regression.

## References

- Original Implementation: Task 3 from `docs/plans/2026-01-27-acp-slash-commands.md`
- Related Events: `AgentEventTypes.CommandsAvailable` in `packages/nuvin-core/src/ports.ts`
- Protocol Types: `AvailableCommandsUpdate` in `packages/nuvin-acp/source/protocol/types.ts`
