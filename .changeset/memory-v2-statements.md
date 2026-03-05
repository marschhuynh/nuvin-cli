---
"@nuvin/nuvin-core": minor
"@nuvin/nuvin-cli": minor
---

feat(memory): upgrade to v2 with statement-level metadata and active recall

- Add MemoryStatement type with status, confidence, evidence, and key-based deduplication
- Add buildCoreMemoryInjection for compact system prompt injection (semantic/procedural only)
- Add queryStatements for structured hits with score metadata
- Add migrateV1ToV2 with automatic backup creation
- Add access buffer with flush interval for batched access count updates
- Add per-statement access tracking and signature-based deduplication
- Add supersedes/contradicts relationships for conflict resolution
- Add minScore, freshnessHalfLifeDays, activeCandidateLimit config options
- Move project memory to ~/.nuvin/memory/workspace/<workspace_id>
