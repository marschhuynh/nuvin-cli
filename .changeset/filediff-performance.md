---
"@nuvin/nuvin-cli": patch
---

Optimize FileDiffView: O(n) Levenshtein with early-exit, truncate extremely long lines, add content-based memoization keys, and compute content width dynamically.
