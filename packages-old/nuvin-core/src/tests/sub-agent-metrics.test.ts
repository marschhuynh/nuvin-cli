
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentManager } from '../agent-manager.js';
import {
  AgentEventTypes,
  type AgentConfig,
  type LLMFactory,
  type LLMPort,
  type ToolPort,
} from '../ports.js';

describe('AgentManager - Sub-Agent Metrics Streaming', () => {
  let agentManager: AgentManager;
  let mockLLM: LLMPort;
  let mockLLMFactory: LLMFactory;
  let mockTools: ToolPort;
  let events: any[] = [];

  const delegatingConfig: AgentConfig = {
    id: 'master-agent',
    systemPrompt: 'You are the master agent.',
    model: 'gpt-4',
    temperature: 0,
    topP: 1,
    maxToolConcurrency: 1,
  };

  beforeEach(() => {
    events = [];

    mockLLM = {
      generateCompletion: vi.fn().mockResolvedValue({
        content: 'I have completed the task.',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          cost: 0.001,
        },
      }),
      streamCompletion: vi.fn(),
    };

    mockLLMFactory = {
      createLLM: vi.fn().mockReturnValue(mockLLM),
    };

    mockTools = {
      getToolDefinitions: vi.fn().mockReturnValue([]),
      executeToolCalls: vi.fn().mockResolvedValue([]),
    };

    agentManager = new AgentManager(
      delegatingConfig,
      mockTools,
      mockLLMFactory,
      (event) => events.push(event)
    );
  });

  it('should emit SubAgentMetrics event when sub-agent records usage', async () => {
    const taskConfig = {
      agentId: 'sub-agent-1',
      agentName: 'Sub Agent',
      taskDescription: 'Do something',
      model: 'gpt-3.5-turbo',
      tools: [],
    };

    await agentManager.executeTask(taskConfig);

    // Find the metrics event
    const metricsEvent = events.find(
      (e) => e.type === AgentEventTypes.SubAgentMetrics
    );

    expect(metricsEvent).toBeDefined();
    expect(metricsEvent).toMatchObject({
      type: AgentEventTypes.SubAgentMetrics,
      agentId: 'sub-agent-1',
      metrics: expect.objectContaining({
        totalTokens: 15,
        totalPromptTokens: 10,
        totalCompletionTokens: 5,
        totalCost: 0.001,
        llmCallCount: 1,
      }),
    });
  });
});
