# Tracing MessageLines in Resumed Sessions

**Date:** March 19, 2026
**Question:** Does the tracing issue also affect session resume?

**Answer:** ✅ **YES** - but with a unique opportunity to build the mapping during load

---

## Session Resume Flow

### What Happens During Resume

```typescript
// 1. Load Messages from disk
const result = await loadSessionHistory(sessionId);

// Result contains BOTH:
result.cliMessages  // Original Messages from history.cli.json
result.lines        // Generated MessageLines from processMessageToUILines()

// 2. Store Messages in memory
await switchResult.memory.set(conversationId, result.cliMessages);

// 3. Display MessageLines in UI
setLines(result.lines);
```

**Key Insight:** During resume, we have **both datasets available simultaneously**!

---

## The Problem: Same as New Sessions

### MessageLines Still Lose Message ID

```typescript
// In loadHistoryFromFile (useSessionManagement.ts:284-286)
for (const msg of cliMessages) {
  uiMessages.push(...processMessageToUILines(msg));
  // ❌ MessageLines get new IDs, messageId is lost
}
```

**Result:** After resume, you still can't trace a MessageLine back to its Message.

---

## Unique Opportunity: Build Mapping During Resume

Since we have both `cliMessages` and `lines` during resume, we can build a mapping:

### Workaround: Runtime Map (Resume-Specific)

```typescript
// During resume, build the mapping
const lineToMessageMap = new Map<string, string>();

const result = await loadSessionHistory(sessionId);
if (result.kind === 'messages') {
  // Build mapping while we have both datasets
  const { cliMessages, lines } = result;
  
  let lineIndex = 0;
  for (const message of cliMessages) {
    const messageLines = processMessageToUILines(message);
    
    // Map each line to its message
    for (const line of messageLines) {
      lineToMessageMap.set(line.id, message.id);
      lineIndex++;
    }
  }
  
  // Store the map for later use
  window.__sessionLineMap = lineToMessageMap;
  
  // Load into UI
  setLines(result.lines);
}

// Later, use the map to trace
function findMessageForLine(lineId: string): Message | undefined {
  const messageId = window.__sessionLineMap?.get(lineId);
  return messages.find(m => m.id === messageId);
}
```

**Limitations:**
- ⚠️ Map only exists for resumed sessions
- ⚠️ Lost on new messages (must update map)
- ⚠️ Not persisted
- ⚠️ Global variable hack

---

## Better Solution: Add `messageId` Field

### Same Fix Works for Both Cases

```typescript
// In processMessageToUILines
export function processMessageToUILines(msg: Message): MessageLine[] {
  const lines: MessageLine[] = [];

  if (msg.role === 'user') {
    lines.push({
      id: crypto.randomUUID(),
      type: 'user',
      content: extractTextContent(msg.content),
      metadata: {
        timestamp: msg.timestamp,
        messageId: msg.id,  // ✅ PRESERVE FOR ALL CASES
      },
    });
  }
  
  // ... same for assistant and tool
  
  return lines;
}
```

### Benefits for Resume

**1. Direct Tracing After Resume**

```typescript
// Resume session
const result = await loadSessionHistory(sessionId);
setLines(result.lines);

// Later, trace any line to its message
function findMessage(lineId: string): Message | undefined {
  const line = lines.find(l => l.id === lineId);
  const messageId = line?.metadata.messageId;
  return messages.find(m => m.id === messageId);
}
```

**2. Delete Message from UI**

```typescript
// User clicks "delete" on a line
async function deleteLine(lineId: string) {
  const line = lines.find(l => l.id === lineId);
  
  if (line?.metadata.messageId) {
    // Remove from storage
    const messageIndex = messages.findIndex(m => m.id === line.metadata.messageId);
    if (messageIndex >= 0) {
      messages.splice(messageIndex, 1);
      await memory.set(conversationId, messages);
    }
    
    // Remove from UI
    setLines(prev => prev.filter(l => l.id !== lineId));
  }
}
```

**3. Show Message Metadata**

```typescript
// User wants to see original message info
function showMessageInfo(lineId: string) {
  const line = lines.find(l => l.id === lineId);
  const message = messages.find(m => m.id === line?.metadata.messageId);
  
  if (message) {
    console.log({
      messageId: message.id,
      role: message.role,
      timestamp: message.timestamp,
      usage: message.usage,
      toolCalls: message.tool_calls,
    });
  }
}
```

---

## Comparison: With vs Without `messageId`

### Scenario: User Resumes Session and Clicks "Delete" on a Line

**Without `messageId` (Current):**

