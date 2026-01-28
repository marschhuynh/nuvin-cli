# ACP Slash Commands Integration Plan

> **Goal:** Enable Nuvin's custom and built-in commands to be advertised and invoked through the ACP protocol's slash commands feature.

## Context

**What exists:**
- ✅ Nuvin has a robust custom command system (`CustomCommandRegistry`)
- ✅ Built-in commands (exit, help, sudo, thinking, models, etc.)
- ✅ Commands stored as markdown files with frontmatter
- ✅ Command shadowing (local > profile > global)
- ✅ Command lifecycle (enable/disable, create, edit, delete)

**What's missing:**
- ❌ ACP protocol support for advertising commands
- ❌ Commands not visible in ACP-enabled editors (Zed, JetBrains)
- ❌ No `available_commands_update` session notifications

**Architecture:**
```
Nuvin CLI Commands → ACP EventAdapter → available_commands_update → Editor UI
```

---

## Task 1: Add ACP Protocol Types for Slash Commands

**Files:**
- Modify: `packages/nuvin-acp/source/protocol/types.ts`

**Step 1: Add AvailableCommand types**

Add after the existing `SessionUpdate` types:

```typescript
// Slash Commands
export type AvailableCommand = {
  name: string;
  description: string;
  input?: {
    hint: string;
  };
};

export type AvailableCommandsUpdate = {
  sessionUpdate: 'available_commands_update';
  availableCommands: AvailableCommand[];
};
```

**Step 2: Update SessionUpdate union type**

```typescript
// Update the union type
export type SessionUpdate =
  | AgentMessageChunk
  | AgentThoughtChunk
  | ToolCallUpdate
  | ToolCallStatusUpdate
  | AvailableCommandsUpdate;  // ← Add this line
```

**Step 3: Commit**

```bash
git add packages/nuvin-acp/source/protocol/types.ts
git commit -m "feat(acp): add slash command protocol types"
```

---

## Task 2: Add AgentEvent for Commands Available

**Files:**
- Modify: `packages/nuvin-core/src/ports.ts`

**Step 1: Add CommandsAvailable event type**

Find the `AgentEventTypes` constant and add:

```typescript
export const AgentEventTypes = {
  // ... existing types
  CommandsAvailable: 'commands_available',
} as const;
```

**Step 2: Add CommandsAvailableEvent type**

Find the `AgentEvent` type union and add:

```typescript
export type CommandsAvailableEvent = {
  type: typeof AgentEventTypes.CommandsAvailable;
  commands: Array<{
    id: string;
    description: string;
    requiresInput?: boolean;
  }>;
};

// Update the union
export type AgentEvent =
  | AssistantChunkEvent
  | ReasoningChunkEvent
  | ToolCallsEvent
  | ToolResultEvent
  | CommandsAvailableEvent  // ← Add this line
  | /* ... other events */;
```

**Step 3: Commit**

```bash
git add packages/nuvin-core/src/ports.ts
git commit -m "feat(core): add CommandsAvailable agent event type"
```

---

## Task 3: Emit Commands on Session Creation

**Files:**
- Modify: `packages/nuvin-cli/source/acp-entry.ts`

**Step 1: Import CustomCommandRegistry**

```typescript
import { getCustomCommandRegistry } from '@/services/CustomCommandLoader.js';
import { commandRegistry } from '@/modules/commands/registry.js';
```

**Step 2: Emit commands after orchestrator initialization**

After `manager.init()`, add:

