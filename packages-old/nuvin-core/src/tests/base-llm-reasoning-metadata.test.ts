import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseLLM } from '../llm-providers/base-llm';
import { mergeChoices } from '../llm-providers/llm-utils';
import type { HttpTransport } from '../transports/index.js';
import type { TransportResponse } from '../transports/transport.js';
import type { CompletionParams } from '../ports.js';

// Concrete implementation for testing
class TestLLM extends BaseLLM {
  private _transport: HttpTransport;

  constructor(apiUrl: string) {
    super(apiUrl);

    this._transport = {
      post: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: 'test' } }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          }),
          text: async () => '',
        }) as Response,
      get: async (): Promise<TransportResponse> => ({
        ok: true,
        status: 200,
        json: async <T>() => ({}) as T,
        text: async () => '',
      }),
    };

    this.transport = this._transport;
  }

  protected createTransport(): HttpTransport {
    return this._transport;
  }

  public getTransportForSpy(): HttpTransport {
    return this._transport;
  }
}

describe('BaseLLM - Reasoning & Metadata Support', () => {
  let llm: TestLLM;
  const apiUrl = 'https://api.example.com';

  beforeEach(() => {
    llm = new TestLLM(apiUrl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockStreamResponse = (chunks: string[]) => {
    const encoder = new TextEncoder();
    const encodedChunks = chunks.map((chunk) => encoder.encode(chunk));

    let currentIndex = 0;
    const reader = {
      read: vi.fn(async () => {
        if (currentIndex >= encodedChunks.length) {
          return { done: true, value: undefined };
        }
        return { done: false, value: encodedChunks[currentIndex++] };
      }),
    };

    return {
      ok: true,
      body: { getReader: () => reader },
      text: () => Promise.resolve(''),
    };
  };

  describe('streamCompletion with Root-Level Flattening', () => {
    it('should accumulate "reasoning" field into root object', async () => {
      // Simulating DeepSeek-style reasoning field
      const chunks = [
        'data: {"choices":[{"delta":{"content":null,"reasoning":"I need"}}]}',
        'data: {"choices":[{"delta":{"content":null,"reasoning":" to think"}}]}',
        'data: {"choices":[{"delta":{"content":"Here"}}]}',
        'data: {"choices":[{"delta":{"content":" is answer"}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      const postSpy = vi
        .spyOn(llm.getTransportForSpy(), 'post')
        .mockResolvedValueOnce(mockResponse as unknown as Response);

      const params: CompletionParams = {
        model: 'deepseek-r1',
        messages: [],
        temperature: 0,
        topP: 0,
      };

      const result = await llm.streamCompletion(params);

      expect(result.content).toBe('Here is answer');
      // Metadata should be undefined if no generic valid metadata was passed
      expect(result.metadata).toBeUndefined();
      expect(postSpy).toHaveBeenCalled();
    });

    it('should accumulate "reasoning_content" field and call onReasoningChunk (GLM-style)', async () => {
      // Simulating GLM-style reasoning_content field
      const chunks = [
        'data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"The"}}]}',
        'data: {"choices":[{"delta":{"role":"assistant","reasoning_content":" user"}}]}',
        'data: {"choices":[{"delta":{"role":"assistant","content":"Hi"}}]}',
        'data: {"choices":[{"delta":{"role":"assistant","content":" there"}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      const postSpy = vi
        .spyOn(llm.getTransportForSpy(), 'post')
        .mockResolvedValueOnce(mockResponse as unknown as Response);

      const params: CompletionParams = {
        model: 'glm-4.7',
        messages: [],
        temperature: 0,
        topP: 0,
      };

      const reasoningChunks: string[] = [];
      const result = await llm.streamCompletion(params, {
        onReasoningChunk: (delta) => reasoningChunks.push(delta),
      });

      expect(result.content).toBe('Hi there');
      expect(result.reasoning).toBe('The user');
      expect(reasoningChunks).toEqual(['The', ' user']);
      expect(postSpy).toHaveBeenCalled();
    });

    it('should accumulate "reasoning_text" field and call onReasoningChunk (GitHub-style)', async () => {
      // Simulating GitHub Copilot-style reasoning_text field
      const chunks = [
        'data: {"choices":[{"delta":{"content":null,"reasoning_text":"Let me think..."}}]}',
        'data: {"choices":[{"delta":{"content":null,"reasoning_text":" I found the issue"}}]}',
        'data: {"choices":[{"delta":{"content":"The fix is:"}}]}',
        'data: {"choices":[{"delta":{"content":" to rename the file"}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      const postSpy = vi
        .spyOn(llm.getTransportForSpy(), 'post')
        .mockResolvedValueOnce(mockResponse as unknown as Response);

      const params: CompletionParams = {
        model: 'gpt-4',
        messages: [],
        temperature: 0,
        topP: 0,
      };

      const reasoningChunks: string[] = [];
      const result = await llm.streamCompletion(params, {
        onReasoningChunk: (delta) => reasoningChunks.push(delta),
      });

      expect(result.content).toBe('The fix is: to rename the file');
      expect(result.reasoning).toBe('Let me think... I found the issue');
      expect(reasoningChunks).toEqual(['Let me think...', ' I found the issue']);
      expect(postSpy).toHaveBeenCalled();
    });

    it('should accumulate arbitrary unknown string fields into root', async () => {
      // Simulating a custom provider sending "thoughts" field
      const chunks = [
        'data: {"choices":[{"delta":{"content":null,"thoughts":"Step 1"}}]}',
        'data: {"choices":[{"delta":{"content":null,"thoughts":": Analyze"}}]}',
        'data: {"choices":[{"delta":{"content":"Result"}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      const postSpy = vi
        .spyOn(llm.getTransportForSpy(), 'post')
        .mockResolvedValueOnce(mockResponse as unknown as Response);

      const params: CompletionParams = {
        model: 'custom-model',
        messages: [],
        temperature: 0,
        topP: 0,
      };

      const result = await llm.streamCompletion(params);

      expect(result.content).toBe('Result');
      expect(postSpy).toHaveBeenCalled();
    });

    it('should capture non-string root fields (last write wins)', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"msg","provider_id":123}}]}',
        'data: {"choices":[{"delta":{"content":"", "provider_id":456}}]}',
        'data: [DONE]',
      ];

      const mockResponse = createMockStreamResponse(chunks);
      const postSpy = vi
        .spyOn(llm.getTransportForSpy(), 'post')
        .mockResolvedValueOnce(mockResponse as unknown as Response);

      const params: CompletionParams = {
        model: 'custom-model',
        messages: [],
        temperature: 0,
        topP: 0,
      };

      await llm.streamCompletion(params);

      expect(postSpy).toHaveBeenCalled();
    });
  });

  describe('mergeChoices (LLM Utils)', () => {
    it('should merge unknown fields from choices into root', () => {
      const choices = [
        {
          message: {
            content: 'Test content',
            reasoning: 'I am thinking',
            custom_field: 'custom value',
          } as unknown as Response, // Intentional cast to any to simulate unknown fields
        },
      ];

      const result = mergeChoices(choices);

      expect(result.content).toBe('Test content');
      expect((result as unknown as Response).reasoning).toBe('I am thinking');
      expect((result as unknown as Response).custom_field).toBe('custom value');
    });
  });
});
