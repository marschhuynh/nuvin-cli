---
"@nuvin/nuvin-core": minor
---

Remove unused className and transportName fields from provider configuration. The createTransport function signature has been updated to remove the unused _name parameter. This is a breaking change for any code that directly uses createTransport.
