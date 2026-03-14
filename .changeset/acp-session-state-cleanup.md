---
"@nuvin/nuvin-cli": patch
---

Fix ACP server session state management by clearing streaming state at the start of handleSessionNew instead of after applyAcpToolRestrictions
