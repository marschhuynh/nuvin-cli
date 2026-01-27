# Tool Approval in ACP - Investigation Report

**Date:** 2026-01-27  
**Status:** ⚠️ **NOT FULLY IMPLEMENTED**

---

## What I Found

### ✅ Infrastructure Exists (Tested & Working)

The ACP server has **all the infrastructure** for tool approval:

1. **PermissionBridge** (`packages/nuvin-acp/source/adapters/permission-bridge.ts`)
   - Sends `session/request_permission` requests
   - Handles approve/deny responses
   - Maps tool kinds correctly
   - ✅ Fully implemented

2. **Server Event Handler** (`packages/nuvin-acp/source/server.ts`, lines 128-136)
   ```typescript
   orchestrator.onEvent(async (event) => {
     // Handle tool approval events specially
     if (event.type === AgentEventTypes.ToolApprovalRequired) {
       const decision = await this.permissionBridge.requestPermission(
         session.id,
         event.toolCalls[0]
       );
       orchestrator.handleToolApproval(event.approvalId, decision);
       return;
     }
     await eventAdapter.handleEvent(event);
   });
   ```
   - ✅ Listens for ToolApprovalRequired events
   - ✅ Requests permission from client
   - ✅ Calls handleToolApproval with decision

3. **Orchestrator Integration** (`packages/nuvin-cli/source/acp-entry.ts`, lines 188-190)
   ```typescript
   handleToolApproval: (approvalId, decision) => {
     manager.getOrchestrator()?.handleToolApproval(
       approvalId, 
       decision === 'approve' ? 'approve' : 'deny'
     );
   }
   ```
   - ✅ Passes approval to orchestrator

4. **Tests Pass** (25/25 tests)
   - ✅ Permission request tests pass
   - ✅ Approval flow tests pass
   - ✅ Denial flow tests pass

---

### ❌ Missing Piece: Orchestrator Doesn't Emit Approval Events

**The Problem:** The core orchestrator (from `@nuvin/nuvin-core`) doesn't actually emit `ToolApprovalRequired` events when it encounters tool calls. Tools execute automatically without asking for permission.

**Evidence:**
- No code in `packages/nuvin-core` emits `ToolApprovalRequired` events
- No code in `packages/nuvin-cli` wraps tools to request approval
- Tools execute directly when LLM requests them

**Test Reality:** The tests pass because they use mock orchestrators that manually emit `ToolApprovalRequired` events. The real orchestrator doesn't do this.

---

## Current Behavior (What Actually Happens)

```
LLM requests: bash_tool({cmd: 'rm -rf /'})
    ↓
Orchestrator receives tool call
    ↓
Tool executes IMMEDIATELY ❌ (no approval requested)
    ↓
Tool results returned to LLM
    ↓
LLM responds
```

**Problem:** Dangerous commands execute without user approval!

---

## Expected Behavior (What Should Happen)

```
LLM requests: bash_tool({cmd: 'rm -rf /'})
    ↓
Orchestrator receives tool call
    ↓
Orchestrator emits: ToolApprovalRequired event ✅
    ↓
ACP server receives event
    ↓
PermissionBridge sends: session/request_permission
    ↓
ACP client shows: [Allow bash_tool? ✓ Allow once [Allow always] [✗ Reject]]
    ↓
User selects: Allow once
    ↓
Client responds: {outcome: "selected", optionId: "allow-once"}
    ↓
Orchestrator.handleToolApproval('approval_id', 'approve')
    ↓
Tool executes ✅
    ↓
Tool results returned to LLM
```

---

## What Needs Implementation

To make tool approval work in ACP mode, we need to:

### Option 1: Modify Core Orchestrator (Ideal)

Add approval logic to the core orchestrator in `@nuvin/nuvin-core`:

```typescript
// In the orchestrator's tool execution logic:
async executeTool(toolCall) {
  // Check if tool requires approval
  if (this.requiresApproval(toolCall)) {
    // Emit approval required event
    const approvalId = generateId();
    emit(new ToolApprovalRequiredEvent({
      approvalId,
      toolCalls: [toolCall]
    }));
    
    // Wait for approval
    const decision = await this.waitForApproval(approvalId);
    
    if (decision === 'deny') {
      return; // Don't execute
    }
  }
  
  // Execute tool
  return await toolCall.execute();
}
```

**Pros:** Clean, works for all clients  
**Cons:** Requires changes to core package

### Option 2: Wrap ToolPort in ACP Mode (Workaround)

In `acp-entry.ts`, wrap the tool execution:

```typescript
// Wrap tool registry to intercept tool calls
const wrappedToolRegistry = new ToolRegistry({...});

// Override tool execution to request approval
originalToolRegistry.executeTool = async (toolCall) => {
  // Emit approval required event
  const approvalId = generateId();
  
  // Create promise that resolves when handleToolApproval is called
  const approvalPromise = new Promise((resolve) => {
    pendingApprovals.set(approvalId, resolve);
  });
  
  eventBus.emit('agent:event', {
    type: AgentEventTypes.ToolApprovalRequired,
    approvalId,
    toolCalls: [toolCall]
  });
  
  const decision = await approvalPromise;
  
  if (decision === 'deny') {
    throw new Error('Tool execution denied');
  }
  
  // Execute original tool
  return await originalToolRegistry.executeTool(toolCall);
};

// Use wrapped registry
const agentTools = wrappedToolRegistry;
```

**Pros:** Can be done in CLI package  
**Cons:** More complex, needs careful testing

---

## Current Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| **ACP Permission Infrastructure** | ✅ Complete | Server, bridge, handler all implemented |
| **Event Types** | ✅ Defined | `ToolApprovalRequired` exists |
| **Tests** | ✅ Pass | But use mocks that emit events manually |
| **Real Orchestrator** | ❌ Doesn't Emit | Tools execute without approval |
| **Tool Execution in ACP** | ❌ No Approval | Dangerous commands run automatically |

---

## Recommendation

**The tool approval INFRASTRUCTURE is complete and tested, but the orchestrator doesn't actually use it.**

Tools currently execute without requesting approval from the user. This is a **security concern** for ACP mode since:

1. Dangerous commands (like `bash_tool` with `rm -rf /`) can execute without permission
2. File modifications happen silently
3. No user control over what tools can do

**To Fix:** Either:
1. **Best:** Add approval logic to core orchestrator (works for all clients)
2. **Good:** Wrap tool execution in ACP mode (ACP-specific fix)

The good news is all the plumbing is in place - we just need to wire up the approval request emission in the actual orchestrator.
