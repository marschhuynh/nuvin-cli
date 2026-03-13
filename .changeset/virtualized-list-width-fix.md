---
"@nuvin/nuvin-cli": patch
---

Fix VirtualizedList to use stdout dimensions for width calculation when no explicit width prop provided. Prevents stale height cache when terminal resizes.
