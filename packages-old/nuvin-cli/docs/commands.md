# Built-in Commands Reference

Once running, you can use these built-in commands:

## Session Management

- `/new` - Start a new conversation
- `/clear` - Clear the screen
- `/exit` - Exit the CLI

## Information & History

- `/help` - Show available commands
- `/history` - Show conversation history
- `/summary` - Show summarized conversation (bash commands, file operations, key points)
- `/export <path>` - Export conversation to file

## Configuration & Settings

- `/model` - List and switch between available models
- `/auth` - Test authentication for a provider
- `/sudo` - Toggle sudo mode (bypass tool approval requirement)
- `/thinking [off|low|medium|high]` - Set thinking display level (interactive if no args)

## Advanced Features

- `/mcp` - Show MCP server status and available tools
- `/agent` - Manage and delegate tasks to specialist agents
- `/vim` - Open vim editor (experimental)

## Command Examples

### Thinking Display

```bash
# Thinking display - direct argument
/thinking off              # Disable thinking display
/thinking low              # Minimal thinking output
/thinking medium           # Balanced output (default)
/thinking high             # Detailed thinking output
/thinking                  # Interactive mode - shows menu
```

### Model Switching

```bash
/model                     # Interactive selection
/auth                      # Test OpenRouter authentication
```

### Sudo Mode

Toggle tool approval bypass:

```bash
/sudo                      # Toggle sudo mode
```

### Export Conversation

```bash
/export conversation.json  # Save to file
```

## What You Can Do

### Development & Code Analysis

- "Analyze my project structure and provide optimization recommendations"
- "Review the recent git commits and summarize changes"
- "Find all TODO comments in my codebase"
- "Set up automated testing for my codebase"

### File & Data Operations

- "Search for all JavaScript files that import React"
- "Create a backup script for my important files"
- "Organize my downloads folder by file type"

### Research & Web Search

- "Search for best practices for React hooks and summarize findings"
- "Find documentation for TypeScript 5.0 new features"

### Automation & Multi-Agent Delegation

- "Delegate code review to the specialist agent"
- "Create a comprehensive test suite for this module"
- "Research documentation for this API and create usage examples"
- "Organize my git changes into conventional commits"
- "Have the architect review this design and suggest improvements"
- "Get the quality tester to analyze test coverage gaps"
- "Research best practices for React hooks and implement examples"
