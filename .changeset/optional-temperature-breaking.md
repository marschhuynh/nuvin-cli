---
"@nuvin/nuvin-core": major
---

BREAKING: Make temperature and topP optional in CompletionParams and AgentConfig

- temperature and topP are now optional in CompletionParams (LLMPort)
- temperature and topP are now optional in AgentConfig
- BaseLLM only sends temperature/topP to API when explicitly provided
- AgentManager and AgentRegistry respect undefined temperature values
- Orchestrator passes temperature/topP only when defined
