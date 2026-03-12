---
"@nuvin/nuvin-core": minor
---

Add content truncation to `file_read` tool. Full-file reads exceeding 20KB are truncated with a `<system-reminder>` tag showing total lines and file size, guiding agents to use `lineStart`/`lineEnd` for specific sections. Line-range reads are unaffected.
