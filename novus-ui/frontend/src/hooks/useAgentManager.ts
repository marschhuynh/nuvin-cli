import { useEffect, useCallback, useMemo } from 'react';
import { useAgentStore } from '@/store/useAgentStore';
import { useProviderStore } from '@/store/useProviderStore';
import { agentManager, SendMessageOptions, MessageResponse, AgentStatus, A2AErrorType } from '@/lib';
import { AgentSettings } from '@/types';

/**
 * Custom hook for managing agent communication and state
 * Integrates AgentManager with Zustand stores for seamless React integration
 */
export function useAgentManager() {
  // Get store states and actions
  const { agents, activeAgentId, setActiveAgent: setStoreActiveAgent } = useAgentStore();
  const { providers, activeProviderId, setActiveProvider: setStoreActiveProvider } = useProviderStore();

  // Get current active agent and provider
  const activeAgent = useMemo(() =>
    agents.find(agent => agent.id === activeAgentId) || null,
    [agents, activeAgentId]
  );

  const activeProvider = useMemo(() =>
    providers.find(provider => provider.id === activeProviderId) || null,
    [providers, activeProviderId]
  );

  // Sync AgentManager with store state
  useEffect(() => {
    if (activeAgent) {
      agentManager.setActiveAgent(activeAgent);
    }
  }, [activeAgent]);

  useEffect(() => {
    if (activeProvider) {
      agentManager.setActiveProvider(activeProvider);
    }
  }, [activeProvider]);

  // Set active agent (updates both store and manager)
  const setActiveAgent = useCallback((agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (agent) {
      setStoreActiveAgent(agentId);
      agentManager.setActiveAgent(agent);
    } else {
      console.warn(`Agent with id ${agentId} not found`);
    }
  }, [agents, setStoreActiveAgent]);

  // Set active provider (updates both store and manager)
  const setActiveProvider = useCallback((providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (provider) {
      setStoreActiveProvider(providerId);
      agentManager.setActiveProvider(provider);
    } else {
      console.warn(`Provider with id ${providerId} not found`);
    }
  }, [providers, setStoreActiveProvider]);

  // Send message using the agent manager
  const sendMessage = useCallback(async (
    content: string,
    options?: SendMessageOptions
  ): Promise<MessageResponse> => {
    if (!activeAgent) {
      throw new Error('No active agent selected');
    }

    if (!activeProvider && activeAgent.agentType === 'local') {
      throw new Error('No active provider selected for local agent');
    }

    return await agentManager.sendMessage(content, options);
  }, [activeAgent, activeProvider]);

  // Get agent status
  const getAgentStatus = useCallback(async (agent: AgentSettings): Promise<AgentStatus> => {
    return await agentManager.getAgentStatus(agent);
  }, []);

  // Get status of active agent
  const getActiveAgentStatus = useCallback(async (): Promise<AgentStatus | null> => {
    if (!activeAgent) return null;
    return await agentManager.getAgentStatus(activeAgent);
  }, [activeAgent]);

  // Test agent connectivity
  const testAgentConnectivity = useCallback(async (agent: AgentSettings): Promise<{
    connected: boolean;
    error?: string;
    userMessage?: string;
    errorType?: A2AErrorType;
  }> => {
    return await agentManager.testAgentConnectivity(agent);
  }, []);

  // Test active agent connectivity
  const testActiveAgentConnectivity = useCallback(async (): Promise<{
    connected: boolean;
    error?: string;
    userMessage?: string;
    errorType?: A2AErrorType;
  }> => {
    if (!activeAgent) {
      return { connected: false, error: 'No active agent selected' };
    }
    return await agentManager.testAgentConnectivity(activeAgent);
  }, [activeAgent]);

  // Get conversation history
  const getConversationHistory = useCallback((conversationId: string) => {
    return agentManager.getConversationHistory(conversationId);
  }, []);

  // Clear conversation history
  const clearConversationHistory = useCallback((conversationId?: string) => {
    agentManager.clearConversationHistory(conversationId);
  }, []);

  // Get available models for current provider
  const getAvailableModels = useCallback(() => {
    return agentManager.getAvailableModels();
  }, []);

  // Check if agent manager is ready (has both agent and provider if needed)
  const isReady = useMemo(() => {
    if (!activeAgent) return false;

    if (activeAgent.agentType === 'local') {
      return activeProvider !== null && activeProvider.apiKey !== '';
    }

    if (activeAgent.agentType === 'remote') {
      return activeAgent.url !== undefined && activeAgent.url !== '';
    }

    return false;
  }, [activeAgent, activeProvider]);

  // Get current agent type
  const agentType = useMemo(() => activeAgent?.agentType || null, [activeAgent]);

  // Check if current setup supports streaming
  const supportsStreaming = useMemo(() => {
    if (!activeAgent) return false;

    // A2A agents support streaming via Server-Sent Events (SSE)
    if (activeAgent.agentType === 'remote') return true;

    // Local agents can support streaming depending on the provider
    return activeAgent.agentType === 'local' && activeProvider !== null;
  }, [activeAgent, activeProvider]);

  // Get task by ID (for A2A agents)
  const getTask = useCallback(async (agentUrl: string, taskId: string) => {
    return await agentManager.getTask(agentUrl, taskId);
  }, []);

  // Cancel task (for A2A agents)
  const cancelTask = useCallback(async (agentUrl: string, taskId: string) => {
    return await agentManager.cancelTask(agentUrl, taskId);
  }, []);

  // Get all tracked tasks
  const getTasks = useCallback(() => {
    return agentManager.getTasks();
  }, []);

  // Get tasks for active agent
  const getActiveAgentTasks = useCallback(() => {
    return agentManager.getActiveAgentTasks();
  }, []);

  // Reset agent manager
  const reset = useCallback(() => {
    agentManager.reset();
  }, []);

  return {
    // State
    activeAgent,
    activeProvider,
    isReady,
    agentType,
    supportsStreaming,

    // Core Actions
    setActiveAgent,
    setActiveProvider,
    sendMessage,
    getAgentStatus,
    getActiveAgentStatus,
    testAgentConnectivity,
    testActiveAgentConnectivity,
    getConversationHistory,
    clearConversationHistory,
    getAvailableModels,
    reset,

    // A2A Task Management
    getTask,
    cancelTask,
    getTasks,
    getActiveAgentTasks,

    // Utilities
    agentManager: agentManager // Direct access if needed
  };
}

