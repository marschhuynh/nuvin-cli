# MCP (Model Context Protocol) Usage Guide

## Quick Start

### Adding a Local MCP Server

```bash
# Add a stdio-based server
nuvin mcp add filesystem npx -y @anthropic-ai/mcp-server-filesystem /path/to/allowed

# Add with environment variables
nuvin mcp add github npx -y @anthropic-ai/mcp-server-github --env GITHUB_TOKEN=your-token
```

### Adding a Remote MCP Server with OAuth

```bash
# Add Atlassian MCP (auto-discovers OAuth, opens browser for login)
nuvin mcp add atlassian https://mcp.atlassian.com/v1/mcp --oauth

# Add with explicit auth server (if auto-discovery fails)
nuvin mcp add myserver https://mcp.example.com --oauth --auth-server https://auth.example.com
```

### Managing Servers

```bash
# List all servers
nuvin mcp list

# Remove a server
nuvin mcp remove <server-name>

# Test a server connection
nuvin mcp test <server-name>

# Enable/disable a server
nuvin mcp enable <server-name>
nuvin mcp disable <server-name>
```

## OAuth Authentication

### How It Works

1. **Add server with `--oauth`** → Auto-discovers OAuth config + opens browser for login
2. **Browser login** → Authorize access, redirects back to CLI
3. **Token stored** → Encrypted in `~/.nuvin/.tokens.json`
4. **Auto-refresh** → Tokens refreshed automatically when expired

### OAuth Commands

```bash
# Re-login (if token expired or revoked)
nuvin mcp login <server-name>

# Logout (clear stored tokens)
nuvin mcp logout <server-name>

# Check auth status
nuvin mcp auth-status <server-name>
```

### OAuth Options

| Flag | Description |
|------|-------------|
| `--oauth` | Enable OAuth authentication |
| `--client-id <id>` | Manual client ID (if DCR not supported) |
| `--auth-server <url>` | Manual auth server URL (if discovery fails) |
| `--scopes <scopes>` | Comma-separated scopes to request |

## Configuration

### Config File Locations

- **Global**: `~/.nuvin/config.json` (under `mcp.servers`)
- **Project**: `.nuvin.json` or `nuvin.yaml` in project root
- **Custom**: `--mcp-config <path>`

### JSON Configuration Format

```json
{
  "mcp": {
    "servers": {
      "filesystem": {
        "command": "npx",
        "args": ["-y", "@anthropic-ai/mcp-server-filesystem", "/home"],
        "enabled": true
      },
      "remote-api": {
        "transport": "http",
        "url": "https://mcp.example.com",
        "auth": {
          "type": "oauth",
          "oauth": {
            "scopes": ["read", "write"]
          }
        }
      }
    }
  }
}
```

### Server Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `command` | string | - | Executable (stdio transport) |
| `args` | string[] | [] | Command arguments |
| `env` | object | {} | Environment variables |
| `transport` | 'stdio' \| 'http' | 'stdio' | Transport type |
| `url` | string | - | Server URL (http transport) |
| `headers` | object | {} | HTTP headers |
| `auth` | object | - | Authentication config |
| `prefix` | string | `mcp_<id>_` | Tool name prefix |
| `timeoutMs` | number | 120000 | Timeout in ms |
| `enabled` | boolean | true | Enable/disable server |

## Tool Management

### In-App UI

Type `/mcp` in the chat to open the MCP management modal:

- **Navigate**: `↑↓` arrows
- **Switch panels**: `←→` or `Tab`
- **Toggle tool**: `Space` or `Enter`
- **Enable all**: `A`
- **Disable all**: `D`
- **Exit**: `ESC`

### Auth Status Icons

| Icon | Status |
|------|--------|
| 🔓 | No auth required |
| 🔑 | Bearer token |
| ✅ | OAuth authenticated |
| ⚠️ | Token expired |
| ❌ | Login required |

## Examples

### Atlassian (Jira/Confluence)

```bash
nuvin mcp add atlassian https://mcp.atlassian.com/v1/mcp --oauth
```

### GitHub with Token

```bash
nuvin mcp add github npx -y @anthropic-ai/mcp-server-github --env GITHUB_TOKEN=$GITHUB_TOKEN
```

### Local Filesystem

```bash
nuvin mcp add fs npx -y @anthropic-ai/mcp-server-filesystem ~/projects
```

### Remote Server with Bearer Token

```bash
nuvin mcp add api https://api.example.com/mcp --auth-type bearer --auth-token $API_TOKEN
```

## Troubleshooting

### Server won't connect
- Check command/URL is correct: `nuvin mcp test <name>`
- Increase timeout: edit config, set `timeoutMs: 300000`

### OAuth login fails
- Clear and retry: `nuvin mcp logout <name> && nuvin mcp login <name>`
- Check auth server is reachable
- Some servers require manual `--client-id`

### Tools not showing
- Check server is enabled: `nuvin mcp list`
- Open `/mcp` modal to see tool permissions
- Check for errors in server status

### Token expired
- Tokens auto-refresh, but if issues persist:
  ```bash
  nuvin mcp logout <name>
  nuvin mcp login <name>
  ```
