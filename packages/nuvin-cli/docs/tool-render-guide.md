# Tool Rendering System Guide

This document explains the unified tool rendering architecture introduced in the ToolCallViewer refactor.

## Overview

The tool rendering system uses a registry-based approach where all tool configurations are centralized in `source/components/toolRegistry.ts`. Each tool can customize how it renders its four phases: header, params, result, and status.

## Architecture

### Four Rendering Phases

Every tool render goes through four phases:

1. **Header** - Tool name and inline summary (e.g., "⚙ Edit README.md")
2. **Params** - Expanded parameter details (e.g., function arguments as JSON)
3. **Result** - Tool execution result content (e.g., file content, API response)
4. **Status** - Status line with completion message (e.g., "✓ Completed")

### Default Renderers

The system provides sensible defaults in `DefaultToolRenderer.ts`:
- `defaultRenderHeader` - Shows tool icon and display name
- `defaultRenderParams` - Renders parameters as formatted JSON
- `defaultRenderResult` - Shows result content with truncation
- `defaultRenderStatus` - Displays success/error status with duration

## Configuration

### Basic Tool Configuration

```typescript
const TOOL_REGISTRY: Record<string, ToolConfig> = {
  file_read: {
    displayName: 'Read',
    statusText: {
      success: (r) => `Read ${lineCount} lines`,
      error: 'Read failed',
    },
    collapsedByDefault: true,
  },
};
```

### ToolConfig Options

```typescript
type ToolConfig = {
  // Display name shown in header (e.g., "Edit", "Read", "Run")
  displayName: string | ((ctx: ToolRenderContext) => string);
  
  // Status text configuration
  statusText?: {
    success?: string | ((result: ToolExecutionResult) => string);
    error?: string;
  };
  
  // Where to show status line: 'top' (default) or 'bottom'
  statusPosition?: 'top' | 'bottom';
  
  // Parameter keys to exclude from default params renderer
  // These are typically shown in the header or handled by custom renderers
  excludeParams?: string[];
  
  // Custom renderers (see below)
  renderHeader?: RenderFn | null;
  renderParams?: RenderFn | null;
  renderResult?: RenderFn | null;
  renderStatus?: RenderFn | null;
  
  // Collapse result content by default
  collapsedByDefault?: boolean;
  
  // Hide entire tool until it has a result (e.g., ask_user_tool)
  hideUntilComplete?: boolean;
};
```

### Excluding Parameters from Display

The `excludeParams` field controls which parameters are hidden from the default params renderer. This is useful for:
- Parameters already shown in the header (e.g., `cmd`, `path`, `query`)
- Internal metadata (e.g., `description`)
- Parameters handled by custom renderers (e.g., `old_text`, `new_text` in file_edit)

**Example:**

```typescript
bash_tool: {
  displayName: 'Run',
  excludeParams: ['cmd', 'cwd', 'description'],
  // cmd is shown in header, so we exclude it from params
  // cwd and description are internal metadata
}
```

**Result:**
```
⚙ Run npm install
  │  timeoutMs: 30000    ← Only non-excluded params shown
  └─ Executed (exit 0)
```

**Without excludeParams:**
```
⚙ Run npm install
  │  cmd: npm install    ← Redundant - already in header
  │  cwd: /home/user
  │  description: Install dependencies
  │  timeoutMs: 30000
  └─ Executed (exit 0)
```

## Custom Renderers

### Understanding RenderFn

```typescript
type RenderFn = (ctx: ToolRenderContext) => React.ReactNode | null;

type ToolRenderContext = {
  toolCall: ToolCall;
  toolResult?: ToolExecutionResult;
  toolState: ComputedToolState;
  args: Record<string, unknown>;
  theme: Theme;
  cols: number;
  config: ToolConfig;
};
```

### Renderer Values

Each render function can be:

1. **`undefined`** (default) - Use the default renderer for this phase
2. **`null`** - Skip rendering this phase entirely
3. **Function** - Use a custom renderer

#### Example: Using null to skip sections

