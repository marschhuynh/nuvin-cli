# Nuvin Hook System Implementation Plan

## Executive Summary

Implement a hook system for Nuvin that allows users to intercept and control agent behavior at key lifecycle points. The design is inspired by Claude Code's hook system but leverages Nuvin's existing event infrastructure for seamless integration.

---

## 1. Background Research

### 1.1 Claude Code Hook System Overview

Claude Code provides hooks at specific lifecycle points that can execute bash commands or prompt-based LLM evaluation:

| Hook Event | Fires | Purpose |
|------------|-------|---------|
| `SessionStart` | Session begins/resumes | Load context, set env vars |
| `UserPromptSubmit` | User submits prompt | Validate/augment prompts |
| `PreToolUse` | Before tool execution | Approve/deny/modify tools |
| `PermissionRequest` | Permission dialog appears | Auto-approve/deny permissions |
| `PostToolUse` | After tool completes | Validation, linting |
| `Stop` | Agent finishes responding | Completion validation |
| `SubagentStop` | Subagent finishes | Subagent result validation |
| `PreCompact` | Before context compaction | Custom compaction logic |
| `SessionEnd` | Session terminates | Cleanup, logging |

**Key Features:**
- **Matchers**: Target specific tools via regex patterns (e.g., `"Write|Edit"`, `"mcp__.*__.*"`)
- **Command hooks**: Execute bash scripts with JSON input via stdin
- **Prompt hooks**: LLM-based evaluation for context-aware decisions (Stop/SubagentStop)
- **Decision control**: JSON output for allow/deny/block/modify/input injection
- **Scope levels**: User settings, project settings, agent frontmatter, plugins

### 1.2 Nuvin's Existing Event System

Nuvin already has a mature event system (`src/events.ts`):

```typescript
interface EventPort {
  emit(event: AgentEvent): void | Promise<void>;
}

class ConsoleEventPort implements EventPort
class PersistingConsoleEventPort implements EventPort
class CallbackEventPort implements EventPort
```

**Existing Event Types** (`src/ports.ts`):
- `MessageStarted` - User message received
- `ToolCalls` - LLM requests tool execution
- `ToolApprovalRequired` - Tool needs user approval
- `ToolApprovalResponse` - User approved/denied
- `ToolResult` - Tool execution completed
- `AssistantChunk/AssistantMessage` - LLM response stream
- `Done` - Turn complete
- `Error` - Error occurred
- `SubAgent*` events - Subagent lifecycle

**Existing Hook Support in Agents:**
Agents already support a `hooks` field in frontmatter (see `agent-file-persistence.ts:92`):
```typescript
hooks: typeof fm.hooks === 'object' && fm.hooks !== null ? (fm.hooks as Record<string, unknown>) : undefined
```

---

## 2. Architecture Decision: Extend Events vs. Separate Hook System

### Recommendation: Extend the Event System

The existing `EventPort` can be extended with hook capabilities rather than creating a parallel system:

```
EventPort (existing) ──────────────────────────────────────►
     │                                                              │
     │ emit()                                                       │
     ▼                                                              │
HookPort (new) ───────────────────┐                               │
     │                            │                               │
     │ emit(event)                │ emitHook(hookEvent)           │
     │ returns Decision│None      │ returns Promise<HookResult>   │
     ▼                            ▼                               │
Event Implementations      Hook Implementations                   │
(Console, Persisting)       (CommandHook, PromptHook)             │
```

**Benefits:**
- ✅ Leverages existing infrastructure (event emission points already exist)
- ✅ Single integration point for consumers
- ✅ Consistent JSON-based input/output
- ✅ Hooks can be treated as "events with control flow"

---

## 3. Hook System Design

### 3.1 Hook Event Types

Map Nuvin events to hook equivalents:

| Nuvin Event | Hook Equivalent | Purpose |
|-------------|-----------------|---------|
| `MessageStarted` | `PreUserPrompt` | Validate/augment user input |
| `ToolCalls` | `PreToolUse` | Approve/deny/modify tool calls |
| `ToolApprovalRequired` | `PermissionRequest` | Auto-handle approvals |
| `ToolResult` | `PostToolUse` | Validate results, lint, format |
| (new) | `PreSubAgent` | Validate subagent launch |
| `SubAgentCompleted` | `PostSubAgent` | Validate subagent results |
| `Done` | `PreStop` | Completion validation |
| (new) | `SessionStart` | Session initialization |
| (new) | `SessionEnd` | Session cleanup |

