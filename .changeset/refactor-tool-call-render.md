---
"@nuvin/nuvin-core": patch
"@nuvin/nuvin-cli": minor
---

Refactor tool call rendering with comprehensive improvements:

- Show last lines in result truncation instead of first for better visibility
- Fix denied/edited states to avoid duplicate content display
- Add per-tool excludeParams config for cleaner parameter display
- Use dynamic tool names in SubAgentActivity (Reading/Read/Read failed)
- Fix abort errorReason to return 'aborted' instead of 'unknown'
- Show actual error messages in sub-agent status lines
