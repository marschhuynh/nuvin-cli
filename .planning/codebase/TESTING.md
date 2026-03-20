# Testing Patterns

**Analysis Date:** 2025-03-19

## Test Framework

**Runner:**
- Vitest 3.2.4
- Config: `packages/nuvin-cli/vitest.config.ts`
- Additional: AVA 5.3.1 (legacy, used in some test files)

**Assertion Library:**
- Vitest built-in assertions (`expect`)
- AVA assertions (in legacy tests): `t.is()`, `t.true()`, `t.pass()`

**Run Commands:**
```bash
# Run all tests (monorepo)
pnpm test

# Run tests for specific package
pnpm --filter @nuvin/nuvin-cli test
pnpm --filter @nuvin/nuvin-core test

# Watch mode (nuvin-core only)
pnpm test:watch

# Run tests with type checking (nuvin-core)
pnpm --filter @nuvin/nuvin-core test  # Uses --typecheck flag

# Build and run E2E tests
pnpm --filter @nuvin/nuvin-cli test:e2e:acp
```

## Test File Organization

**Location:**
- Primary: `packages/nuvin-cli/tests/`
- Co-located: `packages/nuvin-cli/source/utils/__tests__/`
- Core tests: `packages/nuvin-core/src/tests/`

**Naming:**
- Vitest tests: `*.test.ts` or `*.test.tsx`
- AVA tests: `*.test.ts` (legacy)
- Excluded from Vitest: `tests/inputArea.test.ts`, `tests/utils.test.ts` (use AVA)

**Structure:**
```
packages/nuvin-cli/
├── tests/
│   ├── skills-service.test.ts
│   ├── command-queue.test.ts
│   ├── use-input-index.test.tsx
│   └── *.test.tsx (component tests)
└── source/
    └── utils/
        └── __tests__/
            ├── auto-export.test.ts
            └── fire-permission-request-hooks.test.ts
```

## Test Structure

**Vitest Pattern:**
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SkillsService } from '../source/services/SkillsService.js';

