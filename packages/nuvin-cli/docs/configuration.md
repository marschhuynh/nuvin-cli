# Configuration Guide

The CLI uses a layered configuration system with priority resolution (later entries override earlier ones):

1. **Global config** - `~/.nuvin/config.yaml` or `config.json`
2. **Workspace config** - `./.nuvin/config.yaml` or `config.json` (in current directory)
3. **Explicit file** - `--config path/to/file.{yaml,json}`
4. **Environment variables** - `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, etc. (processed at startup)
5. **CLI flags** - `--provider`, `--model`, `--api-key`, etc. (highest priority)

## Configuration Commands

Manage configuration with built-in commands:

```bash
# Set global configuration
nuvin config set activeProvider openrouter --global
nuvin config set providers.openrouter.auth[0].api-key "sk-or-xxx" --global

# Set local workspace configuration
nuvin config set model "openai/gpt-4o" --local

# View configuration
nuvin config get activeProvider
nuvin config list
```

## Configuration File Example

```yaml
# ~/.nuvin/config.yaml or ./.nuvin/config.yaml
activeProvider: openrouter
model: openai/gpt-4o

providers:
  openrouter:
    auth:
      - type: api-key
        api-key: sk-or-xxxxxxxx
    current-auth: api-key
    defaultModel: openai/gpt-4o

  anthropic:
    auth:
      - type: api-key
        api-key: sk-ant-xxxxxxxx
    current-auth: api-key
    defaultModel: claude-sonnet-4

session:
  memPersist: true

requireToolApproval: false
thinking: MEDIUM

mcp:
  servers:
    filesystem:
      command: npx
      args: ["@modelcontextprotocol/server-filesystem", "/path/to/allowed/files"]
```

## Environment Variables

Environment variables are automatically detected and loaded at CLI startup. They follow the configuration priority chain and can be overridden by CLI flags.

```bash
# AI Provider Authentication
OPENROUTER_API_KEY=sk-or-xxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
ZAI_API_KEY=your_zai_key
DEEPINFRA_API_KEY=your_deepinfra_key
GITHUB_ACCESS_TOKEN=ghp_xxxxxxxxxxxx

# Optional Tool Configuration
GOOGLE_CSE_KEY=your_google_cse_key      # For web_search tool
GOOGLE_CSE_CX=your_search_engine_id     # For web_search tool
```

**Note:** Environment variables are processed centrally at startup in `cli.tsx` and injected into the configuration system as the 'env' scope. This ensures consistent handling across all providers.

## CLI Options

```
Configuration Options
  --provider NAME     Choose AI provider: openrouter | github | zai | anthropic | echo
  --config PATH       Merge configuration from file (JSON or YAML)
  --model NAME        Specify model (e.g., gpt-4o, claude-sonnet-4)
  --api-key KEY       Your API key for authentication (OpenRouter, Zai, Anthropic)
  --mem-persist       Enable conversation history persistence (.history/<session>/)
  --mcp-config PATH   MCP servers configuration file (default: ~/.nuvin/.nuvin_mcp.json)
  --reasoning-effort  Set reasoning effort for o1 models: low | medium | high (default: medium)
  --history PATH      Load conversation history from file on startup
  -v, --version       Show version information
```

## Examples

```bash
# Start with default provider
nuvin

# Use OpenRouter
nuvin --provider openrouter --model minimax/minimax-m2:free

# Use Anthropic Claude
nuvin --provider anthropic --model claude-sonnet-4-5

# Use GitHub Models
nuvin --provider github --model claude-sonnet-4.5

# Use configuration file
nuvin --config ./my-config.yaml
```

## Troubleshooting

### Authentication Issues

```bash
# Set API key via CLI
nuvin --provider openrouter --api-key "sk-or-xxx"

# Or set via config
nuvin config set providers.openrouter.auth[0].api-key "sk-or-xxx" --global
```

### History/Memory Issues

```bash
# Check history location
ls -la .history/

# Load specific history
nuvin --history .history/session-abc123/history.json

# Clear and start fresh
/new
```
