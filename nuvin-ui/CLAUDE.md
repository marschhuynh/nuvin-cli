# CLAUDE.md - Nuvin Space Project

## Project Overview

**Nuvin Space** is a desktop AI agent management application built with Wails (Go + React + TypeScript). It provides a unified interface for interacting with multiple AI providers and agents, including support for MCP (Model Context Protocol) servers for tool integration.

### Architecture
- **Frontend**: React + TypeScript with TailwindCSS and Radix UI components
- **Backend**: Go application using Wails framework for desktop integration
- **State Management**: Zustand for client-side state
- **UI Framework**: Custom component library built on Radix UI primitives

## Key Features

1. **Multi-Agent Support**
   - Local agents (using configured providers)
   - Remote agents (A2A protocol)
   - Pre-configured agent personas (General Assistant, Code Reviewer, Creative Writer, etc.)

2. **Provider Integration**
   - OpenAI, Anthropic, OpenRouter, GitHub Copilot
   - OpenAI-compatible APIs
   - Configurable API keys and endpoints

3. **MCP Server Integration**
   - Tool registry system for external tools
   - Support for both stdio and HTTP transports
   - Dynamic tool loading and execution

4. **Conversation Management**
   - Multi-conversation interface
   - Message streaming support
   - Automatic conversation summarization
   - Pagination for long conversations

## Project Structure

```
nuvin-ui/
├── frontend/                    # React TypeScript frontend
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   │   ├── ui/            # Base UI components (buttons, inputs, etc.)
│   │   │   └── mcp/           # MCP-specific components
│   │   ├── lib/               # Core libraries and utilities
│   │   │   ├── agents/        # Agent implementations
│   │   │   ├── providers/     # LLM provider implementations
│   │   │   ├── mcp/           # MCP client and management
│   │   │   └── tools/         # Tool system
│   │   ├── modules/           # Feature modules
│   │   │   ├── agent/         # Agent configuration
│   │   │   ├── conversation/  # Conversation management
│   │   │   ├── messenger/     # Chat interface
│   │   │   └── provider/      # Provider settings
│   │   ├── store/             # Zustand state stores
│   │   ├── screens/           # Main application screens
│   │   └── types/             # TypeScript type definitions
├── *.go                        # Go backend files
├── wails.json                  # Wails configuration
└── go.mod                      # Go dependencies
```

## Development Commands

### Frontend
```bash
cd frontend
pnpm install              # Install dependencies
pnpm run dev              # Development server
pnpm run build            # Production build
pnpm run test             # Run tests
pnpm run test:ui          # Run tests with UI
pnpm run format           # Format code with Biome
```

### Backend/Desktop App
```bash
wails dev                 # Development mode with hot reload
wails build               # Build production executable
go run .                  # Run Go backend directly
```

## Core Technologies

### Frontend Stack
- **React 18** - UI framework
- **TypeScript** - Type safety
- **TailwindCSS 4** - Utility-first styling
- **Radix UI** - Accessible component primitives
- **Zustand** - Lightweight state management
- **React Router 7** - Client-side routing
- **Vitest** - Testing framework
- **Biome** - Code formatting and linting

### Backend Stack
- **Go** - Backend language
- **Wails v2** - Desktop framework
- **Context/cancellation** - Request management
- **JSON-RPC** - MCP communication protocol

### Key Dependencies
- `@tanstack/react-virtual` - Virtual scrolling for messages
- `react-markdown` - Markdown rendering
- `mermaid` - Diagram rendering
- `lucide-react` - Icon library
- `class-variance-authority` - CSS class utilities

## Architecture Patterns

### State Management
- **Agent Store**: Manages agent configurations and active agent
- **Provider Store**: Handles LLM provider settings
- **Conversation Store**: Manages conversations and messages
- **User Preference Store**: User settings and preferences

### Agent System
- **Base Agent**: Abstract base class for all agents
- **Local Agent**: Uses configured providers for completions
- **A2A Agent**: Communicates with remote agents via HTTP API
- **Agent Manager**: Singleton managing agent lifecycle and message routing

### Provider System
- **Provider Factory**: Creates provider instances based on configuration
- **Base Provider**: Abstract provider interface
- **Concrete Providers**: Implementation for each AI service
- **Cost Calculator**: Tracks token usage and estimated costs

