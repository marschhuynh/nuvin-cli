import { describe, expect, it, vi } from 'vitest';
import { DefaultDelegationService } from '../delegation/delegation-service.js';
import type { AgentCatalog, AgentCommandRunner, SpecialistAgentFactory } from '../delegation/types.js';
import type { AssignParams, SpecialistAgentConfig, SpecialistAgentResult, AgentTemplate } from '../agent-types.js';

const createCatalog = (agents: AgentTemplate[]): AgentCatalog => ({
  list: () => agents,
  get: (agentId: string) => agents.find((agent) => agent.name === agentId),
});

describe('DefaultDelegationService', () => {
  const agent: AgentTemplate = {
    name: 'researcher',
    description: 'Does research',
    instructions: 'Prompt',
    allowed_tools: ['web_search'],
  };

  const params: AssignParams = {
    agent: 'researcher',
    task: 'Investigate the topic',
  };

  const context = {};

  const createDeps = () => {
    const factory: SpecialistAgentFactory = {
      create: vi.fn(
        () =>
          ({
            agentId: 'researcher-1',
            agentName: 'Researcher',
            systemPrompt: 'Prompt',
            taskDescription: params.task,
            tools: ['web_search'],
            delegationDepth: 1,
            shareContext: false,
          }) as unknown as SpecialistAgentConfig,
      ),
    };

    const runner: AgentCommandRunner = {
      run: vi.fn(
        async () =>
          ({
            status: 'success',
            result: 'All done',
            metadata: {
              agentId: 'researcher-1',
              agentName: 'Researcher',
              executionTimeMs: 100,
              toolCallsExecuted: 2,
            },
          }) satisfies SpecialistAgentResult,
      ),
    };

    return { factory, runner };
  };

  it('delegates successfully when policy allows', async () => {
    const deps = createDeps();
    const service = new DefaultDelegationService(createCatalog([agent]), deps.factory, deps.runner);

    const result = await service.delegate(params, context);

    expect(result.success).toBe(true);
    expect(result.summary).toBe('All done');
    expect(result.metadata?.status).toBe('success');

    expect(deps.factory.create).toHaveBeenCalled();
    expect(deps.runner.run).toHaveBeenCalled();
  });

  it('returns error when agent not found', async () => {
    const deps = createDeps();
    const service = new DefaultDelegationService(createCatalog([]), deps.factory, deps.runner);

    const result = await service.delegate(params, context);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Agent "researcher" not found/);
  });

  it('returns error when agent is disabled', async () => {
    const deps = createDeps();
    const service = new DefaultDelegationService(createCatalog([agent]), deps.factory, deps.runner);
    service.setEnabledAgents({ researcher: false });

    const result = await service.delegate(params, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
    expect(deps.runner.run).not.toHaveBeenCalled();
  });

  it('formats errors thrown by runner', async () => {
    const deps = createDeps();
    deps.runner.run = vi.fn(async () => {
      throw new Error('boom');
    });

    const service = new DefaultDelegationService(createCatalog([agent]), deps.factory, deps.runner);

    const result = await service.delegate(params, context);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to execute specialist agent: boom/);
  });

  it('filters disabled agents when listing', () => {
    const deps = createDeps();
    const service = new DefaultDelegationService(createCatalog([agent]), deps.factory, deps.runner);

    service.setEnabledAgents({ researcher: false });
    const enabledAgents = service.listEnabledAgents();

    expect(enabledAgents).toHaveLength(0);

    service.setEnabledAgents({ researcher: true });
    const enabledAgain = service.listEnabledAgents();

    expect(enabledAgain).toHaveLength(1);
  });
});
