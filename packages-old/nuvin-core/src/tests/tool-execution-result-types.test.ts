import { describe, it, expect } from 'vitest';
import type { ToolExecutionResult } from '../ports.js';

describe('ToolExecutionResult Type Safety', () => {
  it('should have type-safe metadata for bash_tool', () => {
    const result: ToolExecutionResult = {
      id: 'call_1',
      name: 'bash_tool',
      status: 'success',
      type: 'text',
      result: 'output',
      metadata: {
        cwd: '/tmp',
        code: 0,
        stdout: 'output',
        stderr: '',
      },
      durationMs: 100,
    };

    if (result.name === 'bash_tool' && result.status === 'success') {
      expect(result.metadata?.cwd).toBe('/tmp');
      expect(result.metadata?.code).toBe(0);
      expect(result.metadata?.stdout).toBe('output');
    }
  });

  it('should have type-safe metadata for file_read', () => {
    const result: ToolExecutionResult = {
      id: 'call_2',
      name: 'file_read',
      status: 'success',
      type: 'text',
      result: 'file content',
      metadata: {
        path: 'test.txt',
        size: 1024,
        encoding: 'utf8',
        lineRange: {
          lineStart: 1,
          lineEnd: 10,
          linesTotal: 100,
        },
      },
      durationMs: 50,
    };

    if (result.name === 'file_read' && result.status === 'success') {
      expect(result.metadata?.path).toBe('test.txt');
      expect(result.metadata?.size).toBe(1024);
      expect(result.metadata?.lineRange?.lineStart).toBe(1);
    }
  });

  it('should have type-safe metadata for web_search', () => {
    const result: ToolExecutionResult = {
      id: 'call_3',
      name: 'web_search',
      status: 'success',
      type: 'json',
      result: [{ title: 'Result 1', url: 'https://example.com' }],
      metadata: {
        query: 'typescript types',
        totalResults: 100,
        resultsReturned: 10,
        provider: 'google',
      },
      durationMs: 200,
    };

    if (result.name === 'web_search' && result.status === 'success') {
      expect(result.metadata?.query).toBe('typescript types');
      expect(result.metadata?.totalResults).toBe(100);
      expect(result.metadata?.resultsReturned).toBe(10);
      expect(result.type).toBe('json');
    }
  });

  it('should have type-safe metadata for assign_task', () => {
    const result: ToolExecutionResult = {
      id: 'call_4',
      name: 'assign_task',
      status: 'success',
      type: 'text',
      result: 'Task completed',
      metadata: {
        agentId: 'agent-123',
        agentName: 'test-agent',
        delegationDepth: 1,
        status: 'success',
        executionTimeMs: 5000,
        toolCallsExecuted: 3,
        tokensUsed: 1000,
        taskDescription: 'Test task',
      },
      durationMs: 5000,
    };

    if (result.name === 'assign_task' && result.status === 'success') {
      expect(result.metadata.agentId).toBe('agent-123');
      expect(result.metadata.delegationDepth).toBe(1);
      expect(result.metadata.toolCallsExecuted).toBe(3);
    }
  });

  it('should have type-safe error metadata', () => {
    const result: ToolExecutionResult = {
      id: 'call_error',
      name: 'file_read',
      status: 'error',
      type: 'text',
      result: 'File not found',
      metadata: {
        errorReason: 'not_found' as const,
        path: 'missing.txt',
        retryable: false,
      },
      durationMs: 10,
    };

    if (result.status === 'error') {
      expect(result.metadata?.errorReason).toBe('not_found');
      expect(result.metadata?.path).toBe('missing.txt');
      expect(result.metadata?.retryable).toBe(false);
    }
  });

  it('should support discriminated union type narrowing', () => {
    const results: ToolExecutionResult[] = [
      {
        id: '1',
        name: 'bash_tool',
        status: 'success',
        type: 'text',
        result: 'ls output',
        metadata: { cwd: '/tmp', code: 0 },
      },
      {
        id: '2',
        name: 'file_read',
        status: 'success',
        type: 'text',
        result: 'file content',
        metadata: { path: 'test.txt', size: 100 },
      },
      {
        id: '3',
        name: 'web_search',
        status: 'success',
        type: 'json',
        result: [],
        metadata: { query: 'test', resultsReturned: 0 },
      },
    ];

    for (const result of results) {
      if (result.status === 'success') {
        switch (result.name) {
          case 'bash_tool':
            expect(result.metadata?.cwd).toBeDefined();
            break;
          case 'file_read':
            expect(result.metadata?.path).toBeDefined();
            break;
          case 'web_search':
            expect(result.metadata?.query).toBeDefined();
            expect(result.type).toBe('json');
            break;
        }
      }
    }
  });

  it('should handle file_edit metadata', () => {
    const result: ToolExecutionResult = {
      id: 'call_edit',
      name: 'file_edit',
      status: 'success',
      type: 'text',
      result: 'File edited successfully',
      metadata: {
        path: 'test.ts',
        size: 2048,
        changesMade: {
          linesAdded: 5,
          linesRemoved: 3,
          bytesChanged: 200,
        },
      },
    };

    if (result.name === 'file_edit' && result.status === 'success') {
      expect(result.metadata?.path).toBe('test.ts');
      expect(result.metadata?.changesMade?.linesAdded).toBe(5);
      expect(result.metadata?.changesMade?.linesRemoved).toBe(3);
    }
  });
});
