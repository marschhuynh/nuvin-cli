import { vi } from 'vitest';

// Mock all contexts and hooks used by ToolCallViewer
vi.mock('@/hooks/useStdoutDimensions.ts', () => ({
  useStdoutDimensions: vi.fn().mockReturnValue({ cols: 100, rows: 30 }),
}));

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

vi.mock('@/contexts/ToolApprovalContext.js', () => ({
  useToolApproval: vi.fn().mockReturnValue({ pendingApprovalTools: [] }),
}));

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { ToolCallViewer } from '@/components/ToolCallViewer/index.js';
import { createMockToolCall, createMockToolResult, createMockToolResultMessage } from '../../../helpers/toolMocks.js';

describe('skill - Snapshot Tests', () => {
  it('renders successful skill load with content', () => {
    const skillContent = `# Test-Driven Development Skill

## When to Use
Use when implementing any feature or bugfix, before writing implementation code.

## Steps

1. **Write the test first**
   - Define the expected behavior
   - Write failing test cases

2. **Implement the minimum code**
   - Make the test pass
   - Keep it simple

3. **Refactor**
   - Clean up code
   - Maintain passing tests`;

    const toolCall = createMockToolCall('skill', {
      name: 'test-driven-development',
    });
    const toolResult = createMockToolResult('skill', skillContent);
    const resultMessage = createMockToolResultMessage(toolResult, 234);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders successful skill load with short content', () => {
    const skillContent = `# Quick Skill

Just a brief instruction for a simple task.`;

    const toolCall = createMockToolCall('skill', {
      name: 'quick-skill',
    });
    const toolResult = createMockToolResult('skill', skillContent);
    const resultMessage = createMockToolResultMessage(toolResult, 89);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders successful skill load with detailed instructions', () => {
    const skillContent = `# Systematic Debugging Skill

## When to Use
Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes.

## Core Principles
- Evidence before assumptions
- Reproduce before fixing
- Understand before changing

## Steps

1. **Reproduce the issue**
   - Create minimal reproduction case
   - Document exact steps
   - Note environment details

2. **Gather evidence**
   - Read error messages carefully
   - Check logs and stack traces
   - Identify affected code paths

3. **Form hypothesis**
   - What could cause this?
   - What evidence supports it?
   - What would disprove it?

4. **Test hypothesis**
   - Add debug logging
   - Use debugger breakpoints
   - Write test cases

5. **Implement fix**
   - Address root cause
   - Add regression tests
   - Verify fix works

6. **Validate**
   - Run full test suite
   - Test edge cases
   - Document the fix`;

    const toolCall = createMockToolCall('skill', {
      name: 'systematic-debugging',
    });
    const toolResult = createMockToolResult('skill', skillContent);
    const resultMessage = createMockToolResultMessage(toolResult, 456);

    const { lastFrame } = render(
      <ToolCallViewer toolCall={toolCall} toolResult={resultMessage} toolState="success" messageId="msg-1" />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });
});
