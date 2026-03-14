---
"@nuvin/nuvin-cli": patch
---

Fix assistant message text wrapping by removing reflowText. The markdown reflow at cols-8 conflicted with actual container width cols-4, causing orphan lines and suboptimal wrapping. Ink's native Text wrap now handles all wrapping correctly.
