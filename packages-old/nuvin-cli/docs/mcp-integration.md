# MCP Integration Guide

Nuvin CLI supports Model Context Protocol (MCP) for extending functionality with additional tools and resources.

## Configuration

Create `~/.nuvin/.nuvin_mcp.json` or configure in your main config file:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/allowed/path"]
    },
    "github": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-github"]
    },
    "postgres": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
    }
  }
}
```

Or inline in your config.yaml:

```yaml
mcp:
  servers:
    filesystem:
      command: npx
      args: ["@modelcontextprotocol/server-filesystem", "/path"]
```

## Check MCP Status

Use `/mcp` command to see:
- Connected MCP servers
- Available tools from each server
- Server health status

## Available MCP Servers

### Filesystem Server

Provides safe file system operations within allowed directories:

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["@modelcontextprotocol/server-filesystem", "/allowed/path"]
  }
}
```

### GitHub Server

Integrates with GitHub repositories:

```json
{
  "github": {
    "command": "npx",
    "args": ["@modelcontextprotocol/server-github"]
  }
}
```

### Database Servers

Connect to databases (PostgreSQL, MySQL, etc.):

```json
{
  "postgres": {
    "command": "npx",
    "args": ["@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
  }
}
```

## Troubleshooting

### MCP Server Issues

```bash
# Check MCP server status
nuvin
/mcp
```

If servers fail to start, check:
1. Command exists (e.g., `npx` is available)
2. Server package is installed
3. Connection parameters are correct
4. Permissions for file system paths
