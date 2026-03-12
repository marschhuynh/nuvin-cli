---
"@nuvin/nuvin-core": patch
---

Add `ToolOutputSpill` utility for tools to write large output to session-scoped files. Refactor `bash_tool` to spill truncated output to `{sessionDir}/{toolName}_{toolCallId}.log` instead of killing the process. Add `sessionDir` to `ToolExecutionContext` and orchestrator.
