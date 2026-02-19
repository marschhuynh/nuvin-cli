import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLLM, getAvailableProviders, type CustomProviderDefinition } from '../llm-providers/llm-factory.js';
import { GenericAnthropicLLM } from '../llm-providers/llm-anthropic-compat.js';

describe('Anthropic-compat Provider Type', () => {
  const customProviders: Record<string, CustomProviderDefinition> = {
    'test-anthropic': {
      type: 'anthropic-compat',
      baseUrl: 'https://api.test-anthropic.com/v1',
    },
    'test-anthropic-with-headers': {
      type: 'anthropic-compat',
      baseUrl: 'https://api.custom-anthropic.com',
      customHeaders: {
        'X-Custom-Header': 'test-value',
      },
    },
  };

  describe('createLLM', () => {
    it('should create GenericAnthropicLLM for anthropic-compat type', () => {
      const llm = createLLM('test-anthropic', { apiKey: 'test-key' }, customProviders);
      expect(llm).toBeInstanceOf(GenericAnthropicLLM);
    });

    describe('usage transformation', () => {
      let originalFetch: typeof global.fetch;

      beforeEach(() => {
        originalFetch = global.fetch;
      });

      afterEach(() => {
        global.fetch = originalFetch;
      });

      it('should calculate prompt_tokens as input_tokens + cache_creation_input_tokens + cache_read_input_tokens', async () => {
        const mockResponse = {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
          model: 'test-model',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: 80,
            cache_read_input_tokens: 70,
          },
        };

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockResponse),
          text: vi.fn().mockResolvedValue(''),
        } as any);

        const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
        const result = await llm.generateCompletion({
          messages: [{ role: 'user', content: 'Hello' }],
          model: 'test-model',
          temperature: 0.7,
          topP: 1,
        });

        // prompt_tokens = input_tokens (100) + cache_creation_input_tokens (80) + cache_read_input_tokens (70) = 250
        expect(result.usage?.prompt_tokens).toBe(250);
        expect(result.usage?.completion_tokens).toBe(50);
        expect(result.usage?.total_tokens).toBe(300);
        expect(result.usage?.prompt_tokens_details?.cached_tokens).toBe(150);
        expect(result.usage?.cache_creation_input_tokens).toBe(80);
        expect(result.usage?.cache_read_input_tokens).toBe(70);
      });

      it('should handle usage without cache tokens', async () => {
        const mockResponse = {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
          model: 'test-model',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
          },
        };

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockResponse),
          text: vi.fn().mockResolvedValue(''),
        } as any);

        const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
        const result = await llm.generateCompletion({
          messages: [{ role: 'user', content: 'Hello' }],
          model: 'test-model',
          temperature: 0.7,
          topP: 1,
        });

        expect(result.usage?.prompt_tokens).toBe(100);
        expect(result.usage?.completion_tokens).toBe(50);
        expect(result.usage?.total_tokens).toBe(150);
        expect(result.usage?.prompt_tokens_details?.cached_tokens).toBe(0);
      });

      it('should handle usage with only cache_read_input_tokens', async () => {
        const mockResponse = {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
          model: 'test-model',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 50,
            output_tokens: 30,
            cache_read_input_tokens: 100,
          },
        };

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockResponse),
          text: vi.fn().mockResolvedValue(''),
        } as any);

        const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
        const result = await llm.generateCompletion({
          messages: [{ role: 'user', content: 'Hello' }],
          model: 'test-model',
          temperature: 0.7,
          topP: 1,
        });

        // prompt_tokens = input_tokens (50) + cache_read_input_tokens (100) = 150
        expect(result.usage?.prompt_tokens).toBe(150);
        expect(result.usage?.completion_tokens).toBe(30);
        expect(result.usage?.total_tokens).toBe(180);
        expect(result.usage?.prompt_tokens_details?.cached_tokens).toBe(100);
        expect(result.usage?.cache_read_input_tokens).toBe(100);
      });

      it('should calculate usage correctly in streaming response', async () => {
        const streamEvents = [
          'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"test-model","usage":{"input_tokens":100,"output_tokens":0,"cache_creation_input_tokens":50,"cache_read_input_tokens":30}}}',
          '',
          'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
          '',
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
          '',
          'data: {"type":"content_block_stop","index":0}',
          '',
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":10}}',
          '',
          'data: {"type":"message_stop"}',
          '',
        ].join('\n');

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(streamEvents));
            controller.close();
          },
        });

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          body: stream,
          text: vi.fn().mockResolvedValue(''),
        } as any);

        const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
        const result = await llm.streamCompletion(
          {
            messages: [{ role: 'user', content: 'Hello' }],
            model: 'test-model',
            temperature: 0.7,
            topP: 1,
          },
          {},
        );

        // prompt_tokens = input_tokens (100) + cache_creation_input_tokens (50) + cache_read_input_tokens (30) = 180
        expect(result.usage?.prompt_tokens).toBe(180);
        expect(result.usage?.completion_tokens).toBe(10);
        expect(result.usage?.total_tokens).toBe(190);
        expect(result.usage?.prompt_tokens_details?.cached_tokens).toBe(80);
      });

      it('should calculate usage from message_delta with cumulative values (real-world scenario)', async () => {
        // This matches real Anthropic API behavior where message_delta contains cumulative usage
        const streamEvents = [
          'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"test-model","usage":{"input_tokens":0,"output_tokens":0}}}',
          '',
          'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
          '',
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
          '',
          'data: {"type":"content_block_stop","index":0}',
          '',
          // Real message_delta event with cumulative usage values
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":13319,"output_tokens":108,"cache_read_input_tokens":0}}',
          '',
          'data: {"type":"message_stop"}',
          '',
        ].join('\n');

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(streamEvents));
            controller.close();
          },
        });

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          body: stream,
          text: vi.fn().mockResolvedValue(''),
        } as any);

        const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
        const result = await llm.streamCompletion(
          {
            messages: [{ role: 'user', content: 'Hello' }],
            model: 'test-model',
            temperature: 0.7,
            topP: 1,
          },
          {},
        );

        // message_delta contains cumulative values, so these should be used
        // prompt_tokens = input_tokens (13319) + cache_read_input_tokens (0) = 13319
        expect(result.usage?.prompt_tokens).toBe(13319);
        expect(result.usage?.completion_tokens).toBe(108);
        expect(result.usage?.total_tokens).toBe(13427);
      });

      it('should calculate usage from message_delta with cache tokens', async () => {
        const streamEvents = [
          'data: {"type":"message_start","message":{"id":"msg_123","usage":{"input_tokens":0,"output_tokens":0}}}',
          '',
          'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
          '',
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}',
          '',
          'data: {"type":"content_block_stop","index":0}',
          '',
          // message_delta with cache_read_input_tokens
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":1000,"output_tokens":50,"cache_read_input_tokens":5000,"cache_creation_input_tokens":200}}',
          '',
          'data: {"type":"message_stop"}',
          '',
        ].join('\n');

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(streamEvents));
            controller.close();
          },
        });

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          body: stream,
          text: vi.fn().mockResolvedValue(''),
        } as any);

        const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
        const result = await llm.streamCompletion(
          {
            messages: [{ role: 'user', content: 'Hello' }],
            model: 'test-model',
            temperature: 0.7,
            topP: 1,
          },
          {},
        );

        // prompt_tokens = input_tokens (1000) + cache_creation (200) + cache_read (5000) = 6200
        expect(result.usage?.prompt_tokens).toBe(6200);
        expect(result.usage?.completion_tokens).toBe(50);
        expect(result.usage?.total_tokens).toBe(6250);
        expect(result.usage?.prompt_tokens_details?.cached_tokens).toBe(5200); // 200 + 5000
        expect(result.usage?.cache_creation_input_tokens).toBe(200);
        expect(result.usage?.cache_read_input_tokens).toBe(5000);
      });
    });

    it('should create LLM with correct base URL', () => {
      const llm = createLLM('test-anthropic', { apiKey: 'test-key' }, customProviders);
      expect((llm as GenericAnthropicLLM).apiUrl).toBe('https://api.test-anthropic.com/v1');
    });

    it('should have generateCompletion method', () => {
      const llm = createLLM('test-anthropic', { apiKey: 'test-key' }, customProviders);
      expect(llm).toHaveProperty('generateCompletion');
      expect(typeof llm.generateCompletion).toBe('function');
    });

    it('should have streamCompletion method', () => {
      const llm = createLLM('test-anthropic', { apiKey: 'test-key' }, customProviders);
      expect(llm).toHaveProperty('streamCompletion');
      expect(typeof llm.streamCompletion).toBe('function');
    });

    it('should have getModels method', () => {
      const llm = createLLM('test-anthropic', { apiKey: 'test-key' }, customProviders);
      expect(llm).toHaveProperty('getModels');
      expect(typeof llm.getModels).toBe('function');
    });

    it('should support custom apiUrl override', () => {
      const llm = createLLM(
        'test-anthropic',
        { apiKey: 'test-key', apiUrl: 'https://custom-override.com' },
        customProviders,
      );
      expect((llm as GenericAnthropicLLM).apiUrl).toBe('https://custom-override.com');
    });
  });

  describe('getAvailableProviders', () => {
    it('should include custom anthropic-compat providers', () => {
      const providers = getAvailableProviders(customProviders);
      expect(providers).toContain('test-anthropic');
      expect(providers).toContain('test-anthropic-with-headers');
    });
  });

  describe('GenericAnthropicLLM class', () => {
    it('should instantiate directly', () => {
      const llm = new GenericAnthropicLLM('https://api.anthropic.com/v1', {
        apiKey: 'test-key',
        providerName: 'test',
      });
      expect(llm).toBeInstanceOf(GenericAnthropicLLM);
    });

    it('should respect enablePromptCaching option', () => {
      const llm = new GenericAnthropicLLM('https://api.anthropic.com/v1', {
        apiKey: 'test-key',
        enablePromptCaching: true,
      });
      expect((llm as any).enablePromptCaching).toBe(true);
    });

    it('should default enablePromptCaching to false', () => {
      const llm = new GenericAnthropicLLM('https://api.anthropic.com/v1', {
        apiKey: 'test-key',
      });
      expect((llm as any).enablePromptCaching).toBe(false);
    });
  });

  describe('mixed provider types', () => {
    const mixedProviders: Record<string, CustomProviderDefinition> = {
      'openai-provider': {
        type: 'openai-compat',
        baseUrl: 'https://api.openai-compat.com/v1',
      },
      'anthropic-provider': {
        type: 'anthropic-compat',
        baseUrl: 'https://api.anthropic-compat.com/v1',
      },
    };

    it('should create correct LLM type for openai-compat', () => {
      const llm = createLLM('openai-provider', { apiKey: 'test-key' }, mixedProviders);
      expect(llm).not.toBeInstanceOf(GenericAnthropicLLM);
    });

    it('should create correct LLM type for anthropic-compat', () => {
      const llm = createLLM('anthropic-provider', { apiKey: 'test-key' }, mixedProviders);
      expect(llm).toBeInstanceOf(GenericAnthropicLLM);
    });
  });

  describe('thinking/reasoning content handling', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should capture thinking content from non-streaming response', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Let me analyze this problem step by step...' },
          { type: 'text', text: 'The answer is 42.' },
        ],
        model: 'test-model',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 50 },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
        text: vi.fn().mockResolvedValue(''),
      } as any);

      const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
      const result = await llm.generateCompletion({
        messages: [{ role: 'user', content: 'What is the meaning of life?' }],
        model: 'test-model',
        temperature: 0.7,
        topP: 1,
      });

      expect(result.content).toBe('The answer is 42.');
      expect(result.reasoning).toBe('Let me analyze this problem step by step...');
    });

    it('should send thinking disabled in request body', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }],
        model: 'test-model',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
        text: vi.fn().mockResolvedValue(''),
      } as any);

      const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
      await llm.generateCompletion({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'test-model',
        temperature: 0.7,
        topP: 1,
        thinking: { type: 'disabled' },
      });

      const fetchCall = (global.fetch as vi.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body as string);

      expect(requestBody.thinking).toEqual({ type: 'disabled' });
    });

    it('should send thinking enabled with budget_tokens in request body', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }],
        model: 'test-model',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
        text: vi.fn().mockResolvedValue(''),
      } as any);

      const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
      await llm.generateCompletion({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'test-model',
        temperature: 0.7,
        topP: 1,
        thinking: { type: 'enabled', budget_tokens: 4096 },
      });

      const fetchCall = (global.fetch as vi.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body as string);

      expect(requestBody.thinking).toEqual({ type: 'enabled', budget_tokens: 4096 });
    });

    it('should stream thinking content via onReasoningChunk', async () => {
      const streamEvents = [
        'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"test-model","usage":{"input_tokens":10,"output_tokens":0}}}',
        '',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}',
        '',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me "}}',
        '',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"think..."}}',
        '',
        'data: {"type":"content_block_stop","index":0}',
        '',
        'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}',
        '',
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Hello!"}}',
        '',
        'data: {"type":"content_block_stop","index":1}',
        '',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":20}}',
        '',
        'data: {"type":"message_stop"}',
        '',
      ].join('\n');

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(streamEvents));
          controller.close();
        },
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: stream,
        text: vi.fn().mockResolvedValue(''),
      } as any);

      const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });

      const reasoningChunks: string[] = [];
      const textChunks: string[] = [];

      const result = await llm.streamCompletion(
        {
          messages: [{ role: 'user', content: 'Hello' }],
          model: 'test-model',
          temperature: 0.7,
          topP: 1,
        },
        {
          onChunk: (delta) => textChunks.push(delta),
          onReasoningChunk: (delta) => reasoningChunks.push(delta),
        },
      );

      expect(reasoningChunks).toEqual(['Let me ', 'think...']);
      expect(textChunks).toEqual(['Hello!']);
      expect(result.content).toBe('Hello!');
      expect(result.reasoning).toBe('Let me think...');
    });

    it('should capture thinking_blocks with signature in streaming', async () => {
      const streamEvents = [
        'data: {"type":"message_start","message":{"id":"msg_123","usage":{"input_tokens":10,"output_tokens":0}}}',
        '',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}',
        '',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me think..."}}',
        '',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig_stream_abc"}}',
        '',
        'data: {"type":"content_block_stop","index":0}',
        '',
        'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}',
        '',
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Here is the answer"}}',
        '',
        'data: {"type":"content_block_stop","index":1}',
        '',
        'data: {"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"tc_1","name":"search","input":{}}}',
        '',
        'data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{\\"query\\":\\"test\\"}"}}',
        '',
        'data: {"type":"content_block_stop","index":2}',
        '',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":50}}',
        '',
        'data: {"type":"message_stop"}',
        '',
      ].join('\n');

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(streamEvents));
          controller.close();
        },
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: stream,
        text: vi.fn().mockResolvedValue(''),
      } as any);

      const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
      const result = await llm.streamCompletion(
        {
          messages: [{ role: 'user', content: 'Search for something' }],
          model: 'test-model',
          temperature: 0.7,
          topP: 1,
          thinking: { type: 'enabled', budget_tokens: 4096 },
        },
        {},
      );

      expect(result.reasoning).toBe('Let me think...');
      expect(result.thinking_blocks).toEqual([
        { type: 'thinking', thinking: 'Let me think...', signature: 'sig_stream_abc' },
      ]);
      expect(result.tool_calls).toHaveLength(1);
      expect(result.content).toBe('Here is the answer');
    });

    it('should send thinking disabled in streaming request', async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'message_start',
                message: { id: 'msg_123', usage: { input_tokens: 10, output_tokens: 0 } },
              }),
            ),
          );
          controller.enqueue(encoder.encode('\n'));
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'message_stop' })));
          controller.close();
        },
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: stream,
        text: vi.fn().mockResolvedValue(''),
      } as any);

      const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });

      await llm.streamCompletion(
        {
          messages: [{ role: 'user', content: 'Hello' }],
          model: 'test-model',
          temperature: 0.7,
          topP: 1,
          thinking: { type: 'disabled' },
        },
        { onChunk: () => {} },
      );

      const fetchCall = (global.fetch as vi.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body as string);

      expect(requestBody.thinking).toEqual({ type: 'disabled' });
    });

    it('should include thinking block from previous assistant messages', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Final answer' }],
        model: 'test-model',
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
        text: vi.fn().mockResolvedValue(''),
      } as any);

      const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
      await llm.generateCompletion({
        messages: [
          { role: 'user', content: 'What is 2+2?' },
          {
            role: 'assistant',
            content: 'Let me calculate...',
            tool_calls: [
              { id: 'tc_1', type: 'function', function: { name: 'calculator', arguments: '{"a":2,"b":2}' } },
            ],
            reasoning: 'I need to use the calculator tool for this arithmetic.',
          },
          { role: 'tool', content: '4', tool_call_id: 'tc_1' },
        ],
        model: 'test-model',
        temperature: 0.7,
        topP: 1,
        thinking: { type: 'enabled', budget_tokens: 4096 },
      });

      const fetchCall = (global.fetch as vi.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body as string);

      const assistantMsg = requestBody.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg.content).toBeInstanceOf(Array);
      expect(assistantMsg.content[0]).toEqual({
        type: 'thinking',
        thinking: 'I need to use the calculator tool for this arithmetic.',
      });
      expect(assistantMsg.content[1]).toEqual({
        type: 'text',
        text: 'Let me calculate...',
      });
      expect(assistantMsg.content[2]).toMatchObject({
        type: 'tool_use',
        id: 'tc_1',
        name: 'calculator',
      });
    });

    it('should preserve thinking_blocks with signature from previous assistant messages', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'The answer is 4' }],
        model: 'test-model',
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
        text: vi.fn().mockResolvedValue(''),
      } as any);

      const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
      await llm.generateCompletion({
        messages: [
          { role: 'user', content: 'What is 2+2?' },
          {
            role: 'assistant',
            content: 'Let me calculate...',
            tool_calls: [
              { id: 'tc_1', type: 'function', function: { name: 'calculator', arguments: '{"a":2,"b":2}' } },
            ],
            thinking_blocks: [
              { type: 'thinking', thinking: 'I need to use the calculator tool.', signature: 'sig_abc123' },
            ],
          },
          { role: 'tool', content: '4', tool_call_id: 'tc_1' },
        ],
        model: 'test-model',
        temperature: 0.7,
        topP: 1,
        thinking: { type: 'enabled', budget_tokens: 4096 },
      });

      const fetchCall = (global.fetch as vi.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body as string);

      const assistantMsg = requestBody.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg.content[0]).toEqual({
        type: 'thinking',
        thinking: 'I need to use the calculator tool.',
        signature: 'sig_abc123',
      });
    });

    it('should preserve redacted_thinking blocks from previous assistant messages', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Done' }],
        model: 'test-model',
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
        text: vi.fn().mockResolvedValue(''),
      } as any);

      const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
      await llm.generateCompletion({
        messages: [
          { role: 'user', content: 'Analyze this' },
          {
            role: 'assistant',
            content: 'Processing...',
            tool_calls: [{ id: 'tc_1', type: 'function', function: { name: 'analyze', arguments: '{}' } }],
            thinking_blocks: [
              { type: 'thinking', thinking: 'Let me think...', signature: 'sig_1' },
              { type: 'redacted_thinking', data: 'encrypted_data_abc' },
            ],
          },
          { role: 'tool', content: 'result', tool_call_id: 'tc_1' },
        ],
        model: 'test-model',
        temperature: 0.7,
        topP: 1,
        thinking: { type: 'enabled', budget_tokens: 4096 },
      });

      const fetchCall = (global.fetch as vi.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body as string);

      const assistantMsg = requestBody.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.content[0]).toEqual({
        type: 'thinking',
        thinking: 'Let me think...',
        signature: 'sig_1',
      });
      expect(assistantMsg.content[1]).toEqual({
        type: 'redacted_thinking',
        data: 'encrypted_data_abc',
      });
    });

    it('should capture thinking_blocks with signature from response', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Let me analyze...', signature: 'sig_xyz789' },
          { type: 'text', text: 'The result is...' },
          { type: 'tool_use', id: 'tc_1', name: 'search', input: { query: 'test' } },
        ],
        model: 'test-model',
        stop_reason: 'tool_use',
        usage: { input_tokens: 50, output_tokens: 100 },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
        text: vi.fn().mockResolvedValue(''),
      } as any);

      const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
      const result = await llm.generateCompletion({
        messages: [{ role: 'user', content: 'Search for something' }],
        model: 'test-model',
        temperature: 0.7,
        topP: 1,
        thinking: { type: 'enabled', budget_tokens: 4096 },
      });

      expect(result.reasoning).toBe('Let me analyze...');
      expect(result.thinking_blocks).toEqual([
        { type: 'thinking', thinking: 'Let me analyze...', signature: 'sig_xyz789' },
      ]);
      expect(result.tool_calls).toHaveLength(1);
    });

    it('should handle full tool use loop with thinking blocks preserved', async () => {
      const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });

      const firstResponse = {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'I need to search first', signature: 'sig_first' },
          { type: 'text', text: 'Let me search...' },
          { type: 'tool_use', id: 'tc_1', name: 'search', input: { query: 'test' } },
        ],
        model: 'test-model',
        stop_reason: 'tool_use',
        usage: { input_tokens: 50, output_tokens: 100 },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(firstResponse),
        text: vi.fn().mockResolvedValue(''),
      } as any);

      const result1 = await llm.generateCompletion({
        messages: [{ role: 'user', content: 'Find something' }],
        model: 'test-model',
        temperature: 0.7,
        topP: 1,
        thinking: { type: 'enabled', budget_tokens: 4096 },
      });

      expect(result1.thinking_blocks).toEqual([
        { type: 'thinking', thinking: 'I need to search first', signature: 'sig_first' },
      ]);

      const secondResponse = {
        id: 'msg_2',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Now I have the results', signature: 'sig_second' },
          { type: 'text', text: 'Here is what I found...' },
        ],
        model: 'test-model',
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(secondResponse),
        text: vi.fn().mockResolvedValue(''),
      } as any);

      const { usage: _u, ...extraFields } = result1;
      await llm.generateCompletion({
        messages: [
          { role: 'user', content: 'Find something' },
          {
            ...extraFields,
            role: 'assistant',
            content: result1.content,
            tool_calls: result1.tool_calls,
          },
          { role: 'tool', content: 'search results here', tool_call_id: 'tc_1' },
        ],
        model: 'test-model',
        temperature: 0.7,
        topP: 1,
        thinking: { type: 'enabled', budget_tokens: 4096 },
      });

      const fetchCall = (global.fetch as vi.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body as string);

      const assistantMsg = requestBody.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.content[0]).toEqual({
        type: 'thinking',
        thinking: 'I need to search first',
        signature: 'sig_first',
      });
    });
  });
});
