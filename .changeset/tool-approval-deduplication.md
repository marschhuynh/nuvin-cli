---
"@nuvin/nuvin-cli": patch
---

Fix pending approval tools accumulation by deduplicating tools with same ID. Prevents stale tools from cancelled/interrupted turns from persisting.
