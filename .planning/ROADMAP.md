# Nuvin CLI Roadmap

**Project:** Message Tracing Enhancement
**Last Updated:** 2025-03-19
**Phases:** 1

## Overview

This roadmap implements message traceability by adding a `messageId` field to MessageLines, enabling bidirectional tracing between displayed lines and stored messages.

---

## Phase 1: Message Tracing Implementation

**Goal:** Enable tracing MessageLines back to their original Messages by adding messageId field

**Requirements:** TRACING-01, TRACING-02, TRACING-03, TRACING-04, TRACING-05

**Success Criteria:**
1. All MessageLines include `metadata.messageId` field
2. Message conversion preserves messageId for all message types
3. Event flow passes messageId from AgentEvents
4. Session resume preserves messageId
5. Can trace any MessageLine to its Message in O(1) time

**Status:** 📋 Planned

---

## Progress Tracking

| Phase | Name | Plans | Status | Start | Complete |
|-------|------|-------|--------|-------|----------|
| 1 | 3/3 | Complete    | 2026-03-18 | - | - |

**Total Plans:** 3
**Complete:** 0/3 (0%)

---

## Phase Details

### Phase 1: Message Tracing Implementation

**Goal:** Enable tracing MessageLines back to their original Messages

**Requirements:**
- TRACING-01: MessageLine type enhancement
- TRACING-02: Message conversion preserves messageId
- TRACING-03: Event flow preserves messageId
- TRACING-04: Session resume preserves messageId
- TRACING-05: Trace MessageLine to Message

**Success Criteria:**
1. All MessageLines include `metadata.messageId` field
2. Message conversion preserves messageId for all message types
3. Event flow passes messageId from AgentEvents
4. Session resume preserves messageId
5. Can trace any MessageLine to its Message in O(1) time

**Plans:**
3/3 plans complete
- [ ] 01-02-PLAN.md — Event flow integration (TRACING-03)
- [ ] 01-03-PLAN.md — Session resume and verification (TRACING-04, TRACING-05)

**Estimated Effort:** 2-3 hours

---

## Quick Reference

**Current Phase:** 1
**Next Action:** `/gsd:execute-phase 1`
**All Requirements:** 5
**Mapped to Phase 1:** 5 (100%)

---
*Roadmap v1.1 — Plans created*
