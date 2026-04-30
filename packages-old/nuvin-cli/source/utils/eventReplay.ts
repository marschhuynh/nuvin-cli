import type { AgentEvent } from '@nuvin/nuvin-core';
import type { MessageLine, MessageMetadata } from '@/adapters/index.js';
import {
  processAgentEvent,
  type EventProcessorCallbacks,
  type EventProcessorState,
  resetEventProcessorState,
} from './eventProcessor.js';

/**
 * Replays events to build UI state without side effects
 * Uses shared event processing logic for consistency with UIEventAdapter
 */
export class EventReplayAdapter {
  private lines: MessageLine[] = [];
  private state: EventProcessorState = resetEventProcessorState();

  async processEvent(event: AgentEvent): Promise<void> {
    const callbacks: EventProcessorCallbacks = {
      appendLine: (line) => {
        this.lines.push(line);
      },
      renderUserMessages: true, // Enable user message rendering for replay
    };

    const result = processAgentEvent(event, this.state, callbacks);
    if (result instanceof Promise) {
      this.state = await result;
    } else {
      this.state = result;
    }
  }

  getUIState(): { lines: MessageLine[]; metadata: MessageMetadata | null } {
    return {
      lines: [...this.lines],
      metadata: null,
    };
  }

  reset(): void {
    this.lines = [];
    this.state = resetEventProcessorState();
  }
}

export async function replayEventsToUIState(events: AgentEvent[]): Promise<{
  lines: MessageLine[];
  metadata: MessageMetadata | null;
}> {
  const adapter = new EventReplayAdapter();

  for (const event of events) {
    await adapter.processEvent(event);
  }

  return adapter.getUIState();
}
