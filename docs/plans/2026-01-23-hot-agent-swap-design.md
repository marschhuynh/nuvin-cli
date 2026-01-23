# Hot Agent Swap Design

## Overview

Implement a `/swap` command that allows users to switch the active agent handling their conversation at runtime. When swapped, the entire `AgentOrchestrator` instance is replaced with one configured for the selected sub-agent. The conversation history is preserved and loaded into the new orchestrator's memory, maintaining context continuity.

## Core Concept

The hot agent swap allows users to switch the active agent handling their conversation at runtime. When swapped, the entire `AgentOrchestrator` instance is replaced with one configured for the selected sub-agent. The conversation history is preserved and loaded into the new orchestrator's memory, maintaining context continuity.

### Key Invariants

- Only registered agents in `AgentRegistry` can be swapped to
- Users can always `/swap main` to return to the default agent
- The swap preserves conversation history but applies the new agent's system prompt going forward
- Config merging: sub-agent config takes priority over main agent config for overlapping fields

### State Tracking

- `OrchestratorManager` maintains `activeAgentId` (defaults to `'main'`)
- Swap operation is atomic: either succeeds fully or leaves previous orchestrator intact

## State Management & Data Flow

### New Fields in OrchestratorManager

```typescript
private activeAgentId: string = 'main';           // 'main' or registered agent ID
private previousOrchestrator: AgentOrchestrator | null = null;  // For /swap main
private previousAgentConfig: AgentConfig | null = null;  // To restore on swap back
```

### Swap Operation Flow

1. User runs `/swap <agent-id>` → `OrchestratorManager.swapToAgent(agentId)`
2. Validate agent exists in `AgentRegistry` and is enabled
3. Create merged config: sub-agent config overrides + main agent defaults
4. Capture current orchestrator state (memory, events, metrics) for potential restore
5. Create new `AgentOrchestrator` instance with merged config
6. Copy conversation history from old orchestrator's memory to new one
7. Swap the orchestrator reference, update `activeAgentId`
8. Emit `agent:swapped` event for UI to update

### Return to Main (`/swap main`)

1. Restore previous orchestrator if it was captured
2. Or create new main orchestrator from original config
3. Restore conversation history from swapped agent's memory
4. Update `activeAgentId` to `'main'`

## UI/Command Implementation

### Command: `/swap`

```
/swap                    # Show current agent with option to switch
/swap <agent-id>         # Directly swap to agent
/swap main               # Return to main agent
/swap -l, --list         # List available agents for swapping
```

### Command Component (`swap.tsx`)

- **Direct swap:** `/swap <agent-id>` triggers immediate swap, shows confirmation message
- **Interactive mode:** `/swap` opens a modal/picker listing enabled agents from `AgentRegistry`
- **Confirmation:** Show agent name, description, and model before confirming
- **Status line:** After swap, display "Switched to [agent-name]"

### Integration Points

- Register in `commands/definitions/swap.tsx` with `registerSwapCommand`
- Import `OrchestratorManager.swapToAgent()` method
- Use `eventBus.emit('agent:swapped', { agentId, agentName })` to notify UI
- Update header/status bar to show `activeAgentId`

### Minimal UI Changes

- Extend `OrchestratorStatus` enum with `SWAPPING` state
- Add `activeAgent` field to session state for header display
- Show agent badge in prompt: `[agent-name] nuvin >` vs `[main] nuvin >`

## Config Merging & Memory Handling

### Config Merge Strategy

Sub-agent wins on overlap:

