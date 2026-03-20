# Coding Conventions

**Analysis Date:** 2025-03-19

## Naming Patterns

**Files:**
- TypeScript/TSX: `.ts` for logic, `.tsx` for React components
- Test files: `*.test.ts` or `*.test.tsx` suffix
- Source files: kebab-case for utilities and services (e.g., `commandCompletion.ts`, `file-logger.ts`)
- Component files: PascalCase (e.g., `ConfigBridge.tsx`, `Gradient.tsx`)

**Functions:**
- camelCase for all functions (e.g., `findCommandCompletion`, `completeCommand`, `getDefaultLogger`)
- Hook functions: `use` prefix with camelCase (e.g., `useInputHistory`, `useNotification`, `useAuthStorage`)
- Handler functions: `handle` prefix (e.g., `handleSubmit`, `handleError`)

**Variables:**
- camelCase for all variables (e.g., `currentInput`, `messagesRef`, `lastSessionMessage`)
- Constants: UPPER_SNAKE_CASE (e.g., `SKILL_FILE`, `DEFAULT_FALLBACK_COLOR`)
- Private class properties: no prefix, just private modifier (e.g., `private instance: SkillsService`)

**Types:**
- PascalCase for all types and interfaces (e.g., `UseInputHistoryOptions`, `FileLoggerOptions`, `SkillInfo`)
- Type parameters: PascalCase (e.g., `T`, `TMessage`)
- Union types: PascalCase for each member (e.g., `'debug' | 'info' | 'warn' | 'error'`)

## Code Style

**Formatting:**
- Tool: Biome 2.3.9
- Config: `biome.json` at project root
- Key settings:
  - Indent style: Spaces
  - Indent width: 2
  - Line width: 120
  - Quote style: Single quotes
  - Semicolons: Required

**Linting:**
- Tool: Biome linter
- Rules: Recommended preset enabled
- Key overrides:
  - `suspicious.noExplicitAny`: error
  - `correctness.noUnusedImports`: off
- Run command: `pnpm lint` (runs `pnpm exec biome lint`)

**TypeScript Configuration:**
- Strict mode enabled
- Key strict options:
  - `noImplicitAny`: true
  - `strictNullChecks`: true
  - `noUnusedLocals`: true
  - `noUnusedParameters`: true
- JSX: `react-jsx` (automatic runtime)
- Module resolution: bundler

## Import Organization

**Order:**
1. Node.js built-in modules (e.g., `import * as fs from 'node:fs/promises'`)
2. External packages (e.g., `import { z } from 'zod'`)
3. Internal packages (e.g., `import { logger } from '@/utils/file-logger.js'`)
4. Relative imports (e.g., `import { ConfigManager } from './config/manager.js'`)

**Path Aliases:**
- `@/*` maps to `source/*` (configured in `tsconfig.json` and `vitest.config.ts`)
- Example: `import { useNotification } from '@/hooks/useNotification.js'`

**Import Style:**
- Named imports preferred: `import { useState, useEffect } from 'react'`
- Type imports: `import type { Message } from '@nuvin/nuvin-core'`
- Namespace imports for Node.js: `import * as fs from 'node:fs/promises'`
- Always include `.js` extension in imports (ES modules)

## Error Handling

**Patterns:**
- Try-catch for async operations that may fail
- Silent failures with logging: `catch { return null }` or `catch { lastSessionMessage = null }`
- Error classification utilities: `isRetryableError(error)`, `shouldStopRetrying(error, attempt, maxRetries)`
- Type guards for error validation

**Example:**
```typescript
try {
  const sessions = await scanAvailableSessions(1, undefined, currentProfile);
  lastSessionMessage = sessions?.[0]?.lastMessage ?? null;
} catch {
  lastSessionMessage = null;
}
```

## Logging

**Framework:** Custom FileLogger (`packages/nuvin-cli/source/utils/file-logger.ts`)

**Usage:**
```typescript
import { logger } from '@/utils/file-logger.js';

logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');
```

**Configuration:**
- Log directory: `~/.nuvin/logs` (default)
- Log levels: `debug`, `info`, `warn`, `error`
- File rotation: 5MB max size, keeps 3 rotated files
- Console logging: Optional (disabled by default)

