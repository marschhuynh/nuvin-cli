import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenericAnthropicLLM } from '../llm-providers/llm-anthropic-compat.js';
import { AnthropicAISDKLLM, buildAISDKToolResultOutput } from '../llm-providers/llm-anthropic-aisdk.js';
import { transformToResponsesInput } from '../llm-providers/responses-api-transform.js';
import type { ChatMessage, ProviderContentPart } from '../ports.js';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

const SAMPLE_BASE64_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const SAMPLE_BASE64_JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//';

/** Helper to build a ProviderContentPart[] with both text and image parts */
function makeImageToolResult(): ProviderContentPart[] {
  return [
    { type: 'text', text: 'Screenshot captured successfully.' },
    {
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${SAMPLE_BASE64_PNG}` },
    },
  ];
}

/** Helper to build a ProviderContentPart[] with only an image part */
function makeImageOnlyToolResult(): ProviderContentPart[] {
  return [
    {
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${SAMPLE_BASE64_JPEG}` },
    },
  ];
}

/** Helper to build a ProviderContentPart[] with only text parts */
function makeTextOnlyProviderContent(): ProviderContentPart[] {
  return [
    { type: 'text', text: 'First line.' },
    { type: 'text', text: 'Second line.' },
  ];
}

// ─── Anthropic Compat Provider ──────────────────────────────────────────────

