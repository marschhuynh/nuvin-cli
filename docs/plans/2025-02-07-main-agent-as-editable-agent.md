# Main Agent as Editable Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the main Nuvin agent prompt to use the same agent file format as sub-agents, allowing users to override/customize it via the AgentRegistry system.

**Architecture:** 
- Built-in `nuvin` agent registered in AgentRegistry during initialization
- User can create `~/.nuvin/agents/nuvin.md` (global) or `.nuvin/agents/nuvin.md` (local) to override
- Priority: local > global > built-in
- UI shows main agent with [main] badge, auto-copies to global on edit
- Falls back to current `prompt.ts` if registry fails

**Tech Stack:** TypeScript, YAML frontmatter, AgentRegistry, React (Ink)

---

## Task 1: Create Built-in Main Agent File

**Files:**
- Create: `packages/nuvin-cli/source/agents/nuvin-agent.md`
- Reference: `packages/nuvin-cli/source/prompt.ts`
- Reference: `packages/nuvin-cli/source/agents/explore-prompt.ts` (for format)

**Step 1: Convert prompt.ts to nuvin-agent.md with frontmatter**

Create `packages/nuvin-cli/source/agents/nuvin-agent.md`:

```markdown
---
name: nuvin
description: Main autonomous software engineering agent in CLI. Direct, precise, verify-first approach. Ground truth first, context-aware, minimal changes only.
allowed_tools:
  - file_read
  - file_edit
  - file_new
  - bash_tool
  - grep_tool
  - glob_tool
  - ls_tool
  - lsp
  - web_search
  - web_fetch
  - todo_write
  - ask_user_tool
  - assign_task
  - skill
temperature: 0.7
---

<identity>
You are **Nuvin**, an autonomous software engineering agent in a CLI interface.
Mission: Help users accomplish engineering tasks efficiently — verify before acting, ask when uncertain, never over-engineer.
Style: Direct, concise, technically precise. No fluff, no preambles, no "I will now..." statements. Use Markdown. Cite code as `path/to/file:line_number`.
</identity>

[... rest of the current prompt.ts content ...]
```

**Step 2: Verify the file is valid markdown**

```bash
cat packages/nuvin-cli/source/agents/nuvin-agent.md | head -20
```

Expected: See frontmatter with `---` delimiters and the identity section.

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/agents/nuvin-agent.md
git commit -m "feat: create built-in nuvin main agent file"
```

---

## Task 2: Update AgentRegistry to Load Built-in Main Agent

**Files:**
- Modify: `packages/nuvin-core/src/agent-registry.ts:40-50`
- Reference: `packages/nuvin-cli/source/agents/index.ts` (builtinAgents array)

**Step 1: Check current builtinAgents structure**

```bash
cat packages/nuvin-cli/source/agents/index.ts
```

Expected: Array of `AgentTemplate` objects exported as `builtinAgents`.

**Step 2: Add nuvin-agent.md to builtinAgents array**

In `packages/nuvin-cli/source/agents/index.ts`, add at the beginning of the array:

```typescript
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { AgentTemplate } from '@nuvin/nuvin-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadBuiltinAgent(filename: string): AgentTemplate {
  const content = readFileSync(path.join(__dirname, filename), 'utf-8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    throw new Error(`Invalid agent file format: ${filename}`);
  }
  
  const frontmatter = parseYaml(frontmatterMatch[1]) as Record<string, unknown>;
  const instructions = frontmatterMatch[2].trim();
  
  return {
    name: typeof frontmatter.name === 'string' ? frontmatter.name : undefined,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
    instructions,
    allowed_tools: Array.isArray(frontmatter.allowed_tools) ? frontmatter.allowed_tools.filter((t): t is string => typeof t === 'string') : undefined,
    temperature: typeof frontmatter.temperature === 'number' ? frontmatter.temperature : undefined,
  };
}

export const builtinAgents: AgentTemplate[] = [
  loadBuiltinAgent('nuvin-agent.md'),
  // ... other builtin agents
];
```

**Step 3: Build and verify**

```bash
cd packages/nuvin-cli && pnpm run build
```

Expected: Build succeeds, no TypeScript errors.

**Step 4: Commit**

```bash
git add packages/nuvin-cli/source/agents/index.ts
git commit -m "feat: load nuvin main agent as built-in agent"
```

---

## Task 3: Update OrchestratorManager to Use Main Agent from Registry

**Files:**
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts:420-450`
- Reference: `packages/nuvin-cli/source/prompt.ts` (fallback)

**Step 1: Update createOrchestrator to get prompt from AgentRegistry**

In `OrchestratorManager.ts`, find where `prompt` is used (around line 434):

```typescript
// BEFORE:
systemPrompt: renderTemplate(prompt, { injectedSystem }),

// AFTER:
const mainAgentTemplate = agentRegistry.get('nuvin');
const mainPrompt = mainAgentTemplate?.instructions || prompt; // Fallback to prompt.ts
systemPrompt: renderTemplate(mainPrompt, { injectedSystem }),
```

