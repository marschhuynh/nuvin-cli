import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'ink';
import { ChatDisplay } from '../../source/components/ChatDisplay.js';
import type { MessageLine as MessageLineType } from '../../source/adapters/index.js';
import type { SessionInfo } from '../../source/types.js';

// Mock child components to simplify output verification
vi.mock('../../source/components/MessageLine.js', () => ({
  MessageLine: ({ message }: { message: MessageLineType }) => (
    <Text>
      [Message id={message.id} content={message.content}]
    </Text>
  ),
}));

vi.mock('../../source/components/RecentSessions.js', () => ({
  RecentSessions: () => <Text>[RecentSessions]</Text>,
  WelcomeLogo: ({ recentSessions }: { recentSessions: unknown[] }) => (
    <>
      <Text>[WelcomeLogo]</Text>
      {recentSessions && recentSessions.length > 0 && <Text>[RecentSessions]</Text>}
    </>
  ),
}));

// Mock logger to avoid cluttering test output
vi.mock('../../source/utils/file-logger.js', () => ({
  getDefaultLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('ChatDisplay', () => {
  it('renders welcome logo when no messages', () => {
    const { lastFrame } = render(<ChatDisplay key="test" messages={[]} headerKey={1} />);

    expect(lastFrame()).toContain('[WelcomeLogo]');
  });

  it('renders finalized messages in Static (implied by output presence)', () => {
    const messages: MessageLineType[] = [
      {
        id: 'msg-1',
        type: 'user',
        content: 'Hello',
        metadata: { timestamp: new Date().toISOString() },
      },
      {
        id: 'msg-2',
        type: 'assistant',
        content: 'Hi there',
        metadata: { timestamp: new Date().toISOString() },
      },
    ];

    const { lastFrame } = render(<ChatDisplay key="test" messages={messages} headerKey={1} />);

    expect(lastFrame()).toContain('[WelcomeLogo]');
    expect(lastFrame()).toContain('[Message id=msg-1 content=Hello]');
    expect(lastFrame()).toContain('[Message id=msg-2 content=Hi there]');
  });

  it('renders streaming message', () => {
    const messages: MessageLineType[] = [
      {
        id: 'msg-1',
        type: 'user',
        content: 'Hello',
        metadata: { timestamp: new Date().toISOString() },
      },
      {
        id: 'msg-2',
        type: 'assistant',
        content: 'Streaming...',
        metadata: {
          timestamp: new Date().toISOString(),
          isStreaming: true,
        },
      },
    ];

    const { lastFrame } = render(<ChatDisplay key="test" messages={messages} headerKey={1} />);

    expect(lastFrame()).toContain('[Message id=msg-1 content=Hello]');
    expect(lastFrame()).toContain('[Message id=msg-2 content=Streaming...]');
  });

  it('handles transition from streaming to finalized', () => {
    const streamingMsg: MessageLineType = {
      id: 'msg-1',
      type: 'assistant',
      content: 'Streaming...',
      metadata: {
        timestamp: new Date().toISOString(),
        isStreaming: true,
      },
    };

    const { lastFrame, rerender } = render(<ChatDisplay key="test" messages={[streamingMsg]} headerKey={1} />);

    expect(lastFrame()).toContain('[Message id=msg-1 content=Streaming...]');

    // Update to finalized
    const finalizedMsg: MessageLineType = {
      ...streamingMsg,
      content: 'Finalized.',
      metadata: {
        ...streamingMsg.metadata,
        isStreaming: false,
      },
    };

    rerender(<ChatDisplay key="test" messages={[finalizedMsg]} headerKey={1} />);

    expect(lastFrame()).toContain('[Message id=msg-1 content=Finalized.]');
  });

  it('keeps pending tool calls dynamic', () => {
    const pendingToolCall: MessageLineType = {
      id: 'msg-1',
      type: 'tool',
      content: 'tool_call',
      metadata: {
        timestamp: new Date().toISOString(),
        toolCalls: [{ id: 'call-1', type: 'function', function: { name: 'test', arguments: '{}' } }],
        // No results
      },
    };

    const { lastFrame } = render(<ChatDisplay key="test" messages={[pendingToolCall]} headerKey={1} />);

    expect(lastFrame()).toContain('[Message id=msg-1 content=tool_call]');
  });

  it('renders first message correctly when transitioning from sessions view', () => {
    const sessions: SessionInfo[] = [
      {
        sessionId: 's1',
        timestamp: new Date().toISOString(),
        lastMessage: 'test',
        messageCount: 1,
      },
    ];

    const { lastFrame, rerender } = render(<ChatDisplay key="test" messages={[]} headerKey={1} sessions={sessions} />);

    expect(lastFrame()).toContain('[WelcomeLogo]');
    expect(lastFrame()).toContain('[RecentSessions]');

    // Add first message
    const msg1: MessageLineType = {
      id: 'msg-1',
      type: 'user',
      content: 'First message',
      metadata: { timestamp: new Date().toISOString() },
    };

    rerender(<ChatDisplay key="test" messages={[msg1]} headerKey={1} sessions={sessions} />);

    // Should still contain sessions (to preserve Static indices)
    expect(lastFrame()).toContain('[RecentSessions]');
    // Should contain the new message
    expect(lastFrame()).toContain('[Message id=msg-1 content=First message]');
  });
});