```typescript
// ❌ Can't find the message
function deleteLine(lineId: string) {
  const line = lines.find(l => l.id === lineId);
  
  // No messageId field!
  // Must use fragile workarounds:
  
  // Option 1: Match by timestamp (unreliable)
  const message = messages.find(m => 
    m.timestamp === line.metadata.timestamp
  );
  
  // Option 2: Match by content (fragile)
  const message = messages.find(m => 
    extractTextContent(m.content) === line.content
  );
  
  // Option 3: Rebuild mapping (expensive)
  const mapping = rebuildLineToMessageMap();
  const messageId = mapping.get(lineId);
  const message = messages.find(m => m.id === messageId);
}
```

**With `messageId` (Proposed):**

```typescript
// ✅ Simple and reliable
function deleteLine(lineId: string) {
  const line = lines.find(l => l.id === lineId);
  const messageId = line?.metadata.messageId;
  
  if (messageId) {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex >= 0) {
      messages.splice(messageIndex, 1);
      await memory.set(conversationId, messages);
    }
  }
}
```

---

## Special Consideration for Resume

### New Messages After Resume

When user sends new messages after resume:

```typescript
// New message uses eventProcessor.ts (same as new session)
case AgentEventTypes.MessageStarted: {
  const messageId = event.messageId;
  
  callbacks.appendLine({
    id: crypto.randomUUID(),
    type: 'user',
    content: `${event.userContent}`,
    metadata: {
      timestamp: now(),
      messageId: messageId,  // ✅ Same fix works
    },
  });
}
```

**Result:** All messages (old and new) have traceable MessageLines

---

## Implementation Priority

### HIGH Priority for Resume Support

If you want to support operations on resumed sessions (delete, export, audit):

| Feature | Without messageId | With messageId |
|---------|------------------|---------------|
| Delete line | ❌ Very difficult | ✅ Easy |
| Export with refs | ❌ Can't link | ✅ Full trace |
| Audit line | ❌ Impossible | ✅ Direct |
| Debug resume | ⚠️ Manual matching | ✅ Automatic |

---

## Migration Path for Resume

### Phase 1: Add Field (Non-Breaking)

```typescript
// Update types
export type MessageLine = {
  id: string;
  type: string;
  content: string;
  metadata?: {
    messageId?: string;  // ✅ Add this
    timestamp?: string;
    // ...
  };
};
```

### Phase 2: Update Conversion

```typescript
// messageProcessor.ts - already handles resume
export function processMessageToUILines(msg: Message): MessageLine[] {
  // ✅ Just add messageId to metadata
  // Works for both new and resumed sessions
}
```

### Phase 3: Update Event Processor

```typescript
// eventProcessor.ts - handles new messages
case AgentEventTypes.MessageStarted: {
  // ✅ Add messageId from event
}
```

---

## Testing Resume with messageId

```typescript
test('resumed session lines have messageId', async () => {
  // 1. Create session with messages
  const messages: Message[] = [
    { id: 'msg-1', role: 'user', content: 'Hello' },
    { id: 'msg-2', role: 'assistant', content: 'Hi there', tool_calls: [...] },
  ];
  
  // 2. Convert to lines (simulates resume)
  const lines = messages.flatMap(m => processMessageToUILines(m));
  
  // 3. Verify all lines have messageId
  expect(lines[0].metadata.messageId).toBe('msg-1');  // user
  expect(lines[1].metadata.messageId).toBe('msg-2');  // assistant content
  expect(lines[2].metadata.messageId).toBe('msg-2');  // assistant tool calls
  
  // 4. Verify can trace back
  const found = messages.find(m => m.id === lines[0].metadata.messageId);
  expect(found).toBe(messages[0]);
});
```

---

## Summary

### Question: Does tracing issue affect resumed sessions?

**Answer:** ✅ **YES** - same problem exists

### But there's good news:

1. **During resume**, we have both Messages and MessageLines available
2. **Could build temporary mapping** (but fragile, not persisted)
3. **Better solution**: Add `messageId` field (works for all cases)

### With `messageId` field:

- ✅ Works for new sessions
- ✅ Works for resumed sessions
- ✅ Works for old messages (loaded from disk)
- ✅ Works for new messages (created after resume)
- ✅ Simple, reliable, non-breaking

### Recommendation:

**Add `messageId` to MessageLine.metadata** - single fix that solves tracing for:
- New sessions
- Resumed sessions  
- Old messages
- New messages
- All future features

**Effort:** Same ~2 hours (already documented in previous guide)
**Impact:** Enables full traceability across all session types