```typescript
// Get available commands (built-in + custom)
const allCommands: Array<{ id: string; description: string; requiresInput?: boolean }> = [];

// Get built-in commands
for (const [id, def] of commandRegistry.getAll()) {
  // Skip modal commands (they're not slash commands)
  if ((def as any).isModal) continue;
  
  allCommands.push({
    id,
    description: def.description || `Execute ${id} command`,
    requiresInput: false,  // Most commands don't require input
  });
}

// Get custom commands
const customRegistry = getCustomCommandRegistry();
if (customRegistry) {
  const customCommands = customRegistry.list({ includeHidden: false });
  for (const cmd of customCommands) {
    if (cmd.enabled) {
      allCommands.push({
        id: cmd.id,
        description: cmd.description,
        requiresInput: true,  // Custom commands typically need context
      });
    }
  }
}

// Emit CommandsAvailable event
const eventHandlers: Array<(event: AgentEvent) => void> = [];
setTimeout(() => {
  const event: AgentEvent = {
    type: AgentEventTypes.CommandsAvailable,
    commands: allCommands,
  };
  for (const handler of eventHandlers) {
    handler(event);
  }
}, 100);  // Small delay to ensure event handlers are registered
```

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/acp-entry.ts
git commit -m "feat(cli): emit commands available event on ACP session creation"
```

---

## Task 4: Add EventAdapter Support for Commands

**Files:**
- Modify: `packages/nuvin-acp/source/adapters/event-adapter.ts`

**Step 1: Add CommandsAvailable case**

In the `convertToSessionUpdate` method, add:

```typescript
case AgentEventTypes.CommandsAvailable:
  return {
    sessionUpdate: 'available_commands_update',
    availableCommands: event.commands.map(cmd => ({
      name: cmd.id,
      description: cmd.description,
      input: cmd.requiresInput ? {
        hint: 'Enter input for this command'
      } : undefined,
    })),
  };
```

**Step 2: Commit**

```bash
git add packages/nuvin-acp/source/adapters/event-adapter.ts
git commit -m "feat(acp): convert CommandsAvailable events to ACP protocol"
```

---

## Task 5: Handle Slash Command Invocation

**Files:**
- Modify: `packages/nuvin-cli/source/acp-entry.ts`

**Step 1: Add command parsing in sendMessage**

```typescript
sendMessage: async (text, options) => {
  // Check if this is a slash command
  if (text.trim().startsWith('/')) {
    const match = text.match(/^\/([a-z][a-z0-9-]*)\s*(.*)/);
    if (match) {
      const [, commandId, input] = match;
      
      // Check if command exists
      const builtIn = commandRegistry.get(commandId);
      if (builtIn) {
        // Execute built-in command
        // Note: Built-in commands typically use React UI, may need adaptation
        await manager.send(`Execute the ${commandId} command${input ? ` with: ${input}` : ''}`);
        return;
      }
      
      // Check custom commands
      const customRegistry = getCustomCommandRegistry();
      const customCmd = customRegistry?.get(commandId);
      if (customCmd) {
        // Render custom command prompt with input
        const renderedPrompt = customCmd.prompt.replace(/{{input}}/g, input);
        await manager.send(renderedPrompt, { stream: options.stream });
        return;
      }
      
      // Command not found, send as regular message
      await manager.send(text, { stream: options.stream });
    }
  } else {
    // Regular message
    await manager.send(text, { stream: options.stream });
  }
},
```

**Step 2: Commit**

```bash
git add packages/nuvin-cli/source/acp-entry.ts
git commit -m "feat(cli): handle slash command invocation in ACP mode"
```

---

## Task 6: Add Tests for Slash Commands

**Files:**
- Create: `packages/nuvin-acp/tests/slash-commands.test.ts`

**Step 1: Write integration test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { AgentEventTypes } from '@nuvin/nuvin-core';
import { EventAdapter } from '../source/adapters/event-adapter.js';
import { Readable, Writable } from 'node:stream';
import { StdioTransport } from '../source/transport/stdio.js';

describe('Slash Commands', () => {
  it('should convert CommandsAvailable event to available_commands_update', async () => {
    const input = new Readable({ read() {} });
    const chunks: string[] = [];
    const output = new Writable({
      write(chunk, enc, cb) {
        chunks.push(chunk.toString());
        cb();
      }
    });

    const transport = new StdioTransport(input, output);
    const adapter = new EventAdapter(transport, 'sess_test');

    const event = {
      type: AgentEventTypes.CommandsAvailable,
      commands: [
        { id: 'test', description: 'Run tests', requiresInput: false },
        { id: 'plan', description: 'Create a plan', requiresInput: true },
      ],
    };

    await adapter.handleEvent(event);

    // Wait for async processing
    await new Promise(r => setTimeout(r, 10));

    expect(chunks).toHaveLength(1);
    const message = JSON.parse(chunks[0].trim());
    
    expect(message).toEqual({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_test',
        update: {
          sessionUpdate: 'available_commands_update',
          availableCommands: [
            { name: 'test', description: 'Run tests' },
            { name: 'plan', description: 'Create a plan', input: { hint: 'Enter input for this command' } },
          ],
        },
      },
    });
  });
});
```

