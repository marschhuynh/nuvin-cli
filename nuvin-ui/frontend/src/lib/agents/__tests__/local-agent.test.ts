import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { LocalAgent } from '../local-agent';
import { createProvider } from '../../providers';
import { toolIntegrationService } from '../../tools';
import { generateUUID } from '../../utils';
import { calculateCost } from '../../utils/cost-calculator';
import type { ProviderConfig, AgentSettings, Message } from '@/types';
import type { CompletionResult, LLMProvider } from '../../providers/types/base';
import type { ToolCallResult } from '@/types/tools';
import { PROVIDER_TYPES } from '@/lib/providers/provider-utils';

// Mock dependencies
vi.mock('../../providers');
vi.mock('../../tools');
vi.mock('../../utils');
vi.mock('../../utils/cost-calculator');
vi.mock('@/store/useTodoStore', () => ({
  useTodoStore: {
    getState: () => ({
      getTodoStateForReminders: () => ({
        todos: [],
        isEmpty: true,
        hasInProgress: false,
        recentChanges: false,
        allCompleted: false,
        completedCount: 0,
        totalCount: 0,
      }),
    }),
  },
}));

const mockCreateProvider = vi.mocked(createProvider);
const mockToolIntegrationService = vi.mocked(toolIntegrationService);
const mockGenerateUUID = vi.mocked(generateUUID);
const mockCalculateCost = vi.mocked(calculateCost);

