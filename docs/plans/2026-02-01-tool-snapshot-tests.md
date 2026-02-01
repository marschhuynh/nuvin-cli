# ToolCallViewer Snapshot Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create comprehensive snapshot tests for all 14 tools to verify visual rendering and prevent regressions

**Architecture:** One snapshot test file per tool, using mock factories for reusable test data. Each test covers success case + edge cases (empty, long content, special chars). Tests use ink-testing-library for rendering.

**Tech Stack:** Vitest, ink-testing-library, @nuvin/nuvin-core types

---

## Task 1: Create Mock Factory Helpers

**Files:**
- Create: `packages/nuvin-cli/tests/helpers/toolMocks.ts`

**Step 1: Create the mock factory file**

```typescript
import type { ToolCall, ToolExecutionResult } from '@nuvin/nuvin-core';
import type { MessageLine } from '@/adapters/index.js';

/**
 * Create a mock ToolCall with given tool name and arguments
 */
export function createMockToolCall(
  name: string,
  args: Record<string, unknown>,
  id = 'test-call-1'
): ToolCall {
  return {
    id,
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

/**
 * Create a mock ToolExecutionResult
 */
export function createMockToolResult(
  name: string,
  result: unknown,
  metadata?: Record<string, unknown>
): ToolExecutionResult {
  return {
    name,
    status: 'success',
    type: 'text',
    result,
    metadata,
  };
}

/**
 * Create a mock error ToolExecutionResult
 */
export function createMockToolError(
  name: string,
  error: string,
  metadata?: Record<string, unknown>
): ToolExecutionResult {
  return {
    name,
    status: 'error',
    type: 'text',
    result: error,
    metadata,
  };
}

/**
 * Create a mock MessageLine with tool result
 */
export function createMockToolResultMessage(
  toolResult: ToolExecutionResult,
  duration?: number
): MessageLine {
  return {
    id: 'msg-result-1',
    type: 'tool_result',
    content: '',
    metadata: {
      toolResult,
      duration,
    },
  };
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/nuvin-cli/tests/helpers/toolMocks.ts
git commit -m "test: add mock factory helpers for tool snapshot tests"
```

---

## Task 2: Create Snapshots Directory and Shared Test Setup

**Files:**
- Create: `packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/test-setup.ts`

**Step 1: Create snapshots directory**

```bash
mkdir -p packages/nuvin-cli/tests/components/ToolCallViewer/snapshots
```

**Step 2: Create shared test setup file**

```typescript
import { vi } from 'vitest';

/**
 * Mock all contexts and hooks used by ToolCallViewer
 */
export function setupToolCallViewerMocks() {
  // Mock dimensions
  vi.mock('@/hooks/useStdoutDimensions.ts', () => ({
    useStdoutDimensions: vi.fn().mockReturnValue({ cols: 100, rows: 30 }),
  }));

  // Mock theme
  vi.mock('@/contexts/ThemeContext.js', () => ({
    useTheme: vi.fn().mockReturnValue({
      theme: {
        messageTypes: { tool: 'blue' },
        status: { success: 'green', error: 'red', idle: 'yellow', warning: 'yellow' },
        colors: { warning: 'yellow', muted: 'gray', textDim: 'gray' },
        tokens: { gray: 'gray', red: 'red' },
      },
    }),
  }));

  // Mock tool approval
  vi.mock('@/contexts/ToolApprovalContext.js', () => ({
    useToolApproval: vi.fn().mockReturnValue({ pendingApprovalTools: [] }),
  }));
}
```

**Step 3: Commit**

```bash
git add packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/test-setup.ts
git commit -m "test: add shared test setup for snapshot tests"
```

---

## Task 3: Create file_read Snapshot Tests

**Files:**
- Create: `packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/file-read.snapshot.test.tsx`

**Step 1: Create the test file**

