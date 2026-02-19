/**
 * Message Flow Integration Test - Data-Driven (Multi-Turn Support)
 *
 * This test loads test cases from JSON fixture files, making it easy to:
 * 1. Add new test cases by creating new JSON files
 * 2. Generate test cases programmatically
 * 3. Maintain test data separately from test logic
 * 4. Test multi-turn conversations (multiple user messages in sequence)
 *
 * Based on: docs/message-flow-analysis.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentOrchestrator } from '../../orchestrator.js';
import { GenericLLM } from '../../llm-providers/llm-factory.js';
import { InMemoryMemory } from '../../persistent/memory.js';
import { SimpleContextBuilder } from '../../context.js';
import { SimpleCost } from '../../cost.js';
import { ToolRegistry } from '../../tools.js';
import { PersistingConsoleEventPort } from '../../events.js';
import { InMemoryMetricsPort } from '../../metrics.js';
import { AgentEventTypes } from '../../ports.js';
import type { AgentConfig, AgentEvent, EventPort, Message, MetricsSnapshot, ToolInvocation } from '../../ports.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ============================================================================
// Type Definitions for Fixture Files
// ============================================================================

interface ToolCallDefinition {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface LLMResponse {
  type: 'tool_calls' | 'text_stream';
  content?: string;
  toolCalls?: ToolCallDefinition[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface ToolMock {
  name: string;
  result: string;
  metadata?: Record<string, unknown>;
  durationMs?: number;
}

interface ExpectedTurnMemory {
  role: 'user' | 'assistant' | 'tool';
  content?: string;
  contentContains?: string;
  name?: string;
  tool_call_id?: string;
  status?: string;
  hasToolCalls?: boolean;
  toolCallCount?: number;
  toolCalls?: Array<{ id: string; name: string }>;
}

interface Turn {
  userMessage: string;
  llmResponses: LLMResponse[];
  toolMocks: Record<string, ToolMock>;
  expected: {
    response: {
      role: string;
      content: string;
    };
    memory: ExpectedTurnMemory[];
  };
}

interface TestFixture {
  name: string;
  description: string;
  config: {
    agentId: string;
    model: string;
    systemPrompt: string;
    temperature: number;
    topP: number;
    maxTokens: number;
    enabledTools: string[];
    requireToolApproval: boolean;
  };
  conversationId: string;
  turns: Turn[];
  expected: {
    totalFetchCalls: number;
    totalMemoryMessages: number;
    finalUsage?: {
      total_tokens: number;
    };
    metrics?: {
      totalTokens?: number;
      llmCallCount?: number;
      toolCallCount?: number;
      requestCount?: number;
    };
  };
}

// ============================================================================
// SSE Stream Builders
// ============================================================================

function createMockStreamResponse(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const eventString = events.join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(eventString));
      controller.close();
    },
  });
}

function buildToolCallStreamEvents(toolCalls: ToolCallDefinition[], usage: LLMResponse['usage']): string {
  const events: string[] = [];

  // First chunk with role
  events.push(
    `data: ${JSON.stringify({
      id: 'test-response',
      model: 'test-model',
      choices: [{ index: 0, delta: { role: 'assistant', content: '' } }],
    })}\n\n`,
  );

  // Tool call chunks
  toolCalls.forEach((tc, index) => {
    events.push(
      `data: ${JSON.stringify({
        id: 'test-response',
        model: 'test-model',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index,
                  id: tc.id,
                  type: 'function',
                  function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
                },
              ],
            },
          },
        ],
      })}\n\n`,
    );
  });

  // Final chunk with finish_reason and usage
  events.push(
    `data: ${JSON.stringify({
      id: 'test-response',
      model: 'test-model',
      choices: [{ index: 0, finish_reason: 'tool_calls', delta: {} }],
      usage,
    })}\n\n`,
  );

  events.push('data: [DONE]\n\n');
  return events.join('');
}

function buildTextStreamEvents(content: string, usage: LLMResponse['usage']): string {
  const words = content.split(' ');
  const events: string[] = [];

  // First chunk with role
  events.push(
    `data: ${JSON.stringify({
      id: 'test-response',
      model: 'test-model',
      choices: [{ index: 0, delta: { role: 'assistant', content: '' } }],
    })}\n\n`,
  );

  // Content chunks - one per word
  words.forEach((word, i) => {
    const delta = i === 0 ? word : ` ${word}`;
    events.push(
      `data: ${JSON.stringify({
        id: 'test-response',
        model: 'test-model',
        choices: [{ index: 0, delta: { content: delta } }],
      })}\n\n`,
    );
  });

  // Final chunk with finish_reason and usage
  events.push(
    `data: ${JSON.stringify({
      id: 'test-response',
      model: 'test-model',
      choices: [{ index: 0, finish_reason: 'stop', delta: {} }],
      usage,
    })}\n\n`,
  );

  events.push('data: [DONE]\n\n');
  return events.join('');
}

function buildSSEResponse(llmResponse: LLMResponse): string {
  if (llmResponse.type === 'tool_calls' && llmResponse.toolCalls) {
    return buildToolCallStreamEvents(llmResponse.toolCalls, llmResponse.usage);
  } else if (llmResponse.type === 'text_stream' && llmResponse.content) {
    return buildTextStreamEvents(llmResponse.content, llmResponse.usage);
  }
  throw new Error(`Unknown LLM response type: ${llmResponse.type}`);
}

// ============================================================================
// Test Runner Functions
// ============================================================================

function loadFixture(fixturePath: string): TestFixture {
  const fullPath = path.join(__dirname, 'fixtures', fixturePath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  return JSON.parse(content) as TestFixture;
}

function setupFetchMockForTurns(turns: Turn[]): { fetchCallCount: () => number } {
  let callCount = 0;

  // Flatten all LLM responses from all turns
  const allResponses: LLMResponse[] = [];
  for (const turn of turns) {
    allResponses.push(...turn.llmResponses);
  }

  vi.mocked(global.fetch).mockImplementation(async () => {
    const responseIndex = callCount;
    callCount++;

    if (responseIndex >= allResponses.length) {
      throw new Error(`Unexpected fetch call #${responseIndex + 1}, only ${allResponses.length} responses defined`);
    }

    const sseResponse = buildSSEResponse(allResponses[responseIndex]);
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: createMockStreamResponse([sseResponse]),
    } as Response;
  });

  return { fetchCallCount: () => callCount };
}

function setupToolMocksForTurns(toolRegistry: ToolRegistry, turns: Turn[]): void {
  // Merge all tool mocks from all turns
  const allToolMocks: Record<string, ToolMock> = {};
  for (const turn of turns) {
    Object.assign(allToolMocks, turn.toolMocks);
  }

  vi.spyOn(toolRegistry, 'executeToolCalls').mockImplementation(async (calls: ToolInvocation[]) => {
    return calls.map((call) => {
      // Look up by tool call ID
      const mock = allToolMocks[call.id];
      if (!mock) {
        return {
          id: call.id,
          name: call.name,
          status: 'error' as const,
          type: 'text' as const,
          result: `No mock defined for tool call ID: ${call.id}`,
          durationMs: 0,
        };
      }
      return {
        id: call.id,
        name: mock.name,
        status: 'success' as const,
        type: 'text' as const,
        result: mock.result,
        metadata: mock.metadata,
        durationMs: mock.durationMs ?? 50,
      };
    });
  });
}

function verifyTurnMemory(
  savedMessages: Message[],
  startIndex: number,
  expectedMemory: ExpectedTurnMemory[],
  turnIndex: number,
): number {
  for (let i = 0; i < expectedMemory.length; i++) {
    const expected = expectedMemory[i];
    const actualIndex = startIndex + i;
    const message = savedMessages[actualIndex];

    expect(message, `Turn ${turnIndex + 1}, message ${i + 1} at index ${actualIndex} should exist`).toBeDefined();

    // Verify role
    expect(message.role, `Turn ${turnIndex + 1}, message ${i + 1}`).toBe(expected.role);

    // Verify content
    if (expected.content !== undefined) {
      expect(message.content).toBe(expected.content);
    }
    if (expected.contentContains !== undefined) {
      expect(message.content).toContain(expected.contentContains);
    }

    // Verify tool-specific fields
    if (expected.name !== undefined) {
      expect(message.name).toBe(expected.name);
    }
    if (expected.tool_call_id !== undefined) {
      expect(message.tool_call_id).toBe(expected.tool_call_id);
    }
    if (expected.status !== undefined) {
      expect(message.status).toBe(expected.status);
    }

    // Verify tool_calls
    if (expected.hasToolCalls === true) {
      expect(message.tool_calls).toBeDefined();
      expect(message.tool_calls?.length).toBeGreaterThan(0);
    }
    if (expected.hasToolCalls === false) {
      expect(message.tool_calls).toBeUndefined();
    }
    if (expected.toolCallCount !== undefined) {
      expect(message.tool_calls?.length).toBe(expected.toolCallCount);
    }
    if (expected.toolCalls) {
      for (const expectedTc of expected.toolCalls) {
        const actualTc = message.tool_calls?.find((tc) => tc.id === expectedTc.id);
        expect(actualTc, `Tool call ${expectedTc.id} should exist`).toBeDefined();
        if (expectedTc.name !== undefined) {
          expect(actualTc?.function.name).toBe(expectedTc.name);
        }
      }
    }

    // Verify required fields exist
    expect(message.id).toBeDefined();
    if (message.role !== 'tool') {
      expect(message.timestamp).toBeDefined();
    }
  }

  return startIndex + expectedMemory.length;
}

// ============================================================================
// Test Runner
// ============================================================================

function runMessageFlowTest(fixture: TestFixture) {
  let testEventsFile: string;
  let mockMemory: InMemoryMemory<Message>;
  let emittedEvents: AgentEvent[];
  let savedMessages: Message[];
  let metricsSnapshots: MetricsSnapshot[];

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    emittedEvents = [];
    savedMessages = [];
    metricsSnapshots = [];

    // Create temp files for testing with unique UUID to avoid conflicts
    const testDir = path.join(os.tmpdir(), `nuvin-test-dd-${crypto.randomUUID()}`);
    fs.mkdirSync(testDir, { recursive: true });
    testEventsFile = path.join(testDir, 'events.json');

    // Create memory that tracks all appended messages
    mockMemory = new InMemoryMemory<Message>();
    const originalAppend = mockMemory.append.bind(mockMemory);
    mockMemory.append = vi.fn(async (key: string, messages: Message[]) => {
      savedMessages.push(...messages);
      return originalAppend(key, messages);
    });
  });

  afterEach(() => {
    // Cleanup temp files
    if (fs.existsSync(testEventsFile)) {
      fs.unlinkSync(testEventsFile);
    }
    const testDir = path.dirname(testEventsFile);
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it(fixture.description, { timeout: 60000 }, async () => {
    // Setup fetch mock for all turns
    const { fetchCallCount } = setupFetchMockForTurns(fixture.turns);

    // Setup event port
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

    // Create LLM
    const llm = new GenericLLM('https://api.example.com', true, {
      apiKey: 'test-key',
      includeUsage: true,
      providerName: 'test-provider',
    });

    // Create tool registry with mocks
    const toolRegistry = new ToolRegistry();
    setupToolMocksForTurns(toolRegistry, fixture.turns);

    // Create config
    const config: AgentConfig = {
      id: fixture.config.agentId,
      model: fixture.config.model,
      systemPrompt: fixture.config.systemPrompt,
      temperature: fixture.config.temperature,
      topP: fixture.config.topP,
      maxTokens: fixture.config.maxTokens,
      enabledTools: fixture.config.enabledTools,
      maxToolConcurrency: 3,
      requireToolApproval: fixture.config.requireToolApproval,
    };

    // Create orchestrator
    const context = new SimpleContextBuilder();
    const cost = new SimpleCost();
    const metricsPort = new InMemoryMetricsPort((snapshot) => {
      metricsSnapshots.push({ ...snapshot });
    });

    const orchestrator = new AgentOrchestrator(config, {
      memory: mockMemory,
      llm,
      tools: toolRegistry,
      context,
      ids: { uuid: () => crypto.randomUUID() },
      clock: { now: () => Date.now(), iso: () => new Date().toISOString() },
      cost,
      reminders: { enhance: (text) => [text] },
      events: mockEvents,
      metrics: metricsPort,
    });

    // Execute each turn
    let memoryIndex = 0;
    for (let turnIndex = 0; turnIndex < fixture.turns.length; turnIndex++) {
      const turn = fixture.turns[turnIndex];

      // Send user message
      const response = await orchestrator.send(turn.userMessage, {
        conversationId: fixture.conversationId,
        stream: true,
      });

      // Verify response
      expect(response.role, `Turn ${turnIndex + 1} response role`).toBe(turn.expected.response.role);
      expect(response.content, `Turn ${turnIndex + 1} response content`).toBe(turn.expected.response.content);

      // Verify memory for this turn
      memoryIndex = verifyTurnMemory(savedMessages, memoryIndex, turn.expected.memory, turnIndex);
    }

    // Verify total fetch call count
    expect(fetchCallCount()).toBe(fixture.expected.totalFetchCalls);

    // Verify total memory messages
    expect(savedMessages.length).toBe(fixture.expected.totalMemoryMessages);

    // Verify event persistence
    expect(fs.existsSync(testEventsFile)).toBe(true);
    const persistedData = JSON.parse(fs.readFileSync(testEventsFile, 'utf-8'));
    expect(persistedData).toHaveProperty(fixture.conversationId);

    // Verify final usage if expected
    if (fixture.expected.finalUsage) {
      const doneEvents = emittedEvents.filter((e) => e.type === AgentEventTypes.Done);
      const lastDoneEvent = doneEvents[doneEvents.length - 1];
      expect(lastDoneEvent).toBeDefined();
      expect(lastDoneEvent?.usage?.total_tokens).toBe(fixture.expected.finalUsage.total_tokens);
    }

    // Verify metrics if expected
    if (fixture.expected.metrics) {
      const finalMetrics = metricsPort.getSnapshot();
      const expectedMetrics = fixture.expected.metrics;

      if (expectedMetrics.totalTokens !== undefined) {
        expect(finalMetrics.totalTokens, 'Metrics: totalTokens').toBe(expectedMetrics.totalTokens);
      }
      if (expectedMetrics.llmCallCount !== undefined) {
        expect(finalMetrics.llmCallCount, 'Metrics: llmCallCount').toBe(expectedMetrics.llmCallCount);
      }
      if (expectedMetrics.toolCallCount !== undefined) {
        expect(finalMetrics.toolCallCount, 'Metrics: toolCallCount').toBe(expectedMetrics.toolCallCount);
      }
      if (expectedMetrics.requestCount !== undefined) {
        expect(finalMetrics.requestCount, 'Metrics: requestCount').toBe(expectedMetrics.requestCount);
      }
    }
  });
}

// ============================================================================
// Load and Run Test Cases
// ============================================================================

// Get all fixture files
const fixturesDir = path.join(__dirname, 'fixtures');
const fixtureFiles = fs.existsSync(fixturesDir) ? fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.json')) : [];

describe('Message Flow Integration Tests (Data-Driven)', () => {
  if (fixtureFiles.length === 0) {
    it.skip('No fixture files found', () => {});
  } else {
    for (const fixtureFile of fixtureFiles) {
      const fixture = loadFixture(fixtureFile);
      describe(fixture.name, () => {
        runMessageFlowTest(fixture);
      });
    }
  }
});
