# Nuvin CLI Requirements

**Project:** Message Tracing Enhancement
**Version:** 1.0
**Last Updated:** 2025-03-19

## v1 Requirements

### TRACING-01: MessageLine Type Enhancement

The `MessageLine` type MUST include an optional `messageId` field in metadata.

**Acceptance Criteria:**
- [x] `MessageLine.metadata.messageId?: string` added to type definition
- [x] Field is optional (backward compatible)
- [x] TypeScript compiles without errors
- [x] Existing MessageLines without messageId still work

**Files:**
- `packages/nuvin-cli/source/types.ts`

---

### TRACING-02: Message Conversion Preserves messageId

The `processMessageToUILines()` function MUST preserve the original Message ID in all generated MessageLines.

**Acceptance Criteria:**
- [ ] User messages: `messageId` = `msg.id`
- [ ] Assistant content messages: `messageId` = `msg.id`
- [ ] Assistant tool call messages: `messageId` = `msg.id` (same as content)
- [ ] Tool result messages: `messageId` = `msg.id`
- [ ] All MessageLines returned have `metadata.messageId` set
- [ ] Function signature unchanged (backward compatible)

**Files:**
- `packages/nuvin-cli/source/utils/messageProcessor.ts`

**Test Cases:**
- User message → 1 line with messageId
- Assistant with content → 1 line with messageId
- Assistant with tool calls → 2 lines, both with same messageId
- Tool result → 1 line with messageId

---

### TRACING-03: Event Flow Preserves messageId

The event processor MUST pass messageId from AgentEvents to MessageLines during streaming.

**Acceptance Criteria:**
- [ ] `MessageStarted` event: user line includes `event.messageId`
- [ ] `AssistantChunk` event: streaming line includes `event.messageId`
- [ ] `AssistantMessage` event: final line includes `event.messageId`
- [ ] Tool call lines include parent assistant messageId
- [ ] Tool result lines include tool message messageId

**Files:**
- `packages/nuvin-cli/source/utils/eventProcessor.ts`

**Test Cases:**
- New user message during streaming
- Streaming assistant response
- Tool calls and results
- Mixed scenarios

---

### TRACING-04: Session Resume Preserves messageId

When loading messages from disk and converting to MessageLines, the messageId MUST be preserved.

**Acceptance Criteria:**
- [ ] `loadHistoryFromFile()` preserves messageId
- [ ] `processMessageToUILines()` called with Messages that have IDs
- [ ] All loaded MessageLines have correct messageId
- [ ] Works for resumed sessions
- [ ] Works for --history flag (read-only load)

**Files:**
- `packages/nuvin-cli/source/hooks/useSessionManagement.ts`

**Test Cases:**
- Resume existing session
- Load from history file
- Verify messageId matches original Message.id

---

### TRACING-05: Trace MessageLine to Message

Given any MessageLine, MUST be able to find the corresponding Message in storage.

**Acceptance Criteria:**
- [ ] Can lookup Message by `line.metadata.messageId`
- [ ] Works for all message types (user, assistant, tool)
- [ ] Works for resumed sessions
- [ ] Works for new messages
- [ ] O(1) lookup (direct ID match)

**Usage Example:**
```typescript
function findMessageForLine(lineId: string, messages: Message[]): Message | undefined {
  const line = lines.find(l => l.id === lineId);
  const messageId = line?.metadata.messageId;
  return messages.find(m => m.id === messageId);
}
```

---

## Out of Scope

- **Storage format changes:** No changes to `history.{agentId}.json` structure
- **Message ID changes:** Message IDs remain unchanged
- **UI redesign:** No visual changes to MessageLine display
- **Performance optimization:** Lookup is already O(1) with direct ID match
- **Migration scripts:** Optional field, no data migration needed

## Traceability

| Requirement ID | Phase | Plan | Status |
|----------------|-------|------|--------|
| TRACING-01 | 1 | 01-01 | Pending |
| TRACING-02 | 1 | 01-01 | Pending |
| TRACING-03 | 1 | 01-02 | Pending |
| TRACING-04 | 1 | 01-03 | Pending |
| TRACING-05 | 1 | 01-03 | Pending |

---
*Requirements v1.0 — Message Tracing Enhancement*
