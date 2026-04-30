/**
 * Events to Test Fixture Generator
 *
 * This script takes an events.json file (recorded from a full conversation)
 * and generates a single test fixture JSON file with all turns.
 *
 * Usage:
 *   npx tsx scripts/events-to-fixture.ts <events.json> [output-file]
 *
 * Example:
 *   npx tsx scripts/events-to-fixture.ts ./events.json ./fixtures/my-test.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// Types
// ============================================================================

interface AgentEvent {
  type: string;
  conversationId: string;
  messageId?: string;
  delta?: string;
  content?: string;
  userContent?: string;
  enhanced?: string[];
  toolNames?: string[];
  finishReason?: string;
  responseTimeMs?: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
    cache_read_input_tokens?: number;
  };
  // Tool-related
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  results?: ToolResult[];
  // Single tool result (actual recorded format)
  result?: {
    id: string;
    name: string;
    status: 'success' | 'error';
    type?: string;
    result?: string;
    metadata?: Record<string, unknown>;
    durationMs?: number;
  };
  name?: string;
  status?: string;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: string | Record<string, unknown>;
}

interface ToolResult {
  id: string;
  name: string;
  status: 'success' | 'error';
  result?: string;
  metadata?: Record<string, unknown>;
}

interface LLMResponse {
  type: 'tool_calls' | 'text_stream';
  content?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
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
  toolMocks: Record<string, { name: string; result: string; metadata?: Record<string, unknown>; durationMs?: number }>;
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
// Event Processing
// ============================================================================

interface TurnFlow {
  userMessage: string;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  assistantContent: string;
  hasToolCalls: boolean;
  usage: AgentEvent['usage'];
  toolNames: string[];
}

function extractTurnFlow(events: AgentEvent[]): TurnFlow {
  let userMessage = '';
  const toolCalls: ToolCall[] = [];
  const toolResults: ToolResult[] = [];
  let assistantContent = '';
  let usage: AgentEvent['usage'];
  let toolNames: string[] = [];

  for (const event of events) {
    switch (event.type) {
      case 'message_started':
        if (event.userContent) {
          userMessage = event.userContent;
        }
        if (event.toolNames) {
          toolNames = event.toolNames;
        }
        break;

      case 'tool_calls':
        if (event.toolCalls) {
          for (const tc of event.toolCalls) {
            // Handle both formats: direct toolCall and function wrapper
            const name = tc.function?.name || (tc as unknown as { name: string }).name || '';
            const args = tc.function?.arguments || (tc as unknown as { arguments: string }).arguments || '{}';
            toolCalls.push({
              id: tc.id,
              name,
              arguments: typeof args === 'string' ? JSON.parse(args) : args,
            });
          }
        }
        break;

      case 'tool_result':
        // Handle single result object format (actual recorded format)
        if (event.result && typeof event.result === 'object' && 'id' in event.result) {
          const tr = event.result;
          toolResults.push({
            id: tr.id,
            name: tr.name,
            status: tr.status,
            result: tr.result,
            metadata: tr.metadata,
          });
        }
        // Handle array of results format (legacy format)
        if (event.results) {
          for (const tr of event.results) {
            toolResults.push({
              id: tr.id,
              name: tr.name,
              status: tr.status,
              result: tr.result,
              metadata: tr.metadata,
            });
          }
        }
        break;

      case 'assistant_message':
        if (event.content) {
          assistantContent = event.content;
        }
        if (event.usage) {
          usage = event.usage;
        }
        break;

      case 'done':
        if (event.usage) {
          usage = event.usage;
        }
        break;
    }
  }

  return {
    userMessage,
    toolCalls,
    toolResults,
    assistantContent,
    hasToolCalls: toolCalls.length > 0,
    usage,
    toolNames,
  };
}

function buildLLMResponses(flow: TurnFlow): LLMResponse[] {
  const responses: LLMResponse[] = [];

  if (flow.toolCalls.length > 0) {
    // First response: tool calls
    responses.push({
      type: 'tool_calls',
      toolCalls: flow.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments,
      })),
      usage: {
        prompt_tokens: Math.floor((flow.usage?.prompt_tokens || 100) / 2),
        completion_tokens: Math.floor((flow.usage?.completion_tokens || 50) / 2),
        total_tokens: Math.floor((flow.usage?.total_tokens || 150) / 2),
      },
    });
  }

  // Final response: text content
  if (flow.assistantContent) {
    responses.push({
      type: 'text_stream',
      content: flow.assistantContent,
      usage: {
        prompt_tokens: flow.usage?.prompt_tokens || 100,
        completion_tokens: flow.usage?.completion_tokens || 50,
        total_tokens: flow.usage?.total_tokens || 150,
      },
    });
  }

  return responses;
}

function buildToolMocks(
  toolCalls: ToolCall[],
  toolResults: ToolResult[],
): Record<string, { name: string; result: string; metadata?: Record<string, unknown>; durationMs?: number }> {
  const mocks: Record<string, { name: string; result: string; metadata?: Record<string, unknown>; durationMs?: number }> = {};

  for (const tr of toolResults) {
    // Find the matching tool call to get the ID
    const toolCall = toolCalls.find((tc) => tc.id === tr.id || tc.name === tr.name);
    const id = toolCall?.id || tr.id;

    mocks[id] = {
      name: tr.name,
      result: tr.result || '',
      metadata: tr.metadata,
      durationMs: 50,
    };
  }

  return mocks;
}

function buildExpectedMemory(flow: TurnFlow): ExpectedTurnMemory[] {
  const memory: ExpectedTurnMemory[] = [];

  // User message
  memory.push({
    role: 'user',
    content: flow.userMessage,
  });

  // If tool calls exist
  if (flow.toolCalls.length > 0) {
    // Assistant with tool calls
    memory.push({
      role: 'assistant',
      content: '',
      hasToolCalls: true,
      toolCallCount: flow.toolCalls.length,
      toolCalls: flow.toolCalls.map((tc) => ({ id: tc.id, name: tc.name })),
    });

    // Tool results
    for (const tr of flow.toolResults) {
      const toolCall = flow.toolCalls.find((tc) => tc.name === tr.name);
      memory.push({
        role: 'tool',
        name: tr.name,
        tool_call_id: toolCall?.id || tr.id,
        status: tr.status,
        contentContains: tr.result ? tr.result.substring(0, 50) : undefined,
      });
    }
  }

  // Final assistant response
  if (flow.assistantContent) {
    memory.push({
      role: 'assistant',
      content: flow.assistantContent,
      hasToolCalls: false,
    });
  }

  return memory;
}

function buildTurn(events: AgentEvent[]): Turn {
  const flow = extractTurnFlow(events);

  return {
    userMessage: flow.userMessage,
    llmResponses: buildLLMResponses(flow),
    toolMocks: buildToolMocks(flow.toolCalls, flow.toolResults),
    expected: {
      response: {
        role: 'assistant',
        content: flow.assistantContent,
      },
      memory: buildExpectedMemory(flow),
    },
  };
}

// ============================================================================
// Message Boundary Detection
// ============================================================================

function splitEventsIntoTurns(events: AgentEvent[]): AgentEvent[][] {
  const turns: AgentEvent[][] = [];
  let currentTurn: AgentEvent[] = [];

  for (const event of events) {
    if (event.type === 'message_started' && currentTurn.length > 0) {
      // New turn started, save the previous one
      turns.push(currentTurn);
      currentTurn = [];
    }

    currentTurn.push(event);

    if (event.type === 'done') {
      // Turn completed
      turns.push(currentTurn);
      currentTurn = [];
    }
  }

  // Add any remaining events
  if (currentTurn.length > 0) {
    turns.push(currentTurn);
  }

  return turns;
}

function generateFixture(conversationId: string, events: AgentEvent[]): TestFixture {
  // Split events into individual turns
  const turnGroups = splitEventsIntoTurns(events);

  // Filter complete turns (has user message and done event)
  const completeTurns = turnGroups.filter(
    (turnEvents) =>
      turnEvents.some((e) => e.type === 'message_started' && e.userContent) &&
      turnEvents.some((e) => e.type === 'done'),
  );

  // Build turns
  const turns: Turn[] = completeTurns.map((turnEvents) => buildTurn(turnEvents));

  // Collect all tool names from the first turn
  const firstTurnEvents = completeTurns[0] || [];
  const messageStarted = firstTurnEvents.find((e) => e.type === 'message_started');
  const toolNames = messageStarted?.toolNames || ['file_read', 'bash_tool'];

  // Calculate totals
  let totalFetchCalls = 0;
  let totalMemoryMessages = 0;
  let finalUsage: AgentEvent['usage'];

  for (const turn of turns) {
    totalFetchCalls += turn.llmResponses.length;
    totalMemoryMessages += turn.expected.memory.length;
  }

  // Get final usage from last turn
  const lastTurnEvents = completeTurns[completeTurns.length - 1];
  const lastDoneEvent = lastTurnEvents?.find((e) => e.type === 'done');
  if (lastDoneEvent?.usage) {
    finalUsage = lastDoneEvent.usage;
  }

  // Create a name from the first user message
  const firstUserMessage = turns[0]?.userMessage || 'unknown';
  const nameParts = firstUserMessage
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .slice(0, 5)
    .join('_');

  const name = `${nameParts}_conversation`;
  const description = `Multi-turn conversation (${turns.length} turns): ${firstUserMessage.substring(0, 60)}${firstUserMessage.length > 60 ? '...' : ''}`;

  // Calculate expected metrics
  let totalTokens = 0;
  let totalToolCalls = 0;
  for (const turn of turns) {
    // Sum up tokens from all LLM responses in this turn
    for (const response of turn.llmResponses) {
      totalTokens += response.usage?.total_tokens || 0;
    }
    // Count tool calls
    totalToolCalls += Object.keys(turn.toolMocks).length;
  }

  return {
    name,
    description,
    config: {
      agentId: 'test-agent',
      model: 'test-model',
      systemPrompt: 'You are a helpful assistant.',
      temperature: 0.7,
      topP: 1.0,
      maxTokens: 4096,
      enabledTools: toolNames,
      requireToolApproval: false,
    },
    conversationId: `test-${conversationId}`,
    turns,
    expected: {
      totalFetchCalls,
      totalMemoryMessages,
      finalUsage: finalUsage ? { total_tokens: finalUsage.total_tokens } : undefined,
      metrics: {
        totalTokens,
        llmCallCount: totalFetchCalls,
        toolCallCount: totalToolCalls,
        requestCount: turns.length,
      },
    },
  };
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: npx tsx scripts/events-to-fixture.ts <events.json> [output-file]');
    console.log('');
    console.log('Arguments:');
    console.log('  events.json   Path to the events JSON file (one conversation)');
    console.log('  output-file   Output file path (default: ./fixture.json)');
    process.exit(1);
  }

  const eventsPath = args[0];
  const outputPath = args[1] || './fixture.json';

  // Check if input file exists
  if (!fs.existsSync(eventsPath)) {
    console.error(`Error: File not found: ${eventsPath}`);
    process.exit(1);
  }

  // Read events file
  console.log(`Reading events from: ${eventsPath}`);
  const eventsContent = fs.readFileSync(eventsPath, 'utf-8');
  const eventsData = JSON.parse(eventsContent) as Record<string, AgentEvent[]>;

  // Get the first conversation (assume one conversation per file)
  const conversationIds = Object.keys(eventsData);
  if (conversationIds.length === 0) {
    console.error('Error: No conversations found in events file');
    process.exit(1);
  }

  const conversationId = conversationIds[0];
  const events = eventsData[conversationId];

  console.log(`Found conversation: ${conversationId}`);
  console.log(`Total events: ${events.length}`);

  // Generate fixture
  const fixture = generateFixture(conversationId, events);

  console.log(`Generated fixture with ${fixture.turns.length} turn(s)`);
  console.log(`  Total fetch calls: ${fixture.expected.totalFetchCalls}`);
  console.log(`  Total memory messages: ${fixture.expected.totalMemoryMessages}`);

  // Create output directory if needed
  const outputDir = path.dirname(outputPath);
  if (outputDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write fixture file
  fs.writeFileSync(outputPath, JSON.stringify(fixture, null, 2));
  console.log(`\n✅ Created: ${outputPath}`);
}

main();