### 3.2 Hook Configuration Schema

```typescript
type HookMatcher = string; // Regex pattern for tool names

interface HookDefinition {
  // Matcher is optional for non-tool hooks
  matcher?: HookMatcher;
  
  // Command-based hook
  command?: {
    command: string;
    timeout?: number; // seconds, default 60
  };
  
  // Prompt-based hook (LLM evaluation)
  prompt?: {
    prompt: string; // Can use $ARGUMENTS placeholder
    timeout?: number; // seconds, default 30
  };
  
  // Options
  enabled?: boolean; // default true
  once?: boolean; // Run once then remove (skills only)
}

interface HookEventConfig {
  // Array allows multiple hooks per event
  hooks: HookDefinition[];
}

// Top-level hooks config
interface HooksConfig {
  preUserPrompt?: HookEventConfig;
  preToolUse?: HookEventConfig;
  permissionRequest?: HookEventConfig;
  postToolUse?: HookEventConfig;
  preSubAgent?: HookEventConfig;
  postSubAgent?: HookEventConfig;
  preStop?: HookEventConfig;
  sessionStart?: HookEventConfig;
  sessionEnd?: HookEventConfig;
}
```

### 3.3 Hook Execution Input/Output

**Input (JSON via stdin for command hooks):**

```typescript
interface HookInput {
  session_id: string;
  conversation_id: string;
  message_id: string;
  hook_event: string; // "PreToolUse", etc.
  cwd: string;
  
  // Event-specific
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
  tool_response?: Record<string, unknown>;
  
  // User prompt for PreUserPrompt
  prompt?: string;
  
  // Subagent for Pre/PostSubAgent
  agent_id?: string;
  agent_type?: string;
}
```

**Output (JSON via stdout):**

```typescript
interface HookOutput {
  // Control flow
  continue: boolean; // default true
  stop_reason?: string; // Shown when continue=false
  
  // Decision control (PreToolUse, PermissionRequest)
  permission_decision?: 'allow' | 'deny' | 'ask';
  permission_decision_reason?: string;
  
  // Input modification
  updated_input?: Record<string, unknown>;
  
  // Context injection
  additional_context?: string;
  
  // Output control
  suppress_output?: boolean; // Hide from transcript
  system_message?: string; // Warning to user
}
```

---

## 4. Implementation Roadmap

### Phase 1: Core Infrastructure

#### 4.1 Create Hook Types and Interfaces

**File:** `packages/nuvin-core/src/hooks/types.ts`

```typescript
// Hook event types
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

// Decision types
export type HookDecision = 'allow' | 'deny' | 'ask' | 'block';

// Hook execution result
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
}

// Hook input (what hooks receive)
export interface HookContext {
  sessionId: string;
  conversationId: string;
  messageId: string;
  hookEvent: HookEventType;
  cwd: string;
  
  // Tool-specific
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolUseId?: string;
  toolResponse?: Record<string, unknown>;
  
  // Prompt-specific
  prompt?: string;
  
  // Subagent-specific
  agentId?: string;
  agentType?: string;
  
  // Permission-specific
  permissionType?: string;
}

// Hook port interface
export interface HookPort {
  // Execute a hook and get result
  executeHook(context: HookContext): Promise<HookResult>;
  
  // Check if hooks are configured for an event
  hasHooks(event: HookEventType, matcher?: string): boolean;
}
```

#### 4.2 Create Hook Registry

**File:** `packages/nuvin-core/src/hooks/hook-registry.ts`

```typescript
import type { HooksConfig, HookDefinition } from './types.js';

export class HookRegistry {
  private configs: Map<string, HooksConfig> = new Map();
  
  // Register hooks from a source (user, project, agent, skill)
  register(sourceId: string, config: HooksConfig): void {
    this.configs.set(sourceId, config);
  }
  
  // Unregister hooks from a source
  unregister(sourceId: string): void {
    this.configs.delete(sourceId);
  }
  
  // Get all hooks for an event type
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
  
  // Get hooks matching a tool name
  getMatchingHooks(event: HookEventType, toolName: string): HookDefinition[] {
    const hooks = this.getHooksForEvent(event);
    return hooks.filter(hook => {
      if (!hook.matcher) return true; // No matcher = match all
      try {
        const regex = new RegExp(hook.matcher);
        return regex.test(toolName);
      } catch {
        return false;
      }
    });
  }
  
  // Clear all hooks
  clear(): void {
    this.configs.clear();
  }
}
```