**Step 2: Add comment explaining fallback**

```typescript
// Get main agent prompt from registry (allows user override)
// Falls back to built-in prompt.ts if registry fails to load
const mainAgentTemplate = agentRegistry.get('nuvin');
const mainPrompt = mainAgentTemplate?.instructions || prompt;
```

**Step 3: Find similar code in swapBackToMainAgent (around line 1495)**

Update it the same way:

```typescript
const mainAgentTemplate = agentRegistry.get('nuvin');
const mainPrompt = mainAgentTemplate?.instructions || prompt;
systemPrompt: renderTemplate(mainPrompt, { injectedSystem }),
```

**Step 4: Build and test**

```bash
cd packages/nuvin-cli && pnpm run build
```

Expected: Build succeeds, CLI uses nuvin agent from registry.

**Step 5: Commit**

```bash
git add packages/nuvin-cli/source/services/OrchestratorManager.ts
git commit -m "feat: load main agent prompt from registry with fallback"
```

---

## Task 4: Add [main] Badge Display in AgentList UI

**Files:**
- Modify: `packages/nuvin-cli/source/components/AgentModal/AgentList.tsx:45-120`

**Step 1: Check if agent is main agent**

In `renderAgentItem` callback (around line 45), after getting the agent:

```typescript
const agent = agents.find((a) => a.name === item.value);
if (!agent) return null;

const enabled = isAgentEnabled(agent.name);
const statusColor = showStatus ? (enabled ? theme.tokens.green : theme.tokens.red) : theme.tokens.green;
const statusIcon = showStatus ? (enabled ? '✓' : '✗') : '✓';
const accentColor = theme.colors.accent;
const isBuiltin = agent.isDefault;
const location = agent.location || (isBuiltin ? 'built-in' : 'local');
const isMainAgent = agent.name === 'nuvin'; // NEW: Check if main agent
```

**Step 2: Update badge display logic**

Replace the location badge section:

```typescript
// Before:
<Text color={locationColor} dimColor>
  [{location}]
</Text>

// After:
{isMainAgent ? (
  <Text color={theme.tokens.magenta} bold>
    [main]
  </Text>
) : (
  <Text color={locationColor} dimColor>
    [{location}]
  </Text>
)}
```

**Step 3: Build and test**

```bash
cd packages/nuvin-cli && pnpm run build
```

Expected: In /agent modal, nuvin agent shows [main] badge.

**Step 4: Commit**

```bash
git add packages/nuvin-cli/source/components/AgentModal/AgentList.tsx
git commit -m "feat: show [main] badge for nuvin agent in UI"
```

---

## Task 5: Implement Auto-Copy to Global on Edit

**Files:**
- Modify: `packages/nuvin-cli/source/modules/commands/definitions/agent.tsx:195-220`

**Step 1: Add check for main agent in handleAgentEdit**

In `handleAgentEdit` callback (around line 195):

```typescript
const handleAgentEdit = useCallback(
  async (agentName: string) => {
    try {
      const tools = context.orchestratorManager?.getOrchestrator()?.getTools?.();
      const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
      const agentRegistry = agentAwareTools?.getAgentRegistry?.();

      if (!agentRegistry) {
        setError('Agent registry not available');
        return;
      }

      const agent = agentRegistry.get(agentName);
      if (!agent) {
        void loadAgents();
        return;
      }

      // NEW: Check if editing main agent that's built-in
      if (agentName === 'nuvin' && agent.location === 'built-in') {
        // Auto-copy to global
        const globalAgent = { ...agent, location: 'global' as const };
        await agentRegistry.saveToFile(globalAgent);
        
        // Reload to pick up the new global version
        await loadAgents();
        
        // Now edit the global version
        const updatedAgent = agentRegistry.get('nuvin');
        if (!updatedAgent) {
          setError('Failed to create global override');
          return;
        }
        
        // Set info message
        setCreationError('Created global override at ~/.nuvin/agents/nuvin.md. Editing global version.');
      }

      const selectedAgentIndex = agents.findIndex((a) => a.name === agentName);

      transitionToEdit(agentName, 'agent-config', selectedAgentIndex);

      setEditingAgentName(agentName);
      setCreationMode(true);
      setCreationError(undefined); // Clear if not main agent
      setCreationPreview(agent);
      setCreationLoading(false);
    } catch (error) {
      setError(`Failed to edit agent: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  [loadAgents, agents, transitionToEdit, context.orchestratorManager?.getOrchestrator],
);
```

**Step 2: Build and test**

```bash
cd packages/nuvin-cli && pnpm run build
```

Expected: Clicking Edit on built-in 'nuvin' creates ~/.nuvin/agents/nuvin.md and opens editor.

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/modules/commands/definitions/agent.tsx
git commit -m "feat: auto-copy main agent to global on edit with info message"
```

---

## Task 6: Update Agent Creation Form to Show Help Text

**Files:**
- Modify: `packages/nuvin-cli/source/components/AgentCreation/AgentCreation.tsx:30-60`

