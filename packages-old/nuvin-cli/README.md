# @nuvin/nuvin-cli

Interactive AI coding assistant for the terminal.
Your terminal, your choice of model, your rules—nothing hidden.

## Features

**Provider Freedom** — Use any LLM provider without lock-in. Supports OpenRouter, Anthropic, GitHub Models, DeepInfra, ZAI, Moonshot, Kimi, MiniMax out of the box. Switch models mid-conversation.

**Multi-Agent Delegation** — Spawn specialist agents for focused tasks like security audits or code investigation. Each agent runs in isolated context with session resumption support.

**Native Code Intelligence** — Built-in LSP integration for go-to-definition, find references, hover information, and real-time diagnostics. Understand your codebase, not just pattern match.

**Modern TUI** — React/Ink-based terminal interface with vim mode, virtualized rendering for large outputs, and session statistics.

**Configuration Profiles** — Maintain separate configurations for different projects, teams, or workflows. Layer global, workspace, and CLI settings.

**MCP Extensibility** — Extend capabilities with Model Context Protocol servers. Add custom tools without modifying core code.

**Session Persistence** — Resume previous conversations with full context. Export, browse, and manage conversation history.

**Controlled Execution** — Optional sudo mode for manual tool approval. Review and approve file edits, bash commands, and web requests before execution.

## Installation

```bash
# Install globally
npm install --global @nuvin/nuvin-cli

# Use with npx (no installation required)
npx @nuvin/nuvin-cli

# Install in project as dependency
npm install @nuvin/nuvin-cli

# Or with pnpm
pnpm add @nuvin/nuvin-cli

# Or with yarn
yarn add @nuvin/nuvin-cli
```

## Quick Start

```bash
# Start with default provider
nuvin

# Use OpenRouter with a free model
nuvin --provider openrouter --model minimax/minimax-m2:free

# Use Anthropic Claude (requires API key)
nuvin --provider anthropic --model claude-sonnet-4-5

# Use GitHub Models (requires GitHub token)
nuvin --provider github --model claude-sonnet-4.5

# Use configuration file for persistent settings
nuvin --config ./my-config.yaml

# List available commands
nuvin --help

# Check version
nuvin --version
```

## CLI Usage

### Basic Commands

```bash
# Start interactive mode with default provider
nuvin

# Use specific provider and model
nuvin --provider openrouter --model openai/gpt-4o

# Use Anthropic Claude
nuvin --provider anthropic --model claude-sonnet-4-5

# Use GitHub Models
nuvin --provider github --model claude-sonnet-4.5

# Use Echo mode for testing
nuvin --provider echo --model echo

# Load configuration from file
nuvin --config ./my-config.yaml

# Show help and all options
nuvin --help
```

### Advanced Usage

```bash
# Combine multiple options
nuvin --provider openrouter --model openai/gpt-4o --config ./config.yaml

# Use ZAI provider
nuvin --provider zai --model glm-4.7
```

### ACP Server Mode

Run Nuvin as an ACP server over stdio:

```bash
nuvin --acp
```

Notes: Uses the same config resolution as the CLI. File system and terminal actions use local Nuvin tools (no ACP fs/terminal proxy in the initial implementation).

## Environment Variables

Set up authentication via environment variables:

```bash
# AI Provider Authentication
export OPENROUTER_API_KEY=sk-or-xxxxxxxx
export ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
export GITHUB_ACCESS_TOKEN=ghp_xxxxxxxxxxxx

# Optional Tool Configuration
export GOOGLE_CSE_KEY=your_google_cse_key
export GOOGLE_CSE_CX=your_search_engine_id
```

## What You Can Do

### Development & Code Analysis
- "Analyze my project structure and provide optimization recommendations"
- "Review the recent git commits and summarize changes"
- "Find all TODO comments in my codebase"
- "Set up automated testing for my codebase"
- "Refactor this function to follow SOLID principles"

### Multi-Agent Delegation
- "Delegate code review to the specialist agent"
- "Create a comprehensive test suite for this module"
- "Research documentation for this API and create usage examples"
- "Organize my git changes into conventional commits"
- "Have the architect review this design and suggest improvements"

## Documentation

- **[Configuration Guide](docs/configuration.md)** - Detailed configuration system documentation
- **[Commands Reference](docs/commands.md)** - Built-in commands and usage examples
- **[MCP Integration](docs/mcp-integration.md)** - Model Context Protocol setup and usage
- **[Specialist Agents](docs/agents.md)** - Multi-agent system and delegation guide
- **[Development Guide](docs/development.md)** - Contributing and development workflow
- **[Tool Approval Renderers](docs/tool-approval-renderers.md)** - Tool approval system and custom renderers

## Troubleshooting

### Common Issues

**Installation problems**
- Ensure Node.js 18+ is installed: `node --version`
- Clear npm cache: `npm cache clean --force`
- Use specific version: `npm install -g @nuvin/nuvin-cli@latest`

**Provider authentication issues**
- Check API keys are set correctly as environment variables
- Verify keys have proper permissions for the provider
- Test with free models first before upgrading

**Configuration file issues**
- Validate YAML syntax (use online validator)
- Check file paths are correct
- Use absolute paths if relative paths fail

**Performance issues**
- Close other memory-intensive applications
- Increase Node.js memory limit: `node --max-old-space-size=4096`
- Use lighter models for faster responses

**Getting help**
- Run `nuvin --help` for command options
- Check [GitHub Issues](https://github.com/marschhuynh/nuvin-cli/issues) for known problems
- Enable debug mode (if available) for detailed logs

## License

Apache-2.0 © Marsch Huynh
