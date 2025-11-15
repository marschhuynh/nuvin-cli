---
'@nuvin/nuvin-core': patch
---

Fix race condition in event persistence causing streaming chunk events to be lost. Serialize writes using promise queue to prevent concurrent overwrites.