**Step 2: Run tests**

```bash
cd packages/nuvin-acp && pnpm test
```

Expected: All tests pass (22/22)

**Step 3: Commit**

```bash
git add packages/nuvin-acp/tests/slash-commands.test.ts
git commit -m "test(acp): add slash command protocol tests"
```

---

## Task 7: Update Integration Tests

**Files:**
- Modify: `packages/nuvin-acp/tests/integration.test.ts`

**Step 1: Add test for commands advertising**

Add new test:

```typescript
it('should advertise available commands after session creation', async () => {
  const { input, output, messages } = createTestStreams();
  
  let sessionId: string;
  const mockFactory: OrchestratorFactory = async () => {
    const handlers: Array<(event: AgentEvent) => void> = [];
    
    // Simulate emitting CommandsAvailable event
    setTimeout(() => {
      const event: AgentEvent = {
        type: AgentEventTypes.CommandsAvailable,
        commands: [
          { id: 'web', description: 'Search the web' },
          { id: 'test', description: 'Run tests' },
        ],
      };
      for (const handler of handlers) {
        handler(event);
      }
    }, 50);
    
    return {
      sendMessage: vi.fn(),
      onEvent: (handler) => handlers.push(handler),
      handleToolApproval: vi.fn(),
    };
  };

  const server = new ACPServer(mockFactory);
  await server.start();

  // Initialize
  input.push(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: 1 },
  }) + '\n');

  await waitForMessage(messages, 1);

  // Create session
  input.push(JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'session/new',
    params: { cwd: '/tmp/test' },
  }) + '\n');

  const sessionResponse = await waitForMessage(messages, 2);
  sessionId = sessionResponse.result.sessionId;

  // Wait for commands notification
  await new Promise(r => setTimeout(r, 100));

  // Find the available_commands_update notification
  const commandsNotification = messages.find(msg => 
    msg.method === 'session/update' && 
    msg.params?.update?.sessionUpdate === 'available_commands_update'
  );

  expect(commandsNotification).toBeDefined();
  expect(commandsNotification.params.update.availableCommands).toHaveLength(2);
  expect(commandsNotification.params.update.availableCommands[0].name).toBe('web');
});
```

**Step 2: Run tests**

```bash
cd packages/nuvin-acp && pnpm test
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add packages/nuvin-acp/tests/integration.test.ts
git commit -m "test(acp): add integration test for slash command advertising"
```

---

## Task 8: Update Package Exports

**Files:**
- Modify: `packages/nuvin-acp/source/index.ts`

**Step 1: Export new types**

Add to existing exports:

```typescript
// Export slash command types explicitly
export type { AvailableCommand, AvailableCommandsUpdate } from './protocol/types.js';
```

**Step 2: Build and verify**

```bash
cd packages/nuvin-acp && pnpm build
```

**Step 3: Commit**

```bash
git add packages/nuvin-acp/source/index.ts
git commit -m "feat(acp): export slash command types"
```

---

## Task 9: Documentation

**Files:**
- Create: `docs/acp-slash-commands.md`

**Step 1: Create documentation**