```typescript
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { ToolCallViewer } from '@/components/ToolCallViewer/index.js';
import { createMockToolCall, createMockToolResult, createMockToolResultMessage } from '../../../helpers/toolMocks.js';
import { setupToolCallViewerMocks } from './test-setup.js';

setupToolCallViewerMocks();

describe('file_read - Snapshot Tests', () => {
  it('renders successful file read with TypeScript content', () => {
    const content = `import React from 'react';\nimport { Box, Text } from 'ink';\n\nexport const MyComponent = () => {\n  return <Box><Text>Hello World</Text></Box>;\n};`;

    const toolCall = createMockToolCall('file_read', {
      path: 'src/components/MyComponent.tsx',
      lineStart: 1,
      lineEnd: 6
    });
    const toolResult = createMockToolResult('file_read', content);
    const resultMessage = createMockToolResultMessage(toolResult, 45);

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

  it('renders file read with empty file', () => {
    const toolCall = createMockToolCall('file_read', { path: 'empty.txt' });
    const toolResult = createMockToolResult('file_read', '');
    const resultMessage = createMockToolResultMessage(toolResult, 12);

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

  it('renders file read with long content (50+ lines)', () => {
    const longContent = Array(50).fill(0).map((_, i) => `Line ${i + 1}: This is a line of text in the file`).join('\n');

    const toolCall = createMockToolCall('file_read', { path: 'long-file.txt' });
    const toolResult = createMockToolResult('file_read', longContent);
    const resultMessage = createMockToolResultMessage(toolResult, 230);

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

  it('renders file read with special characters', () => {
    const content = '// Special chars: 你好 世界 🚀 ✨\n// Symbols: @#$%^&*()_+-={}[]|\\:";\'<>?,./';

    const toolCall = createMockToolCall('file_read', { path: 'special.txt' });
    const toolResult = createMockToolResult('file_read', content);
    const resultMessage = createMockToolResultMessage(toolResult, 18);

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

**Step 2: Run the tests to generate snapshots**

Run: `cd packages/nuvin-cli && pnpm test file-read.snapshot`
Expected: 4 snapshots written

**Step 3: Verify snapshots look correct**

Check: `packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/__snapshots__/file-read.snapshot.test.tsx.snap`

**Step 4: Commit**

```bash
git add packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/file-read.snapshot.test.tsx
git add packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/__snapshots__/file-read.snapshot.test.tsx.snap
git commit -m "test: add file_read snapshot tests"
```

---

## Task 4: Create file_edit Snapshot Tests

**Files:**
- Create: `packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/file-edit.snapshot.test.tsx`

**Step 1: Create the test file**

```typescript
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { ToolCallViewer } from '@/components/ToolCallViewer/index.js';
import { createMockToolCall, createMockToolResult, createMockToolResultMessage } from '../../../helpers/toolMocks.js';
import { setupToolCallViewerMocks } from './test-setup.js';

setupToolCallViewerMocks();

