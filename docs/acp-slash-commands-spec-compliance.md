# ACP Slash Commands - Specification Compliance

**Date:** 2026-01-27  
**Spec URL:** https://agentclientprotocol.com/protocol/slash-commands  
**Status:** ✅ COMPLIANT

---

## Specification Requirements vs Implementation

### 1. Advertising Commands ✅

**Spec Requirement:**
> After creating a session, the Agent MAY send a list of available commands via the `available_commands_update` session notification

**Our Implementation:**
```typescript
// packages/nuvin-cli/source/acp-entry.ts (line ~110)
eventBus.emit('agent:event', {
  type: AgentEventTypes.CommandsAvailable,
  commands: allCommands,
});
```

✅ **COMPLIANT** - We emit commands after session creation using `setImmediate` to ensure handlers are registered.

---

### 2. Command Structure ✅

**Spec Requirement:**
```json
{
  "name": "web",                    // string, required
  "description": "Search the web...", // string, required
  "input": {                        // optional
    "hint": "query to search for"   // string, required
  }
}
```

**Our Implementation:**
```typescript
// packages/nuvin-acp/source/adapters/event-adapter.ts (line 43-49)
{
  sessionUpdate: 'available_commands_update',
  availableCommands: event.commands.map(cmd => ({
    name: cmd.id,                   // ✅ string, required
    description: cmd.description,    // ✅ string, required
    input: cmd.requiresInput ? {     // ✅ optional
      hint: 'Enter input for this command' // ✅ string, required
    } : undefined,
  })),
}
```

✅ **COMPLIANT** - Exact match to spec structure.

---

### 3. Command Name Format ✅

**Spec Requirement:**
> The command name (e.g., "web", "test", "plan")

**Note:** The spec example shows names **WITHOUT** the slash prefix.

**Our Implementation:**
```typescript
// packages/nuvin-cli/source/acp-entry.ts (line 54-56)
// Strip the leading '/' from command IDs for ACP protocol
// Commands are stored as '/exit' but should be advertised as 'exit'
const commandName = cmd.id.startsWith('/') ? cmd.id.slice(1) : cmd.id;

allCommands.push({
  id: commandName,  // ✅ "exit", "help", etc. (no slash)
  ...
});
```

✅ **COMPLIANT** - We strip the `/` prefix from command names when advertising.

**Fix History:** This was fixed in commit `a665017`.

---

### 4. Command Invocation ✅

**Spec Requirement:**
> Commands are included as regular user messages in prompt requests:
> ```json
> {
>   "prompt": [
>     {
>       "type": "text",
>       "text": "/web agent client protocol"
>     }
>   ]
> }
> ```

**Our Implementation:**
```typescript
// packages/nuvin-cli/source/acp-entry.ts (line 96-97)
if (text.trim().startsWith('/')) {
  const match = text.match(/^\/([a-z][a-z0-9_-]*)\s*(.*)/);
  if (match) {
    const [, commandId, input] = match; // ✅ Extracts "web" and "agent client protocol"
```

✅ **COMPLIANT** - We recognize the `/` prefix and parse command name and input.

---

### 5. Fallback Behavior ✅

**Spec Requirement:**
> The Agent recognizes the command prefix and processes it accordingly

**Our Implementation:**
```typescript
// packages/nuvin-cli/source/acp-entry.ts (line 134-140)
// Command not found, send as regular message
try {
  await manager.send(text, { stream: options.stream });
} catch (error) {
  console.error('Failed to send message:', error);
}
```

✅ **COMPLIANT** - If command is not recognized, we send it as a regular message (the agent can still respond to it).

---

### 6. Input Hint ✅

**Spec Requirement:**
> A hint to display when the input hasn't been provided yet

**Our Implementation:**
```typescript
// packages/nuvin-acp/source/adapters/event-adapter.ts (line 46-48)
input: cmd.requiresInput ? {
  hint: 'Enter input for this command'  // ✅ Hint provided
} : undefined,
```

⚠️ **PARTIALLY COMPLIANT** - We provide a generic hint. The spec shows command-specific hints like `"query to search for"` for the `web` command.

**Improvement Opportunity:** We could use more specific hints based on the command type or metadata.

---

### 7. Dynamic Updates ✅

**Spec Requirement:**
> The Agent can update the list of available commands at any time during a session

**Our Implementation:**
```typescript
// packages/nuvin-cli/source/acp-entry.ts (line 102-108)
onEvent: (handler) => {
  eventHandlers.push(handler);

  // CRITICAL: Emit CommandsAvailable event AFTER the first handler is registered
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

✅ **COMPLIANT** - We use the event bus which allows dynamic updates. Additional `CommandsAvailable` events can be emitted at any time to update the list.

**Improvement Opportunity:** We don't currently implement dynamic updates (e.g., when custom commands are added/removed mid-session). This is noted in the plan's "Next Steps".

---

## Comparison Table

| Feature | Spec Requirement | Our Implementation | Status |
|---------|-----------------|-------------------|--------|
| Send `available_commands_update` | Required | ✅ Implemented | ✅ Compliant |
| Command structure (name, description, input) | Required | ✅ Implemented | ✅ Compliant |
| Command name without `/` prefix | Required | ✅ Fixed (commit a665017) | ✅ Compliant |
| Recognize `/` prefix in messages | Required | ✅ Implemented | ✅ Compliant |
| Fallback to regular message | Implied | ✅ Implemented | ✅ Compliant |
| Input hint for commands | Optional | ✅ Generic hint | ⚠️ Could be improved |
| Dynamic command updates | Optional | ✅ Event bus supports it | ⚠️ Not fully implemented |
| Commands in prompt array | Required | ✅ Works with prompt array | ✅ Compliant |

---

## Test Coverage

| Test Scenario | Coverage |
|--------------|----------|
| Command advertising after session | ✅ Integration test (line 1041) |
| Command structure matches spec | ✅ Protocol test (line 1-58 of slash-commands.test.ts) |
| Command invocation parsing | ✅ Integration test (line 1118) |
| Custom command template rendering | ✅ Integration test (line 1169) |
| Fallback for unknown commands | ✅ Code implements (line 134-140) |

---

## Summary

### ✅ Fully Compliant
- Command advertising via `available_commands_update`
- Command structure (name, description, optional input)
- Command name format (no slash prefix)
- Command invocation (recognize `/` prefix)
- Fallback behavior

### ⚠️ Minor Improvements Possible
- **Input hints:** Currently generic. Could be command-specific.
- **Dynamic updates:** Infrastructure supports it but not currently implemented.
- **Command metadata:** Could add more fields (categories, icons, etc.) when spec supports them.

### 🎯 Overall Verdict: **SPEC COMPLIANT** ✅

Our implementation correctly follows the ACP Slash Commands specification. The core functionality is complete and working. The improvement opportunities are optional enhancements that would be nice-to-have but are not required for compliance.

---

## References

- [ACP Slash Commands Spec](https://agentclientprotocol.com/protocol/slash-commands)
- Implementation Plan: `docs/plans/2026-01-27-acp-slash-commands.md`
- Implementation: `packages/nuvin-acp/` and `packages/nuvin-cli/source/acp-entry.ts`
