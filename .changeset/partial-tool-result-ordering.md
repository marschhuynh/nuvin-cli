---
"@nuvin/nuvin-cli": patch
---

Defer partial-result tool messages to bottom of chat view. Tool calls with some results still streaming now appear after other messages, keeping running tools visible at screen bottom. Completed tool calls render before running ones within the same message.
