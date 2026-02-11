---
"@nuvin/nuvin-cli": minor
---

feat(acp): add session/list endpoint and improve history handling

- Add session/list with pagination support (50 sessions per page)
- Support both default and cli history message keys
- Extract text from structured message parts
- Update agent capabilities to match ACP spec
- Use getVersion() for dynamic version reporting
