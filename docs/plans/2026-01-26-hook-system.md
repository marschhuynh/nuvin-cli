# Hook System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a hook system for Nuvin that intercepts agent behavior at lifecycle points (pre-tool, post-tool, session start/end, etc.), leveraging the existing event infrastructure.

**Architecture:** Extend Nuvin's existing `EventPort` system with a `HookPort` that adds decision control (allow/deny/block/modify) to events. Hooks execute as bash commands or LLM prompts, matching Claude Code's hook patterns.

**Tech Stack:** TypeScript, Nuvin Core (`packages/nuvin-core`), existing EventPort infrastructure

---

## Task 1: Create hook types and interfaces

**Files:**
- Create: `packages/nuvin-core/src/hooks/types.ts`
- Test: `packages/nuvin-core/src/tests/hooks/types.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { HookEventTypes, HookDecision, HookResult, HookContext, HookPort } from '../hooks/types.js';

describe('Hook Types', () => {
  it('should define hook event types', () => {
    expect(HookEventTypes.PreToolUse).toBe('pre_tool_use');
    expect(HookEventTypes.PostToolUse).toBe('post_tool_use');
    expect(HookEventTypes.PreUserPrompt).toBe('pre_user_prompt');
    expect(HookEventTypes.PreStop).toBe('pre_stop');
    expect(HookEventTypes.SessionStart).toBe('session_start');
    expect(HookEventTypes.SessionEnd).toBe('session_end');
  });

  it('should define hook decision types', () => {
    expect(HookDecision.Allow).toBe('allow');
    expect(HookDecision.Deny).toBe('deny');
    expect(HookDecision.Ask).toBe('ask');
  });

  it('should define hook result interface', () => {
    const result: HookResult = {
      continue: true,
      exitCode: 0,
    };
    expect(result.continue).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('should define hook context interface', () => {
    const context: HookContext = {
      sessionId: 'test-session',
      conversationId: 'test-convo',
      messageId: 'test-msg',
      hookEvent: HookEventTypes.PreToolUse,
      cwd: '/test',
      toolName: 'bash_tool',
      toolInput: { command: 'ls' },
      toolUseId: 'tool-123',
    };
    expect(context.toolName).toBe('bash_tool');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/marsch/.config/superpowers/worktrees/nuvin-space-public/hook-system-plan
pnpm test -- packages/nuvin-core/src/tests/hooks/types.test.ts
```

Expected: FAIL with "Module not found" or "HookEventTypes not exported"

**Step 3: Write minimal implementation**

```typescript
// packages/nuvin-core/src/hooks/types.ts

export const HookEventTypes = {
  PreUserPrompt: 'pre_user_prompt',
  PreToolUse: 'pre_tool_use',
  PermissionRequest: 'permission_request',
  PostToolUse: 'post_tool_use',
  PreSubAgent: 'pre_sub_agent',
  PostSubAgent: 'post_sub_agent',
  PreStop: 'pre_stop',
  SessionStart: 'session_start',
  SessionEnd: 'session_end',
} as const;

export type HookEventType = typeof HookEventTypes[keyof typeof HookEventTypes];

export const HookDecision = {
  Allow: 'allow',
  Deny: 'deny',
  Ask: 'ask',
  Block: 'block',
} as const;

export type HookDecision = typeof HookDecision[keyof typeof HookDecision];

export interface HookResult {
  decision?: HookDecision;
  decisionReason?: string;
  updatedInput?: Record<string, unknown>;
  additionalContext?: string;
  continue: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  rawOutput?: string;
  exitCode: number;
  error?: string;
  durationMs?: number;
}

export interface HookContext {
  sessionId: string;
  conversationId: string;
  messageId: string;
  hookEvent: HookEventType;
  cwd: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolUseId?: string;
  toolResponse?: Record<string, unknown>;
  prompt?: string;
  agentId?: string;
  agentType?: string;
  permissionType?: string;
}

export interface HookDefinition {
  matcher?: string;
  command?: {
    command: string;
    timeout?: number;
  };
  prompt?: {
    prompt: string;
    timeout?: number;
  };
  enabled?: boolean;
  once?: boolean;
}

export interface HookEventConfig {
  hooks: HookDefinition[];
}

export interface HooksConfig {
  pre_user_prompt?: HookEventConfig;
  pre_tool_use?: HookEventConfig;
  permission_request?: HookEventConfig;
  post_tool_use?: HookEventConfig;
  pre_sub_agent?: HookEventConfig;
  post_sub_agent?: HookEventConfig;
  pre_stop?: HookEventConfig;
  session_start?: HookEventConfig;
  session_end?: HookEventConfig;
}

export interface HookPort {
  executeHook(context: HookContext): Promise<HookResult>;
  hasHooks(event: HookEventType, matcher?: string): boolean;
}
```

