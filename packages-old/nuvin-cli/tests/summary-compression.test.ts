import { describe, it, expect } from 'vitest';
import type { Message, ToolCall } from '@nuvin/nuvin-core';
import { compressConversation } from '../source/modules/commands/definitions/summary/compression.js';
import {
  analyzeFileOperations,
  isStaleFileRead,
  isStaleFileEdit,
} from '../source/modules/commands/definitions/summary/file-operations.js';
import {
  analyzeBashOperations,
  isStaleBashCommand,
  hasErrors,
} from '../source/modules/commands/definitions/summary/bash-operations.js';

function createMessage(
  id: string,
  role: 'user' | 'assistant' | 'tool',
  content: string,
  timestamp: string,
  toolCalls?: ToolCall[],
  toolCallId?: string,
  name?: string,
): Message {
  return {
    id,
    role,
    content,
    timestamp,
    tool_calls: toolCalls,
    tool_call_id: toolCallId,
    name,
  } as Message;
}

describe('File Operations', () => {
  describe('analyzeFileOperations', () => {
    it('should extract file read operations', () => {
      const messages: Message[] = [
        createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z', [
          {
            id: 'tc1',
            type: 'function',
            function: {
              name: 'file_read',
              arguments: JSON.stringify({ path: '/test/file.ts' }),
            },
          },
        ]),
      ];

      const { reads, edits, creates } = analyzeFileOperations(messages);

      expect(reads).toHaveLength(1);
      expect(reads[0].path).toBe('/test/file.ts');
      expect(reads[0].operation).toBe('read');
      expect(edits).toHaveLength(0);
      expect(creates).toHaveLength(0);
    });

    it('should extract file edit operations', () => {
      const messages: Message[] = [
        createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z', [
          {
            id: 'tc1',
            type: 'function',
            function: {
              name: 'file_edit',
              arguments: JSON.stringify({ file_path: '/test/file.ts' }),
            },
          },
        ]),
      ];

      const { reads, edits, creates } = analyzeFileOperations(messages);

      expect(edits).toHaveLength(1);
      expect(edits[0].path).toBe('/test/file.ts');
      expect(edits[0].operation).toBe('edit');
      expect(reads).toHaveLength(0);
      expect(creates).toHaveLength(0);
    });

    it('should extract file new operations', () => {
      const messages: Message[] = [
        createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z', [
          {
            id: 'tc1',
            type: 'function',
            function: {
              name: 'file_new',
              arguments: JSON.stringify({ file_path: '/test/new.ts' }),
            },
          },
        ]),
      ];

      const { reads, edits, creates } = analyzeFileOperations(messages);

      expect(creates).toHaveLength(1);
      expect(creates[0].path).toBe('/test/new.ts');
      expect(creates[0].operation).toBe('new');
      expect(reads).toHaveLength(0);
      expect(edits).toHaveLength(0);
    });
  });

  describe('isStaleFileRead', () => {
    it('should identify stale read when file is edited later', () => {
      const readOp = {
        path: '/test/file.ts',
        timestamp: new Date('2025-01-01T10:00:00Z'),
        message: createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z'),
        operation: 'read' as const,
      };

      const edits = [
        {
          path: '/test/file.ts',
          timestamp: new Date('2025-01-01T10:05:00Z'),
          message: createMessage('2', 'assistant', '', '2025-01-01T10:05:00Z'),
          operation: 'edit' as const,
        },
      ];

      const creates: Array<{ path: string; timestamp: Date }> = [];

      expect(isStaleFileRead(readOp, edits, creates)).toBe(true);
    });

    it('should identify stale read when file is created later', () => {
      const readOp = {
        path: '/test/file.ts',
        timestamp: new Date('2025-01-01T10:00:00Z'),
        message: createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z'),
        operation: 'read' as const,
      };

      const edits: Array<{ path: string; timestamp: Date }> = [];
      const creates = [
        {
          path: '/test/file.ts',
          timestamp: new Date('2025-01-01T10:05:00Z'),
          message: createMessage('2', 'assistant', '', '2025-01-01T10:05:00Z'),
          operation: 'new' as const,
        },
      ];

      expect(isStaleFileRead(readOp, edits, creates)).toBe(true);
    });

    it('should not identify as stale when no later operations', () => {
      const readOp = {
        path: '/test/file.ts',
        timestamp: new Date('2025-01-01T10:00:00Z'),
        message: createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z'),
        operation: 'read' as const,
      };

      expect(isStaleFileRead(readOp, [], [])).toBe(false);
    });

    it('should not identify as stale when edit is earlier', () => {
      const readOp = {
        path: '/test/file.ts',
        timestamp: new Date('2025-01-01T10:05:00Z'),
        message: createMessage('1', 'assistant', '', '2025-01-01T10:05:00Z'),
        operation: 'read' as const,
      };

      const edits = [
        {
          path: '/test/file.ts',
          timestamp: new Date('2025-01-01T10:00:00Z'),
          message: createMessage('2', 'assistant', '', '2025-01-01T10:00:00Z'),
          operation: 'edit' as const,
        },
      ];

      expect(isStaleFileRead(readOp, edits, [])).toBe(false);
    });
  });

  describe('isStaleFileEdit', () => {
    it('should identify stale edit when same file edited later', () => {
      const editOp = {
        path: '/test/file.ts',
        timestamp: new Date('2025-01-01T10:00:00Z'),
        message: createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z'),
        operation: 'edit' as const,
      };

      const edits = [
        editOp,
        {
          path: '/test/file.ts',
          timestamp: new Date('2025-01-01T10:05:00Z'),
          message: createMessage('2', 'assistant', '', '2025-01-01T10:05:00Z'),
          operation: 'edit' as const,
        },
      ];

      expect(isStaleFileEdit(editOp, edits)).toBe(true);
    });

    it('should not identify as stale when it is the latest edit', () => {
      const editOp = {
        path: '/test/file.ts',
        timestamp: new Date('2025-01-01T10:05:00Z'),
        message: createMessage('2', 'assistant', '', '2025-01-01T10:05:00Z'),
        operation: 'edit' as const,
      };

      const edits = [
        {
          path: '/test/file.ts',
          timestamp: new Date('2025-01-01T10:00:00Z'),
          message: createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z'),
          operation: 'edit' as const,
        },
        editOp,
      ];

      expect(isStaleFileEdit(editOp, edits)).toBe(false);
    });
  });
});

