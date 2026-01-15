# Development Guide

## Getting Started

```bash
# Clone repository
git clone https://github.com/nuvin-space/nuvin-space.git
cd nuvin-space

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Development mode (watch mode)
pnpm dev

# Run CLI in development
pnpm run:dev

# Run tests
pnpm test
pnpm test:watch

# Lint and format
pnpm lint
pnpm format

# Clean build artifacts
pnpm clean
```

## Project Structure

```
packages/nuvin-cli/
├── source/
│   ├── app.tsx              # Main app component
│   ├── cli.tsx              # CLI entry point
│   ├── components/          # React components
│   ├── config/              # Configuration management
│   ├── contexts/            # React contexts
│   ├── hooks/               # Custom hooks
│   ├── modules/
│   │   └── commands/        # Command system
│   ├── renderers/           # Message renderers
│   ├── services/            # Business logic services
│   └── utils/               # Utility functions
└── tests/                   # Test files
```

## Architecture

The CLI is built with a modular, event-driven architecture:

### Core Technologies

- **React/Ink** - Terminal UI framework for rich interactive experiences
- **TypeScript** - Type-safe development with strict typing
- **@nuvin/nuvin-core** - Core orchestrator engine with LLM providers and tools
- **Event Bus** - Centralized event system for component communication
- **Command System** - Extensible command registry with function and component-based commands
- **MCP Support** - Model Context Protocol for extensible tool integration
- **Configuration System** - Layered config management (global, local, explicit, direct)
- **Theme System** - Customizable terminal themes with color schemes

### Key Components

- **Orchestrator** - Main agent coordination and LLM interaction
- **Agent Manager** - Multi-agent system with delegation and task routing
- **Tool System** - File operations, web search, bash execution, delegation
- **Memory Management** - Conversation persistence and context management
- **Renderers** - Modular rendering system for different message types
- **Config Bridge** - Real-time configuration updates between React and orchestrator

### Multi-Agent Architecture

The CLI implements a sophisticated multi-agent system:

1. **Main Agent (Orchestrator)**
   - Handles user interactions
   - Routes tasks to appropriate specialist agents
   - Coordinates multi-agent workflows
   - Manages conversation context

2. **Specialist Agents**
   - Independent AI agents with specialized prompts
   - Each agent has domain-specific tools and knowledge
   - Can be invoked directly or automatically by main agent
   - Support for nested delegation (agents can delegate to other agents)

3. **Agent Registry**
   - Centralized registry of all available agents
   - Dynamic agent loading and initialization
   - Configuration-based agent enabling/disabling

4. **Delegation Flow**
   ```
   User Request → Main Agent → Task Analysis
                                    ↓
                    ┌───────────────┴───────────────┐
                    ↓                               ↓
              Direct Response              Delegate to Specialist
                    ↓                               ↓
              Response to User           Specialist Agent Execution
                                                    ↓
                                         Results → Main Agent → User
   ```

## Building

The build process uses `tsup` for bundling:

```bash
# Build all packages
pnpm build

# Build only CLI
pnpm build:cli

# Build only core
pnpm build:core
```

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Run specific test file
pnpm test path/to/test.ts
```

## Code Style

The project uses Biome for linting and formatting:

```bash
# Check code style
pnpm lint

# Auto-fix issues
pnpm format
```

## Publishing

The project uses changesets for version management:

```bash
# Create a changeset
pnpm changeset

# Version packages
pnpm version-packages

# Publish to npm
pnpm release
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run linting and tests
6. Submit a pull request

## License

Apache-2.0 © Marsch Huynh
