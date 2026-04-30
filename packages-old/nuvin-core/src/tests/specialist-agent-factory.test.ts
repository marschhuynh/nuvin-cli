import { describe, expect, it } from 'vitest';
import { DefaultSpecialistAgentFactory } from '../delegation/agent-factory.js';
import type { AgentTemplate, AssignParams } from '../agent-types.js';

const template: AgentTemplate = {
  name: 'analyst',
  description: 'Analyzes data',
  instructions: 'You are an analyst.\n{{injectedSystem}}',
  allowed_tools: ['file_read'],
};

const params: AssignParams = {
  agent: 'analyst',
  task: 'Summarize findings',
};

describe('DefaultSpecialistAgentFactory', () => {
  it('builds specialist config with injected system context and deterministic id', async () => {
    const factory = new DefaultSpecialistAgentFactory({
      systemContextProvider: () => ({
        timeISO: '2025-01-01T00:00:00.000Z',
        platform: 'darwin',
        arch: 'arm64',
        tempDir: '/tmp',
        workspaceDir: '/workspace',
      }),
      idGenerator: () => 'custom-id',
    });

    const config = await factory.create({ template, params, context: undefined, currentDepth: 2 });

    expect(config.agentId).toBe('custom-id');
    expect(config.agentName).toBe('analyst');
    expect(config.taskDescription).toBe(params.task);
    expect(config.delegationDepth).toBe(3);
    expect(config.allowed_tools).toEqual(['file_read']);
    expect(config.instructions).toContain('You are an analyst.');
    expect(config.instructions).toContain("System info:\n- Today's date: 2025-01-01T00:00:00.000Z");
  });

  it('falls back to sensible defaults when optional template fields are missing', async () => {
    const factory = new DefaultSpecialistAgentFactory({ idGenerator: () => 'id-123' });

    const minimalTemplate: AgentTemplate = {
      instructions: 'Just do it',
    };

    const config = await factory.create({ template: minimalTemplate, params, context: undefined, currentDepth: 0 });

    expect(config.agentId).toBe('id-123');
    expect(config.agentName).toBe(params.agent);
    expect(config.allowed_tools).toEqual([]);
    expect(config.delegationDepth).toBe(1);
  });
});