describe('Bash Operations', () => {
  describe('analyzeBashOperations', () => {
    it('should extract bash command operations', () => {
      const messages: Message[] = [
        createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z', [
          {
            id: 'tc1',
            type: 'function',
            function: {
              name: 'bash_tool',
              arguments: JSON.stringify({ cmd: 'npm test' }),
            },
          },
        ]),
        createMessage('2', 'tool', 'Test output', '2025-01-01T10:00:01Z', undefined, 'tc1', 'bash_tool'),
      ];

      const bashOps = analyzeBashOperations(messages);

      expect(bashOps).toHaveLength(1);
      expect(bashOps[0].command).toBe('npm test');
      expect(bashOps[0].toolResultMessage).toBeTruthy();
      expect(bashOps[0].toolResultMessage?.content).toBe('Test output');
    });

    it('should handle bash commands without results', () => {
      const messages: Message[] = [
        createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z', [
          {
            id: 'tc1',
            type: 'function',
            function: {
              name: 'bash_tool',
              arguments: JSON.stringify({ cmd: 'echo hello' }),
            },
          },
        ]),
      ];

      const bashOps = analyzeBashOperations(messages);

      expect(bashOps).toHaveLength(1);
      expect(bashOps[0].command).toBe('echo hello');
      expect(bashOps[0].toolResultMessage).toBeNull();
    });
  });

  describe('isStaleBashCommand', () => {
    it('should identify stale bash command when same command runs later', () => {
      const bashOp = {
        command: 'npm test',
        timestamp: new Date('2025-01-01T10:00:00Z'),
        message: createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z'),
        toolResultMessage: null,
      };

      const allBashOps = [
        bashOp,
        {
          command: 'npm test',
          timestamp: new Date('2025-01-01T10:05:00Z'),
          message: createMessage('2', 'assistant', '', '2025-01-01T10:05:00Z'),
          toolResultMessage: null,
        },
      ];

      expect(isStaleBashCommand(bashOp, allBashOps)).toBe(true);
    });

    it('should not identify as stale when it is the latest run', () => {
      const latestBashOp = {
        command: 'npm test',
        timestamp: new Date('2025-01-01T10:05:00Z'),
        message: createMessage('2', 'assistant', '', '2025-01-01T10:05:00Z'),
        toolResultMessage: null,
      };

      const allBashOps = [
        {
          command: 'npm test',
          timestamp: new Date('2025-01-01T10:00:00Z'),
          message: createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z'),
          toolResultMessage: null,
        },
        latestBashOp,
      ];

      expect(isStaleBashCommand(latestBashOp, allBashOps)).toBe(false);
    });

    it('should not identify as stale when different commands', () => {
      const bashOp = {
        command: 'npm test',
        timestamp: new Date('2025-01-01T10:00:00Z'),
        message: createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z'),
        toolResultMessage: null,
      };

      const allBashOps = [
        bashOp,
        {
          command: 'npm build',
          timestamp: new Date('2025-01-01T10:05:00Z'),
          message: createMessage('2', 'assistant', '', '2025-01-01T10:05:00Z'),
          toolResultMessage: null,
        },
      ];

      expect(isStaleBashCommand(bashOp, allBashOps)).toBe(false);
    });
  });

  describe('hasErrors', () => {
    it('should detect error patterns', () => {
      const errorMessages = [
        createMessage('1', 'tool', 'error: command failed', '2025-01-01T10:00:00Z'),
        createMessage('2', 'tool', 'Command failed with exit code 1', '2025-01-01T10:00:00Z'),
        createMessage('3', 'tool', 'Exception occurred', '2025-01-01T10:00:00Z'),
        createMessage('4', 'tool', 'bash: command not found', '2025-01-01T10:00:00Z'),
        createMessage('5', 'tool', 'permission denied', '2025-01-01T10:00:00Z'),
        createMessage('6', 'tool', 'no such file or directory', '2025-01-01T10:00:00Z'),
        createMessage('7', 'tool', 'cannot access file', '2025-01-01T10:00:00Z'),
        createMessage('8', 'tool', 'fatal: not a git repository', '2025-01-01T10:00:00Z'),
      ];

      errorMessages.forEach((msg) => {
        expect(hasErrors(msg)).toBe(true);
      });
    });

    it('should not detect errors in success messages', () => {
      const successMessages = [
        createMessage('1', 'tool', 'Tests passed successfully', '2025-01-01T10:00:00Z'),
        createMessage('2', 'tool', 'Build complete', '2025-01-01T10:00:00Z'),
        createMessage('3', 'tool', 'All checks passed', '2025-01-01T10:00:00Z'),
      ];

      successMessages.forEach((msg) => {
        expect(hasErrors(msg)).toBe(false);
      });
    });
  });
});

