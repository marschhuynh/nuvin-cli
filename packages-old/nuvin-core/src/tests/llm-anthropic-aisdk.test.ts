import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicAISDKLLM } from '../llm-providers/llm-anthropic-aisdk';
import type { CompletionParams } from '../ports.js';

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn((options?: any) => {
    const provider = vi.fn((modelName: string) => ({
      _modelName: modelName,
    }));
    provider._options = options;
    return provider;
  }),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  jsonSchema: vi.fn((schema) => schema),
  APICallError: {
    isInstance: vi.fn((error: any) => error?.name === 'AI_APICallError'),
  },
}));

import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, streamText, jsonSchema } from 'ai';

describe('AnthropicAISDKLLM', () => {
  let llm: AnthropicAISDKLLM;

  beforeEach(() => {
    vi.clearAllMocks();
    llm = new AnthropicAISDKLLM({
      apiKey: 'test-api-key',
      baseURL: 'https://api.example.com',
    });
  });

  describe('constructor', () => {
    it('should initialize with options', () => {
      expect(llm).toBeDefined();
    });

    it('should work with default options', () => {
      const defaultLLM = new AnthropicAISDKLLM();
      expect(defaultLLM).toBeDefined();
    });

    it('should use OAuth bearer token when oauth is provided', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const oauthLLM = new AnthropicAISDKLLM({
        oauth: {
          type: 'oauth',
          access: 'test-access-token',
          refresh: 'test-refresh-token',
          expires: Date.now() + 3600000,
        },
        baseURL: 'https://api.example.com',
      });

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
      };

      await oauthLLM.generateCompletion(params);

      expect(createAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'sk-ant-oauth-placeholder',
          baseURL: 'https://api.example.com',
          headers: expect.objectContaining({
            authorization: 'Bearer test-access-token',
          }),
          fetch: expect.any(Function),
        }),
      );
    });

    it('should use apiKey when oauth is not provided', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const apiKeyLLM = new AnthropicAISDKLLM({
        apiKey: 'test-api-key',
        baseURL: 'https://api.example.com',
      });

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
      };

      await apiKeyLLM.generateCompletion(params);

      expect(createAnthropic).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: 'https://api.example.com',
        fetch: expect.any(Function),
      });
    });
  });

  describe('generateCompletion', () => {
    it('should successfully generate completion', async () => {
      const mockResult = {
        text: 'Hello, world!',
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
      };

      const result = await llm.generateCompletion(params);

      expect(result.content).toBe('Hello, world!');
      expect(result.usage).toMatchObject({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      });
      expect(createAnthropic).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: 'https://api.example.com',
        fetch: expect.any(Function),
      });
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.objectContaining({
            _modelName: 'claude-3-5-sonnet-20241022',
          }),
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }],
            }),
          ]),
          tools: undefined,
          toolChoice: undefined,
          maxOutputTokens: 10240,
          temperature: 0.7,
          abortSignal: undefined,
        }),
      );
    });

    it('should pass maxTokens correctly', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
        maxTokens: 100,
      };

      await llm.generateCompletion(params);

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          maxOutputTokens: 100,
        }),
      );
    });

    it('should extract and pass system message', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' },
        ],
      };

      await llm.generateCompletion(params);

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: "You are Claude Code, Anthropic's official CLI for Claude.",
            }),
            expect.objectContaining({
              role: 'system',
              content: 'You are a helpful assistant',
            }),
            expect.objectContaining({
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }],
            }),
          ]),
        }),
      );
    });

    it('should handle multiple system messages', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'system', content: 'First instruction' },
          { role: 'system', content: 'Second instruction' },
          { role: 'user', content: 'Hello' },
        ],
      };

      await llm.generateCompletion(params);

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: 'system',
              content: "You are Claude Code, Anthropic's official CLI for Claude.",
              providerOptions: {
                anthropic: { cacheControl: { type: 'ephemeral' } },
              },
            },
            {
              role: 'system',
              content: 'First instruction',
              providerOptions: {
                anthropic: { cacheControl: { type: 'ephemeral' } },
              },
            },
            {
              role: 'system',
              content: 'Second instruction',
              providerOptions: {
                anthropic: { cacheControl: { type: 'ephemeral' } },
              },
            },
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }],
              providerOptions: {
                anthropic: { cacheControl: { type: 'ephemeral' } },
              },
            },
          ],
        }),
      );
    });

    it('should handle tool calls', async () => {
      const mockResult = {
        text: '',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        toolCalls: [
          {
            toolCallId: 'call_1',
            toolName: 'get_weather',
            input: { city: 'NYC' },
          },
        ],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'object', properties: { city: { type: 'string' } } },
            },
          },
        ],
      };

      const result = await llm.generateCompletion(params);

      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls?.[0]).toEqual({
        id: 'call_1',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"city":"NYC"}',
        },
      });
    });

    it('should transform tools correctly', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
      };

      await llm.generateCompletion(params);

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: {
            get_weather: {
              description: 'Get weather',
              inputSchema: { type: 'object', properties: {} },
            },
          },
        }),
      );
    });

    it('should transform multiple tools into object with tool names as keys', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get the weather in a location',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
                required: ['location'],
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'search_web',
              description: 'Search the web',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                },
                required: ['query'],
              },
            },
          },
        ],
      };

      await llm.generateCompletion(params);

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: {
            get_weather: {
              description: 'Get the weather in a location',
              inputSchema: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
                required: ['location'],
              },
            },
            search_web: {
              description: 'Search the web',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                },
                required: ['query'],
              },
            },
          },
        }),
      );
    });

    it('should ensure tools have required type field in parameters schema', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
        tools: [
          {
            type: 'function',
            function: {
              name: 'bash_tool',
              description: 'Execute bash commands',
              parameters: {
                type: 'object',
                properties: {
                  action: {
                    type: 'string',
                    enum: ['exec', 'start', 'send'],
                  },
                  cmd: {
                    type: 'string',
                    description: 'Command to execute',
                  },
                },
                required: ['action'],
              },
            },
          },
        ],
      };

      await llm.generateCompletion(params);

      const callArgs = vi.mocked(generateText).mock.calls[0][0];
      expect(callArgs.tools).toBeDefined();
      expect(callArgs.tools).toEqual({
        bash_tool: {
          description: 'Execute bash commands',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['exec', 'start', 'send'],
              },
              cmd: {
                type: 'string',
                description: 'Command to execute',
              },
            },
            required: ['action'],
          },
        },
      });
      expect(callArgs.tools.bash_tool.inputSchema.type).toBe('object');
    });

    it('should handle tool_choice correctly', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
        tools: [
          {
            type: 'function',
            function: {
              name: 'test_function',
              description: 'Test',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'test_function' } },
      };

      await llm.generateCompletion(params);

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          toolChoice: { type: 'tool', toolName: 'test_function' },
        }),
      );
    });

    it('should handle tool_choice auto', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
        tools: [
          {
            type: 'function',
            function: {
              name: 'test_function',
              description: 'Test',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
        tool_choice: 'auto',
      };

      await llm.generateCompletion(params);

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          toolChoice: 'auto',
        }),
      );
    });

    it('should handle tool_choice none', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
        tools: [
          {
            type: 'function',
            function: {
              name: 'test_function',
              description: 'Test',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
        tool_choice: 'none',
      };

      await llm.generateCompletion(params);

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          toolChoice: 'none',
        }),
      );
    });

    it('should handle image content', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is this?' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
            ],
          },
        ],
      };

      await llm.generateCompletion(params);

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: [
                { type: 'text', text: 'What is this?' },
                { type: 'image', image: 'data:image/png;base64,abc123' },
              ],
            }),
          ]),
        }),
      );
    });

    it('should handle tool result messages with correct output schema', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'tool',
            tool_call_id: 'call_1',
            name: 'get_weather',
            content: 'Sunny, 75°F',
          },
        ],
      };

      await llm.generateCompletion(params);

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call_1',
                  toolName: 'get_weather',
                  output: {
                    type: 'text',
                    value: 'Sunny, 75°F',
                  },
                },
              ],
            },
          ],
        }),
      );
    });

    it('should handle multi-turn conversation with tool calls and results', async () => {
      const mockResult = {
        text: 'Based on the weather data, it looks nice!',
        usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'What is the weather in NYC?' },
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city":"NYC"}',
                },
              },
              {
                id: 'call_2',
                type: 'function',
                function: {
                  name: 'get_forecast',
                  arguments: '{"city":"NYC","days":3}',
                },
              },
            ],
          },
          {
            role: 'tool',
            tool_call_id: 'call_1',
            name: 'get_weather',
            content: 'Sunny, 75°F',
          },
          {
            role: 'tool',
            tool_call_id: 'call_2',
            name: 'get_forecast',
            content: 'Next 3 days: Sunny, Cloudy, Rainy',
          },
        ],
      };

      await llm.generateCompletion(params);

      const callArgs = vi.mocked(generateText).mock.calls[0][0];
      const messages = callArgs.messages;

      expect(messages).toEqual([
        {
          role: 'system',
          content: "You are Claude Code, Anthropic's official CLI for Claude.",
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        },
        {
          role: 'system',
          content: 'You are a helpful assistant',
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'What is the weather in NYC?' }],
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_1',
              toolName: 'get_weather',
              input: { city: 'NYC' },
            },
            {
              type: 'tool-call',
              toolCallId: 'call_2',
              toolName: 'get_forecast',
              input: { city: 'NYC', days: 3 },
            },
          ],
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_1',
              toolName: 'get_weather',
              output: {
                type: 'text',
                value: 'Sunny, 75°F',
              },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_2',
              toolName: 'get_forecast',
              output: {
                type: 'text',
                value: 'Next 3 days: Sunny, Cloudy, Rainy',
              },
            },
          ],
        },
      ]);

      const userAssistantMessages = messages.filter(
        (m: any) => m.role === 'user' || m.role === 'assistant',
      );
      expect(userAssistantMessages).toHaveLength(2);
      expect(userAssistantMessages[0].providerOptions?.anthropic?.cacheControl?.type).toBe('ephemeral');
      expect(userAssistantMessages[1].providerOptions?.anthropic?.cacheControl?.type).toBe('ephemeral');

      const toolMessages = messages.filter((m: any) => m.role === 'tool');
      expect(toolMessages).toHaveLength(2);
      expect(toolMessages[0].providerOptions).toBeUndefined();
      expect(toolMessages[1].providerOptions).toBeUndefined();

      expect(toolMessages[0].content[0].output).toEqual({
        type: 'text',
        value: 'Sunny, 75°F',
      });
      expect(toolMessages[1].content[0].output).toEqual({
        type: 'text',
        value: 'Next 3 days: Sunny, Cloudy, Rainy',
      });
    });

    it('should handle tool result with JSON content', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'tool',
            tool_call_id: 'call_1',
            name: 'get_data',
            content: { result: 'success', data: { value: 42 } },
          },
        ],
      };

      await llm.generateCompletion(params);

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call_1',
                  toolName: 'get_data',
                  output: {
                    type: 'text',
                    value: '{"result":"success","data":{"value":42}}',
                  },
                },
              ],
            },
          ],
        }),
      );
    });

    it('should handle complete turn cycle: user message -> LLM tool calls -> tool results', async () => {
      const mockResult = {
        text: 'I can see the file contains useful information.',
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'system', content: 'You are a helpful coding assistant' },
          { role: 'user', content: 'Read the README file' },
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'toolu_01ABC123',
                type: 'function',
                function: {
                  name: 'file_read',
                  arguments: '{"path":"README.md"}',
                },
              },
              {
                id: 'toolu_01XYZ789',
                type: 'function',
                function: {
                  name: 'bash_tool',
                  arguments: '{"action":"exec","cmd":"ls -la"}',
                },
              },
            ],
          },
          {
            role: 'tool',
            tool_call_id: 'toolu_01ABC123',
            name: 'file_read',
            content: '# My Project\nThis is a test project',
          },
          {
            role: 'tool',
            tool_call_id: 'toolu_01XYZ789',
            name: 'bash_tool',
            content: 'total 8\n-rw-r--r-- 1 user staff 45 README.md',
          },
        ],
      };

      await llm.generateCompletion(params);

      const callArgs = vi.mocked(generateText).mock.calls[0][0];
      const messages = callArgs.messages;

      expect(messages.filter((m: any) => m.role === 'system')).toHaveLength(2);
      expect(messages.filter((m: any) => m.role === 'user')).toHaveLength(1);
      expect(messages.filter((m: any) => m.role === 'assistant')).toHaveLength(1);
      expect(messages.filter((m: any) => m.role === 'tool')).toHaveLength(2);

      const toolMessages = messages.filter((m: any) => m.role === 'tool');
      
      expect(toolMessages[0]).toEqual({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'toolu_01ABC123',
            toolName: 'file_read',
            output: {
              type: 'text',
              value: '# My Project\nThis is a test project',
            },
          },
        ],
      });

      expect(toolMessages[1]).toEqual({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'toolu_01XYZ789',
            toolName: 'bash_tool',
            output: {
              type: 'text',
              value: 'total 8\n-rw-r--r-- 1 user staff 45 README.md',
            },
          },
        ],
      });

      expect(toolMessages[0].content[0]).not.toHaveProperty('result');
      expect(toolMessages[1].content[0]).not.toHaveProperty('result');
      
      expect(toolMessages[0].content[0]).toHaveProperty('output');
      expect(toolMessages[0].content[0].output).toHaveProperty('type', 'text');
      expect(toolMessages[0].content[0].output).toHaveProperty('value');
    });

    it('should handle assistant message with tool calls', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city":"NYC"}',
                },
              },
            ],
          },
        ],
      };

      await llm.generateCompletion(params);

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call_1',
                  toolName: 'get_weather',
                  input: { city: 'NYC' },
                },
              ],
            }),
          ]),
        }),
      );
    });

    it('should add cache control to first 2 system messages', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'system', content: 'First instruction' },
          { role: 'system', content: 'Second instruction' },
          { role: 'system', content: 'Third instruction' },
          { role: 'user', content: 'Hello' },
        ],
      };

      await llm.generateCompletion(params);

      const callArgs = vi.mocked(generateText).mock.calls[0][0];
      const messages = callArgs.messages;

      expect(messages[0].providerOptions?.anthropic?.cacheControl?.type).toBe('ephemeral');
      expect(messages[1].providerOptions?.anthropic?.cacheControl?.type).toBe('ephemeral');
      expect(messages[2].providerOptions?.anthropic?.cacheControl?.type).toBe('ephemeral');
      expect(messages[3].providerOptions).toBeUndefined();
    });

    it('should add cache control to last 2 user/assistant messages', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'system', content: 'System message' },
          { role: 'user', content: 'Message 1' },
          { role: 'assistant', content: 'Response 1' },
          { role: 'user', content: 'Message 2' },
          { role: 'assistant', content: 'Response 2' },
          { role: 'user', content: 'Message 3' },
        ],
      };

      await llm.generateCompletion(params);

      const callArgs = vi.mocked(generateText).mock.calls[0][0];
      const messages = callArgs.messages;

      const userAssistantMessages = messages.filter((m: any) => m.role === 'user' || m.role === 'assistant');
      const lastTwo = userAssistantMessages.slice(-2);

      expect(lastTwo[0].providerOptions?.anthropic?.cacheControl?.type).toBe('ephemeral');
      expect(lastTwo[1].providerOptions?.anthropic?.cacheControl?.type).toBe('ephemeral');

      const notLastTwo = userAssistantMessages.slice(0, -2);
      for (const msg of notLastTwo) {
        expect(msg.providerOptions).toBeUndefined();
      }
    });

    it('should handle cache control when only 1 user/assistant message exists', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'system', content: 'System message' },
          { role: 'user', content: 'Only message' },
        ],
      };

      await llm.generateCompletion(params);

      const callArgs = vi.mocked(generateText).mock.calls[0][0];
      const messages = callArgs.messages;

      const userMessages = messages.filter((m: any) => m.role === 'user');
      expect(userMessages[0].providerOptions?.anthropic?.cacheControl?.type).toBe('ephemeral');
    });

    it('should add cache control to both system messages and last 2 user/assistant messages', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'system', content: 'First system' },
          { role: 'system', content: 'Second system' },
          { role: 'user', content: 'User 1' },
          { role: 'assistant', content: 'Assistant 1' },
          { role: 'user', content: 'User 2' },
        ],
      };

      await llm.generateCompletion(params);

      const callArgs = vi.mocked(generateText).mock.calls[0][0];
      const messages = callArgs.messages;

      expect(messages[0].role).toBe('system');
      expect(messages[0].providerOptions?.anthropic?.cacheControl?.type).toBe('ephemeral');
      expect(messages[1].role).toBe('system');
      expect(messages[1].providerOptions?.anthropic?.cacheControl?.type).toBe('ephemeral');
      expect(messages[2].role).toBe('system');
      expect(messages[2].providerOptions?.anthropic?.cacheControl?.type).toBe('ephemeral');

      const userAssistantMessages = messages.filter((m: any) => m.role === 'user' || m.role === 'assistant');
      const lastTwo = userAssistantMessages.slice(-2);
      expect(lastTwo[0].providerOptions?.anthropic?.cacheControl?.type).toBe('ephemeral');
      expect(lastTwo[1].providerOptions?.anthropic?.cacheControl?.type).toBe('ephemeral');
    });

    it('should pass AbortSignal to generateText', async () => {
      const mockResult = {
        text: 'test',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        toolCalls: [],
      };
      vi.mocked(generateText).mockResolvedValueOnce(mockResult as any);

      const abortController = new AbortController();
      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
      };

      await llm.generateCompletion(params, abortController.signal);

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          abortSignal: abortController.signal,
        }),
      );
    });
  });

  describe('streamCompletion', () => {
    it('should successfully stream completion', async () => {
      const mockTextStream = (async function* () {
        yield 'Hello';
        yield ' world';
      })();

      const mockResult = {
        textStream: mockTextStream,
        toolCalls: Promise.resolve([]),
        usage: Promise.resolve({
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        }),
        finishReason: Promise.resolve('stop'),
      };
      vi.mocked(streamText).mockReturnValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const result = await llm.streamCompletion(params);

      expect(result.content).toBe('Hello world');
      expect(result.usage).toMatchObject({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      });
    });

    it('should call onChunk handler', async () => {
      const mockTextStream = (async function* () {
        yield 'Hello';
        yield ' world';
      })();

      const mockResult = {
        textStream: mockTextStream,
        toolCalls: Promise.resolve([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 2, totalTokens: 7 }),
        finishReason: Promise.resolve('stop'),
      };
      vi.mocked(streamText).mockReturnValueOnce(mockResult as any);

      const onChunk = vi.fn();
      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
      };

      await llm.streamCompletion(params, { onChunk });

      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(onChunk).toHaveBeenNthCalledWith(1, 'Hello');
      expect(onChunk).toHaveBeenNthCalledWith(2, ' world');
    });

    it('should handle tool calls in streaming', async () => {
      const mockTextStream = (async function* () {})();

      const mockResult = {
        textStream: mockTextStream,
        toolCalls: Promise.resolve([
          {
            toolCallId: 'call_1',
            toolName: 'get_weather',
            input: { city: 'NYC' },
          },
        ]),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 20, totalTokens: 30 }),
        finishReason: Promise.resolve('tool_calls'),
      };
      vi.mocked(streamText).mockReturnValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
      };

      const result = await llm.streamCompletion(params);

      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls?.[0]).toEqual({
        id: 'call_1',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"city":"NYC"}',
        },
      });
    });

    it('should call onStreamFinish handler', async () => {
      const mockTextStream = (async function* () {
        yield 'test';
      })();

      const mockResult = {
        textStream: mockTextStream,
        toolCalls: Promise.resolve([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 2, totalTokens: 7 }),
        finishReason: Promise.resolve('stop'),
      };
      vi.mocked(streamText).mockReturnValueOnce(mockResult as any);

      const onStreamFinish = vi.fn();
      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
      };

      await llm.streamCompletion(params, { onStreamFinish });

      expect(onStreamFinish).toHaveBeenCalledWith('stop', expect.objectContaining({
        prompt_tokens: 5,
        completion_tokens: 2,
        total_tokens: 7,
      }));
    });

    it('should pass maxTokens correctly in streaming', async () => {
      const mockTextStream = (async function* () {
        yield 'test';
      })();

      const mockResult = {
        textStream: mockTextStream,
        toolCalls: Promise.resolve([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 2, totalTokens: 7 }),
        finishReason: Promise.resolve('stop'),
      };
      vi.mocked(streamText).mockReturnValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
        maxTokens: 100,
      };

      await llm.streamCompletion(params);

      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          maxOutputTokens: 100,
        }),
      );
    });

    it('should pass AbortSignal to streamText', async () => {
      const mockTextStream = (async function* () {
        yield 'test';
      })();

      const mockResult = {
        textStream: mockTextStream,
        toolCalls: Promise.resolve([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 2, totalTokens: 7 }),
        finishReason: Promise.resolve('stop'),
      };
      vi.mocked(streamText).mockReturnValueOnce(mockResult as any);

      const abortController = new AbortController();
      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
      };

      await llm.streamCompletion(params, {}, abortController.signal);

      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          abortSignal: abortController.signal,
        }),
      );
    });

    it('should handle empty tool calls array', async () => {
      const mockTextStream = (async function* () {
        yield 'test';
      })();

      const mockResult = {
        textStream: mockTextStream,
        toolCalls: Promise.resolve([]),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 2, totalTokens: 7 }),
        finishReason: Promise.resolve('stop'),
      };
      vi.mocked(streamText).mockReturnValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
      };

      const result = await llm.streamCompletion(params);

      expect(result.tool_calls).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should wrap APICallError in LLMError with proper retryable flag for auth errors', async () => {
      const apiCallError = new Error('Invalid bearer token');
      Object.assign(apiCallError, {
        name: 'AI_APICallError',
        statusCode: 401,
        isRetryable: false,
      });

      vi.mocked(generateText).mockRejectedValueOnce(apiCallError);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'test' }],
      };

      await expect(llm.generateCompletion(params)).rejects.toMatchObject({
        name: 'LLMError',
        message: 'Authentication failed. Please check your API key.',
        statusCode: 401,
        isRetryable: false,
      });
    });

    it('should wrap APICallError in LLMError for rate limit errors with retryable flag', async () => {
      const apiCallError = new Error('Rate limit exceeded');
      Object.assign(apiCallError, {
        name: 'AI_APICallError',
        statusCode: 429,
        isRetryable: true,
      });

      vi.mocked(generateText).mockRejectedValueOnce(apiCallError);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'test' }],
      };

      await expect(llm.generateCompletion(params)).rejects.toMatchObject({
        name: 'LLMError',
        message: 'Rate limit exceeded. Please try again later.',
        statusCode: 429,
        isRetryable: true,
      });
    });

    it('should not double-wrap LLMError instances', async () => {
      const { LLMError } = await import('../llm-providers/base-llm.js');
      const llmError = new LLMError('Test error', 500, true);

      vi.mocked(generateText).mockRejectedValueOnce(llmError);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'test' }],
      };

      await expect(llm.generateCompletion(params)).rejects.toBe(llmError);
    });

    it('should handle streaming errors properly', async () => {
      const apiCallError = new Error('Invalid bearer token');
      Object.assign(apiCallError, {
        name: 'AI_APICallError',
        statusCode: 401,
        isRetryable: false,
      });

      let errorCaptured: Error | null = null;
      const mockTextStream = (async function* () {
        throw apiCallError;
      })();

      const mockResult = {
        textStream: mockTextStream,
        toolCalls: Promise.resolve([]),
        usage: Promise.resolve({
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        }),
        finishReason: Promise.resolve('stop'),
        onError: (event: { error: Error }) => {
          errorCaptured = event.error;
        },
      };

      vi.mocked(streamText).mockReturnValueOnce(mockResult as any);

      const params: CompletionParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'test' }],
      };

      await expect(llm.streamCompletion(params)).rejects.toMatchObject({
        name: 'LLMError',
        message: 'Authentication failed. Please check your API key.',
        statusCode: 401,
        isRetryable: false,
      });
    });
  });
});
