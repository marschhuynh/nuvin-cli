import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentManager } from '../agent-manager.js';
import { ErrorReason } from '../ports.js';
import type { LLMPort, ToolPort, AgentConfig, CompletionResult, ToolDefinition, LLMFactory } from '../ports.js';
import type { SpecialistAgentConfig } from '../agent-types.js';

describe('Sub-agent Abort - Error Reason Propagation', () => {
  let mockLLM: LLMPort;
  let mockTools: ToolPort;
  let delegatingConfig: AgentConfig;
  let mockFactory: LLMFactory;

  beforeEach(() => {
    mockLLM = {
      generateCompletion: vi.fn().mockResolvedValue({
        content: 'Task completed',
        tool_calls: undefined,
      } as CompletionResult),
    };

    mockTools = {
      getToolDefinitions: vi.fn().mockReturnValue([
        {
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'Test tool',
            parameters: { type: 'object', properties: {} },
          },
        },
      ] as ToolDefinition[]),
      executeToolCalls: vi.fn().mockResolvedValue([]),
    };

    mockFactory = {
      createLLM: vi.fn().mockReturnValue(mockLLM),
    };

    delegatingConfig = {
      id: 'parent-agent',
      model: 'test-model',
      systemPrompt: 'Test',
      temperature: 0.7,
      topP: 1,
      enabledTools: [],
    };
  });

  it('should set errorReason to Aborted when sub-agent is aborted before execution', async () => {
    const agentManager = new AgentManager(delegatingConfig, mockTools, mockFactory);

    // Create abort controller and abort immediately
    const abortController = new AbortController();
    abortController.abort();

    const config: SpecialistAgentConfig = {
      agentId: 'test-agent',
      agentName: 'Test Agent',
      taskDescription: 'Test task',
      systemPrompt: 'Test prompt',
      tools: ['test_tool'],
    };

    const result = await agentManager.executeTask(config, abortController.signal);

    expect(result.status).toBe('error');
    expect(result.result).toContain('aborted');
    expect(result.metadata.errorReason).toBe(ErrorReason.Aborted);
    expect(result.metadata.errorMessage).toContain('Aborted');
  });

  it('should set errorReason to Aborted when sub-agent is aborted during execution', async () => {
    // Mock LLM with delay to simulate slow response
    const delayedLLM: LLMPort = {
      generateCompletion: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return {
          content: 'This should not complete',
          tool_calls: undefined,
        } as CompletionResult;
      }),
    };

    const delayedFactory: LLMFactory = {
      createLLM: vi.fn().mockReturnValue(delayedLLM),
    };

    const agentManager = new AgentManager(delegatingConfig, mockTools, delayedFactory);

    const abortController = new AbortController();

    const config: SpecialistAgentConfig = {
      agentId: 'test-agent',
      agentName: 'Test Agent',
      taskDescription: 'Test task',
      systemPrompt: 'Test prompt',
      tools: ['test_tool'],
    };

    // Abort after 100ms (before LLM finishes)
    setTimeout(() => abortController.abort(), 100);

    const result = await agentManager.executeTask(config, abortController.signal);

    expect(result.status).toBe('error');
    expect(result.result).toContain('aborted');
    expect(result.metadata.errorReason).toBe(ErrorReason.Aborted);
  }, 10000);
});
