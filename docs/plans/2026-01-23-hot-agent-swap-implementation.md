# Hot Agent Swap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Implement `/swap` command that allows users to switch the active agent at runtime, replacing the entire `AgentOrchestrator` instance while preserving conversation history.

**Architecture:** Swap is handled by `OrchestratorManager.swapToAgent()` which creates a new `AgentOrchestrator` with merged config from the selected sub-agent. Conversation history is copied to the new orchestrator's memory. Users can always `/swap main` to return.

**Tech Stack:** TypeScript, React/Ink for TUI, @nuvin/nuvin-core for orchestration, AgentRegistry for agent storage.

---

## Prerequisites

Before starting, verify the worktree is clean:
```bash
cd /Users/marsch/Projects/nuvin-space-public
git worktree list  # Should show worktree for feature implementation
```

---

## Phase 1: Core OrchestratorManager Changes

### Task 1: Add active agent state to OrchestratorManager

**Files:**
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts:133-160`

**Step 1: Write failing test**

Create `packages/nuvin-core/src/tests/swap-orchestrator.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { OrchestratorManager } from '@nuvin/nuvin-cli';

describe('OrchestratorManager activeAgentId', () => {
  it('should have activeAgentId initialized to "main"', () => {
    const manager = new OrchestratorManager();
    // This will fail - property doesn't exist yet
    expect((manager as any).activeAgentId).toBe('main');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/nuvin-core && pnpm test swap-orchestrator.test.ts`
Expected: FAIL with "Property 'activeAgentId' does not exist"

**Step 3: Add activeAgentId field**

Modify `OrchestratorManager` constructor (~line 133):
```typescript
export class OrchestratorManager {
  private orchestrator: AgentOrchestrator | null = null;
  private memory: MemoryPort<Message> | null = null;
  // ... existing fields
  private sessionInitialized: boolean = false;
  private toolRegistry: ToolRegistry | null = null;
  
  // NEW: Active agent tracking
  private activeAgentId: string = 'main';
  private previousOrchestrator: AgentOrchestrator | null = null;
```

**Step 4: Run test to verify it passes**

Run: `cd packages/nuvin-core && pnpm test swap-orchestrator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/nuvin-core/src/tests/swap-orchestrator.test.ts
git commit -m "feat: add active agent state to OrchestratorManager"
```

---

### Task 2: Add getActiveAgentId() getter method

**Files:**
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts:400-420`

**Step 1: Write failing test**

Add to `packages/nuvin-cli/tests/orchestrator-manager-state.test.ts`:
```typescript
it('should return "main" by default from getActiveAgentId()', () => {
  const manager = new OrchestratorManager();
  expect(manager.getActiveAgentId()).toBe('main');
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/nuvin-core && pnpm test swap-orchestrator.test.ts`
Expected: FAIL with "getActiveAgentId is not a function"

**Step 3: Add getter method**

Add after `getConfig()` method (~line 420):
```typescript
getActiveAgentId(): string {
  return this.activeAgentId;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/nuvin-core && pnpm test swap-orchestrator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/nuvin-core/src/tests/swap-orchestrator.test.ts packages/nuvin-cli/source/services/OrchestratorManager.ts
git commit -m "feat: add getActiveAgentId() method"
```

---

### Task 3: Implement config merging utility function

**Files:**
- Create: `packages/nuvin-core/src/swap-config.ts`
- Modify: `packages/nuvin-core/src/index.ts` - export the new function

**Step 1: Write failing test**

Create `packages/nuvin-core/src/tests/swap-config-merge.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { mergeAgentConfig } from '../swap-config.js';

describe('mergeAgentConfig', () => {
  const mainConfig = {
    id: 'nuvin-agent',
    systemPrompt: 'You are the main agent',
    temperature: 0.7,
    topP: 0.9,
    model: 'gpt-4o',
    maxTokens: 64000,
    enabledTools: ['bash_tool', 'file_read', 'file_edit'],
    maxToolConcurrency: 10,
    requireToolApproval: false,
    reasoningEffort: 'medium' as const,
    thinking: 'auto' as const,
  };

  it('should use sub-agent systemPrompt', () => {
    const agentTemplate = { systemPrompt: 'You are a security auditor', tools: [] };
    const result = mergeAgentConfig(mainConfig, agentTemplate as any);
    expect(result.systemPrompt).toBe('You are a security auditor');
  });

  it('should use sub-agent model when specified', () => {
    const agentTemplate = { systemPrompt: 'You are an agent', model: 'claude-sonnet-4-5', tools: [] };
    const result = mergeAgentConfig(mainConfig, agentTemplate as any);
    expect(result.model).toBe('claude-sonnet-4-5');
  });

  it('should use main config model when agent does not specify', () => {
    const agentTemplate = { systemPrompt: 'You are an agent', tools: [] };
    const result = mergeAgentConfig(mainConfig, agentTemplate as any);
    expect(result.model).toBe('gpt-4o');
  });

  it('should use sub-agent tools when specified', () => {
    const agentTemplate = { systemPrompt: 'You are an agent', tools: ['file_read', 'grep_tool'], tools: ['file_read', 'grep_tool'] };
    const result = mergeAgentConfig(mainConfig, agentTemplate as any);
    expect(result.enabledTools).toEqual(['file_read', 'grep_tool']);
  });

  it('should use main config tools when agent has empty tools array', () => {
    const agentTemplate = { systemPrompt: 'You are an agent', tools: [] };
    const result = mergeAgentConfig(mainConfig, agentTemplate as any);
    expect(result.enabledTools).toEqual(['bash_tool', 'file_read', 'file_edit']);
  });

  it('should set id with swapped- prefix', () => {
    const agentTemplate = { id: 'security-auditor', systemPrompt: 'You audit', tools: [] };
    const result = mergeAgentConfig(mainConfig, agentTemplate as any);
    expect(result.id).toBe('swapped-security-auditor');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/nuvin-core && pnpm test swap-config-merge.test.ts`
Expected: FAIL with "mergeAgentConfig is not exported"

**Step 3: Create merge function**

Create `packages/nuvin-core/src/swap-config.ts`:
```typescript
import type { AgentConfig } from './ports.js';
import type { CompleteAgent } from './agent-types.js';

export function mergeAgentConfig(
  mainConfig: AgentConfig,
  agentTemplate: CompleteAgent,
): AgentConfig {
  return {
    id: `swapped-${agentTemplate.id}`,
    systemPrompt: agentTemplate.systemPrompt,
    temperature: agentTemplate.temperature ?? mainConfig.temperature,
    topP: agentTemplate.topP ?? mainConfig.topP,
    model: agentTemplate.model ?? mainConfig.model,
    maxTokens: agentTemplate.maxTokens ?? mainConfig.maxTokens,
    enabledTools: agentTemplate.tools && agentTemplate.tools.length > 0
      ? agentTemplate.tools
      : mainConfig.enabledTools,
    maxToolConcurrency: mainConfig.maxToolConcurrency,
    requireToolApproval: mainConfig.requireToolApproval,
    reasoningEffort: mainConfig.reasoningEffort,
    thinking: mainConfig.thinking,
  };
}
```

**Step 4: Export from index**

Modify `packages/nuvin-core/src/index.ts`, add:
```typescript
export { mergeAgentConfig } from './swap-config.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/nuvin-core && pnpm test swap-config-merge.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/nuvin-core/src/swap-config.ts packages/nuvin-core/src/index.ts packages/nuvin-core/src/tests/swap-config-merge.test.ts
git commit -m "feat: add mergeAgentConfig utility function"
```

---

### Task 4: Implement swapToAgent method in OrchestratorManager

**Files:**
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts:750-850`

**Step 1: Write integration test for swapToAgent**

Create `packages/nuvin-core/src/tests/swap-to-agent.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { OrchestratorManager } from '@nuvin/nuvin-cli';

describe('OrchestratorManager.swapToAgent', () => {
  let manager: OrchestratorManager;
  
  beforeEach(() => {
    manager = new OrchestratorManager();
  });

  it('should throw error for non-existent agent', async () => {
    await expect(manager.swapToAgent('non-existent-agent')).rejects.toThrow('Agent not found');
  });

  it('should set activeAgentId on successful swap', async () => {
    // This test will fail until swapToAgent is implemented
    // and properly integrated with AgentRegistry
    await expect(manager.swapToAgent('main')).resolves.not.toThrow();
    expect(manager.getActiveAgentId()).toBe('main');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/nuvin-core && pnpm test swap-to-agent.test.ts`
Expected: FAIL with "swapToAgent is not a function"

**Step 3: Implement swapToAgent method**

Add to `OrchestratorManager` class (~line 750):
```typescript
async swapToAgent(agentId: string): Promise<void> {
  if (!this.orchestrator) {
    throw new Error('Orchestrator not initialized');
  }

  // Validate agent exists and is enabled
  const tools = this.orchestrator.getTools();
  const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
  const agentRegistry = agentAwareTools?.getAgentRegistry?.();

  if (!agentRegistry) {
    throw new Error('Agent registry not available');
  }

  const agent = agentRegistry.get(agentId);
  if (!agent) {
    throw new Error(`Agent "${agentId}" not found`);
  }

  const enabledConfig = (this.configManager.get('agentsEnabled') as Record<string, boolean>) || {};
  if (enabledConfig[agentId] === false) {
    throw new Error(`Agent "${agentId}" is disabled`);
  }

  const currentConfig = this.getCurrentConfig();
  const persistEventLog = currentConfig.config.session?.persistEventLog ?? false;

  // Capture current orchestrator state
  const conversationId = this.conversationContext.getActiveConversationId();
  const history = this.memory ? await this.memory.get(conversationId) : [];

  // Merge configs
  const mainConfig = this.orchestrator.getConfig();
  const mergedConfig = mergeAgentConfig(mainConfig, agent);

  // Create new memory for swapped agent
  let newMemory: MemoryPort<Message>;
  if (this.sessionDir) {
    newMemory = this.createMemory(this.sessionDir, `swapped-${agentId}`);
  } else {
    newMemory = new InMemoryMemory<Message>();
  }

  // Copy history to new memory
  if (history.length > 0) {
    await newMemory.set(conversationId, history);
  }

  // Create new LLM for the agent's model
  const httpLogFile = this.memPersist && this.sessionDir && this.sessionDir.length > 0
    ? `${this.sessionDir}/http-log.json`
    : undefined;
  const newLLM = this.createLLM(httpLogFile);

  // Create new event adapter
  const newEventAdapter = this.createEventAdapter(
    this.sessionDir || '',
    this.handlers!,
    persistEventLog,
    this.streamingChunks,
  );

  // Create new metrics port
  const newMetrics = new SessionBoundMetricsPort(
    `swapped-${agentId}`,
    sessionMetricsService,
  );

  // Create new orchestrator with merged config
  const newOrchestrator = new AgentOrchestrator(mergedConfig, {
    memory: newMemory,
    tools: tools,
    events: newEventAdapter,
    metrics: newMetrics,
  });

  // Set LLM before storing
  newOrchestrator.setLLM(newLLM);

  // Store previous orchestrator for potential restore
  this.previousOrchestrator = this.orchestrator;

  // Swap orchestrator
  this.orchestrator = newOrchestrator;
  this.memory = newMemory;
  this.activeAgentId = agentId;

  // Emit swap event
  eventBus.emit('agent:swapped', {
    type: 'agent:swapped',
    previousAgentId: 'main',
    agentId,
    agentName: agent.name,
    timestamp: new Date().toISOString(),
  });
}
```

**Step 4: Run test to verify it fails appropriately**

Run: `cd packages/nuvin-core && pnpm test swap-to-agent.test.ts`
Expected: FAIL with specific error (method exists but behavior not correct yet)

**Step 5: Fix implementation issues iteratively until tests pass**

**Step 6: Commit**

```bash
git add packages/nuvin-core/src/tests/swap-to-agent.test.ts packages/nuvin-cli/source/services/OrchestratorManager.ts
git commit -m "feat: implement swapToAgent method in OrchestratorManager"
```

---

### Task 5: Implement swapToMain method

**Files:**
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts`

**Step 1: Write failing test**

Add to `packages/nuvin-core/src/tests/swap-to-agent.test.ts`:
```typescript
it('should restore main agent on swapToMain', async () => {
  // This will fail until swapToMain is implemented
  await manager.swapToMain();
  expect(manager.getActiveAgentId()).toBe('main');
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/nuvin-core && pnpm test swap-to-agent.test.ts`
Expected: FAIL with "swapToMain is not a function"

**Step 3: Add swapToMain method**

```typescript
async swapToMain(): Promise<void> {
  if (!this.orchestrator) {
    throw new Error('Orchestrator not initialized');
  }

  if (this.activeAgentId === 'main') {
    // Already on main agent
    return;
  }

  // Capture conversation from current orchestrator
  const conversationId = this.conversationContext.getActiveConversationId();
  const history = this.memory ? await this.memory.get(conversationId) : [];

  // Get original main agent config
  const mainConfig = {
    id: 'nuvin-agent',
    systemPrompt: renderTemplate(prompt, { 
      injectedSystem: buildInjectedSystem({
        today: new Date().toLocaleString(),
        platform: process.platform,
        arch: process.arch,
        tempDir: os.tmpdir?.() ?? '',
        workspaceDir: process.cwd(),
        availableAgents: [],
        folderTree: await generateFolderTree(process.cwd(), { maxDepth: 3, maxFiles: 500, includeHidden: false }),
      }, { withSubAgent: true }),
    }),
    temperature: 1,
    topP: 1,
    model: this.model,
    enabledTools: getEnabledTools(),
    maxToolConcurrency: 10,
    requireToolApproval: this.configManager.getConfig().requireToolApproval,
    reasoningEffort: this.configManager.getConfig().reasoningEffort,
    thinking: this.configManager.getConfig().thinking,
  };

  const currentConfig = this.getCurrentConfig();
  const persistEventLog = currentConfig.config.session?.persistEventLog ?? false;

  // Create new memory for main agent
  let newMemory: MemoryPort<Message>;
  if (this.sessionDir) {
    newMemory = this.createMemory(this.sessionDir, 'cli');
  } else {
    newMemory = new InMemoryMemory<Message>();
  }

  // Copy history to new memory
  if (history.length > 0) {
    await newMemory.set(conversationId }

  // Create, history);
  new LLM
  const httpLogFile = this.memPersist && this.sessionDir && this.sessionDir.length > 0
    ? `${this.sessionDir}/http-log.json`
    : undefined;
  const newLLM = this.createLLM(httpLogFile);

  // Create new event adapter
  const newEventAdapter = this.createEventAdapter(
    this.sessionDir || '',
    this.handlers!,
    persistEventLog,
    this.streamingChunks,
  );

  // Create new metrics port
  const newMetrics = new SessionBoundMetricsPort(
    'main',
    sessionMetricsService,
  );

  // Create new orchestrator
  const newOrchestrator = new AgentOrchestrator(mainConfig, {
    memory: newMemory,
    tools: this.orchestrator.getTools(),
    events: newEventAdapter,
    metrics: newMetrics,
  });

  newOrchestrator.setLLM(newLLM);

  // Swap orchestrator
  this.orchestrator = newOrchestrator;
  this.memory = newMemory;
  this.activeAgentId = 'main';

  // Emit swap event
  eventBus.emit('agent:swapped', {
    type: 'agent:swapped',
    previousAgentId: this.activeAgentId,
    agentId: 'main',
    agentName: 'Main Agent',
    timestamp: new Date().toISOString(),
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/nuvin-core && pnpm test swap-to-agent.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/nuvin-cli/source/services/OrchestratorManager.ts
git commit -m "feat: implement swapToMain method"
```

---

## Phase 2: Command Implementation

### Task 6: Create /swap command component

**Files:**
- Create: `packages/nuvin-cli/source/modules/commands/definitions/swap.tsx`
- Modify: `packages/nuvin-cli/source/modules/commands/definitions/index.ts`

**Step 1: Create the command component**

Create `packages/nuvin-cli/source/modules/commands/definitions/swap.tsx`:
```typescript
import { useCallback, useEffect, useState } from 'react';
import { Text, Box } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { eventBus } from '@/services/EventBus.js';

interface AgentInfo {
  id: string;
  name: string;
  description: string;
}

const SwapCommandComponent = ({ context, deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [swapResult, setSwapResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadAgents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const tools = context.orchestratorManager?.getOrchestrator()?.getTools?.();
      const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
      const agentRegistry = agentAwareTools?.getAgentRegistry?.();

      if (!agentRegistry) {
        setError('Agent registry not available');
        return;
      }

      const allAgents = agentRegistry.list();
      const enabledConfig = (context.config.get('agentsEnabled') as Record<string, boolean>) || {};

      const agentInfos: AgentInfo[] = allAgents
        .filter((agent) => enabledConfig[agent.id] !== false)
        .map((agent) => ({
          id: agent.id,
          name: agent.name,
          description: agent.description,
        }));

      setAgents(agentInfos);
    } catch (err) {
      setError(`Failed to load agents: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [context.orchestratorManager?.getOrchestrator, context.config]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const handleSwap = useCallback(async (agentId: string) => {
    try {
      setSwapping(true);
      setError(null);

      if (agentId === 'main') {
        await context.orchestratorManager?.swapToMain();
        setSwapResult({ success: true, message: 'Returned to main agent' });
      } else {
        await context.orchestratorManager?.swapToAgent(agentId);
        const agent = agents.find((a) => a.id === agentId);
        setSwapResult({ success: true, message: `Switched to ${agent?.name || agentId}` });
      }

      // Close command after brief delay
      setTimeout(() => {
        deactivate();
      }, 1500);
    } catch (err) {
      setError(`Failed to swap: ${err instanceof Error ? err.message : String(err)}`);
      setSwapping(false);
    }
  }, [context.orchestratorManager, agents, deactivate]);

  useInput(
    (_input, key) => {
      if (key.escape) {
        deactivate();
      }
    },
    { isActive: !swapping },
  );

  if (loading) {
    return (
      <Box marginTop={1}>
        <Text color={theme.colors.warning}>Loading agents...</Text>
      </Box>
    );
  }

  if (swapResult) {
    return (
      <Box marginTop={1}>
        <Text color={swapResult.success ? theme.colors.success : theme.colors.error}>
          {swapResult.message}
        </Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box marginTop={1}>
        <Text color={theme.colors.error}>{error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Available Agents:</Text>
      <Text />
      <Text color={theme.colors.muted}>Type /swap &lt;agent-id&gt; or /swap main to switch</Text>
      <Text color={theme.colors.muted}>Press Esc to close</Text>
      <Text />
      <Text color={theme.colors.primary}>/swap main - Return to main agent</Text>
      {agents.map((agent) => (
        <Text key={agent.id} color={theme.colors.primary}>
          /swap {agent.id} - {agent.name}
        </Text>
      ))}
    </Box>
  );
};

export function registerSwapCommand(registry: CommandRegistry) {
  registry.register({
    id: '/swap',
    type: 'component',
    description: 'Switch the active agent handling your conversation.',
    category: 'conversation',
    component: SwapCommandComponent,
  });
}
```

**Step 2: Register command in index**

Modify `packages/nuvin-cli/source/modules/commands/definitions/index.ts`:
```typescript
import { registerSwapCommand } from './swap.js';

// ... existing registrations

export function initializeCommands(registry: CommandRegistry) {
  // ... existing calls
  registerSwapCommand(registry);
}
```

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/modules/commands/definitions/swap.tsx packages/nuvin-cli/source/modules/commands/definitions/index.ts
git commit -m "feat: create /swap command component"
```

---

### Task 7: Add SWAPPING status to OrchestratorStatus

**Files:**
- Modify: `packages/nuvin-cli/source/types/orchestrator.ts`

**Step 1: Add SWAPPING status**

Modify `packages/nuvin-cli/source/types/orchestrator.ts`:
```typescript
export enum OrchestratorStatus {
  INITIALIZING = 'initializing',
  READY = 'ready',
  SWAPPING = 'swapping',  // Add this line
  ERROR = 'error',
}
```

**Step 2: Commit**

```bash
git add packages/nuvin-cli/source/types/orchestrator.ts
git commit -m "feat: add SWAPPING status to OrchestratorStatus"
```

---

## Phase 3: UI Updates

### Task 8: Update header to show active agent

**Files:**
- Modify: Header component (find in `packages/nuvin-cli/source/components/`)

**Step 1: Find header component**

Run: `grep_tool { pattern: "activeAgentId|OrchestratorStatus", include: "*.tsx", path: "packages/nuvin-cli/source" }`

**Step 2: Add active agent badge to header**

```typescript
// In header render
const activeAgent = orchestratorManager?.getActiveAgentId();

return (
  <Box>
    {/* Existing header content */}
    {activeAgent && activeAgent !== 'main' && (
      <Text color={theme.colors.accent}>[{activeAgent}] </Text>
    )}
  </Box>
);
```

**Step 3: Listen for agent:swapped event**

```typescript
useEffect(() => {
  const handleAgentSwapped = () => {
    forceUpdate();
  };
  eventBus.on('agent:swapped', handleAgentSwapped);
  return () => eventBus.off('agent:swapped', handleAgentSwapped);
}, []);
```

**Step 4: Commit**

```bash
git add packages/nuvin-cli/source/components/Header.tsx  # or appropriate header file
git commit -m "feat: show active agent badge in header"
```

---

### Task 9: Handle agent:swapped event for UI feedback

**Files:**
- Modify: `packages/nuvin-cli/source/services/EventBus.ts` (if needed)
- Modify: Main app component for toast/notification

**Step 1: Ensure event is properly typed**

Modify event types if needed in `EventBus.ts` or types file.

**Step 2: Add toast notification for swap**

In the main app component, listen for `agent:swapped` and show brief toast:
```typescript
useEffect(() => {
  const handleAgentSwapped = (event: any) => {
    toast.show(`${event.agentName} is now active`, { type: 'success' });
  };
  eventBus.on('agent:swapped', handleAgentSwapped);
  return () => eventBus.off('agent:swapped', handleAgentSwapped);
}, []);
```

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/services/EventBus.ts
git commit -m "feat: add agent:swapped event handling for UI feedback"
```

---

## Phase 4: Additional Tests & Polish

### Task 10: Write integration test for swap command

**Files:**
- Create: `packages/nuvin-cli/tests/swap-command.test.tsx`

**Step 1: Create integration test**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SwapCommandComponent } from '../source/modules/commands/definitions/swap.js';

describe('/swap command', () => {
  it('should display available agents', () => {
    // Mock orchestratorManager with getOrchestrator
    const mockContext = {
      orchestratorManager: {
        getOrchestrator: vi.fn(),
      },
      config: {
        get: vi.fn().mockReturnValue({}),
      },
    };

    const { getByText } = render(<SwapCommandComponent context={mockContext as any} deactivate={() => {}} />);
    
    // Should show loading then agents
    expect(getByText('Available Agents:')).toBeTruthy();
  });
});
```

**Step 2: Run test**

```bash
cd packages/nuvin-cli && pnpm test swap-command.test.tsx
```

**Step 3: Commit**

```bash
git add packages/nuvin-cli/tests/swap-command.test.tsx
git commit -m "test: add integration test for /swap command"
```

---

### Task 11: Test memory preservation during swap

**Files:**
- Modify: `packages/nuvin-core/src/tests/swap-to-agent.test.ts`

**Step 1: Add history preservation test**

```typescript
it('should preserve conversation history during swap', async () => {
  // Setup: Add messages to memory
  const manager = new OrchestratorManager();
  // ... initialize orchestrator with memory containing messages
  
  // Swap agent
  await manager.swapToAgent('main');
  
  // Verify history is preserved
  const newMemory = manager.getMemory();
  const history = await newMemory.get('default');
  expect(history.length).toBeGreaterThan(0);
});
```

**Step 2: Run test**

```bash
cd packages/nuvin-core && pnpm test swap-to-agent.test.ts
```

**Step 3: Commit**

```bash
git add packages/nuvin-core/src/tests/swap-to-agent.test.ts
git commit -m "test: verify conversation history preserved during swap"
```

---

## Summary of Files Changed

### New Files Created

| File | Purpose |
|------|---------|
| `packages/nuvin-core/src/swap-config.ts` | Config merging utility |
| `packages/nuvin-core/src/tests/swap-config-merge.test.ts` | Config merge tests |
| `packages/nuvin-core/src/tests/swap-orchestrator.test.ts` | Orchestrator state tests |
| `packages/nuvin-core/src/tests/swap-to-agent.test.ts` | Swap operation tests |
| `packages/nuvin-cli/source/modules/commands/definitions/swap.tsx` | /swap command component |
| `packages/nuvin-cli/tests/swap-command.test.tsx` | Command integration tests |

### Modified Files

| File | Changes |
|------|---------|
| `packages/nuvin-cli/source/services/OrchestratorManager.ts` | Add activeAgentId, swapToAgent(), swapToMain() |
| `packages/nuvin-cli/source/types/orchestrator.ts` | Add SWAPPING status |
| `packages/nuvin-cli/source/modules/commands/definitions/index.ts` | Register /swap command |
| `packages/nuvin-core/src/index.ts` | Export mergeAgentConfig |
| `packages/nuvin-cli/source/components/Header.tsx` | Show active agent badge |

---

## Plan Complete

**Execution options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
