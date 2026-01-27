# Custom Commands Bug Fix - Priority Order Issue

**Date:** 2026-27-01  
**Status:** ✅ FIXED

---

## The Bug

**Symptom:** Custom commands sent to ACP return `{"stopReason": "end_turn"}` immediately with no LLM response.

**User Report:**
```json
// User sends:
{
  "prompt": [{"type": "text", "text": "/test-acp"}]
}

// Gets back:
{
  "stopReason": "end_turn"
}

// Expected: LLM should process the rendered custom command prompt
```

---

## Root Cause

### Command Registration Order

Custom commands are registered in BOTH registries:

1. **customCommandRegistry** (stores IDs without `/`):
   ```
   customCommandRegistry.get('test-acp') → {id: 'test-acp', prompt: '...'}
   ```

2. **commandRegistry** (main registry, stores IDs WITH `/`):
   ```
   commandRegistry.get('/test-acp') → {type: 'function', handler: ...}
   ```

### The Problem Flow

**Original Code (WRONG ORDER):**
```typescript
// Step 1: Check built-in commands FIRST
const builtIn = commandRegistry.get(`/${commandId}`);
if (builtIn) {
  // Found! Custom command is registered here
  await builtIn.handler(ctx);  // ✅ Executes
  return;  // ❌ Handler doesn't send to LLM
}

// Step 2: Check custom commands (never reached!)
const customRegistry = getCustomCommandRegistry();
const customCmd = customRegistry?.get(commandId);
if (customCmd) {
  const renderedPrompt = customRegistry.renderPrompt(commandId, input);
  await manager.send(renderedPrompt);  // ✅ This sends to LLM
  return;
}
```

**What Happened:**
1. `/test-acp` detected
2. `commandRegistry.get('/test-acp')` → **Found!** (custom command registered here)
3. Executes handler from `CustomCommandLoader.ts`:
   ```typescript
   handler: async (ctx) => {
     const renderedPrompt = customCommandRegistry.renderPrompt(cmd.id, userInput);
     eventBus.emit('custom-command:execute', { renderedPrompt });
     // ❌ Never sends to LLM!
   }
   ```
4. Handler returns
5. **Turn ends immediately** - nothing sent to LLM ❌

---

## The Fix

**Reorder: Check custom commands BEFORE built-in**

```typescript
// Step 1: Check custom commands FIRST
const customRegistry = getCustomCommandRegistry();
const customCmd = customRegistry?.get(commandId);
if (customCmd && customRegistry) {
  const renderedPrompt = customRegistry.renderPrompt(commandId, input);
  if (renderedPrompt) {
    await manager.send(renderedPrompt, { stream: options.stream });  // ✅ Sends to LLM
  }
  return;
}

// Step 2: Check built-in commands
const builtIn = commandRegistry.get(`/${commandId}`);
if (builtIn) {
  // Skip custom commands (already handled above)
  if ((builtIn as any).isCustomCommand) {
    console.warn(`Custom command '${commandId}' not handled by custom registry`);
  } else if (builtIn.type === 'function') {
    await builtIn.handler(ctx);  // ✅ Executes built-in handler
    return;
  }
}
```

---

## Why This Works

### Custom Command Flow (After Fix)

```
User: /test-acp hello
    ↓
Parse: commandId='test-acp', input='hello'
    ↓
Check customRegistry.get('test-acp')  ✅ Found!
    ↓
Render: "This is a test: hello"
    ↓
Send to LLM: manager.send(renderedPrompt)  ✅
    ↓
LLM processes and responds! 🎉
```

### Built-in Command Flow (Still Works)

```
User: /clear
    ↓
Parse: commandId='clear'
    ↓
Check customRegistry.get('clear')  ❌ Not found
    ↓
Check commandRegistry.get('/clear')  ✅ Found!
    ↓
Check: isCustomCommand?  ❌ No, it's built-in
    ↓
Execute: await builtIn.handler(ctx)  ✅ Clears screen
    ↓
Done! (Handler sends UI events directly)
```

---

## Implementation Details

### Why Commands Are Registered Twice

Custom commands are registered in two places for different purposes:

1. **commandRegistry** (main registry):
   - Purpose: Tab completion, command listing
   - Storage: With `/` prefix (`/test-acp`)
   - Handler: Emits event, doesn't send to LLM
   - Used by: CLI interactive mode

2. **customCommandRegistry** (custom registry):
   - Purpose: Template rendering
   - Storage: Without `/` prefix (`test-acp`)
   - Method: `renderPrompt()` replaces `{{user_prompt}}`
   - Used by: ACP mode (and should be used by CLI too!)

### The isCustomCommand Flag

Custom commands have this flag to identify them:
```typescript
const customCommand: FunctionCommand & { isCustomCommand?: boolean } = {
  id: commandId,
  isCustomCommand: true,  // ✅ Marker
  handler: async (ctx) => {
    // This handler is for CLI mode, not ACP mode
    eventBus.emit('custom-command:execute', { ... });
  }
};
```

In ACP mode, we skip this handler and use customCommandRegistry instead.

---

## Test Results

### Before Fix
```
User: /test-acp hello
Result: {"stopReason": "end_turn"}  ❌ No LLM response
```

### After Fix
```
User: /test-acp hello
Result: LLM responds with "This is a test: hello"  ✅ Works!
```

### Integration Tests
```
✓ tests/integration.test.ts (16 tests) 558ms
Test Files  6 passed (6)
     Tests  25 passed (25)
```

---

## Summary

**Issue:** Custom commands weren't working in ACP mode because built-in command check happened first and executed the wrong handler.

**Fix:** Reordered checks - custom commands before built-in commands.

**Impact:** 
- ✅ Custom commands now work correctly
- ✅ Built-in commands still work
- ✅ Template rendering works as expected
- ✅ All tests pass

**Commit:** `c3a7367` - fix(acp): check custom commands BEFORE built-in commands

---

## Files Modified

- `packages/nuvin-cli/source/acp-entry.ts`
  - Lines 100-154: Reordered command checking logic
  - Custom commands checked first
  - Built-in commands checked second
  - Added `isCustomCommand` check to skip duplicates
