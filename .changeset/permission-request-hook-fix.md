---
'@nuvin/nuvin-cli': patch
'@nuvin/nuvin-core': patch
---

Move `permission_request` hook firing from orchestrator to CLI layer. Hooks now fire only when approval UI is shown, not for session-approved tools.
