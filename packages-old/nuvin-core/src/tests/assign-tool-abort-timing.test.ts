import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssignTool } from '../tools/AssignTool.js';
import { AgentRegistry } from '../agent-registry.js';
import {
  DefaultDelegationService,
  DefaultSpecialistAgentFactory,
  AgentManagerCommandRunner,
} from '../delegation/index.js';
import type { LLMPort, ToolPort, AgentConfig, CompletionResult, ToolDefinition, LLMFactory } from '../ports.js';

describe('AssignTool - Abort Timing Tests', () => {
  let mockLLM: LLMPort;
  let mockTools: ToolPort;
  let delegatingConfig: AgentConfig;
  let assignTool: AssignTool;
  let agentRegistry: AgentRegistry;
  let mockFactory: LLMFactory;

  beforeEach(() => {
    // Mock LLM that takes time to respond
    mockLLM = {
      generateCompletion: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second delay
        return {
          content: 'Task completed by sub-agent',
          tool_calls: undefined,
        } as CompletionResult;
      }),
    };

    mockTools = {
      getToolDefinitions: vi.fn().mockReturnValue([
        {
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'Test tool',
            parameters: { type: 'object', properties: {} },
          },
        },
      ] as ToolDefinition[]),
      executeToolCalls: vi.fn().mockResolvedValue([]),
    };

    mockFactory = {
      createLLM: vi.fn().mockReturnValue(mockLLM),
    };

    delegatingConfig = {
      id: 'parent-agent',
      model: 'test-model',
      systemPrompt: 'Test',
      temperature: 0.7,
      topP: 1,
      enabledTools: [],
    };

    agentRegistry = new AgentRegistry();

    // Register a test agent
    agentRegistry.register({
      name: 'test-reviewer',
      description: 'A test reviewing agent',
      instructions: 'You are a test reviewer',
      allowed_tools: ['test_tool'],
    });

    const delegationService = new DefaultDelegationService(
      agentRegistry,
      new DefaultSpecialistAgentFactory({
        agentListProvider: () =>
          agentRegistry.list().map((a) => ({
            id: a.id as string,
            name: a.name as string,
            description: a.description as string,
          })),
      }),
      new AgentManagerCommandRunner(delegatingConfig, mockTools, mockFactory),
    );

    delegationService.setEnabledAgents({ 'test-reviewer': true });

    assignTool = new AssignTool(delegationService);
  });

  describe('Abort during sub-agent execution', () => {
    it('should abort sub-agent task after 2 seconds during 5 second execution', async () => {
      const controller = new AbortController();

      const startTime = Date.now();

      const executePromise = assignTool.execute(
        {
          agent: 'test-reviewer',
          task: 'Review this code that takes a long time',
        },
        {
          conversationId: 'test',
          messageId: 'msg-1',
          signal: controller.signal,
        },
      );

      // Abort after 2 seconds (during the 5 second LLM call)
      setTimeout(() => {
        controller.abort();
      }, 2000);

      const result = await executePromise;
      const executionTime = Date.now() - startTime;

      // Assertions
      expect(result.status).toBe('error');
      expect(result.result).toMatch(/aborted|Aborted/i);

      // Should complete in approximately 2 seconds (with some tolerance)
      expect(executionTime).toBeGreaterThan(1900); // At least 1.9 seconds
      expect(executionTime).toBeLessThan(2500); // Less than 2.5 seconds (not 5 seconds)

      // Should not see "completed" message
      expect(result.result).not.toContain('Task completed by sub-agent');
    }, 10000);

    it('should abort immediately if signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const startTime = Date.now();

      const result = await assignTool.execute(
        {
          agent: 'test-reviewer',
          task: 'Review this code',
        },
        {
          conversationId: 'test',
          messageId: 'msg-1',
          signal: controller.signal,
        },
      );

      const executionTime = Date.now() - startTime;

      expect(result.status).toBe('error');
      expect(result.result).toContain('aborted by user');

      // Should complete almost immediately (less than 100ms)
      expect(executionTime).toBeLessThan(100);
    });

    it('should abort sub-agent that calls multiple tools', async () => {
      // Mock tools that take time
      mockTools.executeToolCalls = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return [
          {
            id: 'call_1',
            name: 'test_tool',
            status: 'success' as const,
            type: 'text' as const,
            result: 'Tool completed',
            durationMs: 3000,
          },
        ];
      });

      // Mock LLM that requests tool calls
      mockLLM.generateCompletion = vi
        .fn()
        .mockResolvedValueOnce({
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function' as const,
              function: { name: 'test_tool', arguments: '{}' },
            },
          ],
        } as unknown as CompletionResult)
        .mockResolvedValue({
          content: 'Done with tools',
          tool_calls: undefined,
        } as CompletionResult);

      const controller = new AbortController();
      const startTime = Date.now();

      const executePromise = assignTool.execute(
        {
          agent: 'test-reviewer',
          task: 'Review and use tools',
        },
        {
          conversationId: 'test',
          messageId: 'msg-1',
          signal: controller.signal,
        },
      );

      // Abort after 1.5 seconds (during tool execution)
      setTimeout(() => controller.abort(), 1500);

      const result = await executePromise;
      const executionTime = Date.now() - startTime;

      expect(result.status).toBe('error');
      expect(result.result).toMatch(/aborted/i);

      // Should abort around 1.5 seconds, not wait for full 3 second tool execution
      expect(executionTime).toBeLessThan(2000);
    }, 10000);
  });

  describe('Abort vs Timeout comparison', () => {
    it('should abort faster than timeout', async () => {
      const controller = new AbortController();

      const startTime = Date.now();

      const executePromise = assignTool.execute(
        {
          agent: 'test-reviewer',
          task: 'Long running task',
        },
        {
          conversationId: 'test',
          messageId: 'msg-1',
          signal: controller.signal,
        },
      );

      // Abort after 1 second
      setTimeout(() => controller.abort(), 1000);

      const result = await executePromise;
      const executionTime = Date.now() - startTime;

      // Should abort at 1 second, not wait for 5 second LLM call or timeout
      expect(result.status).toBe('error');
      expect(result.result).toMatch(/aborted/i);
      expect(executionTime).toBeGreaterThan(900);
      expect(executionTime).toBeLessThan(1500);
    }, 10000);
  });

  describe('Nested abort propagation', () => {
    it('should propagate abort through delegation chain', async () => {
      const controller = new AbortController();

      // Track if the sub-agent orchestrator receives the signal
      let signalReceived = false;
      mockLLM.generateCompletion = vi.fn().mockImplementation(async (_params, signal) => {
        if (signal) {
          signalReceived = true;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return {
          content: 'Response',
          tool_calls: undefined,
        } as CompletionResult;
      });

      const startTime = Date.now();

      const executePromise = assignTool.execute(
        {
          agent: 'test-reviewer',
          task: 'Test signal propagation',
        },
        {
          conversationId: 'test',
          messageId: 'msg-1',
          signal: controller.signal,
        },
      );

      setTimeout(() => controller.abort(), 1000);

      await executePromise;
      const executionTime = Date.now() - startTime;

      expect(signalReceived).toBe(true);
      expect(executionTime).toBeLessThan(1500);
    }, 10000);
  });

  describe('Error message consistency', () => {
    it('should use consistent abort message for sub-agents', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await assignTool.execute(
        {
          agent: 'test-reviewer',
          task: 'Test task',
        },
        {
          conversationId: 'test',
          messageId: 'msg-1',
          signal: controller.signal,
        },
      );

      expect(result.result).toMatch(/aborted by user/i);
      expect(result.result).toContain('Sub-agent');
    });
  });
});
