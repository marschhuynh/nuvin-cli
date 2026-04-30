# Tool Approval Renderer Registry

This document explains how to customize the display of tool parameters in the Tool Approval Prompt.

## Overview

The Tool Approval Prompt uses a registry-based system to render tool parameters. This makes it easy to add or modify how different tools display their parameters without changing the core approval logic.

## File Location

`packages/nuvin-cli/source/components/ToolApprovalPrompt/tool-renderers.tsx`

## Adding or Modifying Tool Renderers

### Option 1: Configure Parameter Display

For simple parameter filtering and formatting, add an entry to `TOOL_REGISTRY`:

```typescript
const TOOL_REGISTRY: Record<string, ToolConfig> = {
  your_tool_name: {
    parameters: [
      { key: 'param1', label: 'Parameter 1' },
      { key: 'param2', label: 'Parameter 2' },
      { key: 'description', hide: true }, // Hide this parameter
      { 
        key: 'param3', 
        label: 'Custom Label',
        format: (value) => `Custom: ${value}` // Custom formatter
      },
    ],
  },
};
```

#### ParameterConfig Options

- `key` (required): The parameter name from the tool definition
- `label` (optional): Display label (defaults to the key name)
- `format` (optional): Custom formatter function for the value
- `hide` (optional): Set to `true` to hide this parameter

### Option 2: Custom Renderer Component

For complex rendering (like file diffs, multi-line content), provide a custom renderer:

```typescript
const TOOL_REGISTRY: Record<string, ToolConfig> = {
  your_tool_name: {
    customRenderer: ({ toolCall }: ToolRendererProps) => {
      const args = parseToolArguments(toolCall);
      
      return (
        <Box flexDirection="column">
          <Text>Custom rendering logic here</Text>
          <Text>{args.someParam}</Text>
        </Box>
      );
    },
    showDefaultParams: false, // Hide default parameter rendering
  },
};
```

### Option 3: Hybrid Approach

Combine custom rendering with parameter display:

```typescript
const TOOL_REGISTRY: Record<string, ToolConfig> = {
  your_tool_name: {
    parameters: [
      { key: 'param1', label: 'Parameter 1' },
    ],
    customRenderer: ({ toolCall }: ToolRendererProps) => {
      // Additional custom content below parameters
      return <YourCustomComponent toolCall={toolCall} />;
    },
  },
};
```

## Examples

### Example 1: bash_tool

```typescript
bash_tool: {
  parameters: [
    { key: 'cmd', label: 'Command' },
    { key: 'cwd', label: 'Working Directory' },
    { key: 'timeoutMs', label: 'Timeout (ms)' },
    { key: 'description', hide: true }, // Hidden from display
  ],
}
```

**Display:**
```
Parameters:
  Command: ls -la
  Working Directory: /home/user
  Timeout (ms): 5000
```

### Example 2: file_edit (Custom Renderer)

```typescript
file_edit: {
  customRenderer: ({ toolCall }: ToolRendererProps) => <FileEditToolContent call={toolCall} />,
  showDefaultParams: false,
}
```

Shows the file path and a custom diff view instead of raw parameters.

### Example 3: file_new (Custom Renderer)

```typescript
file_new: {
  customRenderer: ({ toolCall }: ToolRendererProps) => <FileNewToolContent call={toolCall} />,
  showDefaultParams: false,
}
```

Shows the file path and file content with line numbers for preview.

### Example 4: todo_write (Complex Custom Renderer)

```typescript
todo_write: {
  showDefaultParams: false,
  customRenderer: ({ toolCall }: ToolRendererProps) => {
    const args = parseToolArguments(toolCall);
    const todos = args.todos as Array<Todo> | undefined;
    
    return (
      <Box flexDirection="column">
        <Text>Todo Items ({todos.length}):</Text>
        {todos.slice(0, 5).map((todo, idx) => (
          <Box key={idx} marginLeft={2}>
            <Text>[{todo.status}] {todo.content}</Text>
          </Box>
        ))}
        {todos.length > 5 && <Text>... and {todos.length - 5} more</Text>}
      </Box>
    );
  },
}
```

### Example 4: Default Fallback

If a tool is not in the registry, all parameters (except `description`) are displayed:

```typescript
// For an unregistered tool:
{
  "param1": "value1",
  "param2": "value2",
  "description": "hidden"
}

// Displays:
Parameters:
  param1: value1
  param2: value2
```

## Tool Parameter Definitions Reference

Reference tool definitions from `packages/nuvin-core/src/tools/`:

- `bash_tool`: cmd, cwd, timeoutMs, description
- `file_edit`: file_path, old_text, new_text, dry_run, description
- `file_new`: file_path, content
- `file_read`: path, lineStart, lineEnd, description
- `assign_task`: agent, task, description
- `web_search`: query, count, domains, lang, region, recencyDays, description
- `web_fetch`: url, description
- `ls_tool`: path, limit
- `todo_write`: todos (array of todo objects)

## Best Practices

1. **Hide `description` parameters**: These are usually redundant in the approval UI
2. **Use clear labels**: Make parameter names user-friendly
3. **Truncate long values**: Consider formatting long strings (file paths, URLs)
4. **Show essential info**: Focus on parameters that help users make approval decisions
5. **Custom renderers for structure**: Use for complex data (diffs, arrays, objects)
6. **Keep it scannable**: Users need to quickly understand what the tool will do

## Testing Your Changes

After modifying the registry:

```bash
cd packages/nuvin-cli
pnpm build
pnpm test
```

Test the approval UI by:
1. Enabling tool approval mode
2. Triggering the tool you modified
3. Verify the display is clear and helpful