**Step 4: Run test to verify it passes**

```bash
cd /Users/marsch/.config/superpowers/worktrees/nuvin-space-public/hook-system-plan
pnpm test -- packages/nuvin-core/src/tests/hooks/types.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/nuvin-core/src/hooks/types.ts packages/nuvin-core/src/tests/hooks/types.test.ts
git commit -m "feat: add hook types and interfaces"
```

---

## Task 2: Create hook registry for matching and storage

**Files:**
- Create: `packages/nuvin-core/src/hooks/hook-registry.ts`
- Test: `packages/nuvin-core/src/tests/hooks/hook-registry.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { HookRegistry } from '../hooks/hook-registry.js';
import { HookEventTypes, HooksConfig } from '../hooks/types.js';

describe('HookRegistry', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
  });

  it('should register hooks from a source', () => {
    const config: HooksConfig = {
      pre_tool_use: {
        hooks: [
          { matcher: 'Bash', command: { command: './check.sh' } },
        ],
      },
    };
    registry.register('test-agent', config);
    expect(registry.getHooksForEvent(HookEventTypes.PreToolUse)).toHaveLength(1);
  });

  it('should match hooks by tool name pattern', () => {
    const config: HooksConfig = {
      pre_tool_use: {
        hooks: [
          { matcher: 'Write|Edit', command: { command: './lint.sh' } },
          { matcher: 'Bash', command: { command: './check.sh' } },
        ],
      },
    };
    registry.register('test', config);

    const matching = registry.getMatchingHooks(HookEventTypes.PreToolUse, 'Write');
    expect(matching).toHaveLength(1);
    expect(matching[0].matcher).toBe('Write|Edit');
  });

  it('should match all hooks when no matcher specified', () => {
    const config: HooksConfig = {
      post_tool_use: {
        hooks: [
          { command: { command: './audit.sh' } },  // No matcher
        ],
      },
    };
    registry.register('test', config);

    const matching = registry.getMatchingHooks(HookEventTypes.PostToolUse, 'AnyTool');
    expect(matching).toHaveLength(1);
  });

  it('should return empty array for no matching hooks', () => {
    const config: HooksConfig = {
      pre_tool_use: {
        hooks: [
          { matcher: 'Read', command: { command: './check.sh' } },
        ],
      },
    };
    registry.register('test', config);

    const matching = registry.getMatchingHooks(HookEventTypes.PreToolUse, 'Bash');
    expect(matching).toHaveLength(0);
  });

  it('should unregister hooks by source', () => {
    const config: HooksConfig = {
      pre_tool_use: { hooks: [{ command: { command: './check.sh' } }] },
    };
    registry.register('test', config);
    expect(registry.getHooksForEvent(HookEventTypes.PreToolUse)).toHaveLength(1);

    registry.unregister('test');
    expect(registry.getHooksForEvent(HookEventTypes.PreToolUse)).toHaveLength(0);
  });

  it('should merge hooks from multiple sources', () => {
    registry.register('source1', {
      pre_tool_use: { hooks: [{ matcher: 'Bash', command: { command: './check1.sh' } }] },
    });
    registry.register('source2', {
      pre_tool_use: { hooks: [{ matcher: 'Write', command: { command: './check2.sh' } }] },
    });

    const all = registry.getHooksForEvent(HookEventTypes.PreToolUse);
    expect(all).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/marsch/.config/superpowers/worktrees/nuvin-space-public/hook-system-plan
pnpm test -- packages/nuvin-core/src/tests/hooks/hook-registry.test.ts
```