## Comments

**When to Comment:**
- JSDoc for exported functions and types with parameters
- Inline comments for non-obvious logic
- TODO comments for future work (use sparingly)
- Migration notes: `// TODO: Remove migration call after v1.x release`

**JSDoc Pattern:**
```typescript
export interface FileLoggerOptions {
  /**
   * Directory where log files will be stored
   * @default ~/.nuvin/logs
   */
  logDir?: string;

  /**
   * Minimum log level to write
   * @default 'info'
   */
  minLevel?: LogLevel;
}
```

**TODO Comments:**
- Format: `// TODO: description`
- Use for temporary workarounds or migration notes
- Include version/timeout when applicable: `// TODO: Remove this file after migration period (e.g., v1.x release)`

## Function Design

**Size:** No strict limit, but prefer smaller, focused functions

**Parameters:**
- Use options object for 3+ parameters: `UseInputHistoryOptions`
- Destructure options object in function signature
- Required parameters first, optional last

**Return Values:**
- Explicit return types for exported functions
- Union types for multiple return states: `string | null`
- Object returns for multiple values: `{ newValue: string; newCursorOffset: number }`

**Example:**
```typescript
export function completeCommand(
  input: string,
  cursorOffset: number,
  completedCommand: string,
): { newValue: string; newCursorOffset: number } {
  // Implementation
}
```

## Module Design

**Exports:**
- Named exports preferred: `export function findCommandCompletion()`
- Default exports for React components: `export function ConfigBridge()`
- Type exports: `export type { SkillInfo, Skill }`
- Re-exports: `export { OrchestratorStatus } from '@/types/orchestrator.js'`

**Barrel Files:**
- `index.ts` files in directories to group related exports
- Example: `packages/nuvin-cli/source/hooks/index.ts`

**Class Design:**
- Singleton pattern with `getInstance()` for services
- Static factory methods: `createWithHomeDir(homeDir: string)`
- Private constructors with public static initializers
- Reset methods for testing: `static resetInstance(): void`

**Example:**
```typescript
export class SkillsService {
  private static instance: SkillsService | null = null;

  constructor(homeDir?: string) {
    // ...
  }

  static getInstance(): SkillsService {
    if (!SkillsService.instance) {
      SkillsService.instance = new SkillsService();
    }
    return SkillsService.instance;
  }

  static resetInstance(): void {
    SkillsService.instance = null;
  }
}
```

## Git Workflow Conventions

**Pre-commit Hook:**
- Location: `.husky/pre-commit`
- Action: Runs `pnpm format` (Biome format)
- Purpose: Ensure all committed code is formatted

**Pre-push Hook:**
- Location: `.husky/pre-push`
- Actions:
  1. Runs `pnpm format`
  2. Runs `pnpm build`
- Purpose: Verify code builds before pushing

**Commit Message Format:**
- Conventional commits observed in recent history:
  - `feat(docs): add complete usage guide for Nuvin CLI`
  - `fix(app): use getActiveConversationId() for delete persistence`
  - `feat(layout): pass busy state to MessageActionModal`
- Format: `type(scope): description`

**Branching:**
- Main branch: `main`
- Feature branches: Not specified in codebase

## React/Ink Specific Conventions

**Component Structure:**
- Functional components with hooks
- Props interfaces defined above component
- Type imports for React: `import type React from 'react'`
- Hooks from `ink`: `import { Text, Box } from 'ink'`

**Hook Patterns:**
- Custom hooks start with `use`: `useInputHistory`, `useNotification`
- Hook options interfaces: `UseInputHistoryOptions`
- Return tuples for multiple values: `[value, setValue]`
- Refs for persistent values: `const messagesRef = useRef(messages)`

**Example:**
```typescript
export const useInputHistory = ({
  memory,
  conversationId = 'default',
  currentInput,
  onRecall,
}: UseInputHistoryOptions) => {
  const { setNotification } = useNotification();
  const [messages, setMessages] = useState<string[]>([]);

  // Implementation
};
```

---

*Convention analysis: 2025-03-19*