describe('file_edit - Snapshot Tests', () => {
  it('renders successful file edit with diff view', () => {
    const oldText = 'const value = "hello";';
    const newText = 'const value = "world";';

    const toolCall = createMockToolCall('file_edit', {
      file_path: 'src/config.ts',
      old_text: oldText,
      new_text: newText,
    });
    const toolResult = createMockToolResult('file_edit', 'File edited successfully', {
      bytesWritten: 22,
      path: 'src/config.ts',
      lineNumbers: {
        oldStartLine: 5,
        oldEndLine: 5,
        newStartLine: 5,
        newEndLine: 5,
        oldLineCount: 1,
        newLineCount: 1,
      },
    });
    const resultMessage = createMockToolResultMessage(toolResult, 78);

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

  it('renders multi-line file edit', () => {
    const oldText = `function foo() {\n  console.log("old");\n}`;
    const newText = `function foo() {\n  console.log("new");\n  console.log("added");\n}`;

    const toolCall = createMockToolCall('file_edit', {
      file_path: 'src/utils.ts',
      old_text: oldText,
      new_text: newText,
    });
    const toolResult = createMockToolResult('file_edit', 'File edited successfully', {
      bytesWritten: 65,
    });
    const resultMessage = createMockToolResultMessage(toolResult, 95);

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

  it('renders file edit with no bytes metadata', () => {
    const toolCall = createMockToolCall('file_edit', {
      file_path: 'README.md',
      old_text: '# Old Title',
      new_text: '# New Title',
    });
    const toolResult = createMockToolResult('file_edit', 'File edited successfully');
    const resultMessage = createMockToolResultMessage(toolResult, 42);

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

**Step 2: Run tests and generate snapshots**

Run: `cd packages/nuvin-cli && pnpm test file-edit.snapshot`
Expected: 3 snapshots written

**Step 3: Commit**

```bash
git add packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/file-edit.snapshot.test.tsx
git add packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/__snapshots__/file-edit.snapshot.test.tsx.snap
git commit -m "test: add file_edit snapshot tests"
```

---

## Task 5: Create bash_tool Snapshot Tests

**Files:**
- Create: `packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/bash-tool.snapshot.test.tsx`

**Step 1: Create the test file**

```typescript
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { ToolCallViewer } from '@/components/ToolCallViewer/index.js';
import { createMockToolCall, createMockToolResult, createMockToolResultMessage } from '../../../helpers/toolMocks.js';
import { setupToolCallViewerMocks } from './test-setup.js';

setupToolCallViewerMocks();

describe('bash_tool - Snapshot Tests', () => {
  it('renders successful bash command execution', () => {
    const output = 'total 64\ndrwxr-xr-x  12 user  staff   384 Jan 31 10:00 src\ndrwxr-xr-x   5 user  staff   160 Jan 31 10:00 tests';

    const toolCall = createMockToolCall('bash_tool', {
      cmd: 'ls -la',
      cwd: '/Users/user/project',
    });
    const toolResult = createMockToolResult('bash_tool', output, { code: 0 });
    const resultMessage = createMockToolResultMessage(toolResult, 156);

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

  it('renders bash command with empty output', () => {
    const toolCall = createMockToolCall('bash_tool', {
      cmd: 'touch newfile.txt',
    });
    const toolResult = createMockToolResult('bash_tool', '', { code: 0 });
    const resultMessage = createMockToolResultMessage(toolResult, 34);

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

  it('renders bash command with long multi-line output', () => {
    const longOutput = Array(30).fill(0).map((_, i) => `[${i + 1}] Processing item ${i + 1}...`).join('\n');

    const toolCall = createMockToolCall('bash_tool', {
      cmd: 'npm install',
    });
    const toolResult = createMockToolResult('bash_tool', longOutput, { code: 0 });
    const resultMessage = createMockToolResultMessage(toolResult, 8950);

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

**Step 2: Run tests and generate snapshots**

Run: `cd packages/nuvin-cli && pnpm test bash-tool.snapshot`
Expected: 3 snapshots written

**Step 3: Commit**

```bash
git add packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/bash-tool.snapshot.test.tsx
git add packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/__snapshots__/bash-tool.snapshot.test.tsx.snap
git commit -m "test: add bash_tool snapshot tests"
```

---

## Task 6: Create Remaining Tool Snapshot Tests

**Files:**
- Create: `packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/file-new.snapshot.test.tsx`
- Create: `packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/web-search.snapshot.test.tsx`
- Create: `packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/web-fetch.snapshot.test.tsx`
- Create: `packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/ls-tool.snapshot.test.tsx`
- Create: `packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/glob-tool.snapshot.test.tsx`
- Create: `packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/grep-tool.snapshot.test.tsx`
- Create: `packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/todo-write.snapshot.test.tsx`
- Create: `packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/assign-task.snapshot.test.tsx`
- Create: `packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/lsp.snapshot.test.tsx`
- Create: `packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/skill.snapshot.test.tsx`
- Create: `packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/ask-user-tool.snapshot.test.tsx`

Follow the same pattern as Tasks 3-5:
1. Create test file with 3-4 test cases per tool
2. Run tests to generate snapshots
3. Verify snapshots
4. Commit

Each tool should test:
- Success case with realistic data
- Empty/minimal result edge case
- Long content edge case
- Special characters (if relevant)

**Step 1: Create all remaining test files**

Use the pattern from Tasks 3-5, adapting args and metadata for each tool.

**Step 2: Run all tests**

Run: `cd packages/nuvin-cli && pnpm test snapshot`
Expected: All snapshot tests pass

**Step 3: Commit all at once**

```bash
git add packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/*.snapshot.test.tsx
git add packages/nuvin-cli/tests/components/ToolCallViewer/snapshots/__snapshots__/*.snap
git commit -m "test: add snapshot tests for remaining tools"
```

---

## Task 7: Verify All Tests Pass

**Step 1: Run full test suite**

Run: `cd packages/nuvin-cli && pnpm test`
Expected: All tests pass (including new snapshot tests)

**Step 2: Run TypeScript check**

Run: `cd packages/nuvin-cli && pnpm exec tsc --noEmit`
Expected: No errors

**Step 3: Final commit if any fixes needed**

```bash
git add .
git commit -m "test: fix any issues found during full test run"
```

---

## Success Criteria

After completing all tasks:

- [ ] Mock factory helpers created (`toolMocks.ts`)
- [ ] Shared test setup created (`test-setup.ts`)
- [ ] 14 snapshot test files created (one per tool)
- [ ] Each tool has 3-4 snapshot tests covering success + edge cases
- [ ] All snapshot files generated in `__snapshots__/` folder
- [ ] All tests pass
- [ ] TypeScript compiles without errors
