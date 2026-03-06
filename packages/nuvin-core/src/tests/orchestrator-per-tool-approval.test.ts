import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../orchestrator.js';
import type {
  LLMPort,
  ToolPort,
  MemoryPort,
  Message,
  ContextBuilder,
  IdGenerator,
  Clock,
  CostCalculator,
  RemindersPort,
  EventPort,
  AgentEvent,
  CompletionResult,
  ToolDefinition,
  ToolInvocation,
} from '../ports.js';
import { AgentEventTypes, ErrorReason } from '../ports.js';

/**
 * Tests for Per-Tool Approval functionality
 * 
 * Key requirements:
 * 1. Tools requiring approval must NOT execute until user approves
 * 2. Denied tools must NOT execute
 * 3. Approved tools execute immediately after approval
 * 4. Bypass tools (read-only) execute immediately without approval
 * 5. Each tool gets its own approvalId
 */
describe('AgentOrchestrator - Per-Tool Approval', () => {
  let orchestrator: AgentOrchestrator;
  let mockLLM: LLMPort;
  let mockTools: ToolPort;
  let mockMemory: MemoryPort<Message>;
  let mockContext: ContextBuilder;
  let mockIds: IdGenerator;
  let mockClock: Clock;
  let mockCost: CostCalculator;
  let mockReminders: RemindersPort;
  let mockEvents: EventPort;
  let emittedEvents: AgentEvent[];
  let toolExecutions: string[];

  beforeEach(() => {
    emittedEvents = [];
    toolExecutions = [];
    let idCounter = 0;

    mockMemory = {
      get: vi.fn().mockResolvedValue([]),
      set: vi.fn().mockResolvedValue(undefined),
      append: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockResolvedValue([]),
      clear: vi.fn().mockResolvedValue(undefined),
      exportSnapshot: vi.fn().mockResolvedValue({}),
      importSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    mockContext = {
      toProviderMessages: vi.fn().mockReturnValue([{ role: 'user', content: 'test' }]),
    };

    mockIds = {
      uuid: vi.fn(() => `id-${idCounter++}`),
    };

    mockClock = {
      now: vi.fn(() => Date.now()),
      iso: vi.fn(() => new Date().toISOString()),
    };

    mockCost = {
      estimate: vi.fn(() => 0.001),
    };

    mockReminders = {
      enhance: vi.fn((content: string) => [content]),
    };

    mockEvents = {
      emit: vi.fn((event: AgentEvent) => {
        emittedEvents.push(event);
        return Promise.resolve();
      }),
    };

    // Mock tool port that tracks executions
    mockTools = {
      getToolDefinitions: vi.fn().mockReturnValue([
        { type: 'function', function: { name: 'bash', description: 'Run bash command', parameters: {} } },
        { type: 'function', function: { name: 'file_edit', description: 'Edit file', parameters: {} } },
        { type: 'function', function: { name: 'file_read', description: 'Read file', parameters: {} } },
      ] as ToolDefinition[]),
      executeToolCalls: vi.fn(async (invocations: ToolInvocation[]) => {
        return invocations.map((inv) => {
          toolExecutions.push(inv.name);
          return {
            id: inv.id,
            name: inv.name,
            status: 'success' as const,
            type: 'text' as const,
            result: `Executed ${inv.name}`,
            durationMs: 100,
          };
        });
      }),
    };

    mockLLM = {
      generateCompletion: vi.fn(),
      streamCompletion: vi.fn(),
    };
  });

  const createOrchestrator = (requireToolApproval = true) => {
    return new AgentOrchestrator(
      {
        id: 'test-agent',
        model: 'test-model',
        enabledTools: ['bash', 'file_edit', 'file_read'],
        systemPrompt: 'test',
        requireToolApproval,
        topP: 1,
        temperature: 1
      },
      {
        memory: mockMemory,
        llm: mockLLM,
        tools: mockTools,
        context: mockContext,
        ids: mockIds,
        clock: mockClock,
        cost: mockCost,
        reminders: mockReminders,
        events: mockEvents,
      },
    );
  };

  describe('Tool approval blocking', () => {
    it('should NOT execute non-bypass tool before approval', async () => {
      orchestrator = createOrchestrator(true);

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo test"}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'Done',
      };

      let callCount = 0;
      mockLLM.generateCompletion = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? toolCallResponse : finalResponse;
      });

      // Start send() - it will wait for approval
      const sendPromise = orchestrator.send('run echo test', { stream: false });

      // Wait a bit for the orchestrator to process
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Tool should NOT have executed yet
      expect(toolExecutions).toHaveLength(0);

      // Find ToolCalls event to get approvalId
      const toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      expect(toolCallsEvent).toBeDefined();
      expect(toolCallsEvent?.toolCalls[0]).toHaveProperty('requiresApproval', true);
      expect(toolCallsEvent?.toolCalls[0]).toHaveProperty('approvalId');

      // Now approve the tool
      const approvalId = toolCallsEvent?.toolCalls[0].approvalId;
      orchestrator.handleToolApproval(approvalId!, 'approve');

      // Wait for completion
      await sendPromise;

      // Now tool should have executed
      expect(toolExecutions).toContain('bash');
    });

    it('should NOT execute tool when user denies', async () => {
      orchestrator = createOrchestrator(true);

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"rm -rf /"}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'Understood, cancelled.',
      };

      let callCount = 0;
      mockLLM.generateCompletion = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? toolCallResponse : finalResponse;
      });

      const sendPromise = orchestrator.send('delete everything', { stream: false });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Tool should NOT have executed
      expect(toolExecutions).toHaveLength(0);

      // Deny the tool
      const toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      const approvalId = toolCallsEvent?.toolCalls[0].approvalId;
      orchestrator.handleToolApproval(approvalId!, 'deny');

      await sendPromise;

      // Tool should STILL not have executed
      expect(toolExecutions).toHaveLength(0);

      // ToolResult should show denied
      const toolResult = emittedEvents.find((e) => e.type === AgentEventTypes.ToolResult);
      expect(toolResult?.result.status).toBe('error');
      expect((toolResult?.result.metadata as { errorReason?: string })?.errorReason).toBe(ErrorReason.Denied);
    });

    it('should execute bypass tools (file_read) immediately without waiting for approval', async () => {
      orchestrator = createOrchestrator(true);

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'file_read', arguments: '{"file_path":"test.txt"}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'File contents shown.',
      };

      let callCount = 0;
      mockLLM.generateCompletion = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? toolCallResponse : finalResponse;
      });

      // This should complete without needing approval
      await orchestrator.send('read test.txt', { stream: false });

      // Tool should have executed (file_read is bypass)
      expect(toolExecutions).toContain('file_read');

      // Check ToolCalls event - file_read should NOT require approval
      const toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      expect(toolCallsEvent?.toolCalls[0]).toHaveProperty('requiresApproval', false);
    });

    it('should not require approval for memory_extract when global approval is off', async () => {
      mockTools = {
        getToolDefinitions: vi.fn().mockReturnValue([
          { type: 'function', function: { name: 'memory_extract', description: 'Extract memory', parameters: {} } },
        ] as ToolDefinition[]),
        executeToolCalls: vi.fn(async (invocations: ToolInvocation[]) => {
          return invocations.map((inv) => {
            toolExecutions.push(inv.name);
            return {
              id: inv.id,
              name: inv.name,
              status: 'success' as const,
              type: 'json' as const,
              result: { ok: true },
              durationMs: 100,
            };
          });
        }),
      };

      orchestrator = new AgentOrchestrator(
        {
          id: 'test-agent',
          model: 'test-model',
          enabledTools: ['memory_extract'],
          systemPrompt: 'test',
          requireToolApproval: false,
          topP: 1,
          temperature: 1,
        },
        {
          memory: mockMemory,
          llm: mockLLM,
          tools: mockTools,
          context: mockContext,
          ids: mockIds,
          clock: mockClock,
          cost: mockCost,
          reminders: mockReminders,
          events: mockEvents,
        },
      );

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'memory_extract', arguments: '{}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'done',
      };

      let callCount = 0;
      mockLLM.generateCompletion = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? toolCallResponse : finalResponse;
      });

      const sendPromise = orchestrator.send('extract memory', { stream: false });
      await sendPromise;

      // Tool should execute immediately without approval
      expect(toolExecutions).toHaveLength(1);
      expect(toolExecutions).toContain('memory_extract');

      // ToolCalls event is emitted but with requiresApproval=false
      const toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      expect(toolCallsEvent?.toolCalls[0]).toHaveProperty('requiresApproval', false);
      expect(toolCallsEvent?.toolCalls[0]).toHaveProperty('approvalId', undefined);
    });
  });

  describe('Mixed approval scenarios', () => {
    it('should handle approve first, deny second correctly', async () => {
      orchestrator = createOrchestrator(true);

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo safe"}' } },
          { id: 'tc-2', type: 'function', function: { name: 'bash', arguments: '{"cmd":"rm -rf /"}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'Completed one, skipped dangerous one.',
      };

      let callCount = 0;
      mockLLM.generateCompletion = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? toolCallResponse : finalResponse;
      });

      const sendPromise = orchestrator.send('run commands', { stream: false });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Neither tool should have executed yet
      expect(toolExecutions).toHaveLength(0);

      const toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      expect(toolCallsEvent?.toolCalls).toHaveLength(2);

      // Approve first, deny second
      orchestrator.handleToolApproval(toolCallsEvent?.toolCalls?.[0]?.approvalId as string, 'approve');
      orchestrator.handleToolApproval(toolCallsEvent?.toolCalls?.[1]?.approvalId as string, 'deny');

      await sendPromise;

      // Only first tool should have executed
      expect(toolExecutions).toEqual(['bash']);

      // Check results
      const toolResults = emittedEvents.filter((e) => e.type === AgentEventTypes.ToolResult);
      expect(toolResults).toHaveLength(2);
      
      const approvedResult = toolResults.find((r) => r.result.id === 'tc-1');
      const deniedResult = toolResults.find((r) => r.result.id === 'tc-2');
      
      expect(approvedResult?.result.status).toBe('success');
      expect(deniedResult?.result.status).toBe('error');
      expect((deniedResult?.result.metadata as { errorReason?: string })?.errorReason).toBe(ErrorReason.Denied);
    });

    it('should handle deny first, approve second correctly', async () => {
      orchestrator = createOrchestrator(true);

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"rm -rf /"}' } },
          { id: 'tc-2', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo safe"}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'Completed.',
      };

      let callCount = 0;
      mockLLM.generateCompletion = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? toolCallResponse : finalResponse;
      });

      const sendPromise = orchestrator.send('run commands', { stream: false });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);

      // Deny first, approve second
      orchestrator.handleToolApproval(toolCallsEvent!.toolCalls[0].approvalId!, 'deny');
      orchestrator.handleToolApproval(toolCallsEvent?.toolCalls?.[1]?.approvalId, 'approve');

      await sendPromise;

      // Only second tool should have executed (one bash execution)
      expect(toolExecutions).toEqual(['bash']);

      // Check the denied tool result
      const toolResults = emittedEvents.filter((e) => e.type === AgentEventTypes.ToolResult);
      const deniedResult = toolResults.find((r) => r.result.id === 'tc-1');
      expect(deniedResult?.result.status).toBe('error');
      expect((deniedResult?.result.metadata as { errorReason?: string })?.errorReason).toBe(ErrorReason.Denied);
    });

    it('should handle mixed bypass and approval-required tools', async () => {
      orchestrator = createOrchestrator(true);

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'file_read', arguments: '{"file_path":"a.txt"}' } },
          { id: 'tc-2', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo test"}' } },
          { id: 'tc-3', type: 'function', function: { name: 'file_read', arguments: '{"file_path":"b.txt"}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'All done.',
      };

      let callCount = 0;
      mockLLM.generateCompletion = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? toolCallResponse : finalResponse;
      });

      const sendPromise = orchestrator.send('read files and run command', { stream: false });

      // Wait for bypass tools to execute
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Bypass tools should have executed already
      const fileReadExecutions = toolExecutions.filter((t) => t === 'file_read');
      expect(fileReadExecutions).toHaveLength(2);

      // Bash should NOT have executed (waiting for approval)
      expect(toolExecutions).not.toContain('bash');

      // Approve bash
      const toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      const bashTool = toolCallsEvent!.toolCalls.find((tc) => tc.function.name === 'bash');
      expect(bashTool?.requiresApproval).toBe(true);
      
      orchestrator.handleToolApproval(bashTool!.approvalId!, 'approve');

      await sendPromise;

      // Now bash should have executed
      expect(toolExecutions).toContain('bash');
      expect(toolExecutions).toHaveLength(3);
    });
  });

  describe('Approval disabled', () => {
    it('should execute all tools immediately when requireToolApproval is false', async () => {
      orchestrator = createOrchestrator(false);

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo test"}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'Done.',
      };

      let callCount = 0;
      mockLLM.generateCompletion = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? toolCallResponse : finalResponse;
      });

      // Should complete without waiting for approval
      await orchestrator.send('run command', { stream: false });

      expect(toolExecutions).toContain('bash');

      // ToolCalls event should show requiresApproval=false
      const toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      expect(toolCallsEvent?.toolCalls[0]).toHaveProperty('requiresApproval', false);
    });
  });

  describe('Each tool gets unique approvalId', () => {
    it('should assign different approvalIds to each tool', async () => {
      orchestrator = createOrchestrator(true);

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo 1"}' } },
          { id: 'tc-2', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo 2"}' } },
          { id: 'tc-3', type: 'function', function: { name: 'file_edit', arguments: '{"file_path":"test.txt"}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'Done.',
      };

      let callCount = 0;
      mockLLM.generateCompletion = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? toolCallResponse : finalResponse;
      });

      const sendPromise = orchestrator.send('run commands', { stream: false });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      const toolsNeedingApproval = toolCallsEvent!.toolCalls.filter((tc) => tc.requiresApproval);

      // All 3 tools need approval (bash, bash, file_edit)
      expect(toolsNeedingApproval).toHaveLength(3);

      // Each should have unique approvalId
      const approvalIds = toolsNeedingApproval.map((tc) => tc.approvalId);
      const uniqueIds = new Set(approvalIds);
      expect(uniqueIds.size).toBe(3);

      // Clean up - approve all to let sendPromise complete
      for (const tc of toolsNeedingApproval) {
        orchestrator.handleToolApproval(tc.approvalId!, 'approve');
      }
      await sendPromise;
    });
  });

  describe('Conversation history', () => {
    it('should emit ToolResult event with denied status for denied tools', async () => {
      orchestrator = createOrchestrator(true);

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"rm -rf /"}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'Understood.',
      };

      let callCount = 0;
      mockLLM.generateCompletion = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? toolCallResponse : finalResponse;
      });

      const sendPromise = orchestrator.send('delete everything', { stream: false });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      orchestrator.handleToolApproval(toolCallsEvent?.toolCalls[0].approvalId as string, 'deny');

      await sendPromise;

      // Verify ToolResult event has denied status and message
      const toolResultEvents = emittedEvents.filter((e) => e.type === AgentEventTypes.ToolResult);
      expect(toolResultEvents.length).toBeGreaterThan(0);
      
      const deniedResult = toolResultEvents.find((e) => e.result?.status === 'error');
      expect(deniedResult).toBeDefined();
      expect((deniedResult?.result?.metadata as { errorReason?: string })?.errorReason).toBe(ErrorReason.Denied);
    });

    it('should save assistant tool_calls message to history', async () => {
      // Set up history capture BEFORE creating orchestrator
      const savedHistory: Message[] = [];
      mockMemory.append = vi.fn(async (_convId: string, messages: Message[]) => {
        savedHistory.push(...messages);
      });

      orchestrator = createOrchestrator(true);

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo test"}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'Done.',
      };

      let callCount = 0;
      mockLLM.generateCompletion = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? toolCallResponse : finalResponse;
      });

      const sendPromise = orchestrator.send('run command', { stream: false });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      orchestrator.handleToolApproval(toolCallsEvent?.toolCalls[0].approvalId as string, 'approve');

      await sendPromise;

      // Verify assistant message with tool_calls is saved
      const assistantMsgs = savedHistory.filter((m) => m.role === 'assistant' && m.tool_calls);
      expect(assistantMsgs.length).toBeGreaterThan(0);
      expect(assistantMsgs[0].tool_calls?.[0].function.name).toBe('bash');
    });
  });

  describe('Consecutive denials across requests', () => {
    it('should handle multiple denials across separate requests', async () => {
      orchestrator = createOrchestrator(true);

      const toolCallResponse1: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo 1"}' } },
        ],
      };
      const toolCallResponse2: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-2', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo 2"}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'Cancelled.',
      };

      // First request - deny
      mockLLM.generateCompletion = vi.fn()
        .mockResolvedValueOnce(toolCallResponse1)
        .mockResolvedValueOnce(finalResponse);

      const sendPromise1 = orchestrator.send('run first', { stream: false });
      await new Promise((resolve) => setTimeout(resolve, 50));

      let toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      orchestrator.handleToolApproval(toolCallsEvent?.toolCalls[0].approvalId as string, 'deny');
      await sendPromise1;

      expect(toolExecutions).toHaveLength(0);

      // Clear for second request
      emittedEvents = [];

      // Second request - deny again
      mockLLM.generateCompletion = vi.fn()
        .mockResolvedValueOnce(toolCallResponse2)
        .mockResolvedValueOnce(finalResponse);

      const sendPromise2 = orchestrator.send('run second', { stream: false });
      await new Promise((resolve) => setTimeout(resolve, 50));

      toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      orchestrator.handleToolApproval(toolCallsEvent?.toolCalls[0].approvalId as string, 'deny');
      await sendPromise2;

      // Neither tool should have executed
      expect(toolExecutions).toHaveLength(0);

      // Both should have ToolResult events with denied status
      const allToolResults = emittedEvents.filter((e) => e.type === AgentEventTypes.ToolResult);
      expect(allToolResults.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle duplicate approval gracefully', async () => {
      orchestrator = createOrchestrator(true);

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo test"}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'Done.',
      };

      let callCount = 0;
      mockLLM.generateCompletion = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? toolCallResponse : finalResponse;
      });

      const sendPromise = orchestrator.send('run command', { stream: false });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      const approvalId = toolCallsEvent?.toolCalls[0].approvalId as string;

      // First approval
      orchestrator.handleToolApproval(approvalId, 'approve');

      // Duplicate approval - should log warning but not crash
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      orchestrator.handleToolApproval(approvalId, 'approve');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Received approval for unknown or already processed ID')
      );
      consoleSpy.mockRestore();

      await sendPromise;

      // Tool should have executed only once
      expect(toolExecutions.filter((t) => t === 'bash')).toHaveLength(1);
    });

    it('should throw error for invalid decision', async () => {
      orchestrator = createOrchestrator(true);

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo test"}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'Cancelled.',
      };

      let callCount = 0;
      mockLLM.generateCompletion = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? toolCallResponse : finalResponse;
      });

      const sendPromise = orchestrator.send('run command', { stream: false });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      
      // Invalid decision throws error
      orchestrator.handleToolApproval(
        toolCallsEvent?.toolCalls[0].approvalId as string,
        'invalid_decision' as any,
      );

      // The promise should still complete (error is caught internally)
      await sendPromise.catch(() => {});

      // Tool should NOT have executed
      expect(toolExecutions).toHaveLength(0);
    });
  });

  describe('Edit instruction flow', () => {
    it('should pass edit instruction to tool and mark as edited', async () => {
      orchestrator = createOrchestrator(true);

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo test"}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'Updated as requested.',
      };

      let callCount = 0;
      mockLLM.generateCompletion = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? toolCallResponse : finalResponse;
      });

      // Capture tool invocations to check editInstruction
      let capturedInvocations: ToolInvocation[] = [];
      mockTools.executeToolCalls = vi.fn(async (invocations: ToolInvocation[]) => {
        capturedInvocations = invocations;
        return invocations.map((inv) => ({
          id: inv.id,
          name: inv.name,
          status: 'error' as const,
          type: 'text' as const,
          result: `${inv.editInstruction}\n<system-reminder>User wants changes</system-reminder>`,
          metadata: { errorReason: ErrorReason.Edited, editInstruction: inv.editInstruction },
          durationMs: 0,
        }));
      });

      const sendPromise = orchestrator.send('run command', { stream: false });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      const editInstruction = 'change command to echo hello instead';
      
      orchestrator.handleToolApproval(
        toolCallsEvent?.toolCalls[0].approvalId as string,
        'edit',
        editInstruction,
      );

      await sendPromise;

      // Verify edit instruction was passed
      expect(capturedInvocations).toHaveLength(1);
      expect(capturedInvocations[0].editInstruction).toBe(editInstruction);

      // Verify ToolResult event has Edited error reason
      const toolResults = emittedEvents.filter((e) => e.type === AgentEventTypes.ToolResult);
      const editedResult = toolResults.find(
        (e) => (e.result?.metadata as { errorReason?: string })?.errorReason === ErrorReason.Edited,
      );
      expect(editedResult).toBeDefined();
    });

    it('should continue LLM loop after edit instruction', async () => {
      orchestrator = createOrchestrator(true);

      const toolCallResponse1: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo test"}' } },
        ],
      };
      const toolCallResponse2: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-2', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo hello"}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'Command executed.',
      };

      let llmCallCount = 0;
      mockLLM.generateCompletion = vi.fn(async () => {
        llmCallCount++;
        if (llmCallCount === 1) return toolCallResponse1;
        if (llmCallCount === 2) return toolCallResponse2;
        return finalResponse;
      });

      // First call returns edit result, second returns success
      let toolCallCount = 0;
      mockTools.executeToolCalls = vi.fn(async (invocations: ToolInvocation[]) => {
        toolCallCount++;
        if (toolCallCount === 1) {
          return invocations.map((inv) => ({
            id: inv.id,
            name: inv.name,
            status: 'error' as const,
            type: 'text' as const,
            result: `${inv.editInstruction}\n<system-reminder>User wants changes</system-reminder>`,
            metadata: { errorReason: ErrorReason.Edited },
            durationMs: 0,
          }));
        }
        return invocations.map((inv) => ({
          id: inv.id,
          name: inv.name,
          status: 'success' as const,
          type: 'text' as const,
          result: 'Executed',
          durationMs: 100,
        }));
      });

      const sendPromise = orchestrator.send('run command', { stream: false });

      // First tool call - send edit instruction
      await new Promise((resolve) => setTimeout(resolve, 50));
      let toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      orchestrator.handleToolApproval(
        toolCallsEvent?.toolCalls[0].approvalId as string,
        'edit',
        'use echo hello instead',
      );

      // Second tool call - approve
      await new Promise((resolve) => setTimeout(resolve, 100));
      emittedEvents = emittedEvents.slice(); // Get fresh events
      const secondToolCallsEvent = emittedEvents.filter((e) => e.type === AgentEventTypes.ToolCalls).pop();
      if (secondToolCallsEvent?.toolCalls[0]?.approvalId) {
        orchestrator.handleToolApproval(secondToolCallsEvent.toolCalls[0].approvalId, 'approve');
      }

      await sendPromise;

      // LLM should have been called at least 2 times (after edit, it continues loop)
      expect(llmCallCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Abort handling', () => {
    it('should clean up pending approvals when aborted during approval wait', async () => {
      orchestrator = createOrchestrator(true);

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo test"}' } },
        ],
      };

      mockLLM.generateCompletion = vi.fn(async () => toolCallResponse);

      const abortController = new AbortController();

      const sendPromise = orchestrator.send('run command', { 
        stream: false, 
        signal: abortController.signal 
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Tool should be waiting for approval
      expect(toolExecutions).toHaveLength(0);

      // Abort while waiting
      abortController.abort();

      // Should throw/reject due to abort
      await expect(sendPromise).rejects.toThrow('Aborted');

      // Tool should NOT have executed
      expect(toolExecutions).toHaveLength(0);
    });

    it('should abort tool even after approval received if signal is aborted', async () => {
      orchestrator = createOrchestrator(true);

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo test"}' } },
        ],
      };
      const finalResponse: CompletionResult = {
        content: 'Done.',
      };

      let callCount = 0;
      mockLLM.generateCompletion = vi.fn(async () => {
        callCount++;
        return callCount === 1 ? toolCallResponse : finalResponse;
      });

      const abortController = new AbortController();

      const sendPromise = orchestrator.send('run command', { 
        stream: false, 
        signal: abortController.signal 
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Abort just before approving
      const toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      
      // Abort first
      abortController.abort();
      
      // Then try to approve (should be ignored/rejected)
      orchestrator.handleToolApproval(toolCallsEvent?.toolCalls[0].approvalId as string, 'approve');

      // Should throw/reject due to abort
      await expect(sendPromise).rejects.toThrow('Aborted');
    });

    it('should not leak pending approvals after abort', async () => {
      orchestrator = createOrchestrator(true);

      const toolCallResponse: CompletionResult = {
        content: '',
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo 1"}' } },
          { id: 'tc-2', type: 'function', function: { name: 'bash', arguments: '{"cmd":"echo 2"}' } },
        ],
      };

      mockLLM.generateCompletion = vi.fn(async () => toolCallResponse);

      const abortController = new AbortController();

      const sendPromise = orchestrator.send('run commands', { 
        stream: false, 
        signal: abortController.signal 
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Abort while multiple tools are waiting
      abortController.abort();

      await expect(sendPromise).rejects.toThrow('Aborted');

      // Subsequent approval attempts should warn (approvals were cleaned up)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const toolCallsEvent = emittedEvents.find((e) => e.type === AgentEventTypes.ToolCalls);
      if (toolCallsEvent?.toolCalls[0]?.approvalId) {
        orchestrator.handleToolApproval(toolCallsEvent.toolCalls[0].approvalId, 'approve');
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Received approval for unknown or already processed ID')
      );
      consoleSpy.mockRestore();
    });
  });
});
