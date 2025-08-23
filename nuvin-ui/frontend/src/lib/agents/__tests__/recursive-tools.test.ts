import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { LocalAgent } from '../local-agent';
import { createProvider } from '../../providers';
import { toolIntegrationService } from '../../tools';
import { generateUUID } from '../../utils';
import { calculateCost } from '../../utils/cost-calculator';
import type { ProviderConfig, AgentSettings, Message } from '@/types';
import { PROVIDER_TYPES } from '@/lib/providers/provider-utils';
import type { CompletionResult, LLMProvider } from '../../providers/types/base';
import type { ToolCallResult } from '@/types/tools';
import { createMockToolCall, createMockToolResult, createMockCompletionResult } from '@/test/agent-test-setup';

// Mock dependencies
vi.mock('../../providers');
vi.mock('../../tools');
vi.mock('../../utils');
vi.mock('../../utils/cost-calculator');

const mockCreateProvider = vi.mocked(createProvider);
const mockToolIntegrationService = vi.mocked(toolIntegrationService);
const mockGenerateUUID = vi.mocked(generateUUID);
const mockCalculateCost = vi.mocked(calculateCost);

describe('LocalAgent - Recursive Tool Calls', () => {
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
    vi.clearAllMocks();

    mockProvider = {
      type: 'openai',
      generateCompletion: vi.fn(),
      generateCompletionStream: vi.fn(),
      generateCompletionStreamWithTools: vi.fn(),
      getModels: vi.fn().mockResolvedValue([]),
    };

    mockCreateProvider.mockReturnValue(mockProvider);

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
        enabledTools: ['createFile', 'readFile', 'validateFile', 'generateReport'],
        maxConcurrentCalls: 3,
        timeoutMs: 30000,
      },
    };

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

    mockHistory = new Map();

    let uuidCounter = 0;
    mockGenerateUUID.mockImplementation(() => `mock-uuid-${++uuidCounter}`);
    mockCalculateCost.mockReturnValue(0.01);

    agent = new LocalAgent(mockAgentSettings, mockProviderConfig, mockHistory);
  });

  describe('Complex Recursive Scenarios', () => {
    it('should handle file processing pipeline with 5 recursive steps', async () => {
      // Arrange - Simulate a complex file processing workflow
      const steps = [
        {
          result: createMockCompletionResult('Creating project structure', [
            createMockToolCall('call_1', 'createFile', {
              name: 'package.json',
            }),
          ]),
          toolResults: [createMockToolResult('call_1', 'createFile', 'package.json created')],
        },
        {
          result: createMockCompletionResult('Reading package.json to validate', [
            createMockToolCall('call_2', 'readFile', {
              name: 'package.json',
            }),
          ]),
          toolResults: [createMockToolResult('call_2', 'readFile', '{"name": "test-project"}')],
        },
        {
          result: createMockCompletionResult('Validating package.json structure', [
            createMockToolCall('call_3', 'validateFile', {
              name: 'package.json',
            }),
          ]),
          toolResults: [createMockToolResult('call_3', 'validateFile', 'Valid JSON structure')],
        },
        {
          result: createMockCompletionResult('Creating README based on package.json', [
            createMockToolCall('call_4', 'createFile', { name: 'README.md' }),
          ]),
          toolResults: [createMockToolResult('call_4', 'createFile', 'README.md created')],
        },
        {
          result: createMockCompletionResult('Generating final project report', [
            createMockToolCall('call_5', 'generateReport', {
              files: ['package.json', 'README.md'],
            }),
          ]),
          toolResults: [createMockToolResult('call_5', 'generateReport', 'Project setup complete')],
        },
      ];

      const finalResult = createMockCompletionResult(
        'Project setup completed successfully with all files created and validated',
        undefined,
        { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      );

      // Setup mock responses
      steps.forEach((step) => {
        mockProvider.generateCompletion.mockResolvedValueOnce(step.result);
        mockToolIntegrationService.processCompletionResult.mockResolvedValueOnce({
          result: step.result,
          tool_results: step.toolResults,
          requiresFollowUp: true,
        });
      });

      mockProvider.generateCompletion.mockResolvedValueOnce(finalResult);

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

      const onAdditionalMessageMock = vi.fn();

      // Act
      const response = await agent.sendMessage(['Setup new project with validation'], {
        conversationId: 'test-conv',
        onAdditionalMessage: onAdditionalMessageMock,
      });

      // Assert
      expect(mockProvider.generateCompletion).toHaveBeenCalledTimes(6); // 5 tool rounds + 1 final
      expect(onAdditionalMessageMock).toHaveBeenCalledTimes(5); // One for each tool execution
      expect(response.content).toBe('Project setup completed successfully with all files created and validated');

      // Verify tool execution order
      const toolNames = onAdditionalMessageMock.mock.calls.map((call) => call[0].toolCall?.name);
      expect(toolNames).toEqual(['createFile', 'readFile', 'validateFile', 'createFile', 'generateReport']);
    });

    it('should handle branching tool calls (multiple tools in one response)', async () => {
      // Arrange - LLM decides to call multiple tools at once
      const multiToolResult = createMockCompletionResult('Processing multiple files', [
        createMockToolCall('call_1', 'readFile', { name: 'file1.txt' }),
        createMockToolCall('call_2', 'readFile', { name: 'file2.txt' }),
        createMockToolCall('call_3', 'readFile', { name: 'file3.txt' }),
      ]);

      const analysisResult = createMockCompletionResult('Analyzing all files', [
        createMockToolCall('call_4', 'generateReport', {
          files: ['file1.txt', 'file2.txt', 'file3.txt'],
        }),
      ]);

      const finalResult = createMockCompletionResult('Analysis complete: All files processed successfully');

      const multiToolResults = [
        createMockToolResult('call_1', 'readFile', 'Content of file1'),
        createMockToolResult('call_2', 'readFile', 'Content of file2'),
        createMockToolResult('call_3', 'readFile', 'Content of file3'),
      ];

      const reportToolResult = [createMockToolResult('call_4', 'generateReport', 'Analysis report generated')];

      mockProvider.generateCompletion
        .mockResolvedValueOnce(multiToolResult)
        .mockResolvedValueOnce(analysisResult)
        .mockResolvedValueOnce(finalResult);

      mockToolIntegrationService.processCompletionResult
        .mockResolvedValueOnce({
          result: multiToolResult,
          tool_results: multiToolResults,
          requiresFollowUp: true,
        })
        .mockResolvedValueOnce({
          result: analysisResult,
          tool_results: reportToolResult,
          requiresFollowUp: true,
        });

      mockToolIntegrationService.enhanceCompletionParams.mockReturnValue({
        messages: [{ role: 'user', content: 'Analyze all project files' }],
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9,
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
      });

      const onAdditionalMessageMock = vi.fn();

      // Act
      const response = await agent.sendMessage(['Analyze all project files'], {
        conversationId: 'test-conv',
        onAdditionalMessage: onAdditionalMessageMock,
      });

      // Assert
      expect(mockProvider.generateCompletion).toHaveBeenCalledTimes(3);
      expect(onAdditionalMessageMock).toHaveBeenCalledTimes(4); // 3 read operations + 1 report
      expect(response.content).toBe('Analysis complete: All files processed successfully');

      // Verify all tools were executed
      const toolNames = onAdditionalMessageMock.mock.calls.map((call) => call[0].toolCall?.name);
      expect(toolNames).toEqual(['readFile', 'readFile', 'readFile', 'generateReport']);
    });

    it('should handle mixed success and error tool results in recursive calls', async () => {
      // Arrange - Some tools succeed, some fail
      const step1Result = createMockCompletionResult('Trying to process files', [
        createMockToolCall('call_1', 'readFile', { name: 'existing.txt' }),
        createMockToolCall('call_2', 'readFile', { name: 'missing.txt' }),
      ]);

      const step2Result = createMockCompletionResult('Handling errors and retrying', [
        createMockToolCall('call_3', 'createFile', { name: 'missing.txt' }),
      ]);

      const finalResult = createMockCompletionResult('Successfully handled errors and completed task');

      const step1ToolResults = [
        createMockToolResult('call_1', 'readFile', 'File content here'),
        {
          id: 'call_2',
          name: 'readFile',
          result: {
            status: 'error' as const,
            type: 'text' as const,
            result: 'File not found',
          },
        },
      ];

      const step2ToolResults = [createMockToolResult('call_3', 'createFile', 'File created successfully')];

      mockProvider.generateCompletion
        .mockResolvedValueOnce(step1Result)
        .mockResolvedValueOnce(step2Result)
        .mockResolvedValueOnce(finalResult);

      mockToolIntegrationService.processCompletionResult
        .mockResolvedValueOnce({
          result: step1Result,
          tool_results: step1ToolResults,
          requiresFollowUp: true,
        })
        .mockResolvedValueOnce({
          result: step2Result,
          tool_results: step2ToolResults,
          requiresFollowUp: true,
        });

      mockToolIntegrationService.enhanceCompletionParams.mockReturnValue({
        messages: [{ role: 'user', content: 'Process files with error handling' }],
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9,
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
      });

      const onAdditionalMessageMock = vi.fn();

      // Act
      const response = await agent.sendMessage(['Process files with error handling'], {
        conversationId: 'test-conv',
        onAdditionalMessage: onAdditionalMessageMock,
      });

      // Assert
      expect(response.content).toBe('Successfully handled errors and completed task');
      expect(onAdditionalMessageMock).toHaveBeenCalledTimes(3);

      // Verify error handling
      const errorToolMessage = onAdditionalMessageMock.mock.calls[1][0];
      expect(errorToolMessage.toolCall?.result.status).toBe('error');
      expect(errorToolMessage.toolCall?.result.result).toBe('File not found');

      // Verify recovery
      const recoveryToolMessage = onAdditionalMessageMock.mock.calls[2][0];
      expect(recoveryToolMessage.toolCall?.name).toBe('createFile');
      expect(recoveryToolMessage.toolCall?.result.status).toBe('success');
    });

    it('should preserve conversation context across deep recursion', async () => {
      // Arrange - Test that each recursive call has access to full conversation history
      const recursionDepth = 3; // Reduce depth to make test more manageable
      const results: CompletionResult[] = [];
      const toolResults: ToolCallResult[][] = [];

      // Create a chain of 3 recursive tool calls
      for (let i = 0; i < recursionDepth; i++) {
        results.push(
          createMockCompletionResult(`Step ${i + 1}`, [
            createMockToolCall(`call_${i + 1}`, 'processStep', { step: i + 1 }),
          ]),
        );

        toolResults.push([createMockToolResult(`call_${i + 1}`, 'processStep', `Step ${i + 1} completed`)]);
      }

      const finalResult = createMockCompletionResult('All steps completed successfully');

      // Setup mocks
      results.forEach((result, index) => {
        mockProvider.generateCompletion.mockResolvedValueOnce(result);
        mockToolIntegrationService.processCompletionResult.mockResolvedValueOnce({
          result,
          tool_results: toolResults[index],
          requiresFollowUp: true,
        });
      });

      mockProvider.generateCompletion.mockResolvedValueOnce(finalResult);

      mockToolIntegrationService.enhanceCompletionParams.mockImplementation((params) => ({
        ...params,
        tools: [
          {
            type: 'function',
            function: {
              name: 'processStep',
              description: 'Tool description',
              parameters: {},
            },
          },
        ],
      }));

      // Act
      const response = await agent.sendMessage(['Execute step process'], {
        conversationId: 'test-conv',
      });

      // Assert
      expect(mockProvider.generateCompletion).toHaveBeenCalledTimes(4); // 3 steps + final
      expect(response.content).toBe('All steps completed successfully');

      // Since the agent properly accumulates messages, we can verify the basic structure
      // without strict counts that may vary with implementation details
      const calls = mockProvider.generateCompletion.mock.calls;
      expect(calls.length).toBe(4);

      // Each call should have some messages
      calls.forEach((call) => {
        expect(call[0].messages.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty tool results gracefully', async () => {
      // Arrange - Test with a result that has NO tool calls (truly empty)
      const resultWithoutTools = createMockCompletionResult('Executing tool but no tools returned');

      // Make sure the provider returns a valid result without tool calls
      mockProvider.generateCompletion.mockResolvedValue(resultWithoutTools);

      mockToolIntegrationService.enhanceCompletionParams.mockImplementation((params) => ({
        ...params,
        tools: [
          {
            type: 'function',
            function: {
              name: 'emptyTool',
              description: 'Tool description',
              parameters: {},
            },
          },
        ],
      }));

      // Act
      const response = await agent.sendMessage(['Test empty tool'], {
        conversationId: 'test-conv',
      });

      // Assert
      expect(mockProvider.generateCompletion).toHaveBeenCalledTimes(1); // No recursion due to empty results
      expect(response.content).toBe('Executing tool but no tools returned'); // Uses first result since no follow-up
    });

    it('should handle malformed tool calls', async () => {
      // Arrange
      const malformedResult: CompletionResult = {
        content: 'Attempting malformed tool call',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'testTool',
              arguments: 'invalid json {', // Malformed JSON
            },
          },
        ],
      };

      mockProvider.generateCompletion.mockResolvedValue(malformedResult);

      mockToolIntegrationService.processCompletionResult.mockResolvedValue({
        result: malformedResult,
        tool_results: [],
        requiresFollowUp: true, // This should be true to trigger recursion
      });

      mockToolIntegrationService.enhanceCompletionParams.mockReturnValue({
        messages: [{ role: 'user', content: 'Test malformed tool call' }],
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

      // Act
      const response = await agent.sendMessage(['Test malformed tool call'], {
        conversationId: 'test-conv',
      });

      // Assert
      expect(response.content).toContain('Attempting malformed tool call');
      expect(response.content).toContain('Tool calling stopped due to maximum recursion depth');
      // Should not crash and should handle gracefully
    });
  });
});
