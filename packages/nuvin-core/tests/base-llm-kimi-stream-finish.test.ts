import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseLLM } from '../llm-providers/base-llm.js';
import type { CompletionParams } from '../ports.js';

const createMockTransport = (): any => ({
  postJson: vi.fn(),
  postStream: vi.fn(),
});

class TestLLM extends BaseLLM {
  public mockTransport: any;

  constructor() {
    super('https://test.api', {});
    this.mockTransport = createMockTransport();
  }

  protected createTransport(): any {
    return this.mockTransport;
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

  it('should emit stream_finish when finish_reason and usage arrive in same chunk (Kimi pattern)', async () => {
    // Real Kimi streaming pattern from kimi.txt - abbreviated for test
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
    vi.mocked(llm.mockTransport.postStream).mockResolvedValueOnce(mockResponse as any);

    const onChunk = vi.fn();
    const onStreamFinish = vi.fn();

    const params: CompletionParams = {
      model: 'kimi-k2-0905-preview',
      messages: [],
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
