# Nuvin CLI - Message Tracing Enhancement

**Status:** Active
**Type:** Brownfield Enhancement
**Last Updated:** 2025-03-19

## Project Overview

Nuvin CLI is a terminal-based AI agent system with event-driven architecture, sub-agent sessions, and persistent message storage.

## Core Problem

Currently, **MessageLines (UI display) cannot be traced back to their original Messages (storage)**. When messages are converted from storage format to display format, the link is broken:

```typescript
// Storage format
Message { id: "msg-123", role: "user", content: "..." }

// Display format (NEW ID generated)
MessageLine { id: "uuid-abc", type: "user", content: "..." }
// ❌ No reference to original Message.id
```

**Impact:**
- Cannot delete messages from UI
- Cannot audit which message produced which line
- Difficult to debug message flow issues
- Blocks features like message export with references

## Core Value

**Traceability:** Every displayed line should be traceable to its stored message.

## Solution

Add `messageId` field to `MessageLine.metadata`:

```typescript
export type MessageLine = {
  id: string;
  type: string;
  content: string;
  metadata?: {
    messageId?: string;  // ✅ Reference to original Message
    timestamp?: string;
    // ... other fields
  };
};
```

**Implementation scope:**
1. Update type definition
2. Modify `processMessageToUILines()` to preserve messageId
3. Update `eventProcessor.ts` to pass messageId from events
4. Works for new sessions, resumed sessions, and all message types

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Add messageId as optional field | Non-breaking, backward compatible | — Pending |
| Preserve during conversion | Update processMessageToUILines() | — Pending |
| Include in event flow | Update eventProcessor.ts | — Pending |

## Requirements

### Validated

- ✓ Event-driven message pipeline — existing
- ✓ Message storage to JSON files — existing
- ✓ MessageLine display system — existing
- ✓ Session resume functionality — existing

### Active

- [ ] TRACING-01: MessageLine metadata includes messageId field
- [ ] TRACING-02: processMessageToUILines preserves messageId
- [ ] TRACING-03: eventProcessor passes messageId from events
- [ ] TRACING-04: Resumed sessions preserve messageId
- [ ] TRACING-05: New messages preserve messageId

### Out of Scope

- Message format changes — Only adding optional field
- Storage format changes — No changes to history files
- UI redesign — No visual changes, only data structure

## Research

- `.planning/research/TRACING_MESSAGELINE_TO_MESSAGE.md` — Full analysis
- `.planning/research/MESSAGE_VS_MESSAGELINE_MAPPING.md` — Type comparison
- `.planning/research/TRACING_IN_RESUMED_SESSIONS.md` — Resume handling
- `.planning/research/MESSAGE_FLOW.md` — Complete message flow documentation

## Codebase Context

**Key files:**
- `packages/nuvin-cli/source/types.ts` — MessageLine type definition
- `packages/nuvin-cli/source/utils/messageProcessor.ts` — Conversion logic
- `packages/nuvin-cli/source/utils/eventProcessor.ts` — Event handling
- `packages/nuvin-core/src/ports.ts` — Message type definition

**Architecture:**
- Event-driven pipeline with UIEventAdapter
- Dual-path: UI display + persistent storage
- 1 Message → 1-2 MessageLines (assistant with tool calls splits)

---
*Last updated: 2025-03-19 after initialization*
