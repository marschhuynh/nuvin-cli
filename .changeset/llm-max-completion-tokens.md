---
"@nuvin/nuvin-core": minor
---

Add `buildTokenLimit` hook in `BaseLLM` and override in `GithubLLM` to use `max_completion_tokens` for models that require it (o-series, gpt-5+).
