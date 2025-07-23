import { describe, it, expect, vi } from 'vitest';
import { BaseLLMProvider } from '../base-provider';
import type { ModelInfo } from '../llm-provider';

class TestProvider extends BaseLLMProvider {
  constructor() {
    super({
      providerName: 'Test',
      apiKey: 'test-key',
      apiUrl: 'https://test.api',
    });
  }

  async generateCompletion(): Promise<any> {
    return { content: 'test response' };
  }

  async *generateCompletionStream(): AsyncGenerator<string> {
    yield 'test';
    yield ' stream';
  }

  async *generateCompletionStreamWithTools(): AsyncGenerator<any> {
    yield { content: 'test', tool_calls: [] };
  }

  async getModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'test-model',
        name: 'Test Model',
        contextLength: 1000,
        inputCost: 0.01,
        outputCost: 0.02,
      },
    ];
  }
}

describe('BaseLLMProvider', () => {
  it('should create provider with correct config', () => {
    const provider = new TestProvider();

    expect(provider['type']).toBe('Test');
    expect(provider['apiKey']).toBe('test-key');
    expect(provider['apiUrl']).toBe('https://test.api');
  });

  it('should format model info correctly', () => {
    const provider = new TestProvider();
    const model = { id: 'test-model', name: 'Test Model' };

    const formatted = (provider as any).formatModelInfo(model, {
      contextLength: 1000,
      inputCost: 0.01,
      outputCost: 0.02,
    });

    expect(formatted).toEqual({
      id: 'test-model',
      name: 'Test Model',
      contextLength: 1000,
      inputCost: 0.01,
      outputCost: 0.02,
      modality: 'text',
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportedParameters: ['temperature', 'top_p', 'max_tokens'],
    });
  });

  it('should create completion result correctly', () => {
    const provider = new TestProvider();
    const data = {
      choices: [
        {
          message: {
            content: 'Hello world',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'test_function',
                  arguments: '{"test": true}',
                },
              },
            ],
          },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    };

    const result = (provider as any).createCompletionResult(data);

    expect(result).toEqual({
      content: 'Hello world',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'test_function',
            arguments: '{"test": true}',
          },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    });
  });

  it('should extract nested values correctly', () => {
    const provider = new TestProvider();
    const data = {
      choices: [
        {
          delta: {
            content: 'test content',
          },
        },
      ],
    };

    const value = (provider as any).extractValue(
      data,
      'choices.0.delta.content',
    );
    expect(value).toBe('test content');
  });

  it('should sort models alphabetically', () => {
    const provider = new TestProvider();
    const models: ModelInfo[] = [
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
      { id: 'gpt-4', name: 'GPT-4' },
      { id: 'gpt-4o', name: 'GPT-4o' },
    ];

    const sorted = (provider as any).sortModels(models);
    expect(sorted[0].id).toBe('gpt-3.5-turbo');
    expect(sorted[1].id).toBe('gpt-4');
    expect(sorted[2].id).toBe('gpt-4o');
  });

  it('should transform messages for different providers', () => {
    const provider = new TestProvider();
    const messages = [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello' },
    ];

    const transformed = (provider as any).transformMessagesForProvider(
      messages,
      'Anthropic',
    );
    expect(transformed).toEqual([
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('should transform tools for different providers', () => {
    const provider = new TestProvider();
    const tools = [
      {
        type: 'function',
        function: {
          name: 'test_function',
          description: 'A test function',
          parameters: { type: 'object' },
        },
      },
    ];

    const transformed = (provider as any).transformToolsForProvider(
      tools,
      'Anthropic',
    );
    expect(transformed).toEqual([
      {
        name: 'test_function',
        description: 'A test function',
        parameters: { type: 'object' },
      },
    ]);
  });
});