describe('Anthropic Compat: image content in tool results', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockAnthropicResponse() {
    const mockResponse = {
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'I see the screenshot.' }],
      model: 'test-model',
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 20 },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(mockResponse),
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response);
  }

  function getRequestBody(): Record<string, unknown> {
    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    return JSON.parse(fetchCall[1].body as string);
  }

  it('should convert ProviderContentPart[] with images to Anthropic tool_result with image blocks', async () => {
    mockAnthropicResponse();

    const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
    await llm.generateCompletion({
      messages: [
        { role: 'user', content: 'Take a screenshot' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'tc_1', type: 'function', function: { name: 'screenshot', arguments: '{}' } },
          ],
        },
        {
          role: 'tool',
          content: makeImageToolResult(),
          tool_call_id: 'tc_1',
        },
      ],
      model: 'test-model',
      temperature: 0.7,
      topP: 1,
    });

    const body = getRequestBody();
    const userMsg = body.messages.find(
      (m: Record<string, unknown>) =>
        m.role === 'user' && Array.isArray(m.content) &&
        (m.content as Array<Record<string, unknown>>).some(
          (p: Record<string, unknown>) => p.type === 'tool_result',
        ),
    ) as Record<string, unknown> | undefined;

    expect(userMsg).toBeDefined();
    const toolResult = (userMsg!.content as Array<Record<string, unknown>>).find(
      (p: Record<string, unknown>) => p.type === 'tool_result',
    )!;

    expect(toolResult.tool_use_id).toBe('tc_1');
    expect(Array.isArray(toolResult.content)).toBe(true);

    const resultContent = toolResult.content as Array<Record<string, unknown>>;
    expect(resultContent).toHaveLength(2);

    // Text part
    expect(resultContent[0]).toEqual({ type: 'text', text: 'Screenshot captured successfully.' });

    // Image part — Anthropic base64 format
    expect(resultContent[1]).toEqual({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: SAMPLE_BASE64_PNG,
      },
    });
  });

  it('should keep plain string tool results unchanged', async () => {
    mockAnthropicResponse();

    const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
    await llm.generateCompletion({
      messages: [
        { role: 'user', content: 'Run ls' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'tc_2', type: 'function', function: { name: 'bash', arguments: '{"cmd":"ls"}' } },
          ],
        },
        {
          role: 'tool',
          content: 'file1.txt\nfile2.txt',
          tool_call_id: 'tc_2',
        },
      ],
      model: 'test-model',
      temperature: 0.7,
      topP: 1,
    });

    const body = getRequestBody();
    const userMsg = body.messages.find(
      (m: Record<string, unknown>) =>
        m.role === 'user' && Array.isArray(m.content) &&
        (m.content as Array<Record<string, unknown>>).some(
          (p: Record<string, unknown>) => p.type === 'tool_result',
        ),
    ) as Record<string, unknown>;

    const toolResult = (userMsg.content as Array<Record<string, unknown>>).find(
      (p: Record<string, unknown>) => p.type === 'tool_result',
    )!;

    expect(toolResult.content).toBe('file1.txt\nfile2.txt');
  });

  it('should handle image-only tool result (no text)', async () => {
    mockAnthropicResponse();

    const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
    await llm.generateCompletion({
      messages: [
        { role: 'user', content: 'Capture image' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'tc_3', type: 'function', function: { name: 'capture', arguments: '{}' } },
          ],
        },
        {
          role: 'tool',
          content: makeImageOnlyToolResult(),
          tool_call_id: 'tc_3',
        },
      ],
      model: 'test-model',
      temperature: 0.7,
      topP: 1,
    });

    const body = getRequestBody();
    const userMsg = body.messages.find(
      (m: Record<string, unknown>) =>
        m.role === 'user' && Array.isArray(m.content) &&
        (m.content as Array<Record<string, unknown>>).some(
          (p: Record<string, unknown>) => p.type === 'tool_result',
        ),
    ) as Record<string, unknown>;

    const toolResult = (userMsg.content as Array<Record<string, unknown>>).find(
      (p: Record<string, unknown>) => p.type === 'tool_result',
    )!;

    const resultContent = toolResult.content as Array<Record<string, unknown>>;
    expect(resultContent).toHaveLength(1);
    expect(resultContent[0]).toEqual({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: SAMPLE_BASE64_JPEG,
      },
    });
  });

  it('should merge consecutive tool results into the same user message', async () => {
    mockAnthropicResponse();

    const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
    await llm.generateCompletion({
      messages: [
        { role: 'user', content: 'Run two tools' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'tc_a', type: 'function', function: { name: 'tool1', arguments: '{}' } },
            { id: 'tc_b', type: 'function', function: { name: 'tool2', arguments: '{}' } },
          ],
        },
        {
          role: 'tool',
          content: makeImageToolResult(),
          tool_call_id: 'tc_a',
        },
        {
          role: 'tool',
          content: 'text result',
          tool_call_id: 'tc_b',
        },
      ],
      model: 'test-model',
      temperature: 0.7,
      topP: 1,
    });

    const body = getRequestBody();
    // Anthropic merges consecutive tool results into a single user message
    const userMsgs = (body.messages as Array<Record<string, unknown>>).filter(
      (m: Record<string, unknown>) =>
        m.role === 'user' && Array.isArray(m.content) &&
        (m.content as Array<Record<string, unknown>>).some(
          (p: Record<string, unknown>) => p.type === 'tool_result',
        ),
    );

    expect(userMsgs).toHaveLength(1);
    const toolResults = (userMsgs[0].content as Array<Record<string, unknown>>).filter(
      (p: Record<string, unknown>) => p.type === 'tool_result',
    );
    expect(toolResults).toHaveLength(2);

    // First tool result has image content
    expect(Array.isArray(toolResults[0].content)).toBe(true);
    // Second tool result is plain string
    expect(toolResults[1].content).toBe('text result');
  });

  it('should fall back to JSON.stringify for text-only ProviderContentPart[] without images', async () => {
    mockAnthropicResponse();

    const llm = new GenericAnthropicLLM('https://api.test.com/v1', { apiKey: 'test-key' });
    await llm.generateCompletion({
      messages: [
        { role: 'user', content: 'Do something' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'tc_4', type: 'function', function: { name: 'tool', arguments: '{}' } },
          ],
        },
        {
          role: 'tool',
          content: makeTextOnlyProviderContent(),
          tool_call_id: 'tc_4',
        },
      ],
      model: 'test-model',
      temperature: 0.7,
      topP: 1,
    });

    const body = getRequestBody();
    const userMsg = body.messages.find(
      (m: Record<string, unknown>) =>
        m.role === 'user' && Array.isArray(m.content) &&
        (m.content as Array<Record<string, unknown>>).some(
          (p: Record<string, unknown>) => p.type === 'tool_result',
        ),
    ) as Record<string, unknown>;

    const toolResult = (userMsg.content as Array<Record<string, unknown>>).find(
      (p: Record<string, unknown>) => p.type === 'tool_result',
    )!;

    // Text-only arrays get converted to Anthropic text parts, not JSON stringified
    const resultContent = toolResult.content as Array<Record<string, unknown>>;
    expect(resultContent).toHaveLength(2);
    expect(resultContent[0]).toEqual({ type: 'text', text: 'First line.' });
    expect(resultContent[1]).toEqual({ type: 'text', text: 'Second line.' });
  });
});