**Step 1: Pass error/info message to form**

In `AgentCreation` component, check if `creationError` prop is passed and display it:

```typescript
{creationError && (
  <Box marginBottom={1}>
    <Text color={theme.colors.warning}>{creationError}</Text>
  </Box>
)}
```

This should already exist. Verify the message from Task 5 shows up.

**Step 2: Test manually**

1. Run CLI
2. Open /agent modal
3. Select 'nuvin' agent (should show [main] badge)
4. Press Enter to edit
5. Should see: "Created global override at ~/.nuvin/agents/nuvin.md. Editing global version."

**Step 3: Commit if changes made**

```bash
git add packages/nuvin-cli/source/components/AgentCreation/AgentCreation.tsx
git commit -m "feat: display info message in agent creation form"
```

---

## Task 7: Add Documentation

**Files:**
- Create: `docs/customizing-main-agent.md`

**Step 1: Write user documentation**

```markdown
# Customizing the Main Nuvin Agent

The main Nuvin agent prompt can be customized to suit your preferences.

## How It Works

- **Built-in**: Nuvin ships with a default prompt in `~/.nuvin/agents/nuvin.md` (shown as `[main]` in the agent list)
- **Global Override**: Create `~/.nuvin/agents/nuvin.md` to customize for all projects
- **Local Override**: Create `.nuvin/agents/nuvin.md` to customize for current project only

Priority: Local > Global > Built-in

## Editing the Main Agent

### Via UI

1. Run `nuvin` and press `Ctrl+A` to open agent manager
2. Select the `nuvin` agent (marked with `[main]`)
3. Press `Enter` to edit
4. A global override (`~/.nuvin/agents/nuvin.md`) will be created automatically
5. Edit the prompt as needed
6. Save with `Ctrl+S`
7. Restart Nuvin to apply changes

### Manually

Create or edit `~/.nuvin/agents/nuvin.md`:

```markdown
---
name: nuvin
description: Your custom description
allowed_tools:
  - file_read
  - file_edit
  # ... etc
temperature: 0.7
---

Your custom prompt goes here...
```

## Reverting to Default

Delete your override file:

```bash
rm ~/.nuvin/agents/nuvin.md  # Global
rm .nuvin/agents/nuvin.md    # Local
```

Restart Nuvin to use the built-in prompt.

## Tips

- Keep `name: nuvin` - the system looks for this name
- Include all necessary tools in `allowed_tools`
- Changes require restart to take effect
- Test your changes incrementally
```

**Step 2: Commit**

```bash
git add docs/customizing-main-agent.md
git commit -m "docs: add guide for customizing main agent prompt"
```

---

## Task 8: Verify End-to-End

**Step 1: Test built-in works**

```bash
cd packages/nuvin-cli
pnpm run build
# Run CLI, verify it starts with main agent from registry
```

**Step 2: Test global override**

```bash
# Create override
mkdir -p ~/.nuvin/agents
cat > ~/.nuvin/agents/nuvin.md << 'EOF'
---
name: nuvin
description: Custom test prompt
temperature: 0.7
---

You are a TEST version of Nuvin.
EOF

# Restart CLI, verify it uses the override
```

**Step 3: Test local override priority**

```bash
# Create local override
mkdir -p .nuvin/agents
cat > .nuvin/agents/nuvin.md << 'EOF'
---
name: nuvin
description: Project-specific test prompt
temperature: 0.7
---

You are a PROJECT-SPECIFIC version of Nuvin.
EOF

# Restart CLI, verify it uses local (not global)
```

**Step 4: Test edit flow via UI**

1. Delete test files: `rm ~/.nuvin/agents/nuvin.md .nuvin/agents/nuvin.md`
2. Run CLI, open /agent modal (Ctrl+A)
3. Select 'nuvin' agent, press Enter
4. Verify: Message appears "Created global override at ~/.nuvin/agents/nuvin.md"
5. Edit prompt, save with Ctrl+S
6. Restart CLI
7. Verify: Custom prompt is active

**Step 5: Test fallback if registry fails**

Temporarily break the registry (comment out nuvin-agent.md in builtinAgents). Verify CLI still works using prompt.ts fallback.

**Step 6: Run all tests**

```bash
cd packages/nuvin-core && pnpm test -- --run
cd packages/nuvin-cli && pnpm run build
```

Expected: All tests pass, both packages build.

---

## Summary

After completing all tasks:

1. ✅ Main agent prompt uses agent file format with frontmatter
2. ✅ Registered as built-in 'nuvin' agent in AgentRegistry
3. ✅ Users can override via ~/.nuvin/agents/nuvin.md (global) or .nuvin/agents/nuvin.md (local)
4. ✅ Priority: local > global > built-in
5. ✅ UI shows [main] badge and auto-copies to global on edit
6. ✅ Falls back to prompt.ts if registry fails
7. ✅ Changes require restart to take effect
8. ✅ Documented for users

This makes the main agent consistent with sub-agents while allowing customization without breaking existing functionality.