```typescript
function mergeAgentConfig(
  mainConfig: AgentConfig,
  agentTemplate: CompleteAgent,
): AgentConfig {
  return {
    id: `swapped-${agentTemplate.id}`,
    systemPrompt: agentTemplate.systemPrompt,  // Always use agent's prompt
    temperature: agentTemplate.temperature ?? mainConfig.temperature,
    topP: agentTemplate.topP ?? mainConfig.topP,
    model: agentTemplate.model ?? mainConfig.model,
    maxTokens: agentTemplate.maxTokens ?? mainConfig.maxTokens,
    enabledTools: agentTemplate.tools.length > 0 
      ? agentTemplate.tools 
      : mainConfig.enabledTools,
    maxToolConcurrency: mainConfig.maxToolConcurrency,
    requireToolApproval: mainConfig.requireToolApproval,
    reasoningEffort: mainConfig.reasoningEffort,
    thinking: mainConfig.thinking,
  };
}
```

### Memory Handling During Swap

1. **Capture history before swap:**
   ```typescript
   const conversationId = this.conversationContext.getActiveConversationId();
   const history = await this.memory.get(conversationId);
   ```

2. **Initialize new orchestrator with history:**
   ```typescript
   const newMemory = this.createMemory(sessionDir, `swapped-${agentId}`);
   await newMemory.set(conversationId, history);
   ```

3. **Metadata preservation:**
   - Copy conversation metadata from old store to new
   - Add `swappedFrom: 'main'` or `swappedFrom: <previous-agent-id>` to metadata

### Edge Cases

- **Empty history:** New conversation starts fresh with agent's system prompt
- **Different tool sets:** If agent has fewer tools, unavailable tool calls will fail gracefully
- **Different models:** LLM is recreated for new orchestrator with agent's model

## Testing Strategy

### Unit Tests (`packages/nuvin-core/src/tests/`)

| Test | Description |
|------|-------------|
| `config-merge.test.ts` | Verify merge logic prioritizes sub-agent config |
| `swap-orchestrator.test.ts` | Test orchestrator swap preserves history |
| `swap-invalid-agent.test.ts` | Swap to non-existent agent fails gracefully |
| `swap-main-restores.test.ts` | `/swap main` restores original orchestrator |
| `config-merge-edge-cases.test.ts` | Missing fields, nulls, undefined handled correctly |

### Integration Tests (`packages/nuvin-cli/`)

| Test | Description |
|------|-------------|
| `/swap` command | Command registers, opens modal, lists agents |
| Direct swap `/swap <id>` | OrchestratorManager.swapToAgent() works end-to-end |
| `/swap main` | Returns to original agent, history preserved |
| UI feedback | Agent badge updates, status shows correct agent |
| Event bus | `agent:swapped` event fires with correct payload |

### Manual Testing Checklist

- [ ] Swap to an agent, verify new system prompt applies
- [ ] Send message, verify response comes from swapped agent
- [ ] Swap back to main, verify conversation continuity
- [ ] Swap while in middle of tool execution (should block until idle)
- [ ] Swap with empty history (new conversation)
- [ ] Swap to agent with different model (LLM recreated correctly)
- [ ] Swap to agent with limited tools (tool calls fail appropriately)

### Mock Strategy

- Mock `AgentRegistry` with test agents
- Mock `AgentOrchestrator` to track config changes
- Capture history snapshots before/after swap

## Implementation Files

### New Files

- `packages/nuvin-cli/source/modules/commands/definitions/swap.tsx` - Command component
- `packages/nuvin-cli/source/modules/commands/definitions/index.ts` - Register command
- `packages/nuvin-cli/tests/orchestrator-manager-state.test.ts` - Unit tests

### Modified Files

- `packages/nuvin-cli/source/services/OrchestratorManager.ts` - Add swapToAgent, activeAgentId
- `packages/nuvin-cli/source/types/orchestrator.ts` - Add SWAPPING status
- `packages/nuvin-core/src/tests/config-merge.test.ts` - New test file

## Event Bus Events

```typescript
// New event for agent swap
interface AgentSwappedEvent {
  type: 'agent:swapped';
  previousAgentId: string;
  agentId: string;
  agentName: string;
  timestamp: string;
}
```

## Command Definition Schema

```typescript
{
  id: '/swap',
  type: 'component',
  description: 'Switch the active agent handling your conversation.',
  category: 'conversation',
  component: SwapCommandComponent,
}
```
