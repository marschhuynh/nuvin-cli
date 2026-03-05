import { describe, expect, it } from 'vitest';
import { memorySaveToolDefinition } from '../tools/memory-save-tool.js';

describe('memory_save tool definition', () => {
  it('does not require topic and exposes v2 memory fields', () => {
    const schema = memorySaveToolDefinition.parameters;
    const required = Array.isArray(schema.required) ? schema.required : [];
    const properties =
      'properties' in schema && schema.properties && typeof schema.properties === 'object'
        ? schema.properties
        : {};

    expect(required).toContain('content');
    expect(required).toContain('type');
    expect(required).toContain('scope');
    expect(required).not.toContain('topic');

    expect(properties).toHaveProperty('key');
    expect(properties).toHaveProperty('confidence');
    expect(properties).toHaveProperty('evidence');
  });
});
