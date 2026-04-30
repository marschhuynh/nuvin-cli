import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentManager } from '../agent-manager.js';
import type { LLMPort, ToolPort, AgentConfig, CompletionResult, ToolDefinition, LLMFactory } from '../ports.js';
import type { SpecialistAgentConfig } from '../agent-types.js';
import type { ToolExecutionResult } from '../tools/types.js';

describe('Sub-Agent Timeout with Running Bash Tool', () => {
  let mockLLM: LLMPort;
  let mockTools: ToolPort;
  let delegatingConfig: AgentConfig;
  let mockFactory: LLMFactory;

  beforeEach(() => {
    mockLLM = {
      generateCompletion: vi.fn(),
    };

    mockTools = {
      getToolDefinitions: vi.fn().mockReturnValue([
        {
          type: 'function',
          function: {
            name: 'bash_tool',
            description: 'Execute bash commands',
            parameters: { type: 'object', properties: { cmd: { type: 'string' } } },
          },
        },
      ] as ToolDefinition[]),
      executeToolCalls: vi.fn(),
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
  });

  describe('Timeout during bash tool execution', () => {
    it('should timeout and abort when bash tool runs longer than timeout', async () => {
      let toolExecutionStarted = false;

      mockLLM.generateCompletion = vi.fn().mockResolvedValueOnce({
        content: '',
        tool_calls: [
          { id: 'call-1', type: 'function', function: { name: 'bash_tool', arguments: '{"cmd":"sleep 10"}' } },
        ],
      } as CompletionResult);

      mockTools.executeToolCalls = vi.fn().mockImplementation((_toolCalls, context) => {
        toolExecutionStarted = true;
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            resolve([{ id: 'call-1', name: 'bash_tool', status: 'success', result: 'done' }]);
          }, 500);

          context?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
          });
        });
      });

      const agentManager = new AgentManager(delegatingConfig, mockTools, mockFactory);
      const config: SpecialistAgentConfig = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        taskDescription: 'Run a long bash command',
        instructions: 'Test prompt',
        allowed_tools: ['bash_tool'],
        timeout_ms: 200,
        delegationDepth: 1,
      };

      const result = await agentManager.executeTask(config);

      await new Promise((r) => setTimeout(r, 20));

      expect(result.status).toBe('timeout');
      expect(result.result).toContain('timeout');
      expect(toolExecutionStarted).toBe(true);
    });

    it('should complete successfully when bash tool finishes before timeout', async () => {
      mockLLM.generateCompletion = vi
        .fn()
        .mockResolvedValueOnce({
          content: '',
          tool_calls: [
            { id: 'call-1', type: 'function', function: { name: 'bash_tool', arguments: '{"cmd":"echo hello"}' } },
          ],
        } as CompletionResult)
        .mockResolvedValueOnce({
          content: 'Bash command executed successfully',
          tool_calls: undefined,
        } as CompletionResult);

      mockTools.executeToolCalls = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return [{ id: 'call-1', name: 'bash_tool', status: 'success', result: 'hello' }] as ToolExecutionResult[];
      });

      const agentManager = new AgentManager(delegatingConfig, mockTools, mockFactory);
      const config: SpecialistAgentConfig = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        taskDescription: 'Run a quick bash command',
        systemPrompt: 'Test prompt',
        tools: ['bash_tool'],
        timeoutMs: 5000,
        delegationDepth: 1,
      };

      const result = await agentManager.executeTask(config);

      expect(result.status).toBe('success');
      expect(result.result).toContain('Bash command executed successfully');
    });

    it('should include error metadata when timeout occurs', async () => {
      mockLLM.generateCompletion = vi.fn().mockResolvedValueOnce({
        content: '',
        tool_calls: [
          { id: 'call-1', type: 'function', function: { name: 'bash_tool', arguments: '{"cmd":"sleep 10"}' } },
        ],
      } as CompletionResult);

      mockTools.executeToolCalls = vi.fn().mockImplementation((_toolCalls, context) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 1000);
          context?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Aborted'));
          });
        });
      });

      const agentManager = new AgentManager(delegatingConfig, mockTools, mockFactory);
      const config: SpecialistAgentConfig = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        taskDescription: 'Run a command that times out',
        instructions: 'Test prompt',
        allowed_tools: ['bash_tool'],
        timeout_ms: 50,
        delegationDepth: 1,
      };

      const result = await agentManager.executeTask(config);

      expect(result.status).toBe('timeout');
      expect(result.metadata.agentId).toBe('test-agent');
      expect(result.metadata.errorMessage).toContain('timeout');
    });
  });

  describe('User abort vs timeout priority', () => {
    it('should report abort when user aborts before timeout', async () => {
      mockLLM.generateCompletion = vi.fn().mockResolvedValueOnce({
        content: '',
        tool_calls: [
          { id: 'call-1', type: 'function', function: { name: 'bash_tool', arguments: '{"cmd":"sleep 10"}' } },
        ],
      } as CompletionResult);

      mockTools.executeToolCalls = vi.fn().mockImplementation((_toolCalls, context) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 1000);
          context?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Aborted'));
          });
        });
      });

      const agentManager = new AgentManager(delegatingConfig, mockTools, mockFactory);
      const controller = new AbortController();

      const config: SpecialistAgentConfig = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        taskDescription: 'Run a long command',
        systemPrompt: 'Test prompt',
        tools: ['bash_tool'],
        timeoutMs: 5000,
        delegationDepth: 1,
      };

      const resultPromise = agentManager.executeTask(config, controller.signal);
      setTimeout(() => controller.abort(), 50);

      const result = await resultPromise;

      expect(result.status).toBe('error');
      expect(result.result).toContain('aborted');
    });

    it('should report timeout when timeout occurs before user abort', async () => {
      mockLLM.generateCompletion = vi.fn().mockResolvedValueOnce({
        content: '',
        tool_calls: [
          { id: 'call-1', type: 'function', function: { name: 'bash_tool', arguments: '{"cmd":"sleep 10"}' } },
        ],
      } as CompletionResult);

      mockTools.executeToolCalls = vi.fn().mockImplementation((_toolCalls, context) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 1000);
          context?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Aborted'));
          });
        });
      });

      const agentManager = new AgentManager(delegatingConfig, mockTools, mockFactory);
      const controller = new AbortController();

      const config: SpecialistAgentConfig = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        taskDescription: 'Run a long command',
        instructions: 'Test prompt',
        allowed_tools: ['bash_tool'],
        timeout_ms: 50,
        delegationDepth: 1,
      };

      const resultPromise = agentManager.executeTask(config, controller.signal);
      setTimeout(() => controller.abort(), 500);

      const result = await resultPromise;

      expect(result.status).toBe('timeout');
      expect(result.result).toContain('timeout');
    });
  });
});