// ─── Responses API (OpenAI/Google) ──────────────────────────────────────────

describe('Responses API: image content in tool results', () => {
  it('should replace image content with placeholder text in function_call_output', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Take a screenshot' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'screenshot', arguments: '{}' } },
        ],
      },
      {
        role: 'tool',
        content: makeImageToolResult(),
        tool_call_id: 'call_1',
      },
    ];

    const result = transformToResponsesInput(messages);

    const functionOutput = result.input.find(
      (item) => item.type === 'function_call_output',
    );
    expect(functionOutput).toBeDefined();
    expect(functionOutput!.type).toBe('function_call_output');

    const output = (functionOutput as { output: string }).output;
    expect(output).toContain('Screenshot captured successfully.');
    expect(output).toContain('[Image content returned by tool]');
    // Should NOT contain actual base64 data
    expect(output).not.toContain(SAMPLE_BASE64_PNG);
  });

  it('should keep plain string tool results unchanged', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Run ls' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_2', type: 'function', function: { name: 'bash', arguments: '{"cmd":"ls"}' } },
        ],
      },
      {
        role: 'tool',
        content: 'file1.txt\nfile2.txt',
        tool_call_id: 'call_2',
      },
    ];

    const result = transformToResponsesInput(messages);

    const functionOutput = result.input.find(
      (item) => item.type === 'function_call_output',
    );
    expect(functionOutput).toBeDefined();
    expect((functionOutput as { output: string }).output).toBe('file1.txt\nfile2.txt');
  });

  it('should handle image-only tool result', () => {
    const messages: ChatMessage[] = [
      {
        role: 'tool',
        content: makeImageOnlyToolResult(),
        tool_call_id: 'call_3',
      },
    ];

    const result = transformToResponsesInput(messages);

    const functionOutput = result.input.find(
      (item) => item.type === 'function_call_output',
    );
    expect(functionOutput).toBeDefined();
    const output = (functionOutput as { output: string }).output;
    expect(output).toBe('[Image content returned by tool]');
    expect(output).not.toContain(SAMPLE_BASE64_JPEG);
  });

  it('should handle multiple text and image parts with newline separator', () => {
    const content: ProviderContentPart[] = [
      { type: 'text', text: 'First text' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${SAMPLE_BASE64_PNG}` } },
      { type: 'text', text: 'Second text' },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${SAMPLE_BASE64_JPEG}` } },
    ];

    const messages: ChatMessage[] = [
      { role: 'tool', content, tool_call_id: 'call_4' },
    ];

    const result = transformToResponsesInput(messages);
    const functionOutput = result.input.find(
      (item) => item.type === 'function_call_output',
    );
    const output = (functionOutput as { output: string }).output;

    expect(output).toBe(
      'First text\n[Image content returned by tool]\nSecond text\n[Image content returned by tool]',
    );
  });

  it('should handle non-string, non-array content with JSON.stringify', () => {
    const messages: ChatMessage[] = [
      {
        role: 'tool',
        content: { result: 'success' } as unknown as string,
        tool_call_id: 'call_5',
      },
    ];

    const result = transformToResponsesInput(messages);
    const functionOutput = result.input.find(
      (item) => item.type === 'function_call_output',
    );
    expect((functionOutput as { output: string }).output).toBe('{"result":"success"}');
  });
});

