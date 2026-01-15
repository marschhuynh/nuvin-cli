<p align="center">
  <img src="https://img.shields.io/npm/v/@nuvin/nuvin-cli?style=flat-square&color=blue" alt="npm version" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square" alt="node version" />
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square" alt="license" />
</p>

<h1 align="center">Nuvin CLI</h1>

<p align="center">
  <strong>Interactive AI coding assistant for the terminal</strong><br/>
  Your terminal, your choice of model, your rules—nothing hidden.
</p>

---

## Features

**Provider Freedom** — Use any LLM provider without lock-in. Supports OpenRouter, Anthropic, GitHub Models, DeepInfra, ZAI, Moonshot, Kimi, MiniMax out of the box. Switch models mid-conversation.

**Multi-Agent Delegation** — Spawn specialist agents for focused tasks like security audits or code investigation. Each agent runs in isolated context with session resumption support.

**Native Code Intelligence** — Built-in LSP integration for go-to-definition, find references, hover information, and real-time diagnostics. Understand your codebase, not just pattern match.

**Modern TUI** — React/Ink-based terminal interface with vim mode, virtualized rendering for large outputs, and session statistics.

**Configuration Profiles** — Maintain separate configurations for different projects, teams, or workflows. Layer global, workspace, and CLI settings.

**MCP Extensibility** — Extend capabilities with Model Context Protocol servers. Add custom tools without modifying core code.

**Session Persistence** — Resume previous conversations with full context. Export, browse, and manage conversation history.

**Controlled Execution** — Optional sudo mode for manual tool approval. Review and approve file edits, bash commands, and web requests before execution.

---

## Installation

```bash
# npm
npm install -g @nuvin/nuvin-cli

# pnpm
pnpm add -g @nuvin/nuvin-cli

# yarn
yarn global add @nuvin/nuvin-cli

# Or run without installing
npx @nuvin/nuvin-cli
```

**Requirements:** Node.js 18+

---

## Quick Start

```bash
# Start interactive mode
nuvin

# Use a specific provider
nuvin --provider openrouter --model openai/gpt-4o
nuvin --provider anthropic --model claude-sonnet-4-5
nuvin --provider github --model claude-sonnet-4.5

# Resume previous session
nuvin --resume
nuvin -r

# Load a configuration file
nuvin --config ./nuvin-config.yaml
```

---

## Configuration

### Environment Variables

```bash
# Provider API Keys
export OPENROUTER_API_KEY=sk-or-xxxxxxxx
export ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
export GITHUB_ACCESS_TOKEN=ghp_xxxxxxxxxxxx
export DEEPINFRA_API_KEY=xxxxxxxx
export ZAI_API_KEY=xxxxxxxx

# Tool Configuration (optional)
export GOOGLE_CSE_KEY=your_google_cse_key
export GOOGLE_CSE_CX=your_search_engine_id
```

### CLI Options

| Option | Description |
|--------|-------------|
| `--provider <name>` | AI provider: `openrouter`, `anthropic`, `github`, `deepinfra`, `zai`, `echo` |
| `--model <name>` | Model identifier (e.g., `gpt-4o`, `claude-sonnet-4-5`) |
| `--api-key <key>` | API key for authentication |
| `--config <path>` | Load configuration from YAML/JSON file |
| `--profile <name>` | Use a specific profile |
| `--resume`, `-r` | Resume the most recent session |
| `--reasoning-effort` | Reasoning level: `low`, `medium`, `high`, `off` |
| `--alt` | Enable virtualized rendering (experimental) |
| `--version`, `-v` | Show version |
| `--help` | Show help |

### Configuration Files

Nuvin uses a layered configuration system with the following priority (highest last):

1. **Global:** `~/.nuvin/config.yaml`
2. **Workspace:** `./.nuvin/config.yaml`
3. **Explicit:** `--config <path>`
4. **Environment:** Environment variables
5. **CLI flags:** Command-line arguments

---

## Commands

### CLI Subcommands

```bash
# Configuration management
nuvin config list                     # List all settings
nuvin config get <key>                # Get a value
nuvin config set <key> <value>        # Set a value

# Profile management
nuvin profile list                    # List profiles
nuvin profile create <name>           # Create profile
nuvin profile switch <name>           # Switch active profile
nuvin profile clone <src> <dst>       # Clone profile

# MCP server management
nuvin mcp list                        # List MCP servers
nuvin mcp add <name> --command <cmd>  # Add server
nuvin mcp test <name>                 # Test connection
nuvin mcp enable|disable <name>       # Toggle server
```

### Interactive Commands

Inside the TUI, use `/command` syntax:

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/new` | Start a new conversation |
| `/clear` | Clear the screen |
| `/history` | Browse session history |
| `/export` | Export current conversation |
| `/model` | Switch model |
| `/auth` | Manage authentication |
| `/sudo` | Toggle tool approval mode |
| `/thinking` | Adjust reasoning effort |
| `/mcp` | View MCP servers and tools |
| `/agent` | Manage specialist agents |
| `/command` | Manage custom commands |
| `/summary` | View session summary |
| `/stat` | View session statistics |
| `/skills` | Manage skills |
| `/vim` | Open in Vim mode |
| `/exit` | Exit the application |

---

## Built-in Tools

The assistant has access to these tools:

| Tool | Description |
|------|-------------|
| `bash_tool` | Execute shell commands with timeout protection |
| `file_read` | Read file contents with optional line ranges |
| `file_new` | Create new files |
| `file_edit` | Edit existing files with find-and-replace |
| `ls_tool` | List directory contents |
| `glob_tool` | Find files by glob pattern |
| `grep_tool` | Search file contents with regex |
| `web_search` | Search the web (requires Google CSE) |
| `web_fetch` | Fetch and convert web pages to Markdown |
| `lsp` | Code intelligence (definitions, references, diagnostics) |
| `todo_write` | Manage task lists |
| `skill` | Load specialized instructions |
| `assign_task` | Delegate to specialist agents |

---

## Multi-Agent System

Delegate specialized tasks to agents:

```
"Review this code for security vulnerabilities"
"Create a comprehensive test suite for this module"
```

Agents are stored in `~/.nuvin/agents/` and can be managed via:

```bash
nuvin --help   # See agent-related options
/agent         # Inside TUI
```

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Configuration](packages/nuvin-cli/docs/configuration.md) | Full configuration reference |
| [Commands](packages/nuvin-cli/docs/commands.md) | Command reference |
| [MCP Integration](packages/nuvin-cli/docs/mcp-integration.md) | Setting up MCP servers |
| [Agents](packages/nuvin-cli/docs/agents.md) | Multi-agent system guide |
| [Development](packages/nuvin-cli/docs/development.md) | Contributing guide |
| [Adding Providers](docs/adding-new-provider.md) | How to add new LLM providers |

---

## Project Structure

```
nuvin-space-public/
├── packages/
│   ├── nuvin-cli/        # CLI application (React/Ink TUI)
│   ├── nuvin-core/       # Core orchestrator, tools, and providers
│   └── ink/              # Custom Ink fork with enhancements
├── docs/                 # Additional documentation
└── design/               # Design documents
```

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `pnpm test`
5. Submit a pull request

```bash
# Development
pnpm install
pnpm build
pnpm run:dev   # Run in development mode
```

---

## License

Apache License 2.0 © [Marsch Huynh](https://github.com/marschhuynh)