Expected: FAIL with "HookRegistry not found"

**Step 3: Write minimal implementation**

```typescript
// packages/nuvin-core/src/hooks/hook-registry.ts

import type { HookEventType, HookDefinition, HooksConfig } from './types.js';
import { HookEventTypes } from './types.js';

export class HookRegistry {
  private configs: Map<string, HooksConfig> = new Map();

  register(sourceId: string, config: HooksConfig): void {
    this.configs.set(sourceId, config);
  }

  unregister(sourceId: string): void {
    this.configs.delete(sourceId);
  }

  getHooksForEvent(event: HookEventType): HookDefinition[] {
    const allHooks: HookDefinition[] = [];
    for (const config of this.configs.values()) {
      const eventConfig = config[event as keyof HooksConfig];
      if (eventConfig?.hooks) {
        allHooks.push(...eventConfig.hooks);
      }
    }
    return allHooks;
  }

  getMatchingHooks(event: HookEventType, toolName: string): HookDefinition[] {
    const hooks = this.getHooksForEvent(event);
    return hooks.filter(hook => {
      if (!hook.matcher) return true;
      try {
        const regex = new RegExp(hook.matcher);
        return regex.test(toolName);
      } catch {
        return false;
      }
    });
  }

  hasHooks(event: HookEventType, matcher?: string): boolean {
    if (matcher) {
      return this.getMatchingHooks(event, matcher).length > 0;
    }
    return this.getHooksForEvent(event).length > 0;
  }

  clear(): void {
    this.configs.clear();
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd /Users/marsch/.config/superpowers/worktrees/nuvin-space-public/hook-system-plan
pnpm test -- packages/nuvin-core/src/tests/hooks/hook-registry.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/nuvin-core/src/hooks/hook-registry.ts packages/nuvin-core/src/tests/hooks/hook-registry.test.ts
git commit -m "feat: add hook registry for matching and storage"
```

---

## Task 3: Create command hook executor

**Files:**
- Create: `packages/nuvin-core/src/hooks/command-hook-executor.ts`
- Test: `packages/nuvin-core/src/tests/hooks/command-hook-executor.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandHookExecutor } from '../hooks/command-hook-executor.js';
import { HookContext, HookEventTypes } from '../hooks/types.js';

describe('CommandHookExecutor', () => {
  let executor: CommandHookExecutor;
  let mockExec: any;

  beforeEach(() => {
    executor = new CommandHookExecutor();
  });

  it('should execute a command and return result', async () => {
    const context: HookContext = {
      sessionId: 's1',
      conversationId: 'c1',
      messageId: 'm1',
      hookEvent: HookEventTypes.PreToolUse,
      cwd: '/test',
      toolName: 'Bash',
      toolInput: { command: 'echo hello' },
    };

    const result = await executor.execute('echo hello', context, 5);
    expect(result.exitCode).toBe(0);
    expect(result.rawOutput?.trim()).toBe('hello');
  });

  it('should handle command timeout', async () => {
    const context: HookContext = {
      sessionId: 's1',
      conversationId: 'c1',
      messageId: 'm1',
      hookEvent: HookEventTypes.PreToolUse,
      cwd: '/test',
    };

    const result = await executor.execute('sleep 10', context, 1);
    expect(result.exitCode).toBe(-1);
    expect(result.error).toContain('timed out');
  });

  it('should parse JSON output', async () => {
    const context: HookContext = {
      sessionId: 's1',
      conversationId: 'c1',
      messageId: 'm1',
      hookEvent: HookEventTypes.PreToolUse,
      cwd: '/test',
    };

    const result = await executor.execute(
      'echo \'{"continue": true, "decision": "allow"}\'',
      context,
      5
    );
    expect(result.continue).toBe(true);
    expect(result.decision).toBe('allow');
  });

  it('should handle command failure with exit code 2', async () => {
    const context: HookContext = {
      sessionId: 's1',
      conversationId: 'c1',
      messageId: 'm1',
      hookEvent: HookEventTypes.PreToolUse,
      cwd: '/test',
    };

    const result = await executor.execute('exit 2', context, 5);
    expect(result.exitCode).toBe(2);
    expect(result.continue).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/marsch/.config/superpowers/worktrees/nuvin-space-public/hook-system-plan
pnpm test -- packages/nuvin-core/src/tests/hooks/command-hook-executor.test.ts
```