### Phase 2: Hook Executors

#### 4.3 Command Hook Executor

**File:** `packages/nuvin-core/src/hooks/command-hook-executor.ts`

```typescript
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
      
      // Try to parse JSON output
      const trimmedStdout = stdout.trim();
      let jsonOutput: unknown;
      let rawOutput = trimmedStdout;
      
      try {
        jsonOutput = JSON.parse(trimmedStdout);
      } catch {
        jsonOutput = null;
      }
      
      return this.parseOutput(jsonOutput, rawOutput, stderr, 0, durationMs);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      if (error.code === 'ETIMEDOUT') {
        return {
          continue: true,
          exitCode: -1,
          error: `Hook timed out after ${timeoutSeconds}s`,
        };
      }
      
      return {
        continue: error.code === 2 ? false : true,
        exitCode: error.code || -1,
        error: stderr || String(error),
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
        decision: obj.permission_decision as HookDecision,
        decisionReason: obj.permission_decision_reason as string,
        updatedInput: obj.updated_input as Record<string, unknown>,
        additionalContext: obj.additional_context as string ||
          (obj.hookSpecificOutput as Record<string, unknown>)?.additionalContext as string,
        continue: obj.continue ?? true,
        stopReason: obj.stop_reason as string,
        suppressOutput: obj.suppress_output as boolean,
        systemMessage: obj.system_message as string || (obj.hookSpecificOutput as Record<string, unknown>)?.systemMessage as string,
        rawOutput,
        exitCode,
        durationMs,
      };
    }
    
    // Non-JSON output for UserPromptSubmit/SessionStart: stdout becomes context
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

#### 4.4 Prompt Hook Executor (LLM-based)

**File:** `packages/nuvin-core/src/hooks/prompt-hook-executor.ts`

```typescript
import type { LLMPort } from '../ports.js';
import type { HookContext, HookResult } from './types.js';

export class PromptHookExecutor {
  constructor(private llm: LLMPort) {}
  