```typescript
file_edit: {
  displayName: 'Edit',
  renderParams: fileEditRenderer.params,  // Custom diff view
  renderResult: null,                     // No separate result section
}
```

This is useful when:
- The params already show everything (like file_edit showing the diff)
- A phase doesn't make sense for a tool
- You want minimal output

### Custom Renderer Examples

#### Example 1: Custom Result Renderer

```typescript
// In source/components/ToolCallViewer/renderers/myToolRenderer.tsx
export const myToolRenderer = {
  result: ((ctx: ToolRenderContext) => {
    const { toolResult, theme } = ctx;
    
    if (!toolResult?.result) {
      return null;
    }
    
    return (
      <Box flexDirection="column" marginLeft={2}>
        <Text color={theme.tokens.green}>
          Custom result: {toolResult.result}
        </Text>
      </Box>
    );
  }) as RenderFn,
};

// In toolRegistry.ts
import { myToolRenderer } from './ToolCallViewer/renderers/myToolRenderer.js';

const TOOL_REGISTRY: Record<string, ToolConfig> = {
  my_tool: {
    displayName: 'My Tool',
    renderResult: myToolRenderer.result,
  },
};
```

#### Example 2: Using Metadata Instead of Result

Some tools store meaningful data in `metadata` rather than `result`. For example, `ask_user_tool`:

```typescript
export const askUserRenderer = {
  result: ((ctx: ToolRenderContext) => {
    const { toolCall, toolResult, theme } = ctx;
    const metadata = toolResult?.metadata as AskUserMetadata | undefined;

    // Check metadata, not result
    if (!metadata?.answers || Object.keys(metadata.answers).length === 0) {
      return <Text dimColor>Waiting for user response...</Text>;
    }

    const args = parseToolArguments(toolCall.function.arguments);
    const questions = args.questions as Question[];
    const answers = metadata.answers;

    return (
      <Box flexDirection="column" marginLeft={2}>
        {questions.map((q, idx) => (
          <Box key={idx} flexDirection="column">
            <Text bold>{q.header}: {q.question}</Text>
            <Text color={theme.tokens.green}>→ {answers[`q${idx}`]}</Text>
          </Box>
        ))}
      </Box>
    );
  }) as RenderFn,
};
```

## Important Implementation Details

### Metadata vs Result

Tools can store data in two places:

1. **`result`** - The main result string
2. **`metadata`** - Structured data object

When creating a custom renderer that uses `metadata`, remember:

- The `showResult` logic in `ToolCallViewer` checks if `result` is truthy OR if a custom result renderer exists
- If your tool stores data in metadata with an empty result string, you MUST provide a custom `renderResult` function
- Set `renderResult: null` if you don't want any result section (e.g., file_edit)

### Test Data Structure

When writing snapshot tests, ensure your mock data matches the renderer's expectations:

```typescript
// ✅ Correct - metadata in the right place
const toolResult = createMockToolResult(
  'ask_user_tool',
  '',  // Empty result string
  {
    answers: { q0: "answer" }  // Data in metadata
  }
);

// ❌ Wrong - data in result instead of metadata
const toolResult = createMockToolResult(
  'ask_user_tool',
  JSON.stringify({ question: "Q", answer: "A" })
);
```

## Adding a New Tool

### Step 1: Define the Configuration

Add an entry to `TOOL_REGISTRY` in `toolRegistry.ts`:

```typescript
const TOOL_REGISTRY: Record<string, ToolConfig> = {
  my_new_tool: {
    displayName: 'My Tool',
    statusText: {
      success: 'Completed successfully',
      error: 'Failed',
    },
  },
};
```

### Step 2: (Optional) Create Custom Renderers

If you need custom rendering, create a renderer file:

```typescript
// source/components/ToolCallViewer/renderers/myToolRenderer.tsx
import type { ToolRenderContext, RenderFn } from '../types.js';

export const myToolRenderer = {
  params: ((ctx: ToolRenderContext) => {
    // Custom params rendering
    return <Box>...</Box>;
  }) as RenderFn,
  
  result: ((ctx: ToolRenderContext) => {
    // Custom result rendering
    return <Box>...</Box>;
  }) as RenderFn,
};
```

