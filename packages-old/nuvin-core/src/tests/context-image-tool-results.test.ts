import { describe, it, expect } from 'vitest';
import { SimpleContextBuilder } from '../context.js';
import type { Message, ProviderContentPart } from '../ports.js';

describe('SimpleContextBuilder - image tool results', () => {
  it('passes image content through for tool messages', () => {
    const builder = new SimpleContextBuilder();
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const history: Message[] = [
      {
        id: 'asst-1',
        role: 'assistant',
        content: 'Using the screenshot tool',
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'screenshot', arguments: '{}' } }],
      },
      {
        id: 'tool-1',
        role: 'tool',
        content: {
          type: 'parts',
          parts: [
            { type: 'text', text: 'Screenshot captured:' },
            { type: 'image', mimeType: 'image/png', data: b64 },
          ],
        },
        tool_call_id: 'call-1',
        name: 'screenshot',
      },
    ];

    const result = builder.toProviderMessages(history, 'system prompt', []);
    const toolMsg = result.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(Array.isArray(toolMsg!.content)).toBe(true);

    const content = toolMsg!.content as ProviderContentPart[];
    expect(content.length).toBe(2);
    expect(content[0]).toEqual({ type: 'text', text: 'Screenshot captured:' });
    expect(content[1]).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${b64}` },
    });
  });

  it('passes plain string tool results unchanged', () => {
    const builder = new SimpleContextBuilder();
    const history: Message[] = [
      {
        id: 'asst-1',
        role: 'assistant',
        content: 'Reading file',
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'file_read', arguments: '{}' } }],
      },
      {
        id: 'tool-1',
        role: 'tool',
        content: 'file contents here',
        tool_call_id: 'call-1',
        name: 'file_read',
      },
    ];

    const result = builder.toProviderMessages(history, 'system prompt', []);
    const toolMsg = result.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.content).toBe('file contents here');
  });
});
