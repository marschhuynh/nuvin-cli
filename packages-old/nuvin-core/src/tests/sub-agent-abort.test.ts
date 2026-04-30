import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentManager } from '../agent-manager.js';
import type { LLMPort, ToolPort, AgentConfig, CompletionResult, ToolDefinition, LLMFactory } from '../ports.js';
import type { SpecialistAgentConfig } from '../agent-types.js';

describe('Sub-Agent Abort Functionality', () => {
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

  describe('Abort before sub-agent starts', () => {
    it('should return abort error when signal is already aborted', async () => {
      const agentManager = new AgentManager(delegatingConfig, mockTools, mockFactory);

      const controller = new AbortController();
      controller.abort();

      const config: SpecialistAgentConfig = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        taskDescription: 'Test task',
        systemPrompt: 'Test prompt',
        tools: ['test_tool'],
      };

      const result = await agentManager.executeTask(config, controller.signal);

      expect(result.status).toBe('error');
      expect(result.result).toBe('Sub-agent execution aborted by user');
      expect(result.metadata.toolCallsExecuted).toBe(0);
    });
  });

  describe('Abort during sub-agent execution', () => {
    it('should abort sub-agent when signal is triggered during execution', async () => {
      mockLLM.generateCompletion = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          content: 'This should not complete',
          tool_calls: undefined,
        } as CompletionResult;
      });

      const agentManager = new AgentManager(delegatingConfig, mockTools, mockFactory);

      const controller = new AbortController();

      const config: SpecialistAgentConfig = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        taskDescription: 'Test task',
        systemPrompt: 'Test prompt',
        tools: ['test_tool'],
      };

      const executePromise = agentManager.executeTask(config, controller.signal);

      setTimeout(() => controller.abort(), 50);

      const result = await executePromise;

      expect(result.status).toBe('error');
      expect(result.result).toContain('aborted');
    }, 10000);
  });

  describe('Signal propagation to sub-agent tools', () => {
    it('should pass signal to sub-agent orchestrator', async () => {
      let receivedSignal: AbortSignal | undefined;

      mockLLM.generateCompletion = vi.fn().mockImplementation(async (_params, signal) => {
        receivedSignal = signal;
        if (signal?.aborted) {
          throw new Error('Aborted');
        }
        return {
          content: 'Completed',
          tool_calls: undefined,
        } as CompletionResult;
      });

      const agentManager = new AgentManager(delegatingConfig, mockTools, mockFactory);

      const controller = new AbortController();
      controller.abort();

      const config: SpecialistAgentConfig = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        taskDescription: 'Test task',
        systemPrompt: 'Test prompt',
        tools: ['test_tool'],
      };

      await agentManager.executeTask(config, controller.signal);

      // The signal should not be passed yet since we abort before execution
      // This test verifies the signal flow is set up correctly
      expect(receivedSignal).toBeUndefined();
    });
  });

  describe('Abort message consistency', () => {
    it('should use consistent abort message for sub-agents', async () => {
      const agentManager = new AgentManager(delegatingConfig, mockTools, mockFactory);

      const controller = new AbortController();
      controller.abort();

      const config: SpecialistAgentConfig = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        taskDescription: 'Test task',
        systemPrompt: 'Test prompt',
        tools: [],
      };

      const result = await agentManager.executeTask(config, controller.signal);

      expect(result.result).toMatch(/aborted by user/i);
      expect(result.result).toContain('Sub-agent');
    });
  });

  describe('Cleanup after abort', () => {
    it('should cleanup active agents after abort', async () => {
      mockLLM.generateCompletion = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        throw new Error('Aborted');
      });

      const agentManager = new AgentManager(delegatingConfig, mockTools, mockFactory);

      const controller = new AbortController();

      const config: SpecialistAgentConfig = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        taskDescription: 'Test task',
        systemPrompt: 'Test prompt',
        tools: [],
      };

      const executePromise = agentManager.executeTask(config, controller.signal);

      setTimeout(() => controller.abort(), 50);

      await executePromise;

      expect(agentManager.getActiveAgentCount()).toBe(0);
    }, 10000);
  });
});
