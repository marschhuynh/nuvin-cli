import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentOrchestrator } from '../orchestrator.js';
import { GenericLLM } from '../llm-providers/llm-factory.js';
import { InMemoryMemory } from '../persistent/memory.js';
import { SimpleContextBuilder } from '../context.js';
import { SimpleCost } from '../cost.js';
import { ToolRegistry } from '../tools.js';
import { AgentEventTypes } from '../ports.js';
import { PersistingConsoleEventPort } from '../events.js';
import type { AgentConfig, AgentEvent, EventPort, Message } from '../ports.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const mockStreamResponse = `data: {"id":"20251115201538e5bd49e905784dd2","created":1763208938,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":"","reasoning_content":"\\n"}}]}

data: {"id":"20251115201538e5bd49e905784dd2","created":1763208938,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":"\\n"}}]}

data: {"id":"20251115201538e5bd49e905784dd2","created":1763208938,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":"Hi"}}]}

data: {"id":"20251115201538e5bd49e905784dd2","created":1763208938,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":"!"}}]}

data: {"id":"20251115201538e5bd49e905784dd2","created":1763208938,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":" How"}}]}

data: {"id":"20251115201538e5bd49e905784dd2","created":1763208938,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":" can"}}]}

data: {"id":"20251115201538e5bd49e905784dd2","created":1763208938,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":" I"}}]}

data: {"id":"20251115201538e5bd49e905784dd2","created":1763208938,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":" help"}}]}

data: {"id":"20251115201538e5bd49e905784dd2","created":1763208938,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":" you"}}]}

data: {"id":"20251115201538e5bd49e905784dd2","created":1763208938,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":" today"}}]}

data: {"id":"20251115201538e5bd49e905784dd2","created":1763208938,"model":"glm-4.6","choices":[{"index":0,"delta":{"role":"assistant","content":"?"}}]}

data: {"id":"20251115201538e5bd49e905784dd2","created":1763208938,"model":"glm-4.6","choices":[{"index":0,"finish_reason":"stop","delta":{"role":"assistant","content":""}}],"usage":{"prompt_tokens":3859,"completion_tokens":14,"total_tokens":3873,"prompt_tokens_details":{"cached_tokens":43}}}

data: [DONE]
`;

describe('AgentOrchestrator - Event Persistence Integration Test', () => {
  let testEventsFile: string;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    testEventsFile = path.join(os.tmpdir(), `test-events-${Date.now()}.json`);
  });

  afterEach(() => {
    if (fs.existsSync(testEventsFile)) {
      fs.unlinkSync(testEventsFile);
    }
  });

  it('should emit and persist AssistantChunk events during streaming', async () => {
    const emittedEvents: AgentEvent[] = [];

    const persistingEvents = new PersistingConsoleEventPort({
      filename: testEventsFile,
      maxPerConversation: 1000,
    });

    const mockEvents: EventPort = {
      emit: async (event: AgentEvent) => {
        emittedEvents.push(event);
        await persistingEvents.emit(event);
      },
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(mockStreamResponse));
        controller.close();
      },
    });

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'text/event-stream',
      }),
      body: stream,
    } as Response);

    const llm = new GenericLLM('https://api.example.com', true, {
      apiKey: 'test-key',
      includeUsage: true,
      providerName: 'test-provider',
    });

    const config: AgentConfig = {
      id: 'test-agent',
      model: 'glm-4.6',
      systemPrompt: 'You are a helpful assistant',
      temperature: 0.7,
      topP: 1.0,
      maxTokens: 50,
    };

    const memory = new InMemoryMemory<Message>();
    const context = new SimpleContextBuilder();
    const cost = new SimpleCost();
    const tools = new ToolRegistry();

    const orchestrator = new AgentOrchestrator(config, {
      memory,
      llm,
      tools,
      context,
      ids: {
        uuid: () => crypto.randomUUID(),
      },
      clock: {
        now: () => Date.now(),
        iso: () => new Date().toISOString(),
      },
      cost,
      reminders: {
        enhance: (text) => [text],
      },
      events: mockEvents,
    });

    await orchestrator.send('Hello', {
      conversationId: 'test-convo',
      stream: true,
    });

    const assistantChunkEvents = emittedEvents.filter((e) => e.type === AgentEventTypes.AssistantChunk);

    expect(assistantChunkEvents).toHaveLength(9);

    const expectedDeltas = ['Hi', '!', ' How', ' can', ' I', ' help', ' you', ' today', '?'];

    assistantChunkEvents.forEach((chunkEvent, idx) => {
      expect(chunkEvent).toHaveProperty('type', AgentEventTypes.AssistantChunk);
      expect(chunkEvent).toHaveProperty('conversationId', 'test-convo');
      expect(chunkEvent).toHaveProperty('messageId');
      expect(chunkEvent).toHaveProperty('delta');
      expect(chunkEvent.delta).toBe(expectedDeltas[idx]);
      expect(typeof chunkEvent.delta).toBe('string');
    });

    const messageIds = new Set(assistantChunkEvents.map((e) => e.messageId));
    expect(messageIds.size).toBe(1);

    const streamFinishEvents = emittedEvents.filter((e) => e.type === AgentEventTypes.StreamFinish);
    expect(streamFinishEvents).toHaveLength(1);

    const streamFinishEvent = streamFinishEvents[0];
    expect(streamFinishEvent).toHaveProperty('type', AgentEventTypes.StreamFinish);
    expect(streamFinishEvent).toHaveProperty('conversationId', 'test-convo');
    expect(streamFinishEvent).toHaveProperty('messageId');
    expect(streamFinishEvent).toHaveProperty('finishReason', 'stop');
    expect(streamFinishEvent).toHaveProperty('usage');

    expect(streamFinishEvent.usage).toBeDefined();
    expect(streamFinishEvent.usage).toMatchObject({
      prompt_tokens: 3859,
      completion_tokens: 14,
      total_tokens: 3873,
    });

    const messageStartedEvents = emittedEvents.filter((e) => e.type === AgentEventTypes.MessageStarted);
    expect(messageStartedEvents).toHaveLength(1);

    const doneEvents = emittedEvents.filter((e) => e.type === AgentEventTypes.Done);
    expect(doneEvents).toHaveLength(1);

    expect(fs.existsSync(testEventsFile)).toBe(true);

    const persistedData = JSON.parse(fs.readFileSync(testEventsFile, 'utf-8'));
    expect(persistedData).toHaveProperty('test-convo');

    const persistedEvents = persistedData['test-convo'];
    expect(Array.isArray(persistedEvents)).toBe(true);
    expect(persistedEvents.length).toBe(emittedEvents.length);

    const persistedChunks = persistedEvents.filter((e: AgentEvent) => e.type === AgentEventTypes.AssistantChunk);

    expect(persistedChunks).toHaveLength(assistantChunkEvents.length);

    persistedChunks.forEach((chunk: AgentEvent, idx: number) => {
      expect(chunk.delta).toBe(expectedDeltas[idx]);
    });
  });
});
