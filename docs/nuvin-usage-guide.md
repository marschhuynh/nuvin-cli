# Nuvin CLI — Complete Usage Guide

> **Version:** 2.0.0-rc.13 · **License:** Apache-2.0

Nuvin is an interactive AI coding assistant for the terminal. It orchestrates LLM providers, tools, agents, skills, memory, and MCP servers into a unified developer workflow.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Flags & Subcommands](#cli-flags--subcommands)
- [Configuration](#configuration)
- [Providers](#providers)
- [Interactive Commands](#interactive-commands)
- [Agents](#agents)
- [Tools](#tools)
- [Skills](#skills)
- [Hooks](#hooks)
- [MCP (Model Context Protocol)](#mcp-model-context-protocol)
- [Memory System](#memory-system)
- [Profiles](#profiles)
- [Session Management](#session-management)
- [UI & Keyboard Shortcuts](#ui--keyboard-shortcuts)
- [Statusline Customization](#statusline-customization)
- [Custom Commands](#custom-commands)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

---

## Installation

Requires **Node.js 18+**.

```bash
# Global install
npm install -g @nuvin/nuvin-cli

# Or use npx
npx @nuvin/nuvin-cli

# Or pnpm
pnpm add -g @nuvin/nuvin-cli
```

---

## Quick Start

```bash
# Start with default provider (OpenRouter free tier)
nuvin

# Start with a specific provider
nuvin --provider anthropic --api-key sk-ant-...

# Resume the last session
nuvin --resume

# Use a specific model
nuvin --provider openrouter --model openai/gpt-4o
```

On first run, Nuvin opens an interactive setup. You can also authenticate later with the `/auth` command.

---

## CLI Flags & Subcommands

### Flags

| Flag | Description |
|------|-------------|
| `--provider NAME` | Select provider: `openrouter`, `anthropic`, `github`, `deepinfra`, `zai`, `moonshot`, `kimi`, `minimax`, `echo` |
| `--model NAME` | Specify model (e.g. `claude-sonnet-4-5`, `openai/gpt-4o`) |
| `--api-key KEY` | API key for the selected provider |
| `--config PATH` | Load config from a specific YAML or JSON file |
| `--reasoning-effort LEVEL` | Reasoning depth: `low`, `medium`, `high` (for o1-style models) |
| `--profile NAME` | Use a specific profile for this session |
| `--history PATH` | Load conversation history from file |
| `--resume`, `-r` | Resume the most recent session |
| `--acp` | Run Nuvin as an ACP server over stdio |
| `--alt` | Use virtualized rendering mode (experimental) |
| `--version`, `-v` | Show version |
| `--help` | Show help |

### Subcommands

#### `nuvin config`

Manage configuration values directly from the terminal.

```bash
nuvin config list                      # List all config values
nuvin config get <key>                 # Get a specific value
nuvin config set <key> <value>         # Set a value
nuvin config help                      # Show config help
```

#### `nuvin profile`

Manage multiple isolated profiles (see [Profiles](#profiles)).

```bash
nuvin profile list                     # List all profiles
nuvin profile create <name>            # Create a new profile
nuvin profile delete <name>            # Delete a profile
nuvin profile switch <name>            # Set active profile
nuvin profile show                     # Show current profile info
nuvin profile clone <src> <dst>        # Clone a profile
```

#### `nuvin mcp`

Manage MCP servers from the command line (see [MCP](#mcp-model-context-protocol)).

```bash
nuvin mcp list [--json]                # List configured servers
nuvin mcp add <name> <command|url>     # Add a server
nuvin mcp remove <name>               # Remove a server
nuvin mcp show <name>                 # Show server config
nuvin mcp enable <name>               # Enable a server
nuvin mcp disable <name>              # Disable a server
nuvin mcp test <name>                 # Test connection
nuvin mcp login <name>                # OAuth login
nuvin mcp logout <name>               # Clear stored tokens
nuvin mcp auth-status <name>          # Show auth status
```

---

## Configuration

Nuvin uses a **layered configuration system**. Settings are merged in this priority order (highest wins):

1. **CLI flags** (`--provider`, `--model`, `--api-key`, `--reasoning-effort`)
2. **Environment variables** (`ANTHROPIC_API_KEY`, etc.)
3. **Explicit config file** (`--config path/to/config.yaml`)
4. **Workspace local** (`./.nuvin/config.yaml` in your project)
5. **Global** (`~/.nuvin/config.yaml`)

### File Locations

| Scope | Path |
|-------|------|
| Global | `~/.nuvin/config.yaml` (or `.json`) |
| Workspace | `./.nuvin/config.yaml` (or `.json`) |
| Profile | `~/.nuvin/profiles/<name>/config.yaml` |
| Explicit | Passed via `--config` flag |

### Configuration Keys

```yaml
# Provider & Model
activeProvider: anthropic              # Active LLM provider
model: claude-sonnet-4-5              # Model override

# Provider-specific settings
providers:
  anthropic:
    apiKey: sk-ant-...
    auth:
      - type: api-key
        api-key: sk-ant-...
      - type: oauth
        access: ...
        refresh: ...
  openrouter:
    apiKey: sk-or-...
  github:
    apiKey: ghp_...

# Tool Approval
requireToolApproval: false             # Require manual approval for tool use

# Thinking / Reasoning
thinking: OFF                          # OFF | LOW | MEDIUM | HIGH

# Streaming
streamingChunks: true                  # Show responses as they stream

# Session
session:
  memPersist: true                     # Persist conversation to disk
  persistEventLog: false               # Save event log
  persistHttpLog: false                # Save HTTP request log

# Agent toggles
agentsEnabled:
  code-reviewer: true
  software-engineer: true
  explore: true

# UI
ui:
  theme: dark                          # dark | light
  statusline:
    rows:
      - "model | tokens | cost"
      - "gitBranch | session"

# Skills
skills:
  enabled: true
  directories:                         # Additional skill search paths
    - /path/to/extra/skills
  exclude:                             # Skills to skip
    - some-skill-name

# Memory
memory:
  enabled: true
  saveTool: true                       # Allow memory_save tool
  retrieval:
    engine: bm25
    minScore: 0.1
    maxQueriesPerTurn: 3
    injectTokenBudget: 2000
  extraction:
    enabled: true
    sensitiveFilter: true

# Hooks (see Hooks section)
hooks:
  pre_tool_use:
    - matcher: "bash_tool"
      command:
        command: "echo 'Tool about to run'"
        timeout: 10
      enabled: true

# MCP Servers (see MCP section)
mcp:
  servers:
    filesystem:
      command: npx
      args: ["-y", "@anthropic-ai/mcp-server-filesystem", "/path"]
      enabled: true
```

---

## Providers

Nuvin supports multiple AI providers. Each can be configured with API keys, custom models, and base URLs.

### Built-in Providers

| Provider | Key | Type | Default Models | Auth Env Var |
|----------|-----|------|---------------|--------------|
| **Anthropic** | `anthropic` | Native | Claude models | `ANTHROPIC_API_KEY` |
| **OpenRouter** | `openrouter` | OpenAI-compat | `openai/gpt-4o`, `openai/gpt-4o-mini` | `OPENROUTER_API_KEY` |
| **GitHub Models** | `github` | Native | GitHub-hosted models | `GITHUB_ACCESS_TOKEN` |
| **DeepInfra** | `deepinfra` | OpenAI-compat | Llama 3.1 70B/8B | `DEEPINFRA_API_KEY` |
| **ZAI** | `zai` | Anthropic-compat | GLM 4.5–5 | `ZAI_API_KEY` |
| **Moonshot** | `moonshot` | OpenAI-compat | `kimi-latest`, `kimi-k2-thinking` | — |
| **Kimi for Coding** | `kimi` | Anthropic-compat | Auto-discovered | — |
| **MiniMax** | `minimax` | Anthropic-compat | `MiniMax-M2.1` | — |
| **Echo** | `echo` | Test | — | — |

### Authentication Methods

- **API Key**: Set via `--api-key`, environment variable, or config file
- **OAuth**: Supported for Anthropic (browser-based login via `/auth`)

### Custom Providers

You can configure custom OpenAI-compatible providers in your config:

```yaml
providers:
  my-provider:
    type: openai-compat           # or anthropic-compat
    baseUrl: https://api.example.com/v1
    apiKey: your-key
    models:
      - id: my-model
        name: "My Model"
        limits:
          contextWindow: 128000
          maxOutput: 4096
```

### Switching Providers

```bash
# At launch
nuvin --provider anthropic

# During session
/models                           # Interactive model/provider switcher
```

---

## Interactive Commands

Once inside Nuvin, use `/` prefix commands:

| Command | Description |
|---------|-------------|
| `/help` | Show all available commands |
| `/new` | Start a new conversation |
| `/clear` | Clear conversation history |
| `/exit` | Exit Nuvin |
| `/history` | Browse and resume previous sessions |
| `/export` | Export current conversation to a file |
| `/models` | Switch provider and model mid-conversation |
| `/auth` | Manage authentication (API keys, OAuth) |
| `/sudo` | Toggle sudo mode (require manual tool approval) |
| `/thinking` | Set thinking level: OFF / LOW / MEDIUM / HIGH |
| `/mcp` | Manage MCP servers (add, list, enable/disable) |
| `/agent` | Configure specialist agents (enable/disable, edit) |
| `/command` | Create and manage custom slash commands |
| `/skills` | Browse, enable/disable skills |
| `/memory` | View and manage long-term memory entries |
| `/summary` | Summarize conversation and start new session with context |
| `/stat` | Display session statistics (tokens, cost, requests) |
| `/swap` | Switch between multiple concurrent conversations |
| `/statusline` | Customize the statusline layout |
| `/vim` | Toggle vim mode (insert/normal) |
| `/setup` | Run initial setup wizard |

---

## Agents

Nuvin uses a multi-agent architecture. The **main agent** handles user interaction, and **specialist agents** handle delegated tasks.

### Built-in Agents

| Agent | Description | Context |
|-------|-------------|---------|
| **nuvin** (main) | Autonomous software engineering agent | Main session |
| **code-reviewer** | Code review specialist (quality, security, correctness) | Forked |
| **software-engineer** | Elite engineer for implementation and refactoring | Forked |
| **explore** | Codebase exploration and architecture mapping | Forked |

### Agent Configuration Schema

Agents are defined as Markdown files with YAML frontmatter:

```markdown
---
name: my-agent
description: "What this agent does"
allowed_tools:
  - file_read
  - file_edit
  - bash_tool
  - grep_tool
model: claude-sonnet-4-5          # Optional model override
provider: anthropic                # Optional provider override
temperature: 0.3
max_tokens: 32000
top_p: 1.0
user_invocable: true               # Can user invoke directly
context: fork                      # fork = isolated context
disable_model_invocation: false
hooks:                             # Agent-specific hooks
  pre_tool_use:
    - matcher: "bash_tool"
      command:
        command: "echo checking..."
---

# Agent Instructions

You are a helpful assistant...
```

### Agent File Locations

| Scope | Path |
|-------|------|
| Built-in | `source/agents/nuvin-agent.md`, `source/builtin-agents/*.md` |
| Global override | `~/.nuvin/agents/<agent-name>.md` |
| Workspace override | `./.nuvin/agents/<agent-name>.md` |
| Profile | `~/.nuvin/profiles/<name>/agents/<agent-name>.md` |

**Priority:** Workspace > Global > Built-in

### Customizing the Main Agent

1. **Via UI:** Launch Nuvin → press `Ctrl+A` → select `nuvin` agent → edit → `Ctrl+S`
2. **Manual:** Create `~/.nuvin/agents/nuvin.md` (global) or `.nuvin/agents/nuvin.md` (workspace)

To revert: delete the override file and restart.

### Enabling/Disabling Agents

```yaml
# In config.yaml
agentsEnabled:
  code-reviewer: true
  software-engineer: true
  explore: false                   # Disabled
```

Or toggle interactively via `/agent`.

### Agent Delegation

The main agent can delegate to specialists using the `assign_task` tool:

```
assign_task({
  agent: "code-reviewer",
  task: "Review src/auth/*.ts for security issues",
  description: "Security review of auth module"
})
```

Specialist agents run in **forked contexts** — isolated sessions with their own tools and state.

---

## Tools

Nuvin provides 18+ built-in tools that agents use to interact with the codebase and environment.

### File Operations

| Tool | Description |
|------|-------------|
| `file_read` | Read file contents (supports line ranges) |
| `file_edit` | Edit files by exact text replacement |
| `file_new` | Create new files |
| `bash_tool` | Execute shell commands with timeout |

### Search & Navigation

| Tool | Description |
|------|-------------|
| `grep_tool` | Search file contents with regex |
| `glob_tool` | Find files by glob pattern |
| `ls_tool` | List directory contents |

### Code Intelligence

| Tool | Description |
|------|-------------|
| `lsp` | Language Server Protocol — go-to-definition, find references, hover, diagnostics, document symbols, workspace symbols, call hierarchy |

### Web

| Tool | Description |
|------|-------------|
| `web_search` | Google Programmable Search (requires `GOOGLE_CSE_KEY` and `GOOGLE_CSE_CX`) |
| `web_fetch` | Fetch web page and convert to Markdown |

### Task & Knowledge Management

| Tool | Description |
|------|-------------|
| `todo_write` | Create and manage structured task lists |
| `memory_save` | Save facts to long-term memory |
| `memory_query` | Query long-term memory |
| `memory_extract` | Auto-extract facts from conversation |

### Delegation & Interaction

| Tool | Description |
|------|-------------|
| `assign_task` | Delegate tasks to specialist agents |
| `ask_user_tool` | Ask the user structured questions |
| `skill` | Load and activate skills dynamically |

### Advanced

| Tool | Description |
|------|-------------|
| `computer` | Computer use / visual interaction (experimental, requires `NUVIN_COMPUTER_USE=1`) |

### Tool Approval

By default, tools run automatically. Enable manual approval:

```yaml
# config.yaml
requireToolApproval: true
```

Or toggle at runtime with `/sudo`.

---

## Skills

Skills are reusable instruction packages that extend agent capabilities with specialized knowledge.

### Skill Structure

```
.nuvin/skills/<skill-name>/
├── SKILL.md              # Main skill file (required)
├── scripts/              # Optional shell scripts
├── references/           # Optional reference docs
└── assets/               # Optional assets
```

### SKILL.md Format

```markdown
---
name: my-skill
description: "Step-by-step guide for deploying to K8s"
license: MIT
allowed-tools: "bash_tool file_read"    # Optional: restrict tools
disabled: false                          # Optional: disable
---

# My Skill Instructions

Detailed instructions the agent follows when this skill is loaded...
```

### Skill Search Directories

Skills are discovered from multiple locations (in order):

1. `./.nuvin/skills/` — Workspace local
2. `~/.nuvin/skills/` — Global
3. `~/.claude/skills/` — Claude compatibility
4. `NUVIN_SKILLS_PATH` env var — Colon-separated additional paths
5. `skills.directories` in config — Custom directories

### Managing Skills

```yaml
# config.yaml
skills:
  enabled: true
  directories:
    - /extra/skills/path
  exclude:
    - skill-to-ignore
```

Use `/skills` interactively to browse, enable, and disable skills.

### Creating a Skill

1. Create directory: `mkdir -p .nuvin/skills/my-skill`
2. Create `SKILL.md` with frontmatter and instructions
3. Restart Nuvin or use `/skills` to discover it

---

## Hooks

Hooks intercept agent lifecycle events, allowing you to run scripts before/after tool execution, session start/end, and more.

### Supported Hook Events

| Event | Trigger | Use Case |
|-------|---------|----------|
| `session_start` | Session begins | Logging, setup |
| `session_end` | Session ends | Cleanup, reporting |
| `pre_user_prompt` | Before processing user input | Input validation |
| `pre_tool_use` | Before any tool runs | Block dangerous commands, auditing |
| `post_tool_use` | After tool completes | Logging results |
| `permission_request` | Tool approval requested | Custom approval logic |
| `pre_sub_agent` | Before spawning sub-agent | Rate limiting |
| `post_sub_agent` | After sub-agent completes | Result validation |
| `pre_stop` | Before session terminates | Final cleanup |

### Hook Configuration

Hooks are defined in config.yaml or in agent frontmatter:

```yaml
hooks:
  pre_tool_use:
    - matcher: "bash_tool"           # Regex pattern (optional)
      command:
        command: |
          #!/bin/bash
          if echo "$NUVIN_TOOL_INPUT" | grep -q "rm -rf"; then
            echo '{"decision": "deny", "reason": "Blocked destructive command"}'
            exit 2
          fi
        timeout: 10                  # Seconds (default: 60)
      enabled: true
      once: false                    # Run only once per session

  session_start:
    - command:
        command: |
          echo "Session $NUVIN_SESSION_ID started" >> ~/nuvin-audit.log
        timeout: 5
      enabled: true

  post_tool_use:
    - command:
        command: |
          echo "$(date) Tool=$NUVIN_TOOL_NAME" >> ~/nuvin-audit.log
        timeout: 5
      enabled: true
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success — continue normally |
| `1` | Error — show warning, continue |
| `2` | Block/deny the operation |

### JSON Output (Advanced)

Hooks can return structured JSON for richer control:

```json
{
  "decision": "deny",
  "reason": "Blocked by policy",
  "updatedInput": "...",
  "additionalContext": "...",
  "stopReason": "..."
}
```

### Available Environment Variables in Hooks

| Variable | Description |
|----------|-------------|
| `NUVIN_SESSION_ID` | Current session ID |
| `NUVIN_CONVERSATION_ID` | Conversation ID |
| `NUVIN_MESSAGE_ID` | Message ID |
| `NUVIN_HOOK_EVENT` | Hook event name |
| `NUVIN_CWD` | Working directory |
| `NUVIN_TOOL_NAME` | Tool being invoked (tool hooks) |
| `NUVIN_TOOL_USE_ID` | Tool invocation ID |
| `NUVIN_TOOL_INPUT` | Tool input as JSON string |

### Examples

**Block dangerous bash commands:**
```yaml
hooks:
  pre_tool_use:
    - matcher: "bash_tool"
      command:
        command: |
          #!/bin/bash
          DANGEROUS="rm -rf|mkfs|dd if=|:(){ :|:& };:|chmod -R 777"
          if echo "$NUVIN_TOOL_INPUT" | grep -qE "$DANGEROUS"; then
            echo '{"decision": "deny", "reason": "Blocked dangerous command"}'
            exit 2
          fi
        timeout: 10
      enabled: true
```

**Desktop notification on tool approval (macOS):**
```yaml
hooks:
  permission_request:
    - command:
        command: |
          osascript -e "display notification \"Tool: $NUVIN_TOOL_NAME\" with title \"Nuvin: Approval Required\""
        timeout: 5
      enabled: true
```

**Rate limit sub-agent spawning:**
```yaml
hooks:
  pre_sub_agent:
    - command:
        command: |
          COUNT_FILE="/tmp/nuvin_agent_count_$NUVIN_SESSION_ID"
          COUNT=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
          if [ "$COUNT" -ge 10 ]; then
            echo '{"decision": "deny", "reason": "Sub-agent limit (10) reached"}'
            exit 2
          fi
          echo $((COUNT + 1)) > "$COUNT_FILE"
        timeout: 5
      enabled: true
```

---

## MCP (Model Context Protocol)

MCP extends Nuvin with external tool servers. You can connect to local (stdio) or remote (HTTP) MCP servers.

### Adding Servers

```bash
# Stdio server (local process)
nuvin mcp add filesystem npx -y @anthropic-ai/mcp-server-filesystem /path/to/dir

# Stdio server with environment variables
nuvin mcp add github npx -y @anthropic-ai/mcp-server-github --env GITHUB_TOKEN=ghp_...

# Remote HTTP server
nuvin mcp add my-server https://mcp.example.com/v1/mcp

# Remote with OAuth
nuvin mcp add atlassian https://mcp.atlassian.com/v1/mcp --oauth
```

### Managing Servers

```bash
nuvin mcp list                 # List all servers
nuvin mcp test filesystem      # Test connection
nuvin mcp enable filesystem    # Enable
nuvin mcp disable filesystem   # Disable
nuvin mcp remove filesystem    # Remove
```

### OAuth Authentication

```bash
nuvin mcp login atlassian      # Opens browser for OAuth flow
nuvin mcp auth-status atlassian # Check token status
nuvin mcp logout atlassian     # Clear stored tokens
```

OAuth tokens are encrypted and stored in `~/.nuvin/.tokens.json` with automatic refresh.

### MCP Config Format

In `config.yaml` or `config.json`:

```yaml
mcp:
  servers:
    filesystem:
      command: npx
      args: ["-y", "@anthropic-ai/mcp-server-filesystem", "/home/user/docs"]
      env:
        NODE_ENV: production
      transport: stdio           # stdio (default) or http
      enabled: true
      timeoutMs: 30000
      prefix: fs                 # Tool prefix: mcp_fs_*

    remote-api:
      url: https://mcp.example.com/v1/mcp
      transport: http
      headers:
        Authorization: "Bearer token123"
      enabled: true
      auth:
        type: oauth              # none | bearer | oauth
        oauth:
          clientId: abc123
          scopes: ["read", "write"]
```

### Interactive MCP Management

Type `/mcp` during a session to open the MCP management modal:
- Navigate with arrow keys
- `Tab` to switch panels
- `Space`/`Enter` to toggle servers
- `A`/`D` to enable/disable all

### Auth Status Icons

| Icon | Meaning |
|------|---------|
| 🔓 | No authentication |
| 🔑 | Bearer token |
| ✅ | OAuth authenticated |
| ⚠️ | Token expired |
| ❌ | Login required |

---

## Memory System

Nuvin has a persistent long-term memory system that retains facts, preferences, and decisions across sessions.

### How It Works

1. **Save** — Facts are stored as topic-based Markdown files
2. **Index** — BM25 full-text index for fast retrieval
3. **Inject** — Relevant memories are injected into the prompt at the start of each turn

### Memory Scopes

| Scope | Storage | Content |
|-------|---------|---------|
| **Global** | `~/.nuvin/memory/global/topics/*.md` | Cross-project preferences |
| **Project** | `./.nuvin/memory/project/topics/*.md` | Workspace-specific facts |

### Memory Types

- **Semantic** — Facts and knowledge ("project uses pnpm")
- **Episodic** — Experiences ("debugging X, found that Y works")
- **Procedural** — Rules and conventions ("always use single quotes")

### Memory Tools

| Tool | Purpose |
|------|---------|
| `memory_save` | Explicitly save a fact with topic, scope, type, keywords |
| `memory_query` | Search memories by natural language query |
| `memory_extract` | Auto-extract facts from recent conversation |

### Configuration

```yaml
memory:
  enabled: true                  # Master switch
  saveTool: true                 # Enable memory_save tool

  retrieval:
    engine: bm25                 # Search engine
    minScore: 0.1                # Minimum relevance score
    maxQueriesPerTurn: 3         # Max searches per turn
    injectTokenBudget: 2000      # Token budget for injection
    coreInjectTokenBudget: 500   # Core memory budget
    freshnessHalfLifeDays: 30    # Recency decay half-life

  extraction:
    enabled: true                # Enable memory_extract tool
    provider: anthropic          # Provider for extraction (optional)
    model: claude-haiku          # Model for extraction (optional)
    sensitiveFilter: true        # Filter sensitive data

  index:
    persisted: true              # Persist BM25 index to disk
    flushIntervalMs: 5000        # Index flush interval
```

### Managing Memories

Use `/memory` to view and delete memory entries interactively.

---

## Profiles

Profiles provide **complete isolation** of configuration, agents, sessions, and MCP servers.

### Default Profile

The `default` profile uses `~/.nuvin/` directly — no migration needed.

### Managing Profiles

```bash
nuvin profile list                     # List all profiles
nuvin profile create work              # Create "work" profile
nuvin profile switch work              # Activate "work" profile
nuvin profile show                     # Show current profile
nuvin profile clone work personal      # Clone profile
nuvin profile delete old-profile       # Delete a profile
```

### Using Profiles

```bash
# Use a profile for one session
nuvin --profile work

# Switch the active profile globally
nuvin profile switch personal
```

### Profile Storage Layout

```
~/.nuvin/
├── config.yaml                        # Default profile config
├── agents/                            # Default profile agents
├── sessions/                          # Default profile sessions
├── profiles.yaml                      # Profile registry
└── profiles/
    ├── work/
    │   ├── config.yaml
    │   ├── agents/
    │   └── sessions/
    └── personal/
        ├── config.yaml
        ├── agents/
        └── sessions/
```

### What's Isolated Per Profile

- Configuration (providers, API keys, settings)
- Agent definitions and overrides
- Session history
- MCP server configurations

---

## Session Management

### Starting & Resuming Sessions

```bash
nuvin                          # New session
nuvin --resume                 # Resume last session
nuvin --history file.json      # Load from file
```

Inside a session:
- `/new` — Start fresh conversation
- `/history` — Browse and resume past sessions
- `/export` — Export current conversation
- `/summary` — Summarize and start new session with context
- `/swap` — Switch between concurrent conversations

### Session Statistics

Use `/stat` to view:
- Token usage (input/output/cached)
- Estimated cost
- Number of requests
- Active model and provider

### Session Persistence

```yaml
session:
  memPersist: true               # Persist conversation history
  persistEventLog: false         # Save detailed event log
  persistHttpLog: false          # Save raw HTTP requests
```

---

## UI & Keyboard Shortcuts

### Global Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+C` | Exit (press twice to confirm) |
| `Ctrl+V` | Paste images from clipboard |
| `Escape` | Close modals / cancel |

### Vim Mode

Toggle with `/vim`:
- **Insert mode** — Normal text input
- **Normal mode** — Vi-key navigation

### Modal Navigation

| Key | Action |
|-----|--------|
| `↑`/`↓` | Navigate items |
| `←`/`→` | Navigate options |
| `Enter` | Select |
| `Escape` | Close |
| `Tab` | Switch panels |

### Thinking Mode

Set reasoning depth via `/thinking` or config:

| Level | Description |
|-------|-------------|
| `OFF` | No reasoning output |
| `LOW` | Minimal reasoning |
| `MEDIUM` | Standard reasoning |
| `HIGH` | Maximum reasoning depth |

---

## Statusline Customization

Customize the bottom statusline with `/statusline` or config.

### Available Segments

| Segment | Shows |
|---------|-------|
| `model` | Current model |
| `session` | Session ID |
| `thinking` | Thinking mode |
| `sudo` | Sudo mode status |
| `tokens` | Token usage |
| `context` | Context window usage |
| `cached` | Cached tokens |
| `requests` | Request count |
| `tools` | Tools indicator |
| `cost` | Estimated cost |
| `lsp` | Language server status |
| `gitBranch` | Current git branch |
| `keybindings` | Keybinding mode |
| `memory` | Memory status |
| `rss` | Process memory usage |

### Configuration

```yaml
ui:
  statusline:
    rows:
      - "model | tokens | cost"           # Row 1: left | right
      - "gitBranch | memory | session"     # Row 2: left | right
```

### Interactive Editor

Use `/statusline` to visually customize:
- `←`/`→` — Navigate within row
- `↑`/`↓` — Switch rows
- `Shift+←`/`→` — Reorder segments
- `Shift+↑`/`↓` — Move between rows
- `x` — Hide segment
- `Tab` — Switch to hidden segments
- `r` — Reset to defaults
- `Enter` — Save
- `Escape` — Cancel

---

## Custom Commands

Create your own `/` commands with template-based Markdown files.

### Locations

| Scope | Path |
|-------|------|
| Global | `~/.nuvin/commands/` |
| Workspace | `./.nuvin/commands/` |
| Profile | `~/.nuvin/profiles/<name>/commands/` |

### Creating a Custom Command

Create a `.md` file (e.g., `~/.nuvin/commands/review.md`):

```markdown
---
name: review
description: "Run a code review on staged changes"
---

Review all staged git changes. Focus on:
1. Logic errors
2. Security issues
3. Missing edge cases

Use `bash_tool` to run `git diff --staged` first.
```

The command becomes available as `/review` after restart.

Manage interactively with `/command`.

---

## Environment Variables

### Provider Authentication

| Variable | Provider |
|----------|----------|
| `ANTHROPIC_API_KEY` | Anthropic |
| `OPENROUTER_API_KEY` | OpenRouter |
| `GITHUB_ACCESS_TOKEN` | GitHub Models |
| `DEEPINFRA_API_KEY` | DeepInfra |
| `ZAI_API_KEY` | ZAI |

### Web Search

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CSE_KEY` | Google Custom Search API key |
| `GOOGLE_CSE_CX` | Google Custom Search Engine ID |

### Skills

| Variable | Purpose |
|----------|---------|
| `NUVIN_SKILLS_PATH` | Additional skill directories (colon-separated) |

### LSP

| Variable | Purpose |
|----------|---------|
| `NUVIN_DISABLE_LSP` | Disable LSP entirely (`true`) |
| `NUVIN_DISABLE_LSP_DOWNLOAD` | Disable auto-download of LSP servers (`true`) |
| `NUVIN_LSP_DEBUG` | Enable LSP debug logging |

### UI & Features

| Variable | Purpose |
|----------|---------|
| `NUVIN_THEME_MODE` | Force theme: `dark` or `light` |
| `NUVIN_THEME_BACKGROUNDS` | Background style preference |
| `NUVIN_COMPUTER_USE` | Enable computer use tool (`1`) |

---

## Troubleshooting

### Provider won't authenticate
- Check the correct environment variable is set
- Use `/auth` to re-authenticate interactively
- Verify API key with `nuvin config get providers.<name>.apiKey`

### MCP server won't connect
- Run `nuvin mcp test <name>` to diagnose
- Check server logs and `transport` setting (stdio vs http)
- Ensure the command is available in your PATH

### Tools not showing from MCP
- Verify server is enabled: `nuvin mcp list`
- Check prefix setting — tools appear as `mcp_<prefix>_<tool>`
- Restart Nuvin after adding servers

### Memory not working
- Ensure `memory.enabled: true` in config
- Check `.nuvin/memory/` directory exists and is writable
- Verify `memory.saveTool: true` for explicit saves

### LSP not working
- Ensure language server binary is installed or allow auto-download
- Check `NUVIN_DISABLE_LSP` is not set
- Enable debug with `NUVIN_LSP_DEBUG=true nuvin`

### Session won't resume
- Check `session.memPersist: true` in config
- Verify sessions directory exists at `~/.nuvin/sessions/`
- Use `/history` to browse available sessions
