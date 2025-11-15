import { useCallback, useEffect, useState } from 'react';
import { Text, useInput } from 'ink';
import type { AgentTemplate, ToolPort, AgentAwareToolPort } from '@nuvin/nuvin-core';
import { AppModal } from '@/components/AppModal.js';
import AgentModal, { type AgentInfo } from '@/components/AgentModal/AgentModal.js';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { AgentCreator } from '@/services/AgentCreator.js';
import AgentCreation from '@/components/AgentCreation/AgentCreation.js';

// Navigation state types
type NavigationSource = 'agent-config' | 'direct' | null;
type ActiveView = 'config' | 'edit' | 'none';

interface NavigationState {
  activeView: ActiveView;
  navigationSource: NavigationSource;
  preservedState: {
    selectedAgentId: string | null;
    selectedAgentIndex: number;
  } | null;
}

const AgentCommandComponent = ({ context, deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [enabledAgents, setEnabledAgents] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creationMode, setCreationMode] = useState(false);
  const [creationLoading, setCreationLoading] = useState(false);
  const [creationError, setCreationError] = useState<string | undefined>(undefined);
  const [creationPreview, setCreationPreview] = useState<
    (Partial<AgentTemplate> & { systemPrompt: string }) | undefined
  >(undefined);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [availableTools, setAvailableTools] = useState<string[]>([]);

  // Navigation state management
  const [navigationState, setNavigationState] = useState<NavigationState>({
    activeView: 'config',
    navigationSource: null,
    preservedState: null,
  });

  // Helper functions for clean state transitions
  const transitionToEdit = useCallback((agentId: string, source: NavigationSource, selectedAgentIndex: number) => {
    setNavigationState({
      activeView: 'edit',
      navigationSource: source,
      preservedState:
        source === 'agent-config'
          ? {
              selectedAgentId: agentId,
              selectedAgentIndex,
            }
          : null,
    });
  }, []);

  const transitionToConfig = useCallback(() => {
    setNavigationState(() => ({
      activeView: 'config',
      navigationSource: null,
      preservedState: null,
    }));
  }, []);

  // const transitionToNone = useCallback(() => {
  //   setNavigationState({
  //     activeView: 'none',
  //     navigationSource: null,
  //     preservedState: null,
  //   });
  // }, []);

  useInput(
    (_input, key) => {
      if (key.escape) {
        if (!creationMode || creationLoading) {
          if (!creationMode) {
            deactivate();
          }
        }
      }
    },
    { isActive: !creationMode },
  );

  const loadAgents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const tools = context.orchestrator?.getTools?.();
      const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
      const agentRegistry = agentAwareTools?.getAgentRegistry?.();
      const enabledConfig = (context.config.get('agentsEnabled') as Record<string, boolean>) || {};

      if (!agentRegistry) {
        const debugInfo = [
          'Agent registry not available.',
          '',
          'Debug Info:',
          `- Orchestrator exists: ${!!context.orchestrator}`,
          `- getTools method exists: ${!!context.orchestrator?.getTools}`,
          `- Tools exist: ${!!tools}`,
          `- getAgentRegistry method exists: ${!!agentAwareTools?.getAgentRegistry}`,
          '',
          'Please restart the CLI and try again.',
          'If the issue persists, the orchestrator may not be fully initialized.',
        ].join('\n');
        setError(debugInfo);
        setAgents([]);
        setEnabledAgents({});
        return;
      }

      const allAgents = agentRegistry.list();
      const agentInfos: AgentInfo[] = allAgents.map((agent) => ({
        ...agent,
        isDefault: agentRegistry.isDefault(agent.id),
      }));

      setAgents(agentInfos);
      setEnabledAgents({ ...enabledConfig });

      const orchestratorAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
      if (orchestratorAwareTools?.setEnabledAgents) {
        orchestratorAwareTools.setEnabledAgents({ ...enabledConfig });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load agents: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [context.config, context.orchestrator]);

  useEffect(() => {
    let cancelled = false;

    const loadAvailableTools = async () => {
      try {
        const toolsPort = context.orchestrator?.getTools?.();
        const toolRegistry = toolsPort as { listRegisteredTools?: () => Promise<string[]> } | null | undefined;
        if (toolRegistry?.listRegisteredTools) {
          const toolList = await toolRegistry.listRegisteredTools();
          if (!cancelled && Array.isArray(toolList)) {
            setAvailableTools(toolList);
          }
        }
      } catch (error) {
        console.warn(
          'Failed to load available tools for agent creation:',
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    void loadAvailableTools();

    return () => {
      cancelled = true;
    };
  }, [context.orchestrator]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const handleAgentStatusChange = useCallback(
    async (agentId: string, enabled: boolean) => {
      try {
        const currentConfig = (context.config.get('agentsEnabled') as Record<string, boolean>) || {};
        const updatedConfig = { ...currentConfig, [agentId]: enabled };

        await context.config.set('agentsEnabled', updatedConfig, 'global');
        setEnabledAgents(updatedConfig);

        const tools = context.orchestrator?.getTools?.();
        const orchestratorAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
        if (orchestratorAwareTools?.setEnabledAgents) {
          orchestratorAwareTools.setEnabledAgents(updatedConfig);
        }
      } catch (error) {
        console.error('Failed to save agent status:', error);
      }
    },
    [context.config, context.orchestrator],
  );

  const handleBatchAgentStatusChange = useCallback(
    async (config: Record<string, boolean>) => {
      try {
        const updatedConfig = { ...config };
        await context.config.set('agentsEnabled', updatedConfig, 'global');
        setEnabledAgents(updatedConfig);

        const tools = context.orchestrator?.getTools?.();
        const orchestratorAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
        if (orchestratorAwareTools?.setEnabledAgents) {
          orchestratorAwareTools.setEnabledAgents(updatedConfig);
        }
      } catch (error) {
        console.error('Failed to save batch agent statuses:', error);
      }
    },
    [context.config, context.orchestrator],
  );

  const handleAgentCreate = useCallback(() => {
    setEditingAgentId(null);
    setCreationMode(true);
    setCreationError(undefined);
    setCreationPreview(undefined);
    setCreationLoading(false);
  }, []);

  const handleAgentEdit = useCallback(
    (agentId: string) => {
      const tools = context.orchestrator?.getTools?.();
      const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
      const agentRegistry = agentAwareTools?.getAgentRegistry?.();

      if (!agentRegistry) {
        setError('Agent registry not available');
        return;
      }

      const agent = agentRegistry.get(agentId);
      if (!agent) {
        void loadAgents();
        return;
      }

      // Find the current selected agent index
      const selectedAgentIndex = agents.findIndex((a) => a.id === agentId);

      // Store navigation source as 'agent-config' and preserve state
      transitionToEdit(agentId, 'agent-config', selectedAgentIndex);

      // Set up edit mode
      setEditingAgentId(agentId);
      setCreationMode(true);
      setCreationError(undefined);
      setCreationPreview(agent);
      setCreationLoading(false);
    },
    [context.orchestrator, loadAgents, agents, transitionToEdit],
  );

  const handleAgentDelete = useCallback(
    async (agentId: string) => {
      try {
        const tools = context.orchestrator?.getTools?.();
        const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
        const agentRegistry = agentAwareTools?.getAgentRegistry?.();

        if (!agentRegistry) {
          setError('Agent registry not available');
          return;
        }

        if (agentRegistry.isDefault(agentId)) {
          setError('Cannot delete default agents');
          return;
        }

        agentRegistry.unregister(agentId);
        await agentRegistry.deleteFromFile(agentId);

        // Delete the agent from config - this updates ConfigManager internal state
        await context.config.delete(`agentsEnabled.${agentId}`, 'global');

        // Get the updated config from ConfigManager (already updated by delete)
        const updatedConfig = (context.config.get('agentsEnabled') as Record<string, boolean>) || {};
        setEnabledAgents(updatedConfig);

        const orchestratorAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
        if (orchestratorAwareTools?.setEnabledAgents) {
          orchestratorAwareTools.setEnabledAgents(updatedConfig);
        }

        // Reload agents list (this will also re-sync enabledAgents from config)
        await loadAgents();
      } catch (error) {
        setError(`Failed to delete agent: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [context.config, context.orchestrator, loadAgents],
  );

  // Handle agent creation
  const handleCreationSubmit = async (description: string) => {
    try {
      setCreationLoading(true);
      setCreationError(undefined);
      setEditingAgentId(null);

      const llm = context.orchestrator?.getLLM?.();
      const model = context.orchestrator?.getConfig?.()?.model || 'gpt-4';

      if (!llm) {
        setCreationError('LLM not available');
        setCreationLoading(false);
        return;
      }

      // Create agent using AgentCreator service
      const agentCreator = new AgentCreator(llm);
      const result = await agentCreator.createAgent(description, model);

      if (!result.success || !result.agent) {
        setCreationError(result.error || 'Failed to create agent');
        setCreationLoading(false);
        return;
      }

      // Show preview
      setCreationPreview(result.agent);
      setCreationLoading(false);
    } catch (error) {
      setCreationError(`Error creating agent: ${error instanceof Error ? error.message : String(error)}`);
      setCreationLoading(false);
    }
  };

  const handleCreationCancel = () => {
    // Check navigationSource to determine where to return
    if (navigationState.navigationSource === 'agent-config') {
      // Return to Agent Configuration modal
      transitionToConfig();
      setCreationMode(false);
      setCreationError(undefined);
      setCreationPreview(undefined);
      setCreationLoading(false);
      setEditingAgentId(null);
      // Note: preservedState is cleared by transitionToConfig, but we keep the agents list intact
    } else {
      // Direct entry - close the command entirely
      setCreationMode(false);
      setCreationError(undefined);
      setCreationPreview(undefined);
      setCreationLoading(false);
      setEditingAgentId(null);
      deactivate();
    }
  };

  const handlePreviewEdit = () => {
    setCreationError(undefined);
  };

  const handlePreviewUpdate = (updatedPreview: Partial<AgentTemplate> & { systemPrompt: string }) => {
    setCreationPreview(updatedPreview);
    setCreationError(undefined);
  };

  const handleCreationConfirm = useCallback(
    async (nextPreview?: Partial<AgentTemplate> & { systemPrompt: string }) => {
      const previewToUse = nextPreview ?? creationPreview;
      if (!previewToUse) return;

      setCreationLoading(true);

      try {
        const tools = context.orchestrator?.getTools?.();
        const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
        const agentRegistry = agentAwareTools?.getAgentRegistry?.();

        if (!agentRegistry) {
          setError('Agent registry not available');
          return;
        }

        if (editingAgentId) {
          if (agentRegistry.isDefault(editingAgentId)) {
            setCreationError('Default agents cannot be edited');
            return;
          }

          const originalAgent = agentRegistry.get(editingAgentId);
          if (!originalAgent) {
            setCreationError('Agent not found. Please refresh and try again.');
            return;
          }

          const updatedAgent = agentRegistry.applyDefaults(previewToUse);
          const newId = updatedAgent.id;
          const renamed = newId !== editingAgentId;

          if (renamed && agentRegistry.exists(newId)) {
            setCreationError(`Agent with ID "${newId}" already exists`);
            return;
          }

          const currentConfig = (context.config.get('agentsEnabled') as Record<string, boolean>) || {};
          const wasEnabled = currentConfig[editingAgentId] ?? true;
          const updatedConfig = { ...currentConfig };

          let newRegistered = false;
          let savedUpdatedFile = false;
          let removedOriginalFile = false;

          try {
            if (renamed) {
              agentRegistry.unregister(editingAgentId);
            }

            agentRegistry.register(updatedAgent);
            newRegistered = true;

            await agentRegistry.saveToFile(updatedAgent);
            savedUpdatedFile = true;

            if (renamed) {
              await agentRegistry.deleteFromFile(editingAgentId);
              removedOriginalFile = true;
            }

            if (renamed) {
              delete updatedConfig[editingAgentId];
            }
            if (newId) updatedConfig[newId] = wasEnabled ?? true;

            await context.config.set('agentsEnabled', updatedConfig, 'global');
            setEnabledAgents(updatedConfig);
            const orchestratorAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
            if (orchestratorAwareTools?.setEnabledAgents) {
              orchestratorAwareTools.setEnabledAgents(updatedConfig);
            }

            // Reload agents list to get updated data
            await loadAgents();

            // Check navigationSource to determine where to return
            if (navigationState.navigationSource === 'agent-config') {
              // Get the updated agents list to find the correct index
              const tools = context.orchestrator?.getTools?.();
              const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
              const agentRegistry = agentAwareTools?.getAgentRegistry?.();
              if (agentRegistry) {
                const allAgents = agentRegistry.list();
                const agentInfos: AgentInfo[] = allAgents.map((agent) => ({
                  ...agent,
                  isDefault: agentRegistry.isDefault(agent.id),
                }));

                // Find the index of the edited agent (use new ID if renamed)
                const editedAgentIndex = agentInfos.findIndex((a) => a.id === newId);
                const selectedIndex =
                  editedAgentIndex >= 0 ? editedAgentIndex : (navigationState.preservedState?.selectedAgentIndex ?? 0);

                // Update navigation state to preserve selection on edited agent
                setNavigationState({
                  activeView: 'config',
                  navigationSource: null,
                  preservedState: {
                    selectedAgentId: newId ?? null,
                    selectedAgentIndex: selectedIndex,
                  },
                });
              } else {
                transitionToConfig();
              }

              setCreationMode(false);
              setCreationError(undefined);
              setCreationPreview(undefined);
              setEditingAgentId(null);
            } else {
              // Direct entry - close the command entirely
              setCreationMode(false);
              setCreationError(undefined);
              setCreationPreview(undefined);
              setEditingAgentId(null);
              deactivate();
            }
          } catch (error) {
            if (newRegistered) {
              agentRegistry.unregister(updatedAgent.id);
            }

            if (!agentRegistry.exists(editingAgentId)) {
              agentRegistry.register(originalAgent);
            }

            if (savedUpdatedFile && renamed) {
              try {
                await agentRegistry.deleteFromFile(updatedAgent.id);
              } catch (cleanupError) {
                console.error(
                  'Failed to remove updated agent file after edit error:',
                  cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                );
              }
            }

            if (renamed && removedOriginalFile) {
              try {
                await agentRegistry.saveToFile(originalAgent);
              } catch (restoreError) {
                console.error(
                  'Failed to restore original agent after edit error:',
                  restoreError instanceof Error ? restoreError.message : String(restoreError),
                );
              }
            }

            throw error;
          }
        } else {
          const completeAgent = agentRegistry.applyDefaults(previewToUse);
          agentRegistry.register(completeAgent);

          await agentRegistry.saveToFile(completeAgent);

          const currentConfig = (context.config.get('agentsEnabled') as Record<string, boolean>) || {};
          const updatedConfig = { ...currentConfig, [completeAgent.id]: true };
          await context.config.set('agentsEnabled', updatedConfig, 'global');
          setEnabledAgents(updatedConfig);

          const orchestratorAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
          if (orchestratorAwareTools?.setEnabledAgents) {
            orchestratorAwareTools.setEnabledAgents(updatedConfig);
          }

          // Reload agents list to get updated data
          const allAgents = agentRegistry.list();
          const agentInfos: AgentInfo[] = allAgents.map((agent) => ({
            ...agent,
            isDefault: agentRegistry.isDefault(agent.id),
          }));
          setAgents(agentInfos);

          // Check navigationSource to determine where to return
          if (navigationState.navigationSource === 'agent-config') {
            // Find the index of the newly created agent
            const newAgentIndex = agentInfos.findIndex((a) => a.id === completeAgent.id);
            const selectedIndex = newAgentIndex >= 0 ? newAgentIndex : 0;

            // Update navigation state to preserve selection on new agent
            setNavigationState({
              activeView: 'config',
              navigationSource: null,
              preservedState: {
                selectedAgentId: completeAgent.id,
                selectedAgentIndex: selectedIndex,
              },
            });

            setCreationMode(false);
            setCreationError(undefined);
            setCreationPreview(undefined);
          } else {
            // Direct entry - close the command entirely
            setCreationMode(false);
            setCreationError(undefined);
            setCreationPreview(undefined);
            deactivate();
          }
        }
      } catch (error) {
        setCreationError(`Failed to save agent: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setCreationLoading(false);
      }
    },
    [
      context.config,
      context.orchestrator,
      creationPreview,
      editingAgentId,
      loadAgents,
      navigationState.navigationSource,
      transitionToConfig,
      deactivate,
      navigationState.preservedState?.selectedAgentIndex,
    ],
  );

  // Show creation input if in creation mode
  if (creationMode) {
    return (
      <AgentCreation
        visible={true}
        mode={editingAgentId ? 'edit' : 'create'}
        onGenerate={handleCreationSubmit}
        onCancel={handleCreationCancel}
        onConfirm={handleCreationConfirm}
        onEditPreview={handlePreviewEdit}
        onUpdatePreview={handlePreviewUpdate}
        availableTools={availableTools}
        loading={creationLoading}
        error={creationError}
        preview={creationPreview}
        navigationSource={navigationState.navigationSource || 'direct'}
      />
    );
  }

  if (loading) {
    return (
      <AppModal
        visible={true}
        title="Agent Configuration"
        titleColor={theme.colors.primary}
        type="default"
        onClose={deactivate}
        closeOnEscape={true}
      >
        <Text color={theme.colors.warning}>Loading agents...</Text>
      </AppModal>
    );
  }

  if (error) {
    return (
      <AppModal
        visible={true}
        title="Agent Configuration"
        titleColor={theme.colors.error}
        type="error"
        onClose={deactivate}
        closeOnEscape={true}
      >
        <Text color={theme.colors.error}>{error}</Text>
      </AppModal>
    );
  }

  // Show Agent Configuration modal only when activeView is 'config'
  const showAgentModal = navigationState.activeView === 'config';

  // Calculate the initial selected index for restoration
  // If we have preserved state, use it; otherwise let the modal default to 0
  const initialSelectedIndex =
    navigationState.preservedState?.selectedAgentIndex !== undefined
      ? Math.min(navigationState.preservedState.selectedAgentIndex, Math.max(0, agents.length - 1))
      : undefined;

  return (
    <AgentModal
      visible={showAgentModal}
      agents={agents}
      enabledAgents={enabledAgents}
      initialSelectedIndex={initialSelectedIndex}
      onClose={deactivate}
      onAgentStatusChange={handleAgentStatusChange}
      onAgentBatchStatusChange={handleBatchAgentStatusChange}
      onAgentCreate={handleAgentCreate}
      onAgentDelete={handleAgentDelete}
      onAgentEdit={handleAgentEdit}
    />
  );
};

export function registerAgentCommand(registry: CommandRegistry) {
  registry.register({
    id: '/agent',
    type: 'component',
    description: 'Configure and manage specialist agents.',
    category: 'config',
    component: AgentCommandComponent,
  });
}