/**
 * Hook for managing multiple agent statuses
 * Useful for displaying agent status in lists or dashboards
 */
export function useAgentStatuses(agents?: AgentSettings[]) {
  const { agents: storeAgents } = useAgentStore();
  const agentsToCheck = agents || storeAgents;

  const getStatuses = useCallback(async (): Promise<AgentStatus[]> => {
    const statusPromises = agentsToCheck.map(agent =>
      agentManager.getAgentStatus(agent)
    );

    return await Promise.all(statusPromises);
  }, [agentsToCheck]);

  return {
    getStatuses
  };
}

/**
 * Hook for testing connectivity to multiple agents
 * Useful for health checks and diagnostics
 */
export function useAgentConnectivity(agents?: AgentSettings[]) {
  const { agents: storeAgents } = useAgentStore();
  const agentsToTest = agents || storeAgents;

  const testConnectivity = useCallback(async (): Promise<Record<string, {
    connected: boolean;
    error?: string;
    userMessage?: string;
    errorType?: A2AErrorType;
  }>> => {
    const connectivityPromises = agentsToTest.map(async agent => ({
      id: agent.id,
      result: await agentManager.testAgentConnectivity(agent)
    }));

    const results = await Promise.all(connectivityPromises);

    return results.reduce((acc, { id, result }) => {
      acc[id] = result;
      return acc;
    }, {} as Record<string, {
      connected: boolean;
      error?: string;
      userMessage?: string;
      errorType?: A2AErrorType;
    }>);
  }, [agentsToTest]);

  return {
    testConnectivity
  };
}