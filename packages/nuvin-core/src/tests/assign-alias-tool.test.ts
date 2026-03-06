import { describe, expect, it, vi } from 'vitest';
import { ErrorReason } from '../ports.js';
import { AssignAliasTool } from '../tools/AssignAliasTool.js';
import type { AssignTool } from '../tools/AssignTool.js';

type AliasInput = {
  value?: string;
};

describe('AssignAliasTool', () => {
  it('returns tool_not_found when assign tool is unavailable', async () => {
    const tool = new AssignAliasTool<AliasInput>({
      name: 'alias_test',
      description: 'alias',
      parameters: { type: 'object', properties: {}, required: [] },
      hiddenAgentName: '__hidden_agent',
      getAssignTool: () => undefined,
      buildAssignTask: async () => ({ description: 'desc', task: 'task' }),
    });

    const result = await tool.execute({});
    expect(result.status).toBe('error');
    expect(result.metadata?.errorReason).toBe(ErrorReason.ToolNotFound);
  });

  it('delegates through assign tool with context passthrough', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 'success' as const,
      type: 'text' as const,
      result: 'ok',
      metadata: {},
    });
    const assignTool = { execute } as unknown as AssignTool;

    const tool = new AssignAliasTool<AliasInput>({
      name: 'alias_test',
      description: 'alias',
      parameters: { type: 'object', properties: {}, required: [] },
      hiddenAgentName: '__hidden_agent',
      getAssignTool: () => assignTool,
      buildAssignTask: async () => ({ description: 'desc', task: 'task' }),
    });

    const context = { conversationId: 'conv_1', eventPort: { emit: vi.fn() } };
    const result = await tool.execute({}, context);
    expect(result.status).toBe('success');
    expect(execute).toHaveBeenCalledWith(
      { agent: '__hidden_agent', description: 'desc', task: 'task' },
      context,
    );
  });

  it('returns invalid_input when alias payload is malformed', async () => {
    const execute = vi.fn();
    const assignTool = { execute } as unknown as AssignTool;
    const tool = new AssignAliasTool<AliasInput>({
      name: 'alias_test',
      description: 'alias',
      parameters: { type: 'object', properties: {}, required: [] },
      hiddenAgentName: '__hidden_agent',
      getAssignTool: () => assignTool,
      buildAssignTask: async () => ({ description: '', task: '' }),
    });

    const result = await tool.execute({});
    expect(result.status).toBe('error');
    expect(result.metadata?.errorReason).toBe(ErrorReason.InvalidInput);
    expect(execute).not.toHaveBeenCalled();
  });
});