// ─── AI SDK Adapter: unit tests of buildAISDKToolResultOutput ───────────────

describe('AI SDK adapter: buildAISDKToolResultOutput (unit)', () => {
  it('should produce content output with media parts for image content', () => {
    const result = buildAISDKToolResultOutput(makeImageToolResult());

    expect(result.type).toBe('content');
    expect(result.value).toHaveLength(2);

    const parts = result.value as Array<Record<string, unknown>>;
    expect(parts[0]).toEqual({ type: 'text', text: 'Screenshot captured successfully.' });
    expect(parts[1]).toEqual({
      type: 'media',
      data: SAMPLE_BASE64_PNG,
      mediaType: 'image/png',
    });
  });

  it('should produce content output for image-only tool result', () => {
    const result = buildAISDKToolResultOutput(makeImageOnlyToolResult());

    expect(result.type).toBe('content');
    const parts = result.value as Array<Record<string, unknown>>;
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({
      type: 'media',
      data: SAMPLE_BASE64_JPEG,
      mediaType: 'image/jpeg',
    });
  });

  it('should produce text output for plain string content', () => {
    const result = buildAISDKToolResultOutput('simple text result');

    expect(result).toEqual({ type: 'text', value: 'simple text result' });
  });

  it('should produce text output with JSON.stringify for array without images', () => {
    const content = makeTextOnlyProviderContent();
    const result = buildAISDKToolResultOutput(content);

    expect(result.type).toBe('text');
    expect(result.value).toBe(JSON.stringify(content));
  });

  it('should produce text output with JSON.stringify for null content', () => {
    const result = buildAISDKToolResultOutput(null as unknown as string);

    expect(result.type).toBe('text');
    expect(result.value).toBe('null');
  });

  it('should skip image_url parts that are not base64 data URIs', () => {
    const content: ProviderContentPart[] = [
      { type: 'text', text: 'Here is the image.' },
      { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
    ];
    const result = buildAISDKToolResultOutput(content);

    // The URL-based image is skipped; only the text part remains, so 'content' type with 1 part
    // Actually: the code builds contentParts, the text is added but the URL image is not matched.
    // Since contentParts.length > 0, it returns { type: 'content', value: [textPart] }
    expect(result.type).toBe('content');
    const parts = result.value as Array<Record<string, unknown>>;
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ type: 'text', text: 'Here is the image.' });
  });
});

// ─── AI SDK Adapter: integration through transformMessages ──────────────────