### Tool System
- **Tool Registry**: Central registry for all available tools
- **Built-in Tools**: Calculator, time, random number tools
- **MCP Tools**: Dynamically loaded from MCP servers
- **Tool Integration Service**: Handles tool execution and response parsing

### MCP Integration
- **MCP Manager**: Manages MCP server lifecycle
- **MCP Client**: JSON-RPC client for MCP communication
- **Transport Layer**: Supports stdio and HTTP transports
- **Tool Creation**: Converts MCP tools to internal tool format

## Key Files and Their Purposes

### Core Application
- `frontend/src/App.tsx` - Main application component
- `frontend/src/main.tsx` - Application entry point
- `main.go` - Wails application setup
- `app.go` - Go backend API methods

### Agent Management
- `frontend/src/lib/agent-manager.ts` - Central agent management
- `frontend/src/lib/agents/` - Agent implementations
- `frontend/src/store/useAgentStore.ts` - Agent state management

### Provider System
- `frontend/src/lib/providers/` - LLM provider implementations
- `frontend/src/store/useProviderStore.ts` - Provider configuration

### MCP Integration
- `frontend/src/lib/mcp/mcp-manager.ts` - MCP server management
- `frontend/src/lib/mcp/mcp-client.ts` - MCP JSON-RPC client
- `frontend/src/lib/tools/tool-registry.ts` - Tool system

### UI Components
- `frontend/src/screens/Dashboard/messenger.tsx` - Main chat interface
- `frontend/src/modules/messenger/` - Chat components
- `frontend/src/components/ui/` - Base UI components

## Configuration

### Provider Configuration
Providers are configured through the UI and stored in local storage:
```typescript
interface ProviderConfig {
  type: 'openai' | 'anthropic' | 'openrouter' | 'github' | 'openai-compatible';
  apiKey: string;
  apiUrl?: string;
  activeModel: string;
  customHeaders?: Record<string, string>;
}
```

### Agent Configuration
Agents have configurable parameters:
```typescript
interface AgentSettings {
  id: string;
  name: string;
  persona: string;
  responseLength: 'short' | 'medium' | 'long' | 'detailed';
  temperature: number;
  topP: number;
  maxTokens: number;
  systemPrompt: string;
  agentType: 'local' | 'remote';
  url?: string;
  auth?: AuthConfig;
}
```

### MCP Server Configuration
MCP servers can be configured for tool integration:
```typescript
interface MCPConfig {
  id: string;
  name: string;
  type: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled: boolean;
}
```

## Testing

The project uses Vitest for testing with the following setup:
- Unit tests for core utilities and services
- Component testing with React Testing Library
- Test files located in `__tests__` directories
- Mock implementations for Wails runtime

Run tests:
```bash
cd frontend
pnpm run test        # Run all tests
pnpm run test:ui     # Interactive test UI
pnpm run test:coverage  # Coverage report
```

## Build and Deployment

### Development
```bash
wails dev  # Hot reload for both frontend and backend
```

### Production Build
```bash
wails build  # Creates platform-specific executable
```

The built application will be in the `build/bin/` directory.

## Common Development Tasks

### Adding a New Provider
1. Create provider class in `frontend/src/lib/providers/`
2. Implement the `LLMProvider` interface
3. Add to `ProviderFactory`
4. Update provider types and configurations

### Adding a New Agent Type
1. Create agent class extending `BaseAgent`
2. Implement required methods (`sendMessage`, etc.)
3. Update `AgentManager` to handle the new type
4. Add UI configuration options

### Adding Built-in Tools
1. Create tool implementation in `frontend/src/lib/tools/built-in/`
2. Follow the `Tool` interface
3. Register in the tool registry during initialization

### Debugging MCP Issues
- Check MCP server logs in browser console
- Use the MCP debug components in the UI
- Verify server configurations and connection status
- Test JSON-RPC communication manually

## Important Notes

- All API keys are stored locally in browser storage
- MCP servers run as separate processes managed by the Go backend
- The application uses streaming for real-time message updates
- Conversation history is persisted in browser storage
- The app supports both dark and light themes
- Cost tracking is estimated based on known provider pricing

## Environment Variables

Development environment variables are handled through Wails configuration. No special environment setup is required for basic development.

## Future Extensibility

The architecture is designed to be extensible:
- New providers can be added by implementing the `LLMProvider` interface
- New agent types can be added by extending `BaseAgent`
- MCP integration allows for unlimited tool expansion
- The component system supports easy UI customization
- State management is modular and can be extended