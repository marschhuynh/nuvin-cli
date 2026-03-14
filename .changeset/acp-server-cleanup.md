---
"@nuvin/nuvin-cli": patch
---

Fix AcpServer event handler memory leak by binding handler and adding dispose method. Clear streaming state on new session to prevent stale data.