### Step 3: Register Custom Renderers

```typescript
import { myToolRenderer } from './ToolCallViewer/renderers/myToolRenderer.js';

const TOOL_REGISTRY: Record<string, ToolConfig> = {
  my_new_tool: {
    displayName: 'My Tool',
    renderParams: myToolRenderer.params,
    renderResult: myToolRenderer.result,
  },
};
```

### Step 4: Add Snapshot Tests

Create a snapshot test file following the pattern in `tests/components/ToolCallViewer/snapshots/`:

```typescript
describe('my_new_tool - Snapshot Tests', () => {
  it('renders successful execution', () => {
    const toolCall = createMockToolCall('my_new_tool', {
      param1: 'value1',
    });
    const toolResult = createMockToolResult('my_new_tool', 'Success');
    const resultMessage = createMockToolResultMessage(toolResult, 123);

    const { lastFrame } = render(
      <ToolCallViewer
        toolCall={toolCall}
        toolResult={resultMessage}
        toolState="success"
        messageId="msg-1"
      />
    );

    expect(lastFrame()).toMatchSnapshot();
  });
});
```

## Real-World Examples

### file_edit - Custom params, no result

```typescript
file_edit: {
  displayName: 'Edit',
  renderParams: fileEditRenderer.params,  // Shows diff in params
  renderResult: null,                     // No separate result needed
}
```

### ask_user_tool - Uses metadata, hidden until complete

```typescript
ask_user_tool: {
  displayName: 'Ask user',
  hideUntilComplete: true,                // Don't show until answered
  renderResult: askUserRenderer.result,   // Custom renderer for Q&A
}
```

### file_read - Simple with dynamic status

```typescript
file_read: {
  displayName: 'Read',
  statusText: {
    success: (r) => {
      const lineCount = r.result.split(/\r?\n/).length;
      return `Read ${lineCount} lines`;
    },
  },
  collapsedByDefault: true,
}
```

## Migration Guide

### Before (Old System)

Adding a new tool required editing multiple files:
- `statusStrategies/myToolStatus.ts` - Status computation
- `params/myToolParams.tsx` - Params rendering
- Tool-specific result renderer
- Main ToolCallViewer switch statements

### After (New System)

Adding a new tool requires editing ONE file:
- `toolRegistry.ts` - All configuration and custom renderers

The architecture change means:
- **State computation** happens once in `mergeToolCallsWithResultsCached`
- **Configuration** is centralized in `toolRegistry.ts`
- **Rendering** uses composable render functions

## Troubleshooting

### Snapshot showing empty result?

Check:
1. Is `renderResult` set to `null`? (Intentionally skipping result)
2. Does your tool store data in `metadata` instead of `result`?
3. If using metadata, do you have a custom `renderResult` function?
4. Is `collapsedByDefault: true` hiding the result?

### Custom renderer not being called?

Check:
1. Did you register it in `TOOL_REGISTRY`?
2. Did you import the renderer in `toolRegistry.ts`?
3. Is the tool name matching exactly?
4. For result renderers, is `showResult` true in `ToolCallViewer`?

### Tool not showing at all?

Check:
1. Is `hideUntilComplete: true` set?
2. Is the tool state 'running' with `hideUntilComplete`?
3. Are you in the tool approval flow?
4. Is there a special case early return in `ToolCallViewer`?

## Best Practices

1. **Use defaults when possible** - Only customize what you need
2. **Set `renderResult: null`** when params show everything
3. **Document metadata structure** in renderer comments
4. **Write snapshot tests** for all custom renderers
5. **Keep renderers pure** - No side effects, only rendering
6. **Test with realistic data** - Use actual tool response structures

## Related Files

- `source/components/toolRegistry.ts` - Main registry
- `source/components/ToolCallViewer/types.ts` - Type definitions
- `source/components/ToolCallViewer/DefaultToolRenderer.tsx` - Default renderers
- `source/components/ToolCallViewer/renderers/` - Custom renderers
- `tests/components/ToolCallViewer/snapshots/` - Snapshot tests
