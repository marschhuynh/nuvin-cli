import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentManager } from '../useAgentManager';
import { useAgentStore } from '@/store/useAgentStore';
import { useProviderStore } from '@/store/useProviderStore';
import { useConversationStore } from '@/store';
import type { AgentSettings } from '@/types';

// Mock the stores and AgentManager
vi.mock('@/store/useAgentStore');
vi.mock('@/store/useProviderStore');
vi.mock('@/store');
vi.mock('@/lib', () => ({
  agentManager: {
    setActiveAgent: vi.fn(),
    setActiveProvider: vi.fn(),
    sendMessage: vi.fn(),
    getAgentStatus: vi.fn(),
    getConversationMetrics: vi.fn(),
    cancelCurrentRequest: vi.fn(),
    clearConversationHistory: vi.fn(),
    initializeHistoryFromStore: vi.fn(),
    getConversationHistory: vi.fn(),
    getAvailableModels: vi.fn(),
    testAgentConnectivity: vi.fn(),
    getTask: vi.fn(),
    cancelTask: vi.fn(),
    getTasks: vi.fn(),
    getActiveAgentTasks: vi.fn(),
    reset: vi.fn(),
  },
}));

const mockUseAgentStore = vi.mocked(useAgentStore);
const mockUseProviderStore = vi.mocked(useProviderStore);
const mockUseConversationStore = vi.mocked(useConversationStore);

// Import the mocked agentManager
import { agentManager } from '@/lib';
const mockAgentManager = vi.mocked(agentManager);

