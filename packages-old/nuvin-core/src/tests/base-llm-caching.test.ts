import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseLLM } from '../llm-providers/base-llm.js';
import type { HttpTransport } from '../transports/index.js';
import type { TransportResponse } from '../transports/transport.js';
import type { CompletionParams, ProviderContentPart } from '../ports.js';

class TestLLM extends BaseLLM {
  private _transport: HttpTransport;

  constructor(enableCaching = false) {
    super('https://test.api', { enablePromptCaching: enableCaching });

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

  public getAppliedCaching(params: CompletionParams): CompletionParams {
    return this.applyCacheControl(params);
  }

  public getTransportForSpy(): HttpTransport {
    return this._transport;
  }
}

describe('BaseLLM Prompt Caching', () => {
  describe('caching disabled', () => {
    let llm: TestLLM;

    beforeEach(() => {
      llm = new TestLLM(false);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should not apply caching by default', async () => {
      const postSpy = vi.spyOn(llm.getTransportForSpy(), 'post');

      const params: CompletionParams = {
        model: 'test-model',
        messages: [
          { role: 'system', content: 'System' },
          { role: 'user', content: 'User' },
        ],
        temperature: 0.7,
        topP: 1,
      };

      await llm.generateCompletion(params);

      const sentBody = postSpy.mock.calls[0]?.[1] as CompletionParams;

      expect(postSpy).toHaveBeenCalledOnce();
      expect(sentBody.messages[0]?.content).toBe('System');
      expect(sentBody.messages[1]?.content).toBe('User');
    });

    it('should preserve original params when caching disabled', () => {
      const params: CompletionParams = {
        model: 'test-model',
        messages: [
          { role: 'system', content: 'System' },
          { role: 'user', content: [{ type: 'text', text: 'User' }] },
        ],
        temperature: 0.7,
        topP: 1,
      };

      const result = llm.getAppliedCaching(params);

      expect(result).toEqual(params);
      expect(result.messages[0]?.content).toBe('System');
      expect(result.messages[1]?.content).toEqual([{ type: 'text', text: 'User' }]);
    });

    it('should not modify empty messages array', () => {
      const params: CompletionParams = {
        model: 'test-model',
        messages: [],
        temperature: 0.7,
        topP: 1,
      };

      const result = llm.getAppliedCaching(params);

      expect(result.messages).toEqual([]);
    });
  });

  describe('caching enabled', () => {
    let llm: TestLLM;

    beforeEach(() => {
      llm = new TestLLM(true);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should apply caching to string content', async () => {
      const postSpy = vi.spyOn(llm.getTransportForSpy(), 'post');

      const params: CompletionParams = {
        model: 'test-model',
        messages: [
          { role: 'system', content: 'System' },
          { role: 'user', content: 'User' },
        ],
        temperature: 0.7,
        topP: 1,
      };

      await llm.generateCompletion(params);

      const sentBody = postSpy.mock.calls[0]?.[1] as CompletionParams;

      expect(postSpy).toHaveBeenCalledOnce();
      expect(sentBody.messages[0]?.content).toEqual([
        { type: 'text', text: 'System', cache_control: { type: 'ephemeral' } },
      ]);
      expect(sentBody.messages[1]?.content).toEqual([
        { type: 'text', text: 'User', cache_control: { type: 'ephemeral' } },
      ]);
    });

    it('should cache last part of array content', async () => {
      const postSpy = vi.spyOn(llm.getTransportForSpy(), 'post');

      const params: CompletionParams = {
        model: 'test-model',
        messages: [
          {
            role: 'system',
            content: [
              { type: 'text', text: 'Part 1' },
              { type: 'text', text: 'Part 2' },
            ],
          },
          { role: 'user', content: [{ type: 'text', text: 'Question' }] },
        ],
        temperature: 0.7,
        topP: 1,
      };

      await llm.generateCompletion(params);

      const sentBody = postSpy.mock.calls[0]?.[1] as CompletionParams;
      const systemContent = sentBody.messages[0]?.content as ProviderContentPart[];
      const userContent = sentBody.messages[1]?.content as ProviderContentPart[];

      expect(postSpy).toHaveBeenCalledOnce();
      expect((systemContent[0] as ProviderContentPart & { cache_control?: unknown }).cache_control).toBeUndefined();
      expect((systemContent[1] as ProviderContentPart & { cache_control?: unknown }).cache_control).toEqual({
        type: 'ephemeral',
      });
      expect((userContent[0] as ProviderContentPart & { cache_control?: unknown }).cache_control).toEqual({
        type: 'ephemeral',
      });
    });

    it('should cache first 2 system messages and last 2 user/assistant messages', async () => {
      const postSpy = vi.spyOn(llm.getTransportForSpy(), 'post');

      const params: CompletionParams = {
        model: 'test-model',
        messages: [
          { role: 'system', content: 'System 1' },
          { role: 'system', content: 'System 2' },
          { role: 'system', content: 'System 3' },
          { role: 'user', content: 'User 1' },
          { role: 'assistant', content: 'Assistant 1' },
          { role: 'user', content: 'User 2' },
        ],
        temperature: 0.7,
        topP: 1,
      };

      await llm.generateCompletion(params);

      const sentBody = postSpy.mock.calls[0]?.[1] as CompletionParams;

      expect(postSpy).toHaveBeenCalledOnce();
      expect(
        (
          (sentBody.messages[0]?.content as ProviderContentPart[])[0] as ProviderContentPart & {
            cache_control?: unknown;
          }
        ).cache_control,
      ).toEqual({ type: 'ephemeral' });
      expect(
        (
          (sentBody.messages[1]?.content as ProviderContentPart[])[0] as ProviderContentPart & {
            cache_control?: unknown;
          }
        ).cache_control,
      ).toEqual({ type: 'ephemeral' });
      expect(sentBody.messages[2]?.content).toBe('System 3');
      expect(sentBody.messages[3]?.content).toBe('User 1');
      expect(
        (
          (sentBody.messages[4]?.content as ProviderContentPart[])[0] as ProviderContentPart & {
            cache_control?: unknown;
          }
        ).cache_control,
      ).toEqual({ type: 'ephemeral' });
      expect(
        (
          (sentBody.messages[5]?.content as ProviderContentPart[])[0] as ProviderContentPart & {
            cache_control?: unknown;
          }
        ).cache_control,
      ).toEqual({ type: 'ephemeral' });
    });

    it('should work with streaming when caching enabled', async () => {
      const transport = llm.getTransportForSpy();
      const postSpy = vi.spyOn(transport, 'post').mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"test"}}]}\n\n'),
                done: false,
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        } as unknown as ReadableStream<Uint8Array>,
      } as Response);

      const params: CompletionParams = {
        model: 'test-model',
        messages: [
          { role: 'system', content: 'System' },
          { role: 'user', content: 'User' },
        ],
        temperature: 0.7,
        topP: 1,
      };

      await llm.streamCompletion(params);

      const sentBody = postSpy.mock.calls[0]?.[1] as CompletionParams;

      expect(postSpy).toHaveBeenCalledOnce();
      expect(
        (
          (sentBody.messages[0]?.content as ProviderContentPart[])[0] as ProviderContentPart & {
            cache_control?: unknown;
          }
        ).cache_control,
      ).toEqual({ type: 'ephemeral' });
      expect(
        (
          (sentBody.messages[1]?.content as ProviderContentPart[])[0] as ProviderContentPart & {
            cache_control?: unknown;
          }
        ).cache_control,
      ).toEqual({ type: 'ephemeral' });
    });

    it('should handle single system message', () => {
      const params: CompletionParams = {
        model: 'test-model',
        messages: [{ role: 'system', content: 'Only system' }],
        temperature: 0.7,
        topP: 1,
      };

      const result = llm.getAppliedCaching(params);

      expect(result.messages[0]?.content).toEqual([
        { type: 'text', text: 'Only system', cache_control: { type: 'ephemeral' } },
      ]);
    });

    it('should handle single user message without system', () => {
      const params: CompletionParams = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Only user' }],
        temperature: 0.7,
        topP: 1,
      };

      const result = llm.getAppliedCaching(params);

      expect(result.messages[0]?.content).toEqual([
        { type: 'text', text: 'Only user', cache_control: { type: 'ephemeral' } },
      ]);
    });

    it('should skip null content', () => {
      const params: CompletionParams = {
        model: 'test-model',
        messages: [
          { role: 'system', content: null },
          { role: 'user', content: 'User' },
        ],
        temperature: 0.7,
        topP: 1,
      };

      const result = llm.getAppliedCaching(params);

      expect(result.messages[0]?.content).toBeNull();
      expect(result.messages[1]?.content).toEqual([
        { type: 'text', text: 'User', cache_control: { type: 'ephemeral' } },
      ]);
    });

    it('should skip empty string content', () => {
      const params: CompletionParams = {
        model: 'test-model',
        messages: [
          { role: 'system', content: '' },
          { role: 'user', content: 'User' },
        ],
        temperature: 0.7,
        topP: 1,
      };

      const result = llm.getAppliedCaching(params);

      expect(result.messages[0]?.content).toBe('');
      expect(result.messages[1]?.content).toEqual([
        { type: 'text', text: 'User', cache_control: { type: 'ephemeral' } },
      ]);
    });

    it('should skip non-text content types', () => {
      const params: CompletionParams = {
        model: 'test-model',
        messages: [
          {
            role: 'system',
            content: [
              { type: 'image_url', image_url: { url: 'data:...' } },
              { type: 'text', text: 'Text' },
            ],
          },
          { role: 'user', content: 'User' },
        ],
        temperature: 0.7,
        topP: 1,
      };

      const result = llm.getAppliedCaching(params);
      const systemContent = result.messages[0]?.content as ProviderContentPart[];

      expect(systemContent[0]).toEqual({ type: 'image_url', image_url: { url: 'data:...' } });
      expect(systemContent[1]).toEqual({
        type: 'text',
        text: 'Text',
        cache_control: { type: 'ephemeral' },
      });
    });

    it('should transform string to array content with cache control', () => {
      const params: CompletionParams = {
        model: 'test-model',
        messages: [
          { role: 'system', content: 'System' },
          { role: 'user', content: 'User' },
        ],
        temperature: 0.7,
        topP: 1,
      };

      const result = llm.getAppliedCaching(params);

      expect(result).not.toBe(params);
      expect(result.messages).not.toBe(params.messages);
      expect(Array.isArray(result.messages[0]?.content)).toBe(true);
      expect(Array.isArray(result.messages[1]?.content)).toBe(true);
      expect(result.messages[0]?.content).toEqual([
        { type: 'text', text: 'System', cache_control: { type: 'ephemeral' } },
      ]);
      expect(result.messages[1]?.content).toEqual([
        { type: 'text', text: 'User', cache_control: { type: 'ephemeral' } },
      ]);
    });

    it('should handle 3+ system messages and only cache first 2', () => {
      const params: CompletionParams = {
        model: 'test-model',
        messages: [
          { role: 'system', content: 'System 1' },
          { role: 'system', content: 'System 2' },
          { role: 'system', content: 'System 3' },
          { role: 'system', content: 'System 4' },
        ],
        temperature: 0.7,
        topP: 1,
      };

      const result = llm.getAppliedCaching(params);

      expect(
        ((result.messages[0]?.content as ProviderContentPart[])[0] as ProviderContentPart & { cache_control?: unknown })
          .cache_control,
      ).toEqual({ type: 'ephemeral' });
      expect(
        ((result.messages[1]?.content as ProviderContentPart[])[0] as ProviderContentPart & { cache_control?: unknown })
          .cache_control,
      ).toEqual({ type: 'ephemeral' });
      expect(result.messages[2]?.content).toBe('System 3');
      expect(result.messages[3]?.content).toBe('System 4');
    });

    it('should handle only assistant messages', () => {
      const params: CompletionParams = {
        model: 'test-model',
        messages: [
          { role: 'assistant', content: 'Assistant 1' },
          { role: 'assistant', content: 'Assistant 2' },
        ],
        temperature: 0.7,
        topP: 1,
      };

      const result = llm.getAppliedCaching(params);

      expect(
        ((result.messages[0]?.content as ProviderContentPart[])[0] as ProviderContentPart & { cache_control?: unknown })
          .cache_control,
      ).toEqual({ type: 'ephemeral' });
      expect(
        ((result.messages[1]?.content as ProviderContentPart[])[0] as ProviderContentPart & { cache_control?: unknown })
          .cache_control,
      ).toEqual({ type: 'ephemeral' });
    });

    it('should handle mixed array content with non-text parts', () => {
      const params: CompletionParams = {
        model: 'test-model',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Part 1' },
              { type: 'image_url', image_url: { url: 'http://example.com/img.png' } },
            ],
          },
        ],
        temperature: 0.7,
        topP: 1,
      };

      const result = llm.getAppliedCaching(params);
      const userContent = result.messages[0]?.content as ProviderContentPart[];

      expect(userContent[0]).toEqual({ type: 'text', text: 'Part 1' });
      expect(userContent[1]).toEqual({
        type: 'image_url',
        image_url: { url: 'http://example.com/img.png' },
      });
    });
  });
});
