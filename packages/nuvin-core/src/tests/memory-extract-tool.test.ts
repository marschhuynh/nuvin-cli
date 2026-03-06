import { describe, expect, it, vi } from 'vitest';
import type { AssignTool } from '../tools/AssignTool.js';
import { MemoryExtractionTool } from '../tools/MemoryExtractionTool.js';
import { ToolRegistry } from '../tools.js';

describe('MemoryExtractionTool', () => {
  it('exposes explicit extraction and consolidation controls', () => {
    const tool = new MemoryExtractionTool(() => undefined, async () => ({ task: 'x' }), '__hidden');
    const schema = tool.parameters;
    const properties =
      'properties' in schema && schema.properties && typeof schema.properties === 'object'
        ? schema.properties
        : {};

    expect(properties).toHaveProperty('scope');
    expect(properties).toHaveProperty('maxMessages');
    expect(properties).toHaveProperty('minSimilarityScore');
  });
});

describe('memory_extract tool wiring', () => {
  it('is only exposed when task builder is registered', () => {
    const registry = new ToolRegistry();
    const withoutBuilder = registry.getToolDefinitions(['memory_extract']);
    expect(withoutBuilder).toHaveLength(0);

    registry.setMemoryExtractionTaskBuilder(async () => ({ task: 'extract' }));
    const withBuilder = registry.getToolDefinitions(['memory_extract']);
    expect(withBuilder).toHaveLength(1);
    expect(withBuilder[0]?.function.name).toBe('memory_extract');
  });

  it('delegates memory_extract through assign_task with hidden agent', async () => {
    const registry = new ToolRegistry();
    const assignExecute = vi.fn().mockResolvedValue({
      status: 'success' as const,
      type: 'text' as const,
      result: 'Memory extraction completed.',
      metadata: {},
    });
    const mockAssignTool = {
      execute: assignExecute,
    } as unknown as AssignTool;

    (registry as unknown as { assignTool: AssignTool }).assignTool = mockAssignTool;
    registry.setMemoryExtractionTaskBuilder(
      async () => ({
        description: 'Extract and consolidate memory from this conversation',
        task: 'extract',
      }),
      { hiddenAgentName: '__memory_extractor_internal' },
    );

    const results = await registry.executeToolCalls([
      {
        id: 'call_1',
        name: 'memory_extract',
        parameters: { scope: 'project', maxMessages: 8, minSimilarityScore: 0.3 },
      },
    ]);

    expect(assignExecute).toHaveBeenCalledTimes(1);
    expect(assignExecute).toHaveBeenCalledWith(
      {
        agent: '__memory_extractor_internal',
        description: 'Extract and consolidate memory from this conversation',
        task: 'extract',
      },
      expect.anything(),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('success');
    expect(results[0]?.type).toBe('text');
    expect(results[0]?.name).toBe('memory_extract');
  });
});
