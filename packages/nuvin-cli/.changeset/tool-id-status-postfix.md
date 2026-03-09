---
"@nuvin/nuvin-cli": patch
---

fix: prevent React key conflicts by postfixing tool message IDs with completion status

- Modify `mergeToolCallsWithResultsCached` to append `:streaming` or `:completed` to tool message IDs
- Ensures stable React keys when tool calls transition from streaming to completed state
- Add comprehensive test coverage for ID postfixing behavior