Expected: FAIL with "CommandHookExecutor not found"

**Step 3: Write minimal implementation**

```typescript
// packages/nuvin-core/src/hooks/command-hook-executor.ts

import { exec, ExecOptions } from 'child_process';
import { promisify } from 'util';
import type { HookContext, HookResult } from './types.js';

const execAsync = promisify(exec);

export class CommandHookExecutor {
  async execute(
    command: string,
    context: HookContext,
    timeoutSeconds: number = 60,
  ): Promise<HookResult> {
    const startTime = Date.now();

    const env = {
      ...process.env,
      NUVIN_SESSION_ID: context.sessionId,
      NUVIN_CONVERSATION_ID: context.conversationId,
      NUVIN_MESSAGE_ID: context.messageId,
      NUVIN_HOOK_EVENT: context.hookEvent,
      NUVIN_CWD: context.cwd,
      NUVIN_TOOL_NAME: context.toolName || '',
    };

    const options: ExecOptions = {
      cwd: context.cwd,
      env,
      timeout: timeoutSeconds * 1000,
    };

    try {
      const { stdout, stderr } = await execAsync(command, options);
      const durationMs = Date.now() - startTime;

      const trimmedStdout = stdout.trim();
      let jsonOutput: unknown;
      let rawOutput = trimmedStdout;

      try {
        jsonOutput = JSON.parse(trimmedStdout);
      } catch {
        jsonOutput = null;
      }

      return this.parseOutput(jsonOutput, rawOutput, stderr, 0, durationMs);
    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      if (error.code === 'ETIMEDOUT') {
        return {
          continue: true,
          exitCode: -1,
          error: `Hook timed out after ${timeoutSeconds}s`,
          durationMs,
        };
      }

      return {
        continue: error.code === 2 ? false : true,
        exitCode: error.code || -1,
        error: stderr || error.message,
        durationMs,
      };
    }
  }

  private parseOutput(
    json: unknown,
    rawOutput: string,
    stderr: string,
    exitCode: number,
    durationMs: number,
  ): HookResult {
    if (json && typeof json === 'object') {
      const obj = json as Record<string, unknown>;
      return {
        decision: obj.permission_decision as any,
        decisionReason: obj.permission_decision_reason as string,
        updatedInput: obj.updated_input as Record<string, unknown>,
        additionalContext: obj.additional_context as string ||
          (obj.hookSpecificOutput as Record<string, unknown>)?.additionalContext as string,
        continue: obj.continue ?? true,
        stopReason: obj.stop_reason as string,
        suppressOutput: obj.suppress_output as boolean,
        systemMessage: obj.system_message as string,
        rawOutput,
        exitCode,
        durationMs,
      };
    }

    return {
      additionalContext: rawOutput,
      continue: true,
      exitCode,
      rawOutput,
      durationMs,
    };
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd /Users/marsch/.config/superpowers/worktrees/nuvin-space-public/hook-system-plan
pnpm test -- packages/nuvin-core/src/tests/hooks/command-hook-executor.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/nuvin-core/src/hooks/command-hook-executor.ts packages/nuvin-core/src/tests/hooks/command-hook-executor.test.ts
git commit -m "feat: add command hook executor"
```

---

## Task 4: Create hooks index file and export

**Files:**
- Create: `packages/nuvin-core/src/hooks/index.ts`

**Step 1: Write the index file**

```typescript
// packages/nuvin-core/src/hooks/index.ts

export * from './types.js';
export { HookRegistry } from './hook-registry.js';
export { CommandHookExecutor } from './command-hook-executor.js';
```

