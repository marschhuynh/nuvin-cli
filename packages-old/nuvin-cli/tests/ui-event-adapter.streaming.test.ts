import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentEventTypes, PersistingConsoleEventPort, type AgentEvent } from '@nuvin/nuvin-core';
import { UIEventAdapter } from '../source/adapters/ui-event-adapter.js';

describe('UIEventAdapter — ToolOutputChunk persistence', () => {
  beforeEach(() => {
    vi.spyOn(PersistingConsoleEventPort.prototype, 'emit').mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not persist ToolOutputChunk events', async () => {
    const adapter = new UIEventAdapter(vi.fn(), vi.fn(), vi.fn(), { streamingEnabled: true });

    const chunkEvent: AgentEvent = {
      type: AgentEventTypes.ToolOutputChunk,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCallId: 'tc-1',
      content: 'line1',
      totalLines: 1,
    };

    await adapter.emit(chunkEvent);

    expect(PersistingConsoleEventPort.prototype.emit).not.toHaveBeenCalled();
  });

  it('still persists non-streaming events', async () => {
    const adapter = new UIEventAdapter(vi.fn(), vi.fn(), vi.fn(), { streamingEnabled: true });

    const errorEvent: AgentEvent = {
      type: AgentEventTypes.Error,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      error: 'boom',
    };

    await adapter.emit(errorEvent);

    expect(PersistingConsoleEventPort.prototype.emit).toHaveBeenCalledTimes(1);
    expect(PersistingConsoleEventPort.prototype.emit).toHaveBeenCalledWith(errorEvent);
  });
});
