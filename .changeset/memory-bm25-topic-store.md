---
"@nuvin/nuvin-cli": minor
"@nuvin/nuvin-core": minor
---

feat(memory): replace JSON store with BM25 topic-based markdown storage

- Rewrite MemoryService with frontmatter-topic-md format (one file per topic)
- Add BM25 retrieval engine with recency/frequency/type-weight scoring
- Add query-scoped memory injection per message instead of full dump
- Migrate legacy memories.json entries on startup
- Add `topic`, `title`, `keywords`, `updateMode` fields to memory_save tool
- Add `upsertTopicMemory` for merge/replace semantics
- Wire workspaceId for project-scoped memory isolation
- Add retrieval/storage/index config options to MemorySettings
- Export `MemoryEntryInput` type from nuvin-core
