---
'@nuvin/nuvin-cli': patch
---

Update tool approval and user question contexts to use IOrchestratorManager interface. Call handleToolApproval and handleUserQuestionResponse directly on orchestratorManager instead of getOrchestrator().
