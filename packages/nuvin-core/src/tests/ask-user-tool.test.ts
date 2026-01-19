import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../orchestrator.js';
import { AgentEventTypes } from '../ports.js';
import type { AgentEvent, EventPort } from '../ports.js';
import { AskUserTool } from '../tools/AskUserTool.js';
import { ToolRegistry } from '../tools.js';

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

  it('should validate questions array has 1-4 items', async () => {
    const tool = new AskUserTool();
    
    // Empty array should fail
    const result1 = await tool.execute({ questions: [] });
    expect(result1.status).toBe('error');
    
    // 5 questions should fail
    const result2 = await tool.execute({ 
      questions: Array(5).fill({ 
        question: 'Q?', 
        header: 'H', 
        options: [{label: 'A', description: 'B'}], 
        multiSelect: false 
      }) 
    });
    expect(result2.status).toBe('error');
    
    // 1-4 questions should pass validation
    const result3 = await tool.execute({ 
      questions: [{ 
        question: 'Pick one?', 
        header: 'Choice', 
        options: [
          {label: 'Option A', description: 'First choice'},
          {label: 'Option B', description: 'Second choice'}
        ], 
        multiSelect: false 
      }] 
    });
    expect(result3.status).toBe('success');
  });

  it('should validate each question has 2-4 options', async () => {
    const tool = new AskUserTool();
    
    // 1 option should fail
    const result1 = await tool.execute({ 
      questions: [{ 
        question: 'Q?', 
        header: 'H', 
        options: [{label: 'A', description: 'B'}], 
        multiSelect: false 
      }] 
    });
    expect(result1.status).toBe('error');
    
    // 5 options should fail
    const result2 = await tool.execute({ 
      questions: [{ 
        question: 'Q?', 
        header: 'H', 
        options: Array(5).fill({label: 'A', description: 'B'}), 
        multiSelect: false 
      }] 
    });
    expect(result2.status).toBe('error');
  });

  it('should validate header is max 12 characters', async () => {
    const tool = new AskUserTool();
    
    const result = await tool.execute({ 
      questions: [{ 
        question: 'Q?', 
        header: 'ThisIsWayTooLong', 
        options: [
          {label: 'A', description: 'B'},
          {label: 'C', description: 'D'}
        ], 
        multiSelect: false 
      }] 
    });
    expect(result.status).toBe('error');
    expect(result.result).toContain('12 characters');
  });

  it('should be registered in DefaultToolPort', () => {
    const toolPort = new ToolRegistry();
    const definitions = toolPort.getToolDefinitions(['ask_user_tool']);
    
    expect(definitions).toHaveLength(1);
    expect(definitions[0].function.name).toBe('ask_user_tool');
  });
});
