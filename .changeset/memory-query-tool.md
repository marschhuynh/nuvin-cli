---
"@nuvin/nuvin-core": minor
"@nuvin/nuvin-cli": minor
---

feat(tools): add memory_query tool for targeted memory retrieval

- Add memory_query tool with query, key, scope, topK, and minScore parameters
- Add per-turn query limit enforcement (maxQueriesPerTurn config)
- Add MemoryQueryToolResult with structured hits including statementId, score, confidence
- Wire memory_query handler in OrchestratorManager with turn tracking
- Add memory_query to baseEnabledTools and getEnabledTools logic
- Update system prompt to prefer memory_query for retrieval over memory_save
