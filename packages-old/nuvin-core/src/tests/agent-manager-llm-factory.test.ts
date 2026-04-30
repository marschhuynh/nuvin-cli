import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentManager } from '../agent-manager.js';
import type { AgentConfig, LLMPort, LLMFactory, ToolPort, CompletionResult } from '../ports.js';
import type { SpecialistAgentConfig } from '../agent-types.js';

describe('AgentManager - LLM Factory', () => {
  let delegatingConfig: AgentConfig;
  let mockLLM: LLMPort;
  let factoryCreatedLLM: LLMPort;
  let mockTools: ToolPort;
  let mockFactory: LLMFactory;

  beforeEach(() => {
    delegatingConfig = {
      id: 'test-agent',
      systemPrompt: 'Test system prompt',
      temperature: 0.7,
      topP: 1,
      model: 'gpt-4',
      enabledTools: [],
    };

    mockLLM = {
      generateCompletion: vi.fn().mockResolvedValue({
        content: 'Delegating LLM response',
        usage: { total_tokens: 100 },
      } satisfies CompletionResult),
    };

    factoryCreatedLLM = {
      generateCompletion: vi.fn().mockResolvedValue({
        content: 'Factory LLM response',
        usage: { total_tokens: 200 },
      } satisfies CompletionResult),
    };

    mockTools = {
      getToolDefinitions: vi.fn().mockReturnValue([]),
      executeToolCalls: vi.fn().mockResolvedValue([]),
    };

    mockFactory = {
      createLLM: vi.fn().mockReturnValue(factoryCreatedLLM),
    };
  });

  describe('Without LLM Factory', () => {
    it('should throw error when trying to execute task without factory', async () => {
      const agentManager = new AgentManager(delegatingConfig, mockTools, undefined);

      const config: SpecialistAgentConfig = {
        agentId: 'specialist-1',
        agentName: 'Specialist',
        taskDescription: 'Test task',
        systemPrompt: 'Specialist prompt',
        tools: [],
        provider: 'openrouter',
        model: 'gpt-4',
        delegationDepth: 1,
      };

      await expect(agentManager.executeTask(config)).rejects.toThrow('AgentManager requires LLMFactory');
    });
  });

  describe('With LLM Factory', () => {
    it('should use factory to create fresh LLM even when no overrides specified', async () => {
      const agentManager = new AgentManager(delegatingConfig, mockTools, mockFactory);

      const config: SpecialistAgentConfig = {
        agentId: 'specialist-1',
        agentName: 'Specialist',
        taskDescription: 'Test task',
        systemPrompt: 'Specialist prompt',
        tools: [],
        delegationDepth: 1,
      };

      await agentManager.executeTask(config);

      expect(mockFactory.createLLM).toHaveBeenCalledWith({
        provider: undefined,
        model: undefined,
        
      });
      expect(factoryCreatedLLM.generateCompletion).toHaveBeenCalled();
      expect(mockLLM.generateCompletion).not.toHaveBeenCalled();
    });

    it('should use factory LLM when provider is specified', async () => {
      const agentManager = new AgentManager(delegatingConfig, mockTools, mockFactory);

      const config: SpecialistAgentConfig = {
        agentId: 'specialist-1',
        agentName: 'Specialist',
        taskDescription: 'Test task',
        systemPrompt: 'Specialist prompt',
        tools: [],
        provider: 'anthropic',
        delegationDepth: 1,
      };

      await agentManager.executeTask(config);

      expect(mockFactory.createLLM).toHaveBeenCalledWith({
        provider: 'anthropic',
        model: undefined,
        
      });
      expect(factoryCreatedLLM.generateCompletion).toHaveBeenCalled();
      expect(mockLLM.generateCompletion).not.toHaveBeenCalled();
    });

    it('should use factory LLM when model is specified', async () => {
      const agentManager = new AgentManager(delegatingConfig, mockTools, mockFactory);

      const config: SpecialistAgentConfig = {
        agentId: 'specialist-1',
        agentName: 'Specialist',
        taskDescription: 'Test task',
        systemPrompt: 'Specialist prompt',
        tools: [],
        model: 'claude-3-opus',
        delegationDepth: 1,
      };

      await agentManager.executeTask(config);

      expect(mockFactory.createLLM).toHaveBeenCalledWith({
        provider: undefined,
        model: 'claude-3-opus',
        
      });
      expect(factoryCreatedLLM.generateCompletion).toHaveBeenCalled();
      expect(mockLLM.generateCompletion).not.toHaveBeenCalled();
    });

    it('should use factory LLM with all overrides specified', async () => {
      const agentManager = new AgentManager(delegatingConfig, mockTools, mockFactory);

      const config: SpecialistAgentConfig = {
        agentId: 'specialist-1',
        agentName: 'Specialist',
        taskDescription: 'Test task',
        systemPrompt: 'Specialist prompt',
        tools: [],
        provider: 'anthropic',
        model: 'claude-3-opus',
        delegationDepth: 1,
      };

      await agentManager.executeTask(config);

      expect(mockFactory.createLLM).toHaveBeenCalledWith({
        provider: 'anthropic',
        model: 'claude-3-opus',
      });
      expect(factoryCreatedLLM.generateCompletion).toHaveBeenCalled();
      expect(mockLLM.generateCompletion).not.toHaveBeenCalled();
    });
  });
});
