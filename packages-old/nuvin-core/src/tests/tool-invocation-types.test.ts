import { describe, it, expect } from 'vitest';
import type { ToolInvocation } from '../ports.js';
import { convertToolCall } from '../tools/tool-call-converter.js';
import type { ToolCall } from '../ports.js';

describe('ToolInvocation Type Safety', () => {
  it('should have type-safe parameters for file_read', () => {
    const toolCall: ToolCall = {
      id: 'call_1',
      type: 'function',
      function: {
        name: 'file_read',
        arguments: '{"path": "test.txt", "lineStart": 1, "lineEnd": 10}',
      },
    };

    const result = convertToolCall(toolCall);
    expect(result.valid).toBe(true);

    if (result.valid) {
      const invocation = result.invocation;
      
      if (invocation.name === 'file_read') {
        expect(invocation.parameters.path).toBe('test.txt');
        expect(invocation.parameters.lineStart).toBe(1);
        expect(invocation.parameters.lineEnd).toBe(10);
      }
    }
  });

  it('should have type-safe parameters for bash_tool', () => {
    const toolCall: ToolCall = {
      id: 'call_2',
      type: 'function',
      function: {
        name: 'bash_tool',
        arguments: '{"cmd": "ls -la", "cwd": "/tmp", "timeoutMs": 5000}',
      },
    };

    const result = convertToolCall(toolCall);
    expect(result.valid).toBe(true);

    if (result.valid) {
      const invocation = result.invocation;
      
      if (invocation.name === 'bash_tool') {
        expect(invocation.parameters.cmd).toBe('ls -la');
        expect(invocation.parameters.cwd).toBe('/tmp');
        expect(invocation.parameters.timeoutMs).toBe(5000);
      }
    }
  });

  it('should have type-safe parameters for web_search', () => {
    const toolCall: ToolCall = {
      id: 'call_3',
      type: 'function',
      function: {
        name: 'web_search',
        arguments: JSON.stringify({
          query: 'typescript types',
          count: 10,
          safe: true,
          type: 'web',
        }),
      },
    };

    const result = convertToolCall(toolCall);
    expect(result.valid).toBe(true);

    if (result.valid) {
      const invocation = result.invocation;
      
      if (invocation.name === 'web_search') {
        expect(invocation.parameters.query).toBe('typescript types');
        expect(invocation.parameters.count).toBe(10);
        expect(invocation.parameters.safe).toBe(true);
        expect(invocation.parameters.type).toBe('web');
      }
    }
  });

  it('should have type-safe parameters for todo_write', () => {
    const toolCall: ToolCall = {
      id: 'call_4',
      type: 'function',
      function: {
        name: 'todo_write',
        arguments: JSON.stringify({
          todos: [
            {
              id: '1',
              content: 'Test task',
              status: 'pending',
              priority: 'high',
              createdAt: '2025-12-10T12:00:00Z',
            },
          ],
        }),
      },
    };

    const result = convertToolCall(toolCall);
    expect(result.valid).toBe(true);

    if (result.valid) {
      const invocation = result.invocation;
      
      if (invocation.name === 'todo_write') {
        expect(Array.isArray(invocation.parameters.todos)).toBe(true);
        expect(invocation.parameters.todos[0]?.id).toBe('1');
        expect(invocation.parameters.todos[0]?.content).toBe('Test task');
        expect(invocation.parameters.todos[0]?.status).toBe('pending');
        expect(invocation.parameters.todos[0]?.priority).toBe('high');
      }
    }
  });

  it('should support unknown tools with generic parameters', () => {
    const toolCall: ToolCall = {
      id: 'call_unknown',
      type: 'function',
      function: {
        name: 'custom_tool',
        arguments: '{"customParam": "value"}',
      },
    };

    const result = convertToolCall(toolCall);
    expect(result.valid).toBe(true);

    if (result.valid) {
      const invocation = result.invocation;
      expect(invocation.name).toBe('custom_tool');
      expect(invocation.parameters).toHaveProperty('customParam');
    }
  });

  it('should demonstrate discriminated union type narrowing', () => {
    const invocations: ToolInvocation[] = [
      {
        id: 'call_1',
        name: 'file_read',
        parameters: { path: 'test.txt' },
      },
      {
        id: 'call_2',
        name: 'bash_tool',
        parameters: { cmd: 'echo hello' },
      },
    ];

    for (const inv of invocations) {
      switch (inv.name) {
        case 'file_read':
          expect(inv.parameters.path).toBeDefined();
          break;
        case 'bash_tool':
          expect(inv.parameters.cmd).toBeDefined();
          break;
        case 'web_search':
          expect(inv.parameters.query).toBeDefined();
          break;
      }
    }
  });
});
