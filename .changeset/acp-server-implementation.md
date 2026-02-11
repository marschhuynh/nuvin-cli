---
"@nuvin/nuvin-cli": minor
---

feat(acp): implement ACP server mode with full session flow

- Add ACP JSON-RPC server over stdio with initialize, session/new, session/load, session/prompt, session/cancel
- Implement model resolver with provider-aware model enumeration and humanized display names
- Add tool formatter for descriptive tool call titles and kind inference
- Wire slash command support in ACP mode via command registry
- Add E2E test script for ACP validation
- Add available commands update notification
- Filter ask_user_tool from enabled tools in ACP mode