**Step 2: Commit**

```bash
git add packages/nuvin-core/src/hooks/index.ts
git commit -m "feat: export hooks module"
```

---

## Task 5: Integrate hook execution into Orchestrator

**Files:**
- Modify: `packages/nuvin-core/src/orchestrator.ts` (add hook execution before tools)

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../orchestrator.js';
import { NoopEventPort } from '../events.js';
import { createMockToolPort } from './test-utils.js';

describe('Hook Integration', () => {
  it('should execute pre-tool hooks before tool execution', async () => {
    const orchestrator = new AgentOrchestrator(
      { /* config */ },
      {
        memory: createMockMemory(),
        tools: createMockToolPort(),
        events: new NoopEventPort(),
      }
    );

    // Mock hook port
    const mockHookPort = {
      executeHook: vi.fn().mockResolvedValue({ continue: true, exitCode: 0 }),
      hasHooks: vi.fn().mockReturnValue(true),
    };

    orchestrator.setHookPort(mockHookPort as any);

    // Send a message that triggers tool use
    await orchestrator.send('List files', { conversationId: 'test' });

    expect(mockHookPort.executeHook).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/marsch/.config/superpowers/worktrees/nuvin-space-public/hook-system-plan
pnpm test -- packages/nuvin-core/src/tests/orchestrator-hook.test.ts
```

Expected: FAIL with "setHookPort not defined"

**Step 3: Write minimal implementation**

Add to `AgentOrchestrator` class in `packages/nuvin-core/src/orchestrator.ts`:

```typescript
import type { HookPort, HookContext, HookResult } from './hooks/types.js';
import { HookEventTypes } from './hooks/types.js';

export class AgentOrchestrator {
  // ... existing code ...

  private hookPort?: HookPort;

  constructor(
    private cfg: AgentConfig,
    deps: {
      // ... existing deps ...
      hookPort?: HookPort;
    },
  ) {
    // ... existing code ...
    this.hookPort = deps.hookPort;
  }

  public setHookPort(newHooks: HookPort): void {
    this.hookPort = newHooks;
  }

  private async executePreToolHook(
    toolName: string,
    toolInput: Record<string, unknown>,
    toolUseId: string,
    conversationId: string,
    messageId: string,
  ): Promise<{ allowed: boolean; modifiedInput?: Record<string, unknown>; reason?: string }> {
    if (!this.hookPort) {
      return { allowed: true };
    }

    const context: HookContext = {
      sessionId: this.sessionId,
      conversationId,
      messageId,
      hookEvent: HookEventTypes.PreToolUse,
      cwd: process.cwd(),
      toolName,
      toolInput,
      toolUseId,
    };

    const result = await this.hookPort.executeHook(context);

    if (!result.continue && result.exitCode === 2) {
      return { allowed: false, reason: result.error };
    }

    return {
      allowed: result.decision !== 'deny',
      modifiedInput: result.updatedInput,
      reason: result.decisionReason,
    };
  }

  // ... rest of class ...
}
```

**Step 4: Run test to verify it passes**

```bash
cd /Users/marsch/.config/superpowers/worktrees/nuvin-space-public/hook-system-plan
pnpm test -- packages/nuvin-core/src/tests/orchestrator-hook.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/nuvin-core/src/orchestrator.ts
git commit -m "feat: integrate hook execution into orchestrator"
```

---

## Task 6: Add hook configuration loading from agent frontmatter

**Files:**
- Create: `packages/nuvin-core/src/hooks/config-loader.ts`
- Modify: `packages/nuvin-core/src/agent-file-persistence.ts` (validate hooks)

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { loadHooksFromFrontmatter } from '../hooks/config-loader.js';

describe('Hook Config Loader', () => {
  it('should load hooks from agent frontmatter', () => {
    const frontmatter = {
      hooks: {
        pre_tool_use: [
          { matcher: 'Bash', command: { command: './check.sh', timeout: 30 } },
        ],
        post_tool_use: [
          { matcher: 'Write|Edit', command: { command: './lint.sh' } },
        ],
      },
    };

    const config = loadHooksFromFrontmatter(frontmatter as any);
    expect(config.pre_tool_use?.hooks).toHaveLength(1);
    expect(config.post_tool_use?.hooks).toHaveLength(1);
  });

  it('should return empty config for no hooks', () => {
    const config = loadHooksFromFrontmatter({});
    expect(config).toEqual({});
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/marsch/.config/superpowers/worktrees/nuvin-space-public/hook-system-plan
pnpm test -- packages/nuvin-core/src/tests/hooks/config-loader.test.ts
```

Expected: FAIL with "loadHooksFromFrontmatter not found"

**Step 3: Write minimal implementation**

```typescript
// packages/nuvin-core/src/hooks/config-loader.ts

import type { HooksConfig, HookDefinition } from './types.js';

interface FrontmatterHooks {
  pre_tool_use?: HookDefinition[];
  post_tool_use?: HookDefinition[];
  pre_user_prompt?: HookDefinition[];
  pre_stop?: HookDefinition[];
  session_start?: HookDefinition[];
  session_end?: HookDefinition[];
  pre_sub_agent?: HookDefinition[];
  post_sub_agent?: HookDefinition[];
  permission_request?: HookDefinition[];
}

interface AgentFrontmatter {
  hooks?: FrontmatterHooks;
}

export function loadHooksFromFrontmatter(frontmatter: AgentFrontmatter): HooksConfig {
  const config: HooksConfig = {};

  if (frontmatter.hooks) {
    for (const [key, hooks] of Object.entries(frontmatter.hooks)) {
      const eventType = key.replace(/_([a-z])/g, (_, letter) => `-${letter}`);
      (config as any)[eventType] = { hooks };
    }
  }

  return config;
}
```

**Step 4: Run test to verify it passes**

```bash
cd /Users/marsch/.config/superpowers/worktrees/nuvin-space-public/hook-system-plan
pnpm test -- packages/nuvin-core/src/tests/hooks/config-loader.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/nuvin-core/src/hooks/config-loader.ts packages/nuvin-core/src/tests/hooks/config-loader.test.ts
git commit -m "feat: add hook configuration loader"
```

---

## Task 7: Create composite hook port for multiple sources

**Files:**
- Create: `packages/nuvin-core/src/hooks/composite-hook-port.ts`
- Test: `packages/nuvin-core/src/tests/hooks/composite-hook-port.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompositeHookPort } from '../hooks/composite-hook-port.js';
import { HookContext, HookEventTypes } from '../hooks/types.js';

describe('CompositeHookPort', () => {
  it('should execute hooks from multiple sources', async () => {
    const mockHook1 = {
      executeHook: vi.fn().mockResolvedValue({ continue: true, exitCode: 0 }),
      hasHooks: vi.fn().mockReturnValue(true),
    };
    const mockHook2 = {
      executeHook: vi.fn().mockResolvedValue({ continue: true, exitCode: 0 }),
      hasHooks: vi.fn().mockReturnValue(false),
    };

    const composite = new CompositeHookPort([mockHook1 as any, mockHook2 as any]);

    const context: HookContext = {
      sessionId: 's1',
      conversationId: 'c1',
      messageId: 'm1',
      hookEvent: HookEventTypes.PreToolUse,
      cwd: '/test',
    };

    await composite.executeHook(context);

    expect(mockHook1.executeHook).toHaveBeenCalled();
    expect(mockHook2.executeHook).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/marsch/.config/superpowers/worktrees/nuvin-space-public/hook-system-plan
pnpm test -- packages/nuvin-core/src/tests/hooks/composite-hook-port.test.ts
```

Expected: FAIL with "CompositeHookPort not found"

**Step 3: Write minimal implementation**

```typescript
// packages/nuvin-core/src/hooks/composite-hook-port.ts

import type { HookPort, HookContext, HookResult } from './types.js';

export class CompositeHookPort implements HookPort {
  constructor(private ports: HookPort[]) {}

  async executeHook(context: HookContext): Promise<HookResult> {
    // Execute first port that has hooks for this event
    for (const port of this.ports) {
      if (port.hasHooks(context.hookEvent)) {
        return port.executeHook(context);
      }
    }

    return { continue: true, exitCode: 0 };
  }

  hasHooks(event: string, matcher?: string): boolean {
    return this.ports.some(port => port.hasHooks(event, matcher));
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd /Users/marsch/.config/superpowers/worktrees/nuvin-space-public/hook-system-plan
pnpm test -- packages/nuvin-core/src/tests/hooks/composite-hook-port.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/nuvin-core/src/hooks/composite-hook-port.ts packages/nuvin-core/src/tests/hooks/composite-hook-port.test.ts
git commit -m "feat: add composite hook port for multiple sources"
```

---

## Task 8: Integration test with full hook flow

**Files:**
- Create: `packages/nuvin-core/src/tests/hooks/integration.test.ts`

**Step 1: Write the integration test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../orchestrator.js';
import { NoopEventPort } from '../events.js';
import { HookRegistry } from '../hooks/hook-registry.js';
import { CommandHookExecutor } from '../hooks/command-hook-executor.js';
import { createMockToolPort, createMockMemory } from './test-utils.js';

describe('Hook Integration Test', () => {
  it('should run command hook before Bash tool execution', async () => {
    const registry = new HookRegistry();
    registry.register('test-agent', {
      pre_tool_use: {
        hooks: [
          { matcher: 'Bash', command: { command: 'echo "pre-hook"' } },
        ],
      },
    });

    const executor = new CommandHookExecutor();
    const mockHookPort = {
      executeHook: async (ctx: any) => executor.execute('./test-hook.sh', ctx, 5),
      hasHooks: (event: string, matcher?: string) => registry.hasHooks(event, matcher),
    };

    const orchestrator = new AgentOrchestrator(
      {
        id: 'test',
        systemPrompt: 'You are a test agent',
        temperature: 0.7,
        topP: 0.9,
        model: 'test-model',
      },
      {
        memory: createMockMemory(),
        tools: createMockToolPort(),
        events: new NoopEventPort(),
        hookPort: mockHookPort as any,
      }
    );

    // Create a test hook script
    // ... setup ...

    const response = await orchestrator.send('Run ls', { conversationId: 'test' });
    expect(response.content).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/marsch/.config/superpowers/worktrees/nuvin-space-public/hook-system-plan
pnpm test -- packages/nuvin-core/src/tests/hooks/integration.test.ts
```

Expected: FAIL (incomplete setup)

**Step 3: Implement and fix test**

```bash
# Create test hook script
echo '#!/bin/bash
echo "hook-executed" > /tmp/hook-test.log
echo "{\"continue\": true}"' > /tmp/test-hook.sh
chmod +x /tmp/test-hook.sh
```

**Step 4: Run test to verify it passes**

```bash
cd /Users/marsch/.config/superpowers/worktrees/nuvin-space-public/hook-system-plan
pnpm test -- packages/nuvin-core/src/tests/hooks/integration.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/nuvin-core/src/tests/hooks/integration.test.ts
git commit -m "test: add hook integration test"
```

---

## Summary

**Total Tasks:** 8

**Testing Approach:**
- Unit tests for each component (types, registry, executor)
- Integration tests for orchestrator hook integration
- All tests use vitest with TDD approach

**Key Files Created:**
- `packages/nuvin-core/src/hooks/types.ts` - Type definitions
- `packages/nuvin-core/src/hooks/hook-registry.ts` - Hook matching/registration
- `packages/nuvin-core/src/hooks/command-hook-executor.ts` - Command execution
- `packages/nuvin-core/src/hooks/composite-hook-port.ts` - Multi-source hooks
- `packages/nuvin-core/src/hooks/config-loader.ts` - Frontmatter loading
- `packages/nuvin-core/src/hooks/index.ts` - Module exports

**Key Files Modified:**
- `packages/nuvin-core/src/orchestrator.ts` - Hook integration points

---

**Plan complete and saved to `docs/plans/2026-01-26-hook-system.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
