import { describe, expect, it, vi } from 'vitest';
import { ToolRegistry } from '../tools.js';
import { memoryQueryToolDefinition } from '../tools/memory-query-tool.js';

describe('memory_query tool definition', () => {
  it('requires query and exposes active recall knobs', () => {
    const schema = memoryQueryToolDefinition.parameters;
    const required = Array.isArray(schema.required) ? schema.required : [];
    const properties =
      'properties' in schema && schema.properties && typeof schema.properties === 'object'
        ? schema.properties
        : {};

    expect(required).toContain('query');
    expect(properties).toHaveProperty('scope');
    expect(properties).toHaveProperty('topK');
    expect(properties).toHaveProperty('minScore');
    expect(properties).toHaveProperty('key');
  });
});

describe('memory_query tool wiring', () => {
  it('is only exposed when memory query handler is registered', () => {
    const registry = new ToolRegistry();
    const withoutHandler = registry.getToolDefinitions(['memory_query']);
    expect(withoutHandler).toHaveLength(0);

    registry.setMemoryQueryHandler(async () => ({
      query: 'style',
      scope: 'both',
      totalHits: 0,
      hits: [],
    }));
    const withHandler = registry.getToolDefinitions(['memory_query']);
    expect(withHandler).toHaveLength(1);
    expect(withHandler[0]?.function.name).toBe('memory_query');
  });

  it('executes memory_query handler and returns json results', async () => {
    const registry = new ToolRegistry();
    const handler = vi.fn().mockResolvedValue({
      query: 'quotes',
      scope: 'project',
      totalHits: 1,
      hits: [
        {
          id: 'mem_1:stmt_1',
          statementId: 'stmt_1',
          topic: 'style',
          scope: 'project',
          type: 'procedural',
          content: 'Use single quotes',
          score: 0.91,
        },
      ],
    });
    registry.setMemoryQueryHandler(handler);

    const results = await registry.executeToolCalls([
      {
        id: 'call_1',
        name: 'memory_query',
        parameters: { query: 'quotes', scope: 'project', topK: 5 },
      },
    ]);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('success');
    expect(results[0]?.type).toBe('json');
    expect(results[0]?.name).toBe('memory_query');
  });
});
