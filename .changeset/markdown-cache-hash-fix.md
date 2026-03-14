---
"@nuvin/nuvin-cli": patch
---

Fix markdown cache key collision by using DJB2 hash instead of content slice. Different content with same length and prefix now generates unique cache keys.