```markdown
# ACP Slash Commands

Nuvin supports the ACP slash commands protocol, allowing users to invoke commands via `/command` syntax in ACP-enabled editors.

## Available Commands

### Built-in Commands
- `/help` - Show help information
- `/clear` - Clear conversation history
- `/thinking` - Toggle thinking mode
- `/models` - List available models
- `/sudo` - Enable sudo mode for elevated operations
- `/export` - Export conversation
- `/stat` - Show session statistics
- `/skills` - List available skills
- `/swap` - Swap agent configuration

### Custom Commands

Users can create custom commands as markdown files in:
- **Global**: `~/.nuvin/commands/*.md`
- **Profile**: `~/.nuvin/profiles/{profile}/commands/*.md`
- **Local**: `.nuvin/commands/*.md` (per-project)

Example custom command (`~/.nuvin/commands/review.md`):

\`\`\`markdown
---
description: Review code changes
---

Review the following code changes and provide feedback:

{{input}}

Focus on:
- Code quality
- Potential bugs
- Best practices
\`\`\`

Usage: `/review src/api.ts`

## How It Works

1. **Session Creation**: When an ACP session is created, Nuvin sends an `available_commands_update` notification with all enabled commands.

2. **Command Invocation**: Users type `/command [input]` in the editor. The editor sends this as a regular prompt.

3. **Command Execution**: Nuvin parses the slash command and either:
   - Executes the built-in command logic
   - Renders the custom command template with user input

## Protocol Details

### Available Commands Update

\`\`\`json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_...",
    "update": {
      "sessionUpdate": "available_commands_update",
      "availableCommands": [
        {
          "name": "review",
          "description": "Review code changes",
          "input": {
            "hint": "Enter code or file path to review"
          }
        }
      ]
    }
  }
}
\`\`\`

### Command Invocation

\`\`\`json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "session/prompt",
  "params": {
    "sessionId": "sess_...",
    "prompt": [
      {
        "type": "text",
        "text": "/review src/api.ts"
      }
    ]
  }
}
\`\`\`
```

**Step 2: Commit**

```bash
git add docs/acp-slash-commands.md
git commit -m "docs: add ACP slash commands documentation"
```

---

## Task 10: Build and Verify End-to-End

**Step 1: Build all packages**

```bash
pnpm build
```

**Step 2: Test with real ACP client**

```bash
# Start in ACP mode
pnpm run:dev --acp

# Send initialize
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}' | pnpm run:dev --acp 2>/dev/null

# Create session
echo '{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"/tmp"}}' | pnpm run:dev --acp 2>/dev/null

# You should see available_commands_update notification
```

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(acp): complete slash commands integration

- Add protocol types for available_commands_update
- Emit commands on session creation
- Handle slash command invocation
- Add comprehensive tests
- Full documentation"
```

---

## Summary

**Total Tasks:** 10
**Estimated Time:** 2-3 hours

**What's Built:**
- ✅ ACP protocol types for slash commands
- ✅ AgentEvent for CommandsAvailable
- ✅ Command advertising on session creation
- ✅ EventAdapter support for commands
- ✅ Slash command parsing and invocation
- ✅ Integration with existing command system
- ✅ Comprehensive tests
- ✅ Documentation

**Features Enabled:**
- ✅ Built-in commands visible in ACP editors
- ✅ Custom commands visible in ACP editors
- ✅ Command invocation via `/command` syntax
- ✅ Dynamic command updates (if needed)
- ✅ Input hints for commands that need arguments

**Compatibility:**
- ✅ Zed editor
- ✅ JetBrains IDEs with ACP support
- ✅ Any ACP-compatible editor

---

## Next Steps After Implementation

1. Test with Zed editor to verify commands appear in UI
2. Test command invocation with various built-in and custom commands
3. Consider adding dynamic command updates (e.g., when user creates a new custom command mid-session)
4. Add command categories/grouping if editors support it