describe.skip('useAgentManager', () => {
  const mockAgent: AgentSettings = {
    id: 'test-agent-1',
    name: 'Test Agent',
    agentType: 'local',
    responseLength: 'medium',
    systemPrompt: 'Test prompt',
    temperature: 0.7,
    topP: 1.0,
    maxTokens: 1000,
  };

  const mockAgentStore = {
    agents: [mockAgent],
    activeAgentId: 'test-agent-1',
    setActiveAgent: vi.fn(),
    addAgent: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
    reset: vi.fn(),
  };

  const mockProviderStore = {
    providers: [
      {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai',
        apiKey: 'test-key',
        activeModel: 'gpt-4',
      },
    ],
    activeProviderId: 'openai',
    setActiveProvider: vi.fn(),
    addProvider: vi.fn(),
    updateProvider: vi.fn(),
    deleteProvider: vi.fn(),
    reset: vi.fn(),
  };

  const mockConversationStore = {
    activeConversationId: 'test-conversation-1',
    conversations: [],
    messages: {},
    addConversation: vi.fn(),
    updateConversation: vi.fn(),
    deleteConversation: vi.fn(),
    setActiveConversation: vi.fn(),
    addMessage: vi.fn(),
    updateMessage: vi.fn(),
    deleteMessage: vi.fn(),
    clearMessages: vi.fn(),
    getActiveConversation: vi.fn(),
    getActiveMessages: vi.fn(),
    getConversationMessages: vi.fn(() => []),
    reset: vi.fn(),
    _syncActiveState: vi.fn(),
  };

  beforeEach(() => {
    // Clear call history but keep implementations
    Object.values(mockAgentManager).forEach((mockFn: any) => {
      if (typeof mockFn?.mockClear === 'function') {
        mockFn.mockClear();
      }
    });

    // Re-setup the agentManager methods
    mockAgentManager.setActiveAgent.mockImplementation(vi.fn());
    mockAgentManager.setActiveProvider.mockImplementation(vi.fn());
    mockAgentManager.sendMessage.mockResolvedValue({
      id: 'response-1',
      content: 'Test response',
      role: 'assistant',
      timestamp: new Date().toISOString(),
    });
    mockAgentManager.cancelCurrentRequest.mockResolvedValue(true);
    mockAgentManager.initializeHistoryFromStore.mockImplementation(vi.fn());
    mockAgentManager.getConversationHistory.mockReturnValue([]);
    mockAgentManager.getAvailableModels.mockReturnValue([]);
    mockAgentManager.testAgentConnectivity.mockResolvedValue({
      connected: true,
    });
    mockAgentManager.getTask.mockResolvedValue(null);
    mockAgentManager.cancelTask.mockResolvedValue(true);
    mockAgentManager.getTasks.mockReturnValue([]);
    mockAgentManager.getActiveAgentTasks.mockReturnValue([]);
    mockAgentManager.reset.mockImplementation(vi.fn());

    mockUseAgentStore.mockReturnValue(mockAgentStore);
    mockUseProviderStore.mockReturnValue(mockProviderStore);
    mockUseConversationStore.mockReturnValue(mockConversationStore);
  });

  describe('basic functionality', () => {
    it('initializes with correct default state', () => {
      const { result } = renderHook(() => useAgentManager());

      expect(result.current).toBeDefined();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.activeAgent).toEqual(mockAgent);
    });

    it('sets active agent on mount', () => {
      renderHook(() => useAgentManager());

      expect(mockAgentManager.setActiveAgent).toHaveBeenCalledWith(mockAgent);
    });

    it('updates when active agent changes', () => {
      const { rerender } = renderHook(() => useAgentManager());

      const newAgent: AgentSettings = {
        ...mockAgent,
        id: 'test-agent-2',
        name: 'New Test Agent',
      };

      mockUseAgentStore.mockReturnValue({
        ...mockAgentStore,
        agents: [mockAgent, newAgent],
        activeAgentId: 'test-agent-2',
      });

      rerender();

      expect(mockAgentManager.setActiveAgent).toHaveBeenCalledWith(newAgent);
    });
  });

  describe('sendMessage', () => {
    it('sends message with correct parameters', async () => {
      mockAgentManager.sendMessage.mockResolvedValue({
        id: 'response-1',
        content: 'Test response',
        role: 'assistant',
        timestamp: new Date().toISOString(),
      });

      const { result } = renderHook(() => useAgentManager());

      await act(async () => {
        await result.current.sendMessage('Hello, agent!');
      });

      expect(mockAgentManager.sendMessage).toHaveBeenCalledWith('Hello, agent!', undefined);
    });

    it('handles loading state correctly', async () => {
      let resolvePromise: (value: any) => void;
      const messagePromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockAgentManager.sendMessage.mockReturnValue(messagePromise as Promise<any>);

      const { result } = renderHook(() => useAgentManager());

      const sendPromise = act(async () => {
        result.current.sendMessage('Hello, agent!');
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolvePromise?.({
          id: 'response-1',
          content: 'Test response',
          role: 'assistant',
          timestamp: new Date().toISOString(),
        });
        await sendPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('handles error state correctly', async () => {
      const testError = new Error('Test error');
      mockAgentManager.sendMessage.mockRejectedValue(testError);

      let hookError: Error | null = null;
      const { result } = renderHook(() => {
        try {
          return useAgentManager();
        } catch (error) {
          hookError = error as Error;
          throw error;
        }
      });

      if (hookError) {
        throw new Error(`Hook threw error during execution: ${(hookError as Error).message || String(hookError)}`);
      }

      if (!result.current) {
        throw new Error('Hook failed to initialize - result.current is null');
      }

      await act(async () => {
        try {
          await result.current.sendMessage('Hello, agent!');
        } catch (_error) {
          // Error is expected
        }
      });

      expect(result.current.error).toBe(testError);
      expect(result.current.isLoading).toBe(false);
    });

    it('clears error on successful message', async () => {
      const { result } = renderHook(() => useAgentManager());

      // First, set an error
      mockAgentManager.sendMessage.mockRejectedValue(new Error('First error'));

      await act(async () => {
        try {
          await result.current.sendMessage('Error message');
        } catch (_error) {
          // Expected
        }
      });

      expect(result.current.error).toBeTruthy();

      // Then send a successful message
      mockAgentManager.sendMessage.mockResolvedValue({
        id: 'response-1',
        content: 'Success response',
        role: 'assistant',
        timestamp: new Date().toISOString(),
      });

      await act(async () => {
        await result.current.sendMessage('Success message');
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('cancelRequest', () => {
    it('cancels current request', async () => {
      mockAgentManager.cancelCurrentRequest.mockResolvedValue(true);

      const { result } = renderHook(() => useAgentManager());

      await act(async () => {
        const cancelled = await result.current.cancelRequest();
        expect(cancelled).toBe(true);
      });

      expect(mockAgentManager.cancelCurrentRequest).toHaveBeenCalled();
    });

    it('handles cancel request failure', async () => {
      mockAgentManager.cancelCurrentRequest.mockResolvedValue(false);

      const { result } = renderHook(() => useAgentManager());

      await act(async () => {
        const cancelled = await result.current.cancelRequest();
        expect(cancelled).toBe(false);
      });
    });
  });

  describe('clearError', () => {
    it('clears error state', async () => {
      const testError = new Error('Test error');
      mockAgentManager.sendMessage.mockRejectedValue(testError);

      const { result } = renderHook(() => useAgentManager());

      // First trigger an error
      await act(async () => {
        try {
          await result.current.sendMessage('Error message');
        } catch (_error) {
          // Expected
        }
      });

      expect(result.current.error).toBe(testError);

      // Then clear the error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles no active agent', () => {
      mockUseAgentStore.mockReturnValue({
        ...mockAgentStore,
        activeAgentId: null,
        agents: [],
      });

      const { result } = renderHook(() => useAgentManager());

      expect(result.current).toBeDefined();
      if (result.current) {
        expect(result.current.activeAgent).toBeNull();
      }
    });

    it('handles no active conversation', () => {
      mockUseConversationStore.mockReturnValue({
        ...mockConversationStore,
        activeConversationId: null,
      });

      const { result } = renderHook(() => useAgentManager());

      expect(result.current).toBeDefined();
    });

    it('handles agent not found in agents array', () => {
      mockUseAgentStore.mockReturnValue({
        ...mockAgentStore,
        activeAgentId: 'non-existent-agent',
        agents: [mockAgent],
      });

      const { result } = renderHook(() => useAgentManager());

      expect(result.current.activeAgent).toBeNull();
    });
  });

  describe('streaming support', () => {
    it('sends streaming message with onChunk callback', async () => {
      const chunks: string[] = [];
      const onChunk = vi.fn((chunk: string) => chunks.push(chunk));

      mockAgentManager.sendMessage.mockImplementation((_message, options) => {
        // Simulate streaming chunks
        if (options?.onChunk) {
          setTimeout(() => options.onChunk?.('chunk1'), 10);
          setTimeout(() => options.onChunk?.('chunk2'), 20);
        }

        return Promise.resolve({
          id: 'response-1',
          content: 'chunk1chunk2',
          role: 'assistant',
          timestamp: new Date().toISOString(),
        });
      });

      const { result } = renderHook(() => useAgentManager());

      await act(async () => {
        await result.current.sendMessage('Hello!', {
          stream: true,
          onChunk,
        });
      });

      expect(mockAgentManager.sendMessage).toHaveBeenCalledWith(
        'Hello!',
        expect.objectContaining({
          stream: true,
          onChunk,
        }),
      );
    });
  });
});