describe('AI SDK adapter: transformMessages integration', () => {
  /**
   * Access the private transformMessages method for integration testing.
   * This verifies the full code path from ChatMessage[] → ModelMessage[].
   */
  function callTransformMessages(messages: ChatMessage[]) {
    const instance = new AnthropicAISDKLLM();
    return (instance as unknown as { transformMessages: (msgs: ChatMessage[]) => unknown[] }).transformMessages(messages);
  }

  it('should transform tool message with image content into tool-result with media output', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Take a screenshot' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'tc_1', type: 'function', function: { name: 'screenshot', arguments: '{}' } },
        ],
      },
      {
        role: 'tool',
        content: makeImageToolResult(),
        tool_call_id: 'tc_1',
        name: 'screenshot',
      },
    ];

    const result = callTransformMessages(messages);

    // Find the tool message in the transformed output
    const toolMsg = result.find(
      (m: Record<string, unknown>) => m.role === 'tool',
    ) as Record<string, unknown>;
    expect(toolMsg).toBeDefined();

    const content = toolMsg.content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(1);

    const toolResult = content[0];
    expect(toolResult.type).toBe('tool-result');
    expect(toolResult.toolCallId).toBe('tc_1');
    expect(toolResult.toolName).toBe('screenshot');

    // Verify the output uses the 'content' type with media parts
    const output = toolResult.output as { type: string; value: unknown[] };
    expect(output.type).toBe('content');
    expect(output.value).toHaveLength(2);
    expect(output.value[0]).toEqual({ type: 'text', text: 'Screenshot captured successfully.' });
    expect(output.value[1]).toEqual({
      type: 'media',
      data: SAMPLE_BASE64_PNG,
      mediaType: 'image/png',
    });
  });

  it('should transform tool message with plain string into tool-result with text output', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Run ls' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'tc_2', type: 'function', function: { name: 'bash', arguments: '{"cmd":"ls"}' } },
        ],
      },
      {
        role: 'tool',
        content: 'file1.txt\nfile2.txt',
        tool_call_id: 'tc_2',
      },
    ];

    const result = callTransformMessages(messages);

    const toolMsg = result.find(
      (m: Record<string, unknown>) => m.role === 'tool',
    ) as Record<string, unknown>;
    expect(toolMsg).toBeDefined();

    const content = toolMsg.content as Array<Record<string, unknown>>;
    const toolResult = content[0];
    expect(toolResult.type).toBe('tool-result');

    const output = toolResult.output as { type: string; value: string };
    expect(output.type).toBe('text');
    expect(output.value).toBe('file1.txt\nfile2.txt');
  });

  it('should transform image-only tool result into content output with single media part', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Capture' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'tc_3', type: 'function', function: { name: 'capture', arguments: '{}' } },
        ],
      },
      {
        role: 'tool',
        content: makeImageOnlyToolResult(),
        tool_call_id: 'tc_3',
      },
    ];

    const result = callTransformMessages(messages);

    const toolMsg = result.find(
      (m: Record<string, unknown>) => m.role === 'tool',
    ) as Record<string, unknown>;
    const content = toolMsg.content as Array<Record<string, unknown>>;
    const output = content[0].output as { type: string; value: unknown[] };

    expect(output.type).toBe('content');
    expect(output.value).toHaveLength(1);
    expect(output.value[0]).toEqual({
      type: 'media',
      data: SAMPLE_BASE64_JPEG,
      mediaType: 'image/jpeg',
    });
  });

  it('should transform text-only ProviderContentPart[] into text output with JSON', () => {
    const textContent = makeTextOnlyProviderContent();
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Do something' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'tc_4', type: 'function', function: { name: 'tool', arguments: '{}' } },
        ],
      },
      {
        role: 'tool',
        content: textContent,
        tool_call_id: 'tc_4',
      },
    ];

    const result = callTransformMessages(messages);

    const toolMsg = result.find(
      (m: Record<string, unknown>) => m.role === 'tool',
    ) as Record<string, unknown>;
    const content = toolMsg.content as Array<Record<string, unknown>>;
    const output = content[0].output as { type: string; value: string };

    expect(output.type).toBe('text');
    expect(output.value).toBe(JSON.stringify(textContent));
  });

  it('should preserve toolCallId and toolName through the transformation', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Test' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'unique-id-123', type: 'function', function: { name: 'my_tool', arguments: '{}' } },
        ],
      },
      {
        role: 'tool',
        content: makeImageToolResult(),
        tool_call_id: 'unique-id-123',
        name: 'my_tool',
      },
    ];

    const result = callTransformMessages(messages);

    const toolMsg = result.find(
      (m: Record<string, unknown>) => m.role === 'tool',
    ) as Record<string, unknown>;
    const content = toolMsg.content as Array<Record<string, unknown>>;
    const toolResult = content[0];

    expect(toolResult.toolCallId).toBe('unique-id-123');
    expect(toolResult.toolName).toBe('my_tool');
  });
});
