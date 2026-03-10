---
"@nuvin/nuvin-cli": patch
---

Fix WindowedComboBox double-filtering bug. When using external search (onQueryChange), skip internal filtering to avoid discarding results matched on fields not in item.label.