  async execute(
    promptTemplate: string,
    context: HookContext,
    timeoutMs: number = 30000,
  ): Promise<HookResult> {
    // Replace $ARGUMENTS with context JSON
    const prompt = promptTemplate.includes('$ARGUMENTS')
      ? promptTemplate.replace('$ARGUMENTS', JSON.stringify(context, null, 2))
      : `${promptTemplate}\n\nContext: ${JSON.stringify(context, null, 2)}`;
    
    try {
      const result = await this.llm.generateCompletion(
        {
          messages: [{ role: 'user', content: prompt }],
          model: 'claude-haiku-20250514', // Fast model for hooks
          temperature: 0,
          maxTokens: 500,
        },
        { signal: AbortSignal.timeout(timeoutMs) },
      );
      
      const trimmedContent = result.content.trim();
      
      // Try to parse JSON response
      let jsonOutput: { ok: boolean; reason?: string };
      try {
        jsonOutput = JSON.parse(trimmedContent);
      } catch {
        // Try to extract JSON from markdown code block
        const codeBlockMatch = trimmedContent.match(/```json\n([\s\S]*?)\n```/);
        if (codeBlockMatch) {
          try {
            jsonOutput = JSON.parse(codeBlockMatch[1]);
          } catch {
            return {
              continue: true,
              exitCode: 0,
              rawOutput: trimmedContent,
            };
          }
        } else {
          return {
            continue: true,
            exitCode: 0,
            rawOutput: trimmedContent,
          };
        }
      }
      
      return {
        decision: jsonOutput.ok ? 'allow' : 'block',
        decisionReason: jsonOutput.reason,
        continue: jsonOutput.ok,
        stopReason: jsonOutput.reason,
        rawOutput: trimmedContent,
        exitCode: 0,
      };
    } catch (error) {
      return {
        continue: true,
        exitCode: -1,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
```

### Phase 3: Integration with Orchestrator

#### 4.5 Hook Execution in Orchestrator

**Modifications to `packages/nuvin-core/src/orchestrator.ts`:**

```typescript
// Add to AgentOrchestrator class
private hookPort?: HookPort;

public setHookPort(newHooks: HookPort): void {
  this.hookPort = newHooks;
}

// Before executing tools in processToolApproval():
private async executePreToolHooks(
  toolCall: ToolCall,
  conversationId: string,
  messageId: string,
): Promise<{ decision: HookDecision; updatedToolCall?: ToolCall; context?: string }> {
  if (!this.hookPort) return { decision: 'allow' };
  
  const context: HookContext = {
    sessionId: this.sessionId, // Need to track this
    conversationId,
    messageId,
    hookEvent: HookEventTypes.PreToolUse,
    cwd: process.cwd(),
    toolName: toolCall.function.name,
    toolInput: JSON.parse(toolCall.function.arguments),
    toolUseId: toolCall.id,
  };
  
  const result = await this.hookPort.executeHook(context);
  
  if (result.additionalContext) {
    // Inject context into conversation
    await this.injectContext(result.additionalContext);
  }
  
  if (result.decision === 'deny') {
    return { decision: 'deny', context: result.decisionReason };
  }
  
  if (result.decision === 'ask') {
    return { decision: 'ask', context: result.decisionReason };
  }
  
  if (result.decision === 'allow' && result.updatedInput) {
    // Apply updated input
    const updatedToolCall = {
      ...toolCall,
      function: {
        ...toolCall.function,
        arguments: JSON.stringify(result.updatedInput),
      },
    };
    return { decision: 'allow', updatedToolCall };
  }
  
  return { decision: 'allow' };
}
```

### Phase 4: Configuration Loading

#### 4.6 Hook Configuration from Frontmatter

**File:** `packages/nuvin-core/src/hooks/config-loader.ts`

```typescript
import fs from 'fs';
import path from 'path';

interface FrontmatterHooks {
  pre_user_prompt?: HookDefinition[];
  pre_tool_use?: HookDefinition[];
  // ... other events
}

interface AgentFrontmatter {
  hooks?: FrontmatterHooks;
}

export function loadHooksFromFrontmatter(frontmatter: AgentFrontmatter): HooksConfig {
  const config: Hook  
  if (frontmatter.hooks) {
    for (const [keysConfig = {};
, hooks] of Object.entries(frontmatter.hooks)) {
      const eventType = key.replace('_', '-'); // pre_tool_use -> pre-tool-use
      config[eventType as keyof HooksConfig] = {
        hooks: hooks.map(h => ({
          matcher: h.matcher,
          command: h.command ? { command: h.command.command, timeout: h.command.timeout } : undefined,
          prompt: h.prompt ? { prompt: h.prompt.prompt, timeout: h.prompt.timeout } : undefined,
          enabled: h.enabled,
          once: h.once,
        })),
      };
    }
  }
  
  return config;
}

// Example agent with hooks:
/*
---
name: secure-coder
description: Code with security checks
hooks:
  pre_tool_use:
    - matcher: "Bash"
      command:
        command: "./scripts/security-check.sh"
        timeout: 30
  post_tool_use:
    - matcher: "Write|Edit"
      command:
        command: "./scripts/lint-changed-files.sh"
---
*/
```

### Phase 5: CLI Integration

#### 4.7 Hook Settings File Support

**File:** `packages/nuvin-cli/source/config/hooks-settings.ts`

```typescript
interface HooksSettings {
  // User-level hooks (~/.nuvin/settings.json)
  hooks: HooksConfig;
  
  // Project-level hooks (.nuvin/hooks.json)
  projectHooks?: HooksConfig;
}

export function loadHooksSettings(): HooksConfig {
  const userSettingsPath = path.join(os.homedir(), '.nuvin', 'settings.json');
  const projectSettingsPath = path.join(process.cwd(), '.nuvin', 'hooks.json');
  
  const merged: HooksConfig = {};
  
  // Load user settings
  if (fs.existsSync(userSettingsPath)) {
    try {
      const userSettings = JSON.parse(fs.readFileSync(userSettingsPath, 'utf-8'));
      Object.assign(merged, userSettings.hooks);
    } catch {}
  }
  
  // Load project settings (override user settings)
  if (fs.existsSync(projectSettingsPath)) {
    try {
      const projectSettings = JSON.parse(fs.readFileSync(projectSettingsPath, 'utf-8'));
      Object.assign(merged, projectSettings);
    } catch {}
  }
  
  return merged;
}
```

---

## 5. Event-to-Hook Mapping Reference

| Orchestrator Event | Emit Location | Hook Event | Hook Executor |
|-------------------|---------------|------------|---------------|
| MessageStarted | `send()` start | PreUserPrompt | Command/Prompt |
| ToolCalls | Before `processToolApproval` | PreToolUse | Command/Prompt |
| ToolApprovalRequired | During approval flow | PermissionRequest | Command |
| ToolResult | After each tool | PostToolUse | Command |
| (new) SubAgent start | Before subagent launch | PreSubAgent | Command/Prompt |
| SubAgentCompleted | After subagent | PostSubAgent | Command/Prompt |
| Done | At end of turn | PreStop | Command/Prompt |
| (new) Session start | Orchestrator init | SessionStart | Command |
| (new) Session end | Before shutdown | SessionEnd | Command |

---

## 6. Security Considerations

1. **Hook sandboxing**: Consider running hooks in isolated processes
2. **Input validation**: Validate all hook inputs before execution
3. **Timeout enforcement**: Strict timeout limits prevent hanging
4. **Path sanitization**: Use absolute paths, prevent path traversal
5. **Sensitive data**: Don't pass secrets to hooks unless explicitly configured
6. **Hook deduplication**: Prevent duplicate hook execution
7. **Configuration safety**: Warn on hooks modified during session

---

## 7. Migration Path for Existing Agent Hooks

The `hooks` field already exists in agent frontmatter. We need to:

1. **Define the schema** for the existing `hooks` field
2. **Validate existing hooks** and convert to new format
3. **Provide migration warnings** for deprecated hook formats
4. **Support gradual migration** with backward compatibility

```typescript
// Existing format (to be supported):
hooks: {
  "before_tool": [ /* ... */ ],
  "after_tool": [ /* ... */ ],
}

// New format:
hooks: {
  pre_tool_use: [ /* ... */ ],
  post_tool_use: [ /* ... */ ],
}
```

---

## 8. Testing Strategy

1. **Unit tests** for hook registry matching logic
2. **Integration tests** for command hook execution with mock commands
3. **Integration tests** for prompt hooks with mocked LLM
4. **E2E tests** with real hook scripts
5. **Performance tests** for hook overhead measurement
6. **Security tests** for timeout and input validation

---

## 9. Future Enhancements

1. **Hook plugins**: Third-party hook providers
2. **Hook chaining**: Hooks that can modify subsequent hooks
3. **Hook metrics**: Track hook execution times and success rates
4. **Conditional hooks**: Hooks that run based on conditions
5. **Hook debugging**: UI for testing and debugging hooks
6. **Hook templates**: Reusable hook configurations

---

## 10. File Structure

```
packages/nuvin-core/src/hooks/
├── index.ts                    # Exports
├── types.ts                    # Hook types and interfaces
├── hook-registry.ts            # Hook registration and matching
├── command-hook-executor.ts    # Execute bash command hooks
├── prompt-hook-executor.ts     # Execute LLM-based hooks
├── hook-port.ts                # HookPort interface
├── composite-hook-port.ts      # Combine multiple hook sources
└── config-loader.ts            # Load hooks from config/frontmatter
```

---

## 11. Implementation Tasks

### Phase 1 (Foundation)
- [ ] Define `hooks/types.ts` with all type definitions
- [ ] Implement `hooks/hook-registry.ts`
- [ ] Implement `hooks/command-hook-executor.ts`
- [ ] Add tests for registry matching

### Phase 2 (Execution)
- [ ] Implement `hooks/prompt-hook-executor.ts`
- [ ] Implement `hooks/composite-hook-port.ts`
- [ ] Add timeout and error handling

### Phase 3 (Integration)
- [ ] Modify `orchestrator.ts` to call hooks at key points
- [ ] Add `setHookPort()` to Orchestrator
- [ ] Integrate with existing tool approval flow

### Phase 4 (Configuration)
- [ ] Implement `hooks/config-loader.ts`
- [ ] Support hooks in agent frontmatter
- [ ] Support hooks in `.nuvin/hooks.json`

### Phase 5 (CLI)
- [ ] Add hook settings file support
- [ ] Add `/hooks` CLI command for management
- [ ] Add debug mode for hook execution

---

## 12. Compatibility Notes

- **Backward compatible**: Existing `hooks` field in agents will be validated
- **Event system**: Existing `EventPort` implementations continue to work
- **Tool approval**: Hooks integrate alongside existing approval flow
- **Subagents**: Subagent hooks use the same system as main agent
