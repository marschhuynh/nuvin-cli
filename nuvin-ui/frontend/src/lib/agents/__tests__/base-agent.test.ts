import { describe, it, expect, beforeEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import type { AgentSettings, Message } from '@/types';
import type { SendMessageOptions, MessageResponse } from '../../agent-manager';

// Mock concrete implementation for testing
class TestAgent extends BaseAgent {
  async sendMessage(content: string, options?: SendMessageOptions): Promise<MessageResponse> {
    throw new Error('Method not implemented.');
  }

  cancel(): void {
    throw new Error('Method not implemented.');
  }
}

describe('BaseAgent buildContext', () => {
  let agent: TestAgent;
  const mockSettings: AgentSettings = {
    id: 'test-agent',
    name: 'Test Agent',
    persona: 'helpful',
    responseLength: 'medium',
    temperature: 0.7,
    topP: 1.0,
    maxTokens: 2000,
    systemPrompt: 'You are a helpful assistant.',
    agentType: 'local',
    toolConfig: { enabledTools: [] },
  };

  beforeEach(() => {
    agent = new TestAgent(mockSettings, new Map());
  });

  it('should handle regular messages without tool calls', () => {
    const conversationId = 'test-conversation';
    const messages: Message[] = [
      {
        id: '1',
        role: 'user',
        content: 'Hello, how are you?',
        timestamp: '2023-01-01T00:00:00Z',
      },
      {
        id: '2',
        role: 'assistant',
        content: 'I am doing well, thank you!',
        timestamp: '2023-01-01T00:01:00Z',
      },
    ];

    // Add messages to history
    (agent as any).addToHistory(conversationId, messages);

    const context = agent.buildContext(conversationId, 'What can you help me with?');

    expect(context).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello, how are you?' },
      { role: 'assistant', content: 'I am doing well, thank you!' },
      { role: 'user', content: 'What can you help me with?' },
    ]);
  });

  it('should transform messages with tool calls into function_call and function_call_output format', () => {
    const conversationId = 'test-conversation';
    const messageWithToolCalls: Message[] = [
      {
        id: '1',
        role: 'user',
        content: 'Generate 5 random numbers',
        timestamp: '2023-01-01T00:00:00Z',
      },
      {
        id: '2',
        role: 'assistant',
        content: '<|tool_calls_section_begin|><|tool_call_begin|>random_number:call_123<|tool_call_argument_begin|>{"min":0,"max":100}<|tool_call_result_begin|>{"random_number": 47}<|tool_call_end|><|tool_calls_section_end|>Here are your random numbers!',
        timestamp: '2023-01-01T00:01:00Z',
      },
    ];

    // Add messages to history
    (agent as any).addToHistory(conversationId, messageWithToolCalls);

    const context = agent.buildContext(conversationId, 'Generate more numbers');

    expect(context).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Generate 5 random numbers' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_123',
          type: 'function',
          function: {
            name: 'random_number',
            arguments: '{"min":0,"max":100}',
          }
        }],
      },
      {
        role: 'tool',
        content: '{"random_number":47}',
        tool_call_id: 'call_123',
        name: 'random_number',
      },
      { role: 'assistant', content: 'Here are your random numbers!' },
      { role: 'user', content: 'Generate more numbers' },
    ]);
  });

  it('should handle messages with multiple tool calls', () => {
    const conversationId = 'test-conversation';
    const messageWithMultipleToolCalls: Message[] = [
      {
        id: '1',
        role: 'assistant',
        content: '<|tool_calls_section_begin|><|tool_call_begin|>random_number:call_123<|tool_call_argument_begin|>{"min":0,"max":100}<|tool_call_result_begin|>{"random_number": 47}<|tool_call_end|><|tool_call_begin|>random_number:call_456<|tool_call_argument_begin|>{"min":0,"max":100}<|tool_call_result_begin|>{"random_number": 82}<|tool_call_end|><|tool_calls_section_end|>Generated two numbers.',
        timestamp: '2023-01-01T00:00:00Z',
      },
    ];

    // Add messages to history
    (agent as any).addToHistory(conversationId, messageWithMultipleToolCalls);

    const context = agent.buildContext(conversationId, 'Thanks!');

    expect(context).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'random_number',
              arguments: '{"min":0,"max":100}',
            }
          },
          {
            id: 'call_456',
            type: 'function',
            function: {
              name: 'random_number',
              arguments: '{"min":0,"max":100}',
            }
          }
        ],
      },
      {
        role: 'tool',
        content: '{"random_number":47}',
        tool_call_id: 'call_123',
        name: 'random_number',
      },
      {
        role: 'tool',
        content: '{"random_number":82}',
        tool_call_id: 'call_456',
        name: 'random_number',
      },
      { role: 'assistant', content: 'Generated two numbers.' },
      { role: 'user', content: 'Thanks!' },
    ]);
  });

  it('should handle messages with tool calls but no results', () => {
    const conversationId = 'test-conversation';
    const messageWithToolCallsNoResults: Message[] = [
      {
        id: '1',
        role: 'assistant',
        content: '<|tool_calls_section_begin|><|tool_call_begin|>random_number:call_123<|tool_call_argument_begin|>{"min":0,"max":100}<|tool_call_end|><|tool_calls_section_end|>',
        timestamp: '2023-01-01T00:00:00Z',
      },
    ];

    // Add messages to history
    (agent as any).addToHistory(conversationId, messageWithToolCallsNoResults);

    const context = agent.buildContext(conversationId, 'What happened?');

    expect(context).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_123',
          type: 'function',
          function: {
            name: 'random_number',
            arguments: '{"min":0,"max":100}',
          }
        }],
      },
      { role: 'user', content: 'What happened?' },
    ]);
  });
});