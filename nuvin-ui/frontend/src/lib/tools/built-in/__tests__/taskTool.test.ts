import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { taskTool } from '../taskTool';
import { agentManager } from '@/lib/agent-manager';
import type { MessageResponse } from '@/lib/agent-manager';
import type { AgentSettings } from '@/types';

// Mock the agent manager
vi.mock('@/lib/agent-manager', () => ({
  agentManager: {
    getActiveAgent: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

// Mock UUID generation
vi.mock('@/lib/utils', () => ({
  generateUUID: vi.fn(() => 'test-task-id-123'),
}));

describe('taskTool', () => {
  const mockAgentManager = vi.mocked(agentManager);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('definition', () => {
    it('should have correct tool definition', () => {
      expect(taskTool.definition.name).toBe('Task');
      expect(taskTool.definition.description).toContain('Launch a new agent');
      expect(taskTool.definition.parameters.type).toBe('object');
      expect(taskTool.definition.parameters.required).toEqual(['description', 'prompt']);
      expect(taskTool.definition.parameters.properties.description).toBeDefined();
      expect(taskTool.definition.parameters.properties.prompt).toBeDefined();
    });

    it('should have correct metadata', () => {
      expect(taskTool.category).toBe('agent');
      expect(taskTool.version).toBe('1.0.0');
      expect(taskTool.author).toBe('system');
    });
  });

  describe('validate', () => {
    it('should validate correct parameters', () => {
      const validParams = {
        description: 'Search for files',
        prompt: 'Find all TypeScript files in the project',
      };
      expect(taskTool.validate!(validParams)).toBe(true);
    });

    it('should reject missing description', () => {
      const invalidParams = {
        prompt: 'Find all TypeScript files in the project',
      };
      expect(taskTool.validate!(invalidParams)).toBe(false);
    });

    it('should reject missing prompt', () => {
      const invalidParams = {
        description: 'Search for files',
      };
      expect(taskTool.validate!(invalidParams)).toBe(false);
    });

    it('should reject empty description', () => {
      const invalidParams = {
        description: '',
        prompt: 'Find all TypeScript files in the project',
      };
      expect(taskTool.validate!(invalidParams)).toBe(false);
    });

    it('should reject empty prompt', () => {
      const invalidParams = {
        description: 'Search for files',
        prompt: '',
      };
      expect(taskTool.validate!(invalidParams)).toBe(false);
    });

    it('should reject non-string parameters', () => {
      const invalidParams = {
        description: 123,
        prompt: 'Find all TypeScript files in the project',
      };
      expect(taskTool.validate!(invalidParams)).toBe(false);
    });
  });

  describe('execute', () => {
    const mockActiveAgent: AgentSettings = {
      id: 'test-agent',
      name: 'Test Agent',
      persona: 'helpful',
      responseLength: 'medium',
      temperature: 0.7,
      topP: 1.0,
      maxTokens: 2000,
      systemPrompt: 'You are a helpful assistant',
      agentType: 'local',
    };

    const mockResponse: MessageResponse = {
      id: 'test-response-id',
      content: 'Task completed successfully. Found 15 TypeScript files in the project.',
      role: 'assistant',
      timestamp: new Date().toISOString(),
      metadata: {
        agentId: 'test-agent',
        agentType: 'local',
        model: 'gpt-4',
        provider: 'openai',
        totalTokens: 150,
        responseTime: 1200,
      },
    };

    it('should execute task successfully', async () => {
      mockAgentManager.getActiveAgent.mockReturnValue(mockActiveAgent);
      mockAgentManager.sendMessage.mockResolvedValue(mockResponse);

      const result = await taskTool.execute({
        description: 'Search files',
        prompt: 'Find all TypeScript files in the project',
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        taskId: 'test-task-id-123',
        description: 'Search files',
        prompt: 'Find all TypeScript files in the project',
        response: 'Task completed successfully. Found 15 TypeScript files in the project.',
        agentId: 'test-agent',
        agentType: 'local',
        tokensUsed: 150,
        responseTime: 1200,
        model: 'gpt-4',
        provider: 'openai',
      });
      expect(result.metadata).toMatchObject({
        executionType: 'agent_task',
        agentUsed: 'Test Agent',
      });

      expect(mockAgentManager.sendMessage).toHaveBeenCalledWith(
        'Find all TypeScript files in the project',
        {
          taskId: 'test-task-id-123',
          userId: 'system',
          timeout: 300000,
        }
      );
    });

    it('should fail when no active agent is available', async () => {
      mockAgentManager.getActiveAgent.mockReturnValue(null);

      const result = await taskTool.execute({
        description: 'Search files',
        prompt: 'Find all TypeScript files in the project',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active agent available to handle the task');
    });

    it('should handle agent execution errors', async () => {
      mockAgentManager.getActiveAgent.mockReturnValue(mockActiveAgent);
      mockAgentManager.sendMessage.mockRejectedValue(new Error('Agent timeout'));

      const result = await taskTool.execute({
        description: 'Search files',
        prompt: 'Find all TypeScript files in the project',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task execution failed: Agent timeout');
      expect(result.metadata).toMatchObject({
        taskId: 'test-task-id-123',
        description: 'Search files',
        agentAttempted: 'Test Agent',
      });
    });

    it('should validate required parameters', async () => {
      const result = await taskTool.execute({
        prompt: 'Find all TypeScript files in the project',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Description parameter is required and must be a string');
    });

    it('should validate prompt parameter', async () => {
      const result = await taskTool.execute({
        description: 'Search files',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Prompt parameter is required and must be a string');
    });

    it('should validate description length', async () => {
      // Test very short description (1 word)
      let result = await taskTool.execute({
        description: 'search',
        prompt: 'Find all TypeScript files in the project',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Description should be 3-5 words (2-8 words accepted)');

      // Test very long description (>8 words)
      result = await taskTool.execute({
        description: 'this is a very long description that exceeds the maximum word limit',
        prompt: 'Find all TypeScript files in the project',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Description should be 3-5 words (2-8 words accepted)');
    });

    it('should accept valid description lengths', async () => {
      mockAgentManager.getActiveAgent.mockReturnValue(mockActiveAgent);
      mockAgentManager.sendMessage.mockResolvedValue(mockResponse);

      // Test 2 words (minimum)
      let result = await taskTool.execute({
        description: 'search files',
        prompt: 'Find all TypeScript files in the project',
      });
      expect(result.success).toBe(true);

      // Test 8 words (maximum)
      result = await taskTool.execute({
        description: 'search for all typescript files in project directory',
        prompt: 'Find all TypeScript files in the project',
      });
      expect(result.success).toBe(true);
    });

    it('should handle unknown errors', async () => {
      mockAgentManager.getActiveAgent.mockReturnValue(mockActiveAgent);
      mockAgentManager.sendMessage.mockRejectedValue('Unknown error string');

      const result = await taskTool.execute({
        description: 'Search files',
        prompt: 'Find all TypeScript files in the project',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task execution failed: Unknown error');
    });
  });
});