describe('LocalAgent - Non-Streaming Messages', () => {
  let agent: LocalAgent;
  let mockProvider: LLMProvider & {
    generateCompletion: MockedFunction<LLMProvider['generateCompletion']>;
    generateCompletionStream: MockedFunction<any>;
    generateCompletionStreamWithTools: MockedFunction<any>;
    getModels: MockedFunction<LLMProvider['getModels']>;
  };
  let mockAgentSettings: AgentSettings;
  let mockProviderConfig: ProviderConfig;
  let mockHistory: Map<string, Message[]>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock provider
    mockProvider = {
      type: 'openai',
      generateCompletion: vi.fn(),
      generateCompletionStream: vi.fn(),
      generateCompletionStreamWithTools: vi.fn(),
      getModels: vi.fn().mockResolvedValue([]),
    };

    mockCreateProvider.mockReturnValue(mockProvider);

    // Mock agent settings
    mockAgentSettings = {
      id: 'test-agent',
      name: 'Test Agent',
      agentType: 'local',
      responseLength: 'medium',
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 4000,
      systemPrompt: 'You are a helpful assistant.',
      toolConfig: {
        enabledTools: ['testTool'],
        maxConcurrentCalls: 3,
        timeoutMs: 30000,
      },
    };

    // Mock provider config
    mockProviderConfig = {
      id: 'provider-1',
      name: 'Test OpenAI Provider',
      type: PROVIDER_TYPES.OpenAI,
      apiKey: 'test-key',
      activeModel: {
        model: 'gpt-4',
        maxTokens: 4000,
      },
    };

    // Mock history
    mockHistory = new Map();

    // Mock utility functions
    mockGenerateUUID.mockReturnValue('mock-uuid');
    mockCalculateCost.mockReturnValue(0.01);

    // Create agent instance
    agent = new LocalAgent(mockAgentSettings, mockProviderConfig, mockHistory);
  });

  describe('Basic Message Handling', () => {
    it('should handle simple message without tools', async () => {
      // Arrange
      const mockResult: CompletionResult = {
        content: 'Hello, how can I help you?',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
      };

      mockProvider.generateCompletion.mockResolvedValue(mockResult);
      mockToolIntegrationService.enhanceCompletionParams.mockImplementation((params) => params);

      // Act
      const response = await agent.sendMessage(['Hello'], {
        conversationId: 'test-conv',
        onComplete: vi.fn(),
      });

      // Assert
      expect(mockProvider.generateCompletion).toHaveBeenCalledTimes(1);
      expect(response.content).toBe('Hello, how can I help you?');
      expect(response.role).toBe('assistant');
      expect(response.metadata?.agentType).toBe('local');
      expect(response.metadata?.model).toBe('gpt-4');
      expect(response.metadata?.promptTokens).toBe(10);
      expect(response.metadata?.completionTokens).toBe(8);
      expect(response.metadata?.totalTokens).toBe(18);
    });

    it('should call onComplete callback', async () => {
      // Arrange
      const mockResult: CompletionResult = {
        content: 'Task completed',
      };

      mockProvider.generateCompletion.mockResolvedValue(mockResult);
      mockToolIntegrationService.enhanceCompletionParams.mockImplementation((params) => params);

      const onCompleteMock = vi.fn();

      // Act
      await agent.sendMessage(['Do something'], {
        conversationId: 'test-conv',
        onComplete: onCompleteMock,
      });

      // Assert
      expect(onCompleteMock).toHaveBeenCalledWith('Task completed');
    });

    it('should add messages to history', async () => {
      // Arrange
      const mockResult: CompletionResult = {
        content: 'Response content',
      };

      mockProvider.generateCompletion.mockResolvedValue(mockResult);
      mockToolIntegrationService.enhanceCompletionParams.mockReturnValue({
        messages: [{ role: 'user', content: 'Test message' }],
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9,
      });

      // Act
      await agent.sendMessage(['Test message'], {
        conversationId: 'test-conv',
      });

      // Assert
      const history = mockHistory.get('test-conv');
      expect(history).toBeDefined();
      expect(history).toHaveLength(2); // User message + Assistant response
      expect(history?.[0].role).toBe('user');
      expect(history?.[0].content).toBe('Test message');
      expect(history?.[1].role).toBe('assistant');
      expect(history?.[1].content).toBe('Response content');
    });
  });

  describe('Single Tool Call Handling', () => {
    it('should execute single tool call and return final response', async () => {
      // Arrange
      const initialResult: CompletionResult = {
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'testTool',
              arguments: '{"param": "value"}',
            },
          },
        ],
      };

      const finalResult: CompletionResult = {
        content: 'Tool execution completed successfully',
        usage: {
          prompt_tokens: 20,
          completion_tokens: 15,
          total_tokens: 35,
        },
      };

      const mockToolResults: ToolCallResult[] = [
        {
          id: 'call_1',
          name: 'testTool',
          result: {
            status: 'success',
            type: 'text',
            result: 'Tool executed successfully',
          },
        },
      ];

      mockProvider.generateCompletion.mockResolvedValueOnce(initialResult).mockResolvedValueOnce(finalResult);

      mockToolIntegrationService.enhanceCompletionParams.mockImplementation((params) => ({
        ...params,
        tools: [
          {
            type: 'function',
            function: {
              name: 'testTool',
              description: 'Tool description',
              parameters: {},
            },
          },
        ],
      }));

      mockToolIntegrationService.processCompletionResult.mockResolvedValue({
        result: initialResult,
        tool_results: mockToolResults,
        requiresFollowUp: true,
      });

      const onAdditionalMessageMock = vi.fn();

      // Act
      const response = await agent.sendMessage(['Execute tool'], {
        conversationId: 'test-conv',
        onAdditionalMessage: onAdditionalMessageMock,
      });

      // Assert
      expect(mockProvider.generateCompletion).toHaveBeenCalledTimes(2);
      expect(onAdditionalMessageMock).toHaveBeenCalledTimes(1);
      expect(response.content).toBe('Tool execution completed successfully');
      expect(response.metadata?.totalTokens).toBe(35);

      // Verify tool message was emitted
      const toolMessage = onAdditionalMessageMock.mock.calls[0][0];
      expect(toolMessage.role).toBe('tool');
      expect(toolMessage.content).toBe('Executed tool: testTool');
      expect(toolMessage.toolCall?.name).toBe('testTool');
      expect(toolMessage.toolCall?.result).toEqual(mockToolResults[0].result);
    });
  });

  describe('Recursive Tool Call Handling', () => {
    it('should handle 3 levels of recursive tool calls', async () => {
      // Arrange
      const result1: CompletionResult = {
        content: 'Starting first tool',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'createFile',
              arguments: '{"filename": "test.txt"}',
            },
          },
        ],
      };

      const result2: CompletionResult = {
        content: 'File created, now reading',
        tool_calls: [
          {
            id: 'call_2',
            type: 'function',
            function: {
              name: 'readFile',
              arguments: '{"filename": "test.txt"}',
            },
          },
        ],
      };

      const result3: CompletionResult = {
        content: 'File read, now validating',
        tool_calls: [
          {
            id: 'call_3',
            type: 'function',
            function: {
              name: 'validateFile',
              arguments: '{"filename": "test.txt"}',
            },
          },
        ],
      };

      const finalResult: CompletionResult = {
        content: 'All operations completed successfully',
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: 80,
        },
      };

      const toolResults1: ToolCallResult[] = [
        {
          id: 'call_1',
          name: 'createFile',
          result: { status: 'success', type: 'text', result: 'File created' },
        },
      ];

      const toolResults2: ToolCallResult[] = [
        {
          id: 'call_2',
          name: 'readFile',
          result: {
            status: 'success',
            type: 'text',
            result: 'File content: Hello World',
          },
        },
      ];

      const toolResults3: ToolCallResult[] = [
        {
          id: 'call_3',
          name: 'validateFile',
          result: { status: 'success', type: 'text', result: 'File is valid' },
        },
      ];

      mockProvider.generateCompletion
        .mockResolvedValueOnce(result1)
        .mockResolvedValueOnce(result2)
        .mockResolvedValueOnce(result3)
        .mockResolvedValueOnce(finalResult);

      // Mock enhanceCompletionParams to pass through the actual params
      mockToolIntegrationService.enhanceCompletionParams.mockImplementation((params) => ({
        ...params,
        tools: [
          {
            type: 'function',
            function: {
              name: 'fileOps',
              description: 'Tool description',
              parameters: {},
            },
          },
        ],
      }));

      mockToolIntegrationService.processCompletionResult
        .mockResolvedValueOnce({
          result: result1,
          tool_results: toolResults1,
          requiresFollowUp: true,
        })
        .mockResolvedValueOnce({
          result: result2,
          tool_results: toolResults2,
          requiresFollowUp: true,
        })
        .mockResolvedValueOnce({
          result: result3,
          tool_results: toolResults3,
          requiresFollowUp: true,
        });

      const onAdditionalMessageMock = vi.fn();

      // Act
      const response = await agent.sendMessage(['Create, read, and validate file'], {
        conversationId: 'test-conv',
        onAdditionalMessage: onAdditionalMessageMock,
      });

      // Assert
      expect(mockProvider.generateCompletion).toHaveBeenCalledTimes(4);
      expect(onAdditionalMessageMock).toHaveBeenCalledTimes(3);
      expect(response.content).toBe('All operations completed successfully');

      // Verify that the agent called the provider with messages - don't check exact counts
      // as they may vary with implementation, just verify calls were made
      const calls = mockProvider.generateCompletion.mock.calls;
      expect(calls.length).toBe(4);

      // Verify tool messages were emitted in order
      expect(onAdditionalMessageMock.mock.calls[0][0].toolCall?.name).toBe('createFile');
      expect(onAdditionalMessageMock.mock.calls[1][0].toolCall?.name).toBe('readFile');
      expect(onAdditionalMessageMock.mock.calls[2][0].toolCall?.name).toBe('validateFile');
    });

    it('should stop at maximum recursion depth', async () => {
      // Arrange - Create a scenario that would recurse infinitely
      const recursiveResult: CompletionResult = {
        content: 'Recursive call',
        tool_calls: [
          {
            id: 'call_recursive',
            type: 'function',
            function: { name: 'recursiveTool', arguments: '{}' },
          },
        ],
      };

      const toolResult: ToolCallResult[] = [
        {
          id: 'call_recursive',
          name: 'recursiveTool',
          result: { status: 'success', type: 'text', result: 'Keep going' },
        },
      ];

      // Mock to always return the same recursive result
      mockProvider.generateCompletion.mockResolvedValue(recursiveResult);

      mockToolIntegrationService.enhanceCompletionParams.mockImplementation((params) => ({
        ...params,
        tools: [
          {
            type: 'function',
            function: {
              name: 'recursiveTool',
              description: 'Tool description',
              parameters: {},
            },
          },
        ],
      }));

      mockToolIntegrationService.processCompletionResult.mockResolvedValue({
        result: recursiveResult,
        tool_results: toolResult,
        requiresFollowUp: true,
      });

      // Act
      const response = await agent.sendMessage(['Start recursive process'], {
        conversationId: 'test-conv',
      });

      // Assert
      expect(mockProvider.generateCompletion).toHaveBeenCalledTimes(51); // Initial call + 50 recursive calls
      expect(response.content).toContain('Tool calling stopped due to maximum recursion depth');
      expect(response.content).toContain('1 tool call(s) not executed');
    });

    it('should handle tool execution errors gracefully', async () => {
      // Arrange
      const resultWithTool: CompletionResult = {
        content: 'Executing tool',
        tool_calls: [
          {
            id: 'call_error',
            type: 'function',
            function: { name: 'errorTool', arguments: '{}' },
          },
        ],
      };

      const finalResult: CompletionResult = {
        content: 'Handled error and continued',
      };

      const errorToolResult: ToolCallResult[] = [
        {
          id: 'call_error',
          name: 'errorTool',
          result: {
            status: 'error',
            type: 'text',
            result: 'Tool execution failed',
          },
        },
      ];

      mockProvider.generateCompletion.mockResolvedValueOnce(resultWithTool).mockResolvedValueOnce(finalResult);

      mockToolIntegrationService.enhanceCompletionParams.mockImplementation((params) => ({
        ...params,
        tools: [
          {
            type: 'function',
            function: {
              name: 'errorTool',
              description: 'Tool description',
              parameters: {},
            },
          },
        ],
      }));

      mockToolIntegrationService.processCompletionResult.mockResolvedValue({
        result: resultWithTool,
        tool_results: errorToolResult,
        requiresFollowUp: true,
      });

      const onAdditionalMessageMock = vi.fn();

      // Act
      const response = await agent.sendMessage(['Execute error tool'], {
        conversationId: 'test-conv',
        onAdditionalMessage: onAdditionalMessageMock,
      });

      // Assert
      expect(response.content).toBe('Handled error and continued');
      expect(onAdditionalMessageMock).toHaveBeenCalledTimes(1);

      const toolMessage = onAdditionalMessageMock.mock.calls[0][0];
      expect(toolMessage.toolCall?.result.status).toBe('error');
      expect(toolMessage.toolCall?.result.result).toBe('Tool execution failed');
    });
  });

  describe('Error Handling', () => {
    it('should handle provider errors', async () => {
      // Arrange
      const providerError = new Error('Provider connection failed');
      mockProvider.generateCompletion.mockRejectedValue(providerError);

      mockToolIntegrationService.enhanceCompletionParams.mockReturnValue({
        messages: [{ role: 'user', content: 'Test message' }],
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9,
      });

      const onErrorMock = vi.fn();

      // Act & Assert
      await expect(
        agent.sendMessage(['Test message'], {
          conversationId: 'test-conv',
          onError: onErrorMock,
        }),
      ).rejects.toThrow('Provider connection failed');

      expect(onErrorMock).toHaveBeenCalledWith(providerError);
    });

    it('should handle cancellation', async () => {
      // Arrange
      mockProvider.generateCompletion.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request cancelled')), 100);
        });
      });

      mockToolIntegrationService.enhanceCompletionParams.mockReturnValue({
        messages: [{ role: 'user', content: 'Test message' }],
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9,
      });

      const onErrorMock = vi.fn();

      // Act
      const messagePromise = agent.sendMessage(['Test message'], {
        conversationId: 'test-conv',
        onError: onErrorMock,
      });

      // Cancel the request
      agent.cancel();

      // Assert
      await expect(messagePromise).rejects.toThrow();
      expect(onErrorMock).toHaveBeenCalled();
    });
  });

  describe('Message Building', () => {
    it('should build correct message history with multiple user messages', async () => {
      // Arrange
      const mockResult: CompletionResult = {
        content: 'Processed multiple messages',
      };

      mockProvider.generateCompletion.mockResolvedValue(mockResult);
      mockToolIntegrationService.enhanceCompletionParams.mockReturnValue({
        messages: [
          { role: 'user', content: 'First message' },
          { role: 'user', content: 'Second message' },
        ],
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9,
      });

      // Act
      await agent.sendMessage(['First message', 'Second message'], {
        conversationId: 'test-conv',
      });

      // Assert
      const history = mockHistory.get('test-conv');
      expect(history).toHaveLength(3); // 2 user messages + 1 assistant response
      expect(history?.[0].role).toBe('user');
      expect(history?.[0].content).toBe('First message');
      expect(history?.[1].role).toBe('user');
      expect(history?.[1].content).toBe('Second message');
      expect(history?.[2].role).toBe('assistant');
      expect(history?.[2].content).toBe('Processed multiple messages');
    });

    it('should include tool results in history', async () => {
      // Arrange
      const initialResult: CompletionResult = {
        content: 'Using tool',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'testTool', arguments: '{}' },
          },
        ],
      };

      const finalResult: CompletionResult = {
        content: 'Tool completed',
      };

      const toolResults: ToolCallResult[] = [
        {
          id: 'call_1',
          name: 'testTool',
          result: { status: 'success', type: 'text', result: 'Success' },
        },
      ];

      mockProvider.generateCompletion.mockResolvedValueOnce(initialResult).mockResolvedValueOnce(finalResult);

      mockToolIntegrationService.enhanceCompletionParams.mockReturnValue({
        messages: [{ role: 'user', content: 'Use tool' }],
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9,
        tools: [
          {
            type: 'function',
            function: {
              name: 'testTool',
              description: 'Tool description',
              parameters: {},
            },
          },
        ],
      });

      mockToolIntegrationService.processCompletionResult.mockResolvedValue({
        result: initialResult,
        tool_results: toolResults,
        requiresFollowUp: true,
      });

      // Act
      await agent.sendMessage(['Use tool'], {
        conversationId: 'test-conv',
      });

      // Assert
      const history = mockHistory.get('test-conv');
      expect(history).toHaveLength(3); // User message + Tool message + Assistant response
      expect(history?.[0].role).toBe('user');
      expect(history?.[1].role).toBe('tool');
      expect(history?.[1].content).toBe('Executed tool: testTool');
      expect(history?.[1].toolCall?.name).toBe('testTool');
      expect(history?.[2].role).toBe('assistant');
    });
  });
});
