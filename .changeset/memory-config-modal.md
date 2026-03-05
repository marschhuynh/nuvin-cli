---
"@nuvin/nuvin-cli": patch
---

feat(ui): enhance memory config modal with active recall controls

- Add active recall toggle (enable/disable) in config modal
- Add max queries per turn selector (1/2/3)
- Add core memory budget selector (150/250/400 tokens)
- Display current recall status in modal header (recall:on/off q:N core:N)
- Support memory.extraction.provider/model fallback to memory.provider/model
- Add reset to default for all retrieval settings
