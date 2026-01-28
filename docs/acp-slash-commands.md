# ACP Slash Commands

Nuvin supports the ACP slash commands protocol, allowing users to invoke commands via `/command` syntax in ACP-enabled editors.

## Available Commands

### Common Built-in Commands

The following are frequently used built-in commands (additional commands are available):

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

```markdown
---
description: Review code changes
enabled: true  # Optional: Set to false to disable command
---

Review the following code changes and provide feedback:

{{user_prompt}}

Focus on:
- Code quality
- Potential bugs
- Best practices
```

Usage: `/review src/api.ts`

## How It Works

1. **Session Creation**: When an ACP session is created, Nuvin sends an `available_commands_update` notification with all enabled commands.

2. **Command Invocation**: Users type `/command [input]` in the editor. The editor sends this as a regular prompt.

3. **Command Execution**: Nuvin parses the slash command and either:
   - Executes the built-in command logic
   - Renders the custom command template, replacing `{{user_prompt}}` with the user's input

## Protocol Details

### Available Commands Update

```json
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
```

### Command Invocation

```json
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
```
