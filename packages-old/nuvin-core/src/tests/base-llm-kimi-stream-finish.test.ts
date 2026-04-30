import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseLLM } from '../llm-providers/base-llm.js';
import type { HttpTransport } from '../transports/index.js';
import type { TransportResponse } from '../transports/transport.js';
import type { CompletionParams } from '../ports.js';

class TestLLM extends BaseLLM {
  private _transport: HttpTransport;

  constructor() {
    super('https://test.api', {});

    this._transport = {
      post: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({}),
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

const createMockStreamResponse = (chunks: string[]) => {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });

  return {
    ok: true,
    status: 200,
    body: stream,
  };
};

describe('BaseLLM - Kimi/Moonshot stream_finish', () => {
  let llm: TestLLM;

  beforeEach(() => {
    llm = new TestLLM();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should emit stream_finish when finish_reason and usage arrive in same chunk (Kimi pattern)', async () => {
    const chunks = [
      'data: {"id":"chatcmpl-6911668985355ab7ab43bc2b","object":"chat.completion.chunk","created":1762748041,"model":"kimi-k2-0905-preview","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}],"system_fingerprint":"fpv0_41b1161c"}\n\n',
      'data: {"id":"chatcmpl-6911668985355ab7ab43bc2b","object":"chat.completion.chunk","created":1762748041,"model":"kimi-k2-0905-preview","choices":[{"index":0,"delta":{"content":"I"},"finish_reason":null}],"system_fingerprint":"fpv0_41b1161c"}\n\n',
      'data: {"id":"chatcmpl-6911668985355ab7ab43bc2b","object":"chat.completion.chunk","created":1762748041,"model":"kimi-k2-0905-preview","choices":[{"index":0,"delta":{"content":" can"},"finish_reason":null}],"system_fingerprint":"fpv0_41b1161c"}\n\n',
      'data: {"id":"chatcmpl-6911668985355ab7ab43bc2b","object":"chat.completion.chunk","created":1762748041,"model":"kimi-k2-0905-preview","choices":[{"index":0,"delta":{"content":":\n\n"},"finish_reason":null}],"system_fingerprint":"fpv0_41b1161c"}\n\n',
      'data: {"id":"chatcmpl-6911668985355ab7ab43bc2b","object":"chat.completion.chunk","created":1762748041,"model":"kimi-k2-0905-preview","choices":[{"index":0,"delta":{"content":"help"},"finish_reason":null}],"system_fingerprint":"fpv0_41b1161c"}\n\n',
      'data: {"id":"chatcmpl-6911668985355ab7ab43bc2b","object":"chat.completion.chunk","created":1762748041,"model":"kimi-k2-0905-preview","choices":[{"index":0,"delta":{"content":" you"},"finish_reason":null}],"system_fingerprint":"fpv0_41b1161c"}\n\n',
      'data: {"id":"chatcmpl-6911668985355ab7ab43bc2b","object":"chat.completion.chunk","created":1762748041,"model":"kimi-k2-0905-preview","choices":[{"index":0,"delta":{},"finish_reason":"stop","usage":{"prompt_tokens":4796,"completion_tokens":174,"total_tokens":4970}}],"system_fingerprint":"fpv0_41b1161c"}\n\n',
      'data: [DONE]\n\n',
    ];

    const mockResponse = createMockStreamResponse(chunks);
    const postSpy = vi.spyOn(llm.getTransportForSpy(), 'post').mockResolvedValueOnce(mockResponse as Response);

    const onChunk = vi.fn();
    const onStreamFinish = vi.fn();

    const params: CompletionParams = {
      model: 'kimi-k2-0905-preview',
      messages: [],
      temperature: 1,
      topP: 0,
    };

    const result = await llm.streamCompletion(params, { onChunk, onStreamFinish });

    // Verify content chunks were emitted
    expect(onChunk).toHaveBeenCalledWith('I');
    expect(onChunk).toHaveBeenCalledWith(' can');
    expect(onChunk).toHaveBeenCalledWith('help');

    // Verify stream_finish was emitted with both finish_reason and usage
    expect(onStreamFinish).toHaveBeenCalledTimes(1);
    expect(onStreamFinish).toHaveBeenCalledWith('stop', {
      prompt_tokens: 4796,
      completion_tokens: 174,
      total_tokens: 4970,
    });

    // Verify result contains correct data
    expect(result.content).toBe('I canhelp you');
    expect(result.usage).toEqual({
      prompt_tokens: 4796,
      completion_tokens: 174,
      total_tokens: 4970,
    });
  });
});
