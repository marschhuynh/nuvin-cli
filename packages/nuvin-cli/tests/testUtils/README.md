# Test Utilities

This directory contains shared utilities for testing React components in the Nuvin CLI.

## Context Mocks (`contextMocks.ts`)

A centralized location for all React context mocks used in snapshot tests. This ensures consistency across tests and makes it easy to update mock values.

### Basic Usage

The simplest way to use the context mocks is to call `setupContextMocks()` at the top of your test file:

```typescript
import { render } from 'ink-testing-library';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupContextMocks } from './testUtils/contextMocks';
import { MyComponent } from '../source/components/MyComponent';

// Set up all context mocks with default values
setupContextMocks();

describe('MyComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    const { lastFrame } = render(<MyComponent />);
    expect(lastFrame()).toMatchSnapshot();
  });
});
```

### Customizing Mock Values

You can customize mock values in several ways:

#### 1. Using `setupContextMocksWithOverrides()`

Set custom values when setting up mocks:

```typescript
import { setupContextMocksWithOverrides } from './testUtils/contextMocks';

setupContextMocksWithOverrides({
  theme: {
    colors: { accent: 'blue' }
  },
  altMode: {
    altMode: true
  },
  stdoutDimensions: {
    cols: 120,
    rows: 40
  },
  focus: {
    isFocused: true
  },
});

describe('MyComponent', () => {
  it('renders with custom context values', () => {
    const { lastFrame } = render(<MyComponent />);
    expect(lastFrame()).toMatchSnapshot();
  });
});
```

#### 2. Overriding in Individual Tests

Override mocks for specific tests using `vi.mocked()`:

```typescript
import { setupContextMocks } from './testUtils/contextMocks';
import { useTheme } from '../source/contexts/ThemeContext';

setupContextMocks();

describe('MyComponent', () => {
  it('renders with custom theme in this test only', async () => {
    const themeModule = await import('../source/contexts/ThemeContext');
    vi.mocked(themeModule.useTheme).mockReturnValue({
      theme: {
        ...mockTheme,
        colors: { ...mockTheme.colors, accent: 'purple' }
      },
      getColor: vi.fn((path: string) => 'purple'),
    });

    const { lastFrame } = render(<MyComponent />);
    expect(lastFrame()).toMatchSnapshot();
  });
});
```

#### 3. Using Mock Factories

Create custom mock functions with the factory helpers:

```typescript
import { createThemeMock, createAltModeMock } from './testUtils/contextMocks';

vi.mock('../source/contexts/ThemeContext.js', () => ({
  useTheme: createThemeMock({
    colors: { accent: 'magenta' }
  }),
}));

vi.mock('../source/contexts/AltModeContext', () => ({
  useAltMode: createAltModeMock({
    altMode: true
  }),
}));
```

### Available Mocks

#### ThemeContext

```typescript
mockTheme: Theme
createThemeMock(overrides?: Partial<Theme>): () => ThemeContextValue
```

The theme mock includes all theme properties:
- `tokens` - Color token values
- `colors` - Named color mappings
- `status` - Status colors (success, error, etc.)
- `messageTypes` - Message type colors
- `modal`, `help`, `auth`, `footer`, `input`, `history`, `toolApproval`, etc.

#### AltModeContext

```typescript
mockAltMode: { altMode: boolean }
createAltModeMock(overrides?: Partial<AltModeContextType>): () => AltModeContextType
```

#### ToolApprovalContext

```typescript
mockToolApproval: ToolApprovalState
createToolApprovalMock(overrides?: Partial<ToolApprovalState>): () => ToolApprovalState
```

Includes:
- `toolApprovalMode: boolean`
- `pendingApprovalTools: ToolCall[]`
- `pendingApprovalBatchTotal: number`
- `sessionApprovedTools: Set<string>`
- Functions: `setToolApprovalMode`, `addSessionApprovedTool`, `clearSessionApprovedTools`, `handleSingleToolApproval`

#### StdoutDimensionsContext

```typescript
mockStdoutDimensions: { cols: number; rows: number }
createStdoutDimensionsMock(overrides?: Partial<StdoutDimensions>): () => StdoutDimensions
```

Default: `{ cols: 80, rows: 24 }`

#### InputContext

```typescript
mockUseFocus: FocusContextValue
mockUseInput: MockedFunction
mockUseMouse: MockedFunction

createUseFocusMock(overrides?: Partial<FocusContextValue>): () => FocusContextValue
```

Focus mock includes:
- `id: string`
- `isFocused: boolean`
- `focus: () => void`
- `clearFocus: () => void`

### Example: Migrating Existing Tests

**Before:**

```typescript
// MessageLine.snapshot.test.tsx
vi.mock('../source/contexts/ThemeContext.js', () => ({
  useTheme: () => ({
    theme: {
      messageTypes: {
        user: 'cyan',
        assistant: 'green',
        // ... many more lines
      },
      colors: {
        textDim: 'gray',
        // ... many more lines
      },
      // ... many more sections
    },
  }),
}));

vi.mock('../source/contexts/AltModeContext', () => ({
  useAltMode: () => ({ altMode: false }),
}));

// ... more mocks
```

**After:**

```typescript
// MessageLine.snapshot.test.tsx
import { setupContextMocks } from './testUtils/contextMocks';

setupContextMocks();
```

That's it! All mocks are set up with sensible defaults.

### Best Practices

1. **Use `setupContextMocks()` by default** - Start with the default setup and only customize when needed.

2. **Clear mocks between tests** - Always use `beforeEach(() => { vi.clearAllMocks(); })` to reset mock function call counts.

3. **Override sparingly** - Only override mock values when testing specific behavior that depends on those values.

4. **Keep snapshots stable** - The default mock values are designed to produce stable, readable snapshots.

5. **Document custom overrides** - If a test needs custom context values, add a comment explaining why.

### Troubleshooting

**Problem:** Mock functions aren't being called

```typescript
// Make sure to clear mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
```

**Problem:** Context values don't update in tests

```typescript
// Use vi.mocked() to update existing mocks
const themeModule = await import('../source/contexts/ThemeContext');
vi.mocked(themeModule.useTheme).mockReturnValue({ ... });
```

**Problem:** TypeScript errors with mock values

```typescript
// Import types from the context files
import type { Theme } from '../source/theme';

// Use type assertion if needed
const customTheme: Theme = { ...mockTheme, /* overrides */ };
```

## Adding New Test Utilities

When adding new test utilities:

1. Create the utility file in `tests/testUtils/`
2. Export the utilities from `tests/testUtils/index.ts`
3. Document usage in this README
4. Update existing tests to use the new utilities where applicable
