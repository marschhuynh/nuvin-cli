import { describe, it, expect } from 'vitest';
import { toUserMessagePayload, toTextContentBlock } from '../../source/acp/content.js';

describe('ACP content mapping', () => {
  it('maps ACP text blocks to user payload text', () => {
    const payload = toUserMessagePayload([{ type: 'text', text: 'Hello' }]);
    expect(payload.text).toBe('Hello');
  });

  it('wraps tool output into text content blocks', () => {
    const block = toTextContentBlock('Result');
    expect(block).toEqual({ type: 'text', text: 'Result' });
  });
});