describe('SkillsService', () => {
  let tempDir: string;
  let skillsService: SkillsService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-test-'));
    SkillsService.resetInstance();
    skillsService = SkillsService.createWithHomeDir(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('discover', () => {
    it('should discover skills from .nuvin/skills directory', async () => {
      // Arrange
      const skillDir = path.join(tempDir, '.nuvin', 'skills', 'test-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), '...');

      // Act
      const result = await skillsService.discover(tempDir);

      // Assert
      expect(Object.keys(result.skills)).toHaveLength(1);
      expect(result.skills['test-skill']).toBeDefined();
    });
  });
});
```

**AVA Pattern (Legacy):**
```typescript
import test from 'ava';
import { cleanTerminalCopy } from './utils.js';

test('cleanTerminalCopy removes ANSI escape sequences', (t) => {
  const coloredText = '\u001b[31mRed text\u001b[0m';
  const result = cleanTerminalCopy(coloredText);
  t.is(result, 'Red text');
});
```

**Setup Pattern:**
- `beforeEach()`: Initialize test state, create temp directories, reset singletons
- `afterEach()`: Cleanup temp directories, clear mocks
- Singleton reset: `SkillsService.resetInstance()` before each test

**Teardown Pattern:**
- Always cleanup temp directories: `await fs.rm(tempDir, { recursive: true, force: true })`
- Clear mocks: `vi.clearAllMocks()`

**Assertion Pattern:**
- Use `expect()` for assertions
- Chaining: `expect(result).toHaveLength(1)`, `expect(result).toBeDefined()`
- Custom matchers: `expect(result.skills['test-skill']).toBeDefined()`

## Mocking

**Framework:** Vitest built-in (`vi`)

**Patterns:**
```typescript
// Mock a module
vi.mock('../source/modules/commands/registry.js', () => ({
  commandRegistry: {
    get: vi.fn(),
  },
}));

// Mock a function
const mockAppendLine = vi.fn();
const mockHandleError = vi.fn();

// Mock return values
vi.mocked(commandRegistry.get).mockReturnValue({
  id: '/my-custom',
  isCustomCommand: true,
});

// Clear mocks
beforeEach(() => {
  vi.clearAllMocks();
});
```

**What to Mock:**
- External dependencies: file system, network calls
- Module imports: `vi.mock()` for entire modules
- React hooks: Use `renderHook` from `@testing-library/react` (not observed in current tests)
- Singleton instances: Reset with `resetInstance()` methods

**What NOT to Mock:**
- Pure functions
- Data transformation logic
- Type definitions

## Fixtures and Factories

**Test Data:**
```typescript
// Inline fixture creation
const skillDir = path.join(tempDir, '.nuvin', 'skills', 'test-skill');
await fs.mkdir(skillDir, { recursive: true });
await fs.writeFile(
  path.join(skillDir, 'SKILL.md'),
  `---
name: test-skill
description: A test skill for unit testing
---

# Test Skill

This is a test skill.
`,
);
```

**Location:**
- No dedicated fixtures directory
- Fixtures created inline in tests
- Some fixtures in `packages/nuvin-core/src/tests/message-flow/fixtures/`

**Factory Pattern:**
- Use helper functions for complex setup
- Example: `scanAvailableSessions(1, undefined, currentProfile)`

## Coverage

**Requirements:** No enforced coverage target

**View Coverage:**
```bash
# Run tests with coverage (Vitest default)
pnpm --filter @nuvin/nuvin-cli test --coverage
```

**Coverage Configuration:**
- Not explicitly configured in `vitest.config.ts`
- Vitest default coverage reporting available

## Test Types

**Unit Tests:**
- Scope: Individual functions, classes, hooks
- Approach: Isolated logic with mocked dependencies
- Examples:
  - `packages/nuvin-cli/tests/skills-service.test.ts`
  - `packages/nuvin-cli/tests/command-queue.test.ts`
  - `packages/nuvin-cli/source/utils/__tests__/auto-export.test.ts`

**Integration Tests:**
- Scope: Multiple components working together
- Approach: Real dependencies where possible
- Examples:
  - `packages/nuvin-cli/tests/skills-integration.test.ts`
  - `packages/nuvin-cli/tests/orchestrator-manager.test.ts`

**E2E Tests:**
- Scope: Full application flow
- Framework: Custom E2E runner
- Script: `scripts/e2e-acp.ts`
- Run command: `pnpm test:e2e:acp`
- Requires build first: `pnpm run build && npx tsx scripts/e2e-acp.ts`

**Component Tests:**
- Scope: React/Ink components
- Framework: Vitest with `@vitest/browser` and `@testing-library/react`
- File pattern: `*.test.tsx`
- Examples:
  - `packages/nuvin-cli/tests/chat-display.merge.test.tsx`
  - `packages/nuvin-cli/tests/focus-context.tab-index.test.tsx`
  - `packages/nuvin-cli/tests/text-input.multiline.test.tsx`
  - `packages/nuvin-cli/tests/file-diff-view.snapshot.test.tsx`

## Common Patterns

**Async Testing:**
```typescript
it('should discover skills from .nuvin/skills directory', async () => {
  const result = await skillsService.discover(tempDir);
  expect(result.skills['test-skill']).toBeDefined();
});
```

**Error Testing:**
```typescript
it('should report error for invalid frontmatter', async () => {
  const result = await skillsService.discover(tempDir);
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0].type).toBe('invalid-frontmatter');
});
```

**Snapshot Testing:**
```typescript
// Used in file-diff-view.snapshot.test.tsx
// Vitest snapshot assertions
expect(component).toMatchSnapshot();
```

**Type Testing:**
```typescript
// nuvin-core uses --typecheck flag
// Validates TypeScript types during test runs
pnpm --filter @nuvin/nuvin-core test  # Runs with type checking
```

**Validation Testing:**
```typescript
it('should validate valid frontmatter', () => {
  const result = validateSkillFrontmatter({
    name: 'valid-skill',
    description: 'A valid skill description',
  });

  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.name).toBe('valid-skill');
  }
});
```

## Test Environment

**Node Environment:**
- Default: `environment: 'node'` (configured in `vitest.config.ts`)
- For browser/component tests: `@vitest/browser` available

**React Compiler:**
- Babel plugin: `babel-plugin-react-compiler`
- Configured in `vitest.config.ts` for React tests

**Markdown Loader:**
- Custom transform for `.md` files
- Returns markdown content as string

**Path Aliases:**
- `@/*` maps to `source/*` in tests
- Same as source code configuration

## Test Exclusions

**Excluded from Vitest:**
- `tests/inputArea.test.ts` (uses AVA)
- `tests/utils.test.ts` (uses AVA)

**Why:** These tests use AVA framework and haven't been migrated to Vitest

## Testing Best Practices Observed

1. **Isolation:** Each test sets up fresh state with `beforeEach`
2. **Cleanup:** Temp directories cleaned up in `afterEach`
3. **Descriptive names:** Test names clearly describe what is being tested
4. **Arrange-Act-Assert:** Tests follow this pattern implicitly
5. **Type safety:** Tests use TypeScript and validate types
6. **Mock management:** Mocks cleared between tests
7. **Singleton handling:** Singletons reset before each test

---

*Testing analysis: 2025-03-19*
