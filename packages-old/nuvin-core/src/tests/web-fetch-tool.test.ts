import { describe, it, expect } from 'vitest';
import { WebFetchTool } from '../tools/WebFetchTool';

describe('WebFetchTool', () => {
  const tool = new WebFetchTool();

  it('returns error for invalid URL', async () => {
    const result = await tool.execute({ url: 'https://this-domain-does-not-exist-99999.com' });

    expect(result.status).toBe('error');
    expect(result.type).toBe('text');
  });

  it('returns error for empty URL', async () => {
    const result = await tool.execute({ url: '' });

    expect(result.status).toBe('error');
    expect(result.result).toContain('required');
  });

  it('has correct tool definition', () => {
    const definition = tool.definition();

    expect(definition.name).toBe('web_fetch');
    expect(definition.description).toContain('Markdown');
    expect(definition.parameters.properties).toHaveProperty('url');
    expect(definition.parameters.required).toContain('url');
  });
});