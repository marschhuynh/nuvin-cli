import { describe, it, expect } from 'vitest';
import { processMessageToUILines } from '../source/utils/messageProcessor.js';
import { theme } from '../source/theme.js';
import type { ToolCall } from '@nuvin/nuvin-core';

describe('processMessageToUILines - User messages', () => {
  it('handles user message with string content', () => {
    const msg = {
      role: 'user' as const,
      content: 'Hello, how are you?',
      timestamp: '2025-01-01T00:00:00.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('user');
    expect(result[0].content).toBe('Hello, how are you?');
    expect(result[0].color).toBe(theme.tokens.cyan);
    expect(result[0].metadata.timestamp).toBe('2025-01-01T00:00:00.000Z');
  });

  it('handles user message with null content', () => {
    const msg = {
      role: 'user' as const,
      content: null,
      timestamp: '2025-01-01T00:00:00.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(0);
  });

  it('handles user message with structured parts content', () => {
    const msg = {
      role: 'user' as const,
      content: {
        type: 'parts' as const,
        parts: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'World' },
        ],
      },
      timestamp: '2025-01-01T00:00:00.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('user');
    expect(result[0].content).toBe('Hello World');
  });
});

describe('processMessageToUILines - Assistant messages', () => {
  it('handles assistant message with string content', () => {
    const msg = {
      role: 'assistant' as const,
      content: 'I am doing well, thank you!',
      timestamp: '2025-01-01T00:00:01.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('assistant');
    expect(result[0].content).toBe('I am doing well, thank you!');
    expect(result[0].metadata.timestamp).toBe('2025-01-01T00:00:01.000Z');
  });

  it('handles assistant message with empty content', () => {
    const msg = {
      role: 'assistant' as const,
      content: '',
      timestamp: '2025-01-01T00:00:01.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(0);
  });

  it('handles assistant message with only whitespace', () => {
    const msg = {
      role: 'assistant' as const,
      content: '   \n  \t  ',
      timestamp: '2025-01-01T00:00:01.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(0);
  });

  it('handles assistant message with tool calls', () => {
    const toolCalls: ToolCall[] = [
      {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'bash_tool',
          arguments: '{"cmd":"ls -la"}',
        },
      },
      {
        id: 'call_456',
        type: 'function',
        function: {
          name: 'file_read',
          arguments: '{"path":"test.txt"}',
        },
      },
    ];

    const msg = {
      role: 'assistant' as const,
      content: null,
      tool_calls: toolCalls,
      timestamp: '2025-01-01T00:00:01.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('tool');
    expect(result[0].content.includes('bash_tool')).toBe(true);
    expect(result[0].content.includes('file_read')).toBe(true);
    expect(result[0].color).toBe(theme.tokens.blue);
    expect(result[0].metadata.toolCallCount).toBe(2);
  });

  it('handles assistant message with tool calls and content', () => {
    const toolCalls: ToolCall[] = [
      {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'bash_tool',
          arguments: '{"cmd":"ls"}',
        },
      },
    ];

    const msg = {
      role: 'assistant' as const,
      content: 'Let me check the files.',
      tool_calls: toolCalls,
      timestamp: '2025-01-01T00:00:01.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(2);
    expect(result[0].type).toBe('assistant');
    expect(result[0].content).toBe('Let me check the files.');
    expect(result[1].type).toBe('tool');
  });
});

describe('processMessageToUILines - Tool messages', () => {
  it('handles tool message with success status', () => {
    const msg = {
      role: 'tool' as const,
      content: 'file1.txt\nfile2.txt\nfile3.txt',
      tool_call_id: 'call_123',
      name: 'bash_tool',
      timestamp: '2025-01-01T00:00:02.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('tool_result');
    expect(result[0].content.includes('bash_tool')).toBe(true);
    expect(result[0].content.includes('[+]')).toBe(true);
    expect(result[0].content.includes('success')).toBe(true);
    expect(result[0].color).toBe(theme.tokens.green);
    expect(result[0].metadata.toolName).toBe('bash_tool');
    expect(result[0].metadata.status).toBe('success');
  });

  it('handles tool message with error pattern', () => {
    const msg = {
      role: 'tool' as const,
      content: 'Error: File not found',
      tool_call_id: 'call_456',
      name: 'file_read',
      status: 'error' as const,
      timestamp: '2025-01-01T00:00:02.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('tool_result');
    expect(result[0].content.includes('error:')).toBe(true);
    expect(result[0].color).toBe(theme.tokens.red);
    expect(result[0].metadata.toolName).toBe('file_read');
    expect(result[0].metadata.status).toBe('error');
  });

  it('handles tool message with "failed" pattern', () => {
    const msg = {
      role: 'tool' as const,
      content: 'Failed: Connection timeout',
      tool_call_id: 'call_789',
      name: 'web_fetch',
      status: 'error' as const,
      timestamp: '2025-01-01T00:00:02.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].metadata.status).toBe('error');
    expect(result[0].color).toBe(theme.tokens.red);
  });

  it('handles tool message with "exception" pattern', () => {
    const msg = {
      role: 'tool' as const,
      content: 'Exception: Invalid syntax',
      tool_call_id: 'call_012',
      name: 'bash_tool',
      status: 'error' as const,
      timestamp: '2025-01-01T00:00:02.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].metadata.status).toBe('error');
    expect(result[0].color).toBe(theme.tokens.red);
  });

  it('handles tool message without name field', () => {
    const msg = {
      role: 'tool' as const,
      content: 'Result data',
      tool_call_id: 'call_345',
      timestamp: '2025-01-01T00:00:02.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].metadata.toolName).toBe('call_345');
  });

  it('handles tool message with structured parts content', () => {
    const msg = {
      role: 'tool' as const,
      content: {
        type: 'parts' as const,
        parts: [
          { type: 'text', text: 'Result: ' },
          { type: 'text', text: 'Success' },
        ],
      },
      tool_call_id: 'call_678',
      name: 'web_search',
      timestamp: '2025-01-01T00:00:02.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('tool_result');
    expect(result[0].metadata.toolName).toBe('web_search');
  });
});

describe('processMessageToUILines - Edge cases', () => {
  it('handles message with no timestamp', () => {
    const msg = {
      role: 'user' as const,
      content: 'No timestamp',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].metadata.timestamp).toBeTruthy();
  });

  it('handles assistant message with only tool calls', () => {
    const toolCalls: ToolCall[] = [
      {
        id: 'call_999',
        type: 'function',
        function: {
          name: 'todo_write',
          arguments: '{"todos":[{"content":"Task 1","status":"pending"}]}',
        },
      },
    ];

    const msg = {
      role: 'assistant' as const,
      content: null,
      tool_calls: toolCalls,
      timestamp: '2025-01-01T00:00:01.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('tool');
  });

  it('handles empty tool calls array', () => {
    const msg = {
      role: 'assistant' as const,
      content: 'Just text',
      tool_calls: [],
      timestamp: '2025-01-01T00:00:01.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('assistant');
  });

  it('handles complex multi-part content', () => {
    const msg = {
      role: 'user' as const,
      content: {
        type: 'parts' as const,
        parts: [
          'String part',
          { type: 'text', text: 'Object part' },
          { type: 'other', data: 'Should be ignored' },
          { type: 'text', text: 'Another text' },
        ],
      },
      timestamp: '2025-01-01T00:00:00.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].content).toBe('String part Object part Another text');
  });

  it('handles case-insensitive error detection', () => {
    const msg = {
      role: 'tool' as const,
      content: 'ERROR: Something went wrong',
      tool_call_id: 'call_111',
      name: 'test_tool',
      status: 'error' as const,
      timestamp: '2025-01-01T00:00:02.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].metadata.status).toBe('error');
  });

  it('removes leading newlines from assistant content', () => {
    const msg = {
      role: 'assistant' as const,
      content: '\n\nHello, how are you?',
      timestamp: '2025-01-01T00:00:01.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('assistant');
    expect(result[0].content).toBe('Hello, how are you?');
  });

  it('preserves middle and end newlines', () => {
    const msg = {
      role: 'assistant' as const,
      content: 'Hello\n\nhow are you?\nGoodbye',
      timestamp: '2025-01-01T00:00:01.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('assistant');
    expect(result[0].content).toBe('Hello\n\nhow are you?\nGoodbye');
  });

  it('removes leading newlines from parts content', () => {
    const msg = {
      role: 'assistant' as const,
      content: {
        type: 'parts' as const,
        parts: ['\n\nHello', { type: 'text' as const, text: ' ' }, { type: 'text' as const, text: 'how are you?' }],
      },
      timestamp: '2025-01-01T00:00:01.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('assistant');
    expect(result[0].content).toBe('Hello   how are you?');
  });

  it('handles tool message with empty content', () => {
    const msg = {
      role: 'tool' as const,
      content: '',
      tool_call_id: 'call_222',
      name: 'empty_tool',
      timestamp: '2025-01-01T00:00:02.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('tool_result');
    expect(result[0].metadata.status).toBe('success');
  });

  it('generates unique IDs for each line', () => {
    const toolCalls: ToolCall[] = [
      {
        id: 'call_a',
        type: 'function',
        function: { name: 'tool_a', arguments: '{}' },
      },
    ];

    const msg = {
      role: 'assistant' as const,
      content: 'Content',
      tool_calls: toolCalls,
      timestamp: '2025-01-01T00:00:01.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(2);
    expect(result[0].id).not.toBe(result[1].id);
    expect(result[0].id).toBeTruthy();
    expect(result[1].id).toBeTruthy();
  });

  it('handles tool message with null content', () => {
    const msg = {
      role: 'tool' as const,
      content: null,
      tool_call_id: 'call_333',
      name: 'null_tool',
      timestamp: '2025-01-01T00:00:02.000Z',
    };

    const result = processMessageToUILines(msg);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('tool_result');
    expect(result[0].metadata.status).toBe('success');
  });
});
