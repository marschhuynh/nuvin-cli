import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../orchestrator.js';
import { AgentEventTypes } from '../ports.js';
import type { AgentEvent, EventPort } from '../ports.js';

describe('AskUserTool', () => {
  let emittedEvents: AgentEvent[];
  let mockEvents: EventPort;

  beforeEach(() => {
    emittedEvents = [];
    mockEvents = {
      emit: vi.fn((event: AgentEvent) => {
        emittedEvents.push(event);
        return Promise.resolve();
      }),
    };
  });

  it('should emit UserQuestionRequired event when tool is called', async () => {
    // This test will fail until we add the event types
    const questionEvent = emittedEvents.find(
      (e) => e.type === AgentEventTypes.UserQuestionRequired
    );
    expect(questionEvent).toBeDefined();
  });
});
