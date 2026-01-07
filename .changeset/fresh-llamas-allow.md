---
'@nuvin/nuvin-core': minor
'@nuvin/nuvin-cli': minor
---

Refactor tool approval to per-tool granularity. Each tool now gets its own approval flow: bypass tools execute immediately, approval-required tools wait for individual user decisions. Added new `ui:toolCalls` event for real-time tool tracking. Removed batch approval model in favor of individual tool approvals.
