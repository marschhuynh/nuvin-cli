import { describe, it, expect, vi } from 'vitest';
import { convertToolCall, convertToolCalls } from '../tools/tool-call-converter.js';
import type { ToolCall } from '../ports.js';

describe('Tool Call Converter', () => {
  describe('convertToolCall', () => {
    it('should successfully parse valid file_read tool call', () => {
      const toolCall: ToolCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'file_read',
          arguments: '{"path": "package.json", "lineStart": 1, "lineEnd": 10}',
        },
      };

      const result = convertToolCall(toolCall);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.invocation).toEqual({
          id: 'call_123',
          name: 'file_read',
          parameters: {
            path: 'package.json',
            lineStart: 1,
            lineEnd: 10,
          },
        });
      }
    });

    it('should fail on invalid JSON', () => {
      const toolCall: ToolCall = {
        id: 'call_456',
        type: 'function',
        function: {
          name: 'file_read',
          arguments: '{invalid json}',
        },
      };

      const result = convertToolCall(toolCall);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errorType).toBe('parse');
        expect(result.callId).toBe('call_456');
        expect(result.toolName).toBe('file_read');
        expect(result.error).toContain('JSON');
      }
    });

    it('should fail on array instead of object', () => {
      const toolCall: ToolCall = {
        id: 'call_789',
        type: 'function',
        function: {
          name: 'file_read',
          arguments: '["path", "package.json"]',
        },
      };

      const result = convertToolCall(toolCall);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errorType).toBe('parse');
        expect(result.error).toContain('object');
      }
    });

    it('should validate parameters in strict mode', () => {
      const toolCall: ToolCall = {
        id: 'call_strict',
        type: 'function',
        function: {
          name: 'file_read',
          arguments: '{"lineStart": 1}',
        },
      };

      const result = convertToolCall(toolCall, { strict: true });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errorType).toBe('validation');
        expect(result.error).toContain('path');
      }
    });

    it('should warn but succeed in non-strict mode for missing required params', () => {
      const toolCall: ToolCall = {
        id: 'call_lenient',
        type: 'function',
        function: {
          name: 'file_read',
          arguments: '{"lineStart": 1}',
        },
      };

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = convertToolCall(toolCall, { strict: false });

      expect(result.valid).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should handle bash_tool with valid parameters', () => {
      const toolCall: ToolCall = {
        id: 'call_bash',
        type: 'function',
        function: {
          name: 'bash_tool',
          arguments: '{"cmd": "ls -la", "cwd": "/tmp", "timeoutMs": 5000}',
        },
      };

      const result = convertToolCall(toolCall);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.invocation.parameters).toEqual({
          cmd: 'ls -la',
          cwd: '/tmp',
          timeoutMs: 5000,
        });
      }
    });

    it('should validate bash_tool timeoutMs is positive in strict mode', () => {
      const toolCall: ToolCall = {
        id: 'call_bash_invalid',
        type: 'function',
        function: {
          name: 'bash_tool',
          arguments: '{"cmd": "ls", "timeoutMs": -1}',
        },
      };

      const result = convertToolCall(toolCall, { strict: true });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errorType).toBe('validation');
        expect(result.error).toContain('timeoutMs');
      }
    });
  });

  describe('convertToolCalls', () => {
    it('should convert multiple tool calls successfully', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'file_read',
            arguments: '{"path": "test.txt"}',
          },
        },
        {
          id: 'call_2',
          type: 'function',
          function: {
            name: 'bash_tool',
            arguments: '{"cmd": "echo hello"}',
          },
        },
      ];

      const result = convertToolCalls(toolCalls);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('call_1');
      expect(result[1]?.id).toBe('call_2');
    });

    it('should throw on error when throwOnError is true', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_invalid',
          type: 'function',
          function: {
            name: 'file_read',
            arguments: '{invalid}',
          },
        },
      ];

      expect(() => {
        convertToolCalls(toolCalls, { throwOnError: true });
      }).toThrow();
    });

    it('should not throw when throwOnError is false', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_invalid',
          type: 'function',
          function: {
            name: 'file_read',
            arguments: '{invalid}',
          },
        },
      ];

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = convertToolCalls(toolCalls, { throwOnError: false });

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('call_invalid');
      expect(result[0]?.parameters).toEqual({});
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle todo_write with valid todos array', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_todo',
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
        },
      ];

      const result = convertToolCalls(toolCalls);

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('todo_write');
      expect(result[0]?.parameters).toHaveProperty('todos');
    });
  });
});
