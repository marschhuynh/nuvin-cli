---
"@nuvin/nuvin-cli": minor
"@nuvin/nuvin-core": patch
---

feat(cli): add auto-summary continuation and improve summary prompt

- Auto-submit continuation turn after context window auto-summary
- Add skipAutoSummaryCheck option to prevent recursive checks
- Improve summary prompt for better session continuity
- Lower auto-summary threshold to 30% for earlier intervention