describe('Compression', () => {
  describe('compressConversation', () => {
    it('should remove stale file reads', () => {
      const messages: Message[] = [
        createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z', [
          {
            id: 'tc1',
            type: 'function',
            function: { name: 'file_read', arguments: JSON.stringify({ path: '/test/file.ts' }) },
          },
        ]),
        createMessage('2', 'tool', 'file content', '2025-01-01T10:00:01Z', undefined, 'tc1', 'file_read'),
        createMessage('3', 'assistant', '', '2025-01-01T10:01:00Z', [
          {
            id: 'tc2',
            type: 'function',
            function: { name: 'file_edit', arguments: JSON.stringify({ file_path: '/test/file.ts' }) },
          },
        ]),
        createMessage('4', 'tool', 'edit success', '2025-01-01T10:01:01Z', undefined, 'tc2', 'file_edit'),
      ];

      const { compressed, stats } = compressConversation(messages);

      expect(stats.staleReads).toBe(1);
      expect(compressed).toHaveLength(2);
      expect(compressed.map((m) => m.id)).toEqual(['3', '4']);
    });

    it('should remove stale file edits', () => {
      const messages: Message[] = [
        createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z', [
          {
            id: 'tc1',
            type: 'function',
            function: { name: 'file_edit', arguments: JSON.stringify({ file_path: '/test/file.ts' }) },
          },
        ]),
        createMessage('2', 'tool', 'edit 1', '2025-01-01T10:00:01Z', undefined, 'tc1', 'file_edit'),
        createMessage('3', 'assistant', '', '2025-01-01T10:01:00Z', [
          {
            id: 'tc2',
            type: 'function',
            function: { name: 'file_edit', arguments: JSON.stringify({ file_path: '/test/file.ts' }) },
          },
        ]),
        createMessage('4', 'tool', 'edit 2', '2025-01-01T10:01:01Z', undefined, 'tc2', 'file_edit'),
      ];

      const { compressed, stats } = compressConversation(messages);

      expect(stats.staleEdits).toBe(1);
      expect(compressed).toHaveLength(2);
      expect(compressed.map((m) => m.id)).toEqual(['3', '4']);
    });

    it('should remove stale bash commands', () => {
      const messages: Message[] = [
        createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z', [
          {
            id: 'tc1',
            type: 'function',
            function: { name: 'bash_tool', arguments: JSON.stringify({ cmd: 'npm test' }) },
          },
        ]),
        createMessage('2', 'tool', 'test output 1', '2025-01-01T10:00:01Z', undefined, 'tc1', 'bash_tool'),
        createMessage('3', 'assistant', '', '2025-01-01T10:01:00Z', [
          {
            id: 'tc2',
            type: 'function',
            function: { name: 'bash_tool', arguments: JSON.stringify({ cmd: 'npm test' }) },
          },
        ]),
        createMessage('4', 'tool', 'test output 2', '2025-01-01T10:01:01Z', undefined, 'tc2', 'bash_tool'),
      ];

      const { compressed, stats } = compressConversation(messages);

      expect(stats.staleBash).toBe(1);
      expect(compressed).toHaveLength(2);
      expect(compressed.map((m) => m.id)).toEqual(['3', '4']);
    });

    it('should remove failed bash commands', () => {
      const messages: Message[] = [
        createMessage('1', 'assistant', '', '2025-01-01T10:00:00Z', [
          {
            id: 'tc1',
            type: 'function',
            function: { name: 'bash_tool', arguments: JSON.stringify({ cmd: 'invalid-command' }) },
          },
        ]),
        createMessage('2', 'tool', 'error: command not found', '2025-01-01T10:00:01Z', undefined, 'tc1', 'bash_tool'),
      ];

      const { compressed, stats } = compressConversation(messages);

      expect(stats.failedBash).toBe(1);
      expect(compressed).toHaveLength(0);
    });

    it('should preserve user messages', () => {
      const messages: Message[] = [
        createMessage('1', 'user', 'Hello', '2025-01-01T10:00:00Z'),
        createMessage('2', 'assistant', '', '2025-01-01T10:00:01Z', [
          {
            id: 'tc1',
            type: 'function',
            function: { name: 'file_read', arguments: JSON.stringify({ path: '/test/file.ts' }) },
          },
        ]),
        createMessage('3', 'tool', 'content', '2025-01-01T10:00:02Z', undefined, 'tc1', 'file_read'),
        createMessage('4', 'assistant', '', '2025-01-01T10:01:00Z', [
          {
            id: 'tc2',
            type: 'function',
            function: { name: 'file_edit', arguments: JSON.stringify({ file_path: '/test/file.ts' }) },
          },
        ]),
        createMessage('5', 'tool', 'edit', '2025-01-01T10:01:01Z', undefined, 'tc2', 'file_edit'),
      ];

      const { compressed } = compressConversation(messages);

      expect(compressed.find((m) => m.id === '1')).toBeTruthy();
      expect(compressed.find((m) => m.role === 'user')).toBeTruthy();
    });

    it('should handle empty message list', () => {
      const { compressed, stats } = compressConversation([]);

      expect(compressed).toHaveLength(0);
      expect(stats.original).toBe(0);
      expect(stats.compressed).toBe(0);
      expect(stats.removed).toBe(0);
    });

    it('should handle messages with no tool calls', () => {
      const messages: Message[] = [
        createMessage('1', 'user', 'Hello', '2025-01-01T10:00:00Z'),
        createMessage('2', 'assistant', 'Hi there', '2025-01-01T10:00:01Z'),
      ];

      const { compressed, stats } = compressConversation(messages);

      expect(compressed).toHaveLength(2);
      expect(stats.removed).toBe(0);
    });
  });
});
