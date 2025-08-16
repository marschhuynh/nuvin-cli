# Codebase Structure

## Root Directory
```
nuvin-agent/
├── nuvin-ui/              # Main Wails desktop application
├── doc/                   # Documentation
├── agent-client/          # A2A client SDK example (mentioned in README)
├── package.json           # Root package.json with workspace scripts
├── biome.json            # Biome configuration for formatting/linting
├── go.mod                # Root Go module
├── main.go               # Root Go file
└── README.md             # Main project documentation
```

## Main Application (nuvin-ui/)
```
nuvin-ui/
├── frontend/             # React TypeScript frontend
├── *.go                  # Go backend files
├── wails.json           # Wails configuration
├── go.mod               # Go dependencies
├── CLAUDE.md            # Detailed project documentation
└── README.md            # Application-specific docs
```

## Frontend Structure (nuvin-ui/frontend/src/)
```
src/
├── components/          # Reusable UI components
│   ├── ui/             # Base components (Button, Input, etc.)
│   ├── mcp/            # MCP-specific components
│   ├── debug/          # Debug utilities
│   └── conversation/   # Conversation-related components
├── lib/                # Core libraries and services
│   ├── agents/         # Agent system (LocalAgent, A2AAgent, etc.)
│   ├── providers/      # LLM providers (OpenAI, Anthropic, etc.)
│   ├── tools/          # Tool system and built-in tools
│   ├── mcp/            # MCP client and management
│   └── utils/          # Utility functions
├── modules/            # Feature-based modules
│   ├── agent/          # Agent configuration UI
│   ├── provider/       # Provider settings UI
│   ├── messenger/      # Chat interface components
│   ├── conversation/   # Conversation management
│   └── setting/        # Application settings
├── store/              # Zustand state stores
├── types/              # TypeScript type definitions
├── screens/            # Main application screens
├── hooks/              # Custom React hooks
├── routes/             # Routing configuration
├── assets/             # Static assets (images, fonts)
├── themes/             # Theme definitions
└── test/               # Test utilities and mocks
```

## Key Architecture Components

### Agent System
- **BaseAgent**: Abstract base class for all agents
- **LocalAgent**: Uses configured LLM providers
- **A2AAgent**: Communicates with remote A2A agents
- **AgentManager**: Singleton managing agent lifecycle

### Provider System
- **Base Provider**: Abstract provider interface
- **Concrete Providers**: OpenAI, Anthropic, GitHub, OpenRouter implementations
- **Provider Factory**: Creates provider instances
- **Cost Calculator**: Tracks usage and costs

### Tool System
- **Tool Registry**: Central registry for all tools
- **Built-in Tools**: Calculator, time, bash, todo management
- **MCP Tools**: Dynamically loaded from MCP servers
- **Tool Integration Service**: Handles execution and parsing

### State Management
- **Agent Store**: Agent configurations and active agent
- **Provider Store**: LLM provider settings
- **Conversation Store**: Messages and conversation history
- **User Preference Store**: Application preferences
- **Todo Store**: Task management state

### MCP Integration
- **MCP Manager**: Server lifecycle management
- **MCP Client**: JSON-RPC communication
- **Transport Layer**: stdio and HTTP transport support
- **Tool Creation**: Converts MCP tools to internal format

## Important Files
- `App.tsx` - Main application component
- `main.tsx` - Application entry point
- `agent-manager.ts` - Central agent coordination
- `tool-registry.ts` - Tool system core
- `mcp-manager.ts` - MCP server management
- `provider-factory.ts` - Provider instantiation
- Various store files in `store/` - State management