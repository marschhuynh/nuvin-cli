# Code Style and Conventions

## Formatting and Linting
- **Primary Tool**: Biome (configured in `/biome.json`)
- **Indentation**: 2 spaces
- **Quote Style**: Single quotes for JavaScript/TypeScript
- **File Scope**: Only TypeScript/TSX files in `nuvin-ui/frontend/**/*.{ts,tsx}`

## TypeScript Conventions
- **Type Safety**: Strict TypeScript configuration
- **Interface/Type Definitions**: Located in `src/types/` directory
- **Naming**: PascalCase for components, camelCase for functions/variables
- **Type Hints**: Extensive use of TypeScript types throughout

## React Conventions
- **Component Structure**: Functional components with hooks
- **Props**: Typed interfaces for all component props
- **State Management**: Zustand stores for global state
- **File Organization**: Feature-based module structure

## File and Directory Structure
```
nuvin-ui/frontend/src/
├── components/          # Reusable UI components
│   ├── ui/             # Base UI components (buttons, inputs, etc.)
│   └── mcp/            # MCP-specific components
├── lib/                # Core libraries and utilities
│   ├── agents/         # Agent implementations
│   ├── providers/      # LLM provider implementations
│   ├── tools/          # Tool system
│   └── mcp/            # MCP client and management
├── modules/            # Feature modules
├── store/              # Zustand state stores
├── types/              # TypeScript type definitions
├── screens/            # Main application screens
└── hooks/              # Custom React hooks
```

## Naming Conventions
- **Components**: PascalCase (e.g., `MessageList.tsx`)
- **Files**: kebab-case for utilities, PascalCase for components
- **Variables/Functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Interfaces/Types**: PascalCase with descriptive names

## Import Organization
- External libraries first
- Internal utilities and types
- Relative imports last
- Group imports logically

## Testing Conventions
- **Framework**: Vitest with React Testing Library
- **File Naming**: `*.test.tsx` or `*.test.ts`
- **Location**: `__tests__` directories or alongside source files
- **Coverage**: Aim for high coverage on core utilities and services

## Go Backend Conventions
- **Module**: Uses Go modules with `go.mod`
- **Structure**: Main application files in `nuvin-ui/` directory
- **Dependencies**: Wails v2 framework, minimal external dependencies
- **Integration**: Exposes API methods for frontend via Wails context

## Documentation Style
- **README**: Comprehensive setup and usage instructions
- **Code Comments**: Minimal, focus on WHY not WHAT
- **Type Documentation**: Let TypeScript interfaces serve as documentation