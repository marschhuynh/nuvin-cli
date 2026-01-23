import { useCallback, useEffect, useState } from 'react';
import { Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import type { AgentTemplate, ToolPort, AgentAwareToolPort } from '@nuvin/nuvin-core';
import { AppModal } from '@/components/AppModal.js';
import AgentConfigurationModal, { type AgentInfo } from '@/components/AgentModal/AgentModal.js';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { AgentCreator } from '@/services/AgentCreator.js';
import AgentCreation from '@/components/AgentCreation/AgentCreation.js';

type NavigationSource = 'agent-config' | 'direct' | null;
type ActiveView = 'config' | 'edit' | 'none';

interface NavigationState {
  activeView: ActiveView;
  navigationSource: NavigationSource;
  preservedState: {
    selectedAgentName: string | null;
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
    (Partial<AgentTemplate> & { instructions: string }) | undefined
  >(undefined);
  const [editingAgentName, setEditingAgentName] = useState<string | null>(null);
  const [availableTools, setAvailableTools] = useState<string[]>([]);

  const [navigationState, setNavigationState] = useState<NavigationState>({
    activeView: 'config',
    navigationSource: null,
    preservedState: null,
  });

  const transitionToEdit = useCallback((agentName: string, source: NavigationSource, selectedAgentIndex: number) => {
    setNavigationState({
      activeView: 'edit',
      navigationSource: source,
      preservedState:
        source === 'agent-config'
          ? {
            selectedAgentName: agentName,
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
      const tools = context.orchestratorManager?.getOrchestrator()?.getTools?.();
      const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
      const agentRegistry = agentAwareTools?.getAgentRegistry?.();
      const enabledConfig = (context.config.get('agentsEnabled') as Record<string, boolean>) || {};

      if (!agentRegistry) {
        const debugInfo = [
          'Agent registry not available.',
          '',
          'Debug Info:',
          `- Orchestrator exists: ${!!context.orchestratorManager?.getOrchestrator()}`,
          `- getTools method exists: ${!!context.orchestratorManager?.getOrchestrator()?.getTools}`,
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
        isDefault: agentRegistry.isDefault(agent.name),
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
  }, [context.config, context.orchestratorManager?.getOrchestrator]);

  useEffect(() => {
    let cancelled = false;

    const loadAvailableTools = async () => {
      try {
        const toolsPort = context.orchestratorManager?.getOrchestrator()?.getTools?.();
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
  }, [context.orchestratorManager?.getOrchestrator]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const handleAgentStatusChange = useCallback(
    async (agentName: string, enabled: boolean) => {
      try {
        const currentConfig = (context.config.get('agentsEnabled') as Record<string, boolean>) || {};
        const updatedConfig = { ...currentConfig, [agentName]: enabled };

        await context.config.set('agentsEnabled', updatedConfig, 'global');
        setEnabledAgents(updatedConfig);

        const tools = context.orchestratorManager?.getOrchestrator()?.getTools?.();
        const orchestratorAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
        if (orchestratorAwareTools?.setEnabledAgents) {
          orchestratorAwareTools.setEnabledAgents(updatedConfig);
        }
      } catch (error) {
        console.error('Failed to save agent status:', error);
      }
    },
    [context.config, context.orchestratorManager?.getOrchestrator],
  );

  const handleAgentCreate = useCallback(() => {
    setEditingAgentName(null);
    setCreationMode(true);
    setCreationError(undefined);
    setCreationPreview(undefined);
    setCreationLoading(false);
  }, []);

  const handleAgentEdit = useCallback(
    (agentName: string) => {
      const tools = context.orchestratorManager?.getOrchestrator()?.getTools?.();
      const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
      const agentRegistry = agentAwareTools?.getAgentRegistry?.();

      if (!agentRegistry) {
        setError('Agent registry not available');
        return;
      }

      const agent = agentRegistry.get(agentName);
      if (!agent) {
        void loadAgents();
        return;
      }

      const selectedAgentIndex = agents.findIndex((a) => a.name === agentName);

      transitionToEdit(agentName, 'agent-config', selectedAgentIndex);

      setEditingAgentName(agentName);
      setCreationMode(true);
      setCreationError(undefined);
      setCreationPreview(agent);
      setCreationLoading(false);
    },
    [loadAgents, agents, transitionToEdit, context.orchestratorManager?.getOrchestrator],
  );

  const handleAgentDelete = useCallback(
    async (agentName: string) => {
      try {
        const tools = context.orchestratorManager?.getOrchestrator()?.getTools?.();
        const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
        const agentRegistry = agentAwareTools?.getAgentRegistry?.();

        if (!agentRegistry) {
          setError('Agent registry not available');
          return;
        }

        if (agentRegistry.isDefault(agentName)) {
          setError('Cannot delete default agents');
          return;
        }

        agentRegistry.unregister(agentName);
        await agentRegistry.deleteFromFile(agentName);

        await context.config.delete(`agentsEnabled.${agentName}`, 'global');

        const updatedConfig = (context.config.get('agentsEnabled') as Record<string, boolean>) || {};
        setEnabledAgents(updatedConfig);

        const orchestratorAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
        if (orchestratorAwareTools?.setEnabledAgents) {
          orchestratorAwareTools.setEnabledAgents(updatedConfig);
        }

        await loadAgents();

        transitionToConfig();
        setCreationMode(false);
        setCreationError(undefined);
        setCreationPreview(undefined);
        setEditingAgentName(null);
      } catch (error) {
        setError(`Failed to delete agent: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [context.config, loadAgents, context.orchestratorManager?.getOrchestrator, transitionToConfig],
  );

  const handleCreationSubmit = async (description: string) => {
    try {
      setCreationLoading(true);
      setCreationError(undefined);
      setEditingAgentName(null);

      const llm = context.orchestratorManager?.getOrchestrator()?.getLLM?.();
      const model = context.orchestratorManager?.getOrchestrator()?.getConfig?.()?.model || 'gpt-4';

      if (!llm) {
        setCreationError('LLM not available');
        setCreationLoading(false);
        return;
      }

      const agentCreator = new AgentCreator(llm);
      const result = await agentCreator.createAgent(description, model);

      if (!result.success || !result.agent) {
        setCreationError(result.error || 'Failed to create agent');
        setCreationLoading(false);
        return;
      }

      setCreationPreview(result.agent);
      setCreationLoading(false);
    } catch (error) {
      setCreationError(`Error creating agent: ${error instanceof Error ? error.message : String(error)}`);
      setCreationLoading(false);
    }
  };

  const handleCreationCancel = () => {
    if (navigationState.navigationSource === 'agent-config') {
      transitionToConfig();
      setCreationMode(false);
      setCreationError(undefined);
      setCreationPreview(undefined);
      setCreationLoading(false);
      setEditingAgentName(null);
    } else {
      setCreationMode(false);
      setCreationError(undefined);
      setCreationPreview(undefined);
      setCreationLoading(false);
      setEditingAgentName(null);
      deactivate();
    }
  };

  const handlePreviewEdit = () => {
    setCreationError(undefined);
  };

  const handlePreviewUpdate = (updatedPreview: Partial<AgentTemplate> & { instructions: string }) => {
    setCreationPreview(updatedPreview);
    setCreationError(undefined);
  };

  const handleCreationConfirm = useCallback(
    async (nextPreview?: Partial<AgentTemplate> & { instructions: string }) => {
      const previewToUse = nextPreview ?? creationPreview;
      if (!previewToUse) return;

      setCreationLoading(true);

      try {
        const tools = context.orchestratorManager?.getOrchestrator()?.getTools?.();
        const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
        const agentRegistry = agentAwareTools?.getAgentRegistry?.();

        if (!agentRegistry) {
          setError('Agent registry not available');
          return;
        }

        if (editingAgentName) {
          if (agentRegistry.isDefault(editingAgentName)) {
            setCreationError('Default agents cannot be edited');
            return;
          }

          const originalAgent = agentRegistry.get(editingAgentName);
          if (!originalAgent) {
            setCreationError('Agent not found. Please refresh and try again.');
            return;
          }

          const updatedAgent = agentRegistry.applyDefaults(previewToUse);
          const newName = updatedAgent.name;
          const renamed = newName !== editingAgentName;

          if (renamed && agentRegistry.exists(newName)) {
            setCreationError(`Agent with name "${newName}" already exists`);
            return;
          }

          const currentConfig = (context.config.get('agentsEnabled') as Record<string, boolean>) || {};
          const wasEnabled = currentConfig[editingAgentName] ?? true;
          const updatedConfig = { ...currentConfig };

          let newRegistered = false;
          let savedUpdatedFile = false;
          let removedOriginalFile = false;

          try {
            if (renamed) {
              agentRegistry.unregister(editingAgentName);
            }

            agentRegistry.register(updatedAgent);
            newRegistered = true;

            await agentRegistry.saveToFile(updatedAgent);
            savedUpdatedFile = true;

            if (renamed) {
              await agentRegistry.deleteFromFile(editingAgentName);
              removedOriginalFile = true;
            }

            if (renamed) {
              delete updatedConfig[editingAgentName];
            }
            if (newName) updatedConfig[newName] = wasEnabled ?? true;

            await context.config.set('agentsEnabled', updatedConfig, 'global');
            setEnabledAgents(updatedConfig);
            const orchestratorAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
            if (orchestratorAwareTools?.setEnabledAgents) {
              orchestratorAwareTools.setEnabledAgents(updatedConfig);
            }

            await loadAgents();

            if (navigationState.navigationSource === 'agent-config') {
              const tools = context.orchestratorManager?.getOrchestrator()?.getTools?.();
              const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
              const agentRegistry = agentAwareTools?.getAgentRegistry?.();
              if (agentRegistry) {
                const allAgents = agentRegistry.list();
                const agentInfos: AgentInfo[] = allAgents.map((agent) => ({
                  ...agent,
                  isDefault: agentRegistry.isDefault(agent.name),
                }));

                const editedAgentIndex = agentInfos.findIndex((a) => a.name === newName);
                const selectedIndex =
                  editedAgentIndex >= 0 ? editedAgentIndex : (navigationState.preservedState?.selectedAgentIndex ?? 0);

                setNavigationState({
                  activeView: 'config',
                  navigationSource: null,
                  preservedState: {
                    selectedAgentName: newName ?? null,
                    selectedAgentIndex: selectedIndex,
                  },
                });
              } else {
                transitionToConfig();
              }

              setCreationMode(false);
              setCreationError(undefined);
              setCreationPreview(undefined);
              setEditingAgentName(null);
            } else {
              setCreationMode(false);
              setCreationError(undefined);
              setCreationPreview(undefined);
              setEditingAgentName(null);
              deactivate();
            }
          } catch (error) {
            if (newRegistered) {
              agentRegistry.unregister(updatedAgent.name);
            }

            if (!agentRegistry.exists(editingAgentName)) {
              agentRegistry.register(originalAgent);
            }

            if (savedUpdatedFile && renamed) {
              try {
                await agentRegistry.deleteFromFile(updatedAgent.name);
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
          const updatedConfig = { ...currentConfig, [completeAgent.name]: true };
          await context.config.set('agentsEnabled', updatedConfig, 'global');
          setEnabledAgents(updatedConfig);

          const orchestratorAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
          if (orchestratorAwareTools?.setEnabledAgents) {
            orchestratorAwareTools.setEnabledAgents(updatedConfig);
          }

          const allAgents = agentRegistry.list();
          const agentInfos: AgentInfo[] = allAgents.map((agent) => ({
            ...agent,
            isDefault: agentRegistry.isDefault(agent.name),
          }));
          setAgents(agentInfos);

          if (navigationState.navigationSource === 'agent-config') {
            const newAgentIndex = agentInfos.findIndex((a) => a.name === completeAgent.name);
            const selectedIndex = newAgentIndex >= 0 ? newAgentIndex : 0;

            setNavigationState({
              activeView: 'config',
              navigationSource: null,
              preservedState: {
                selectedAgentName: completeAgent.name,
                selectedAgentIndex: selectedIndex,
              },
            });

            setCreationMode(false);
            setCreationError(undefined);
            setCreationPreview(undefined);
          } else {
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
      creationPreview,
      editingAgentName,
      loadAgents,
      navigationState.navigationSource,
      transitionToConfig,
      deactivate,
      navigationState.preservedState?.selectedAgentIndex,
      context.orchestratorManager?.getOrchestrator,
    ],
  );

  if (creationMode) {
    const editingAgent = editingAgentName ? agents.find((a) => a.name === editingAgentName) : null;
    const isEditingDefault = editingAgent?.isDefault ?? false;

    return (
      <AgentCreation
        visible={true}
        mode={editingAgentName ? 'edit' : 'create'}
        onGenerate={handleCreationSubmit}
        onCancel={handleCreationCancel}
        onConfirm={handleCreationConfirm}
        onEditPreview={handlePreviewEdit}
        onUpdatePreview={handlePreviewUpdate}
        onDelete={editingAgentName && !isEditingDefault ? () => handleAgentDelete(editingAgentName) : undefined}
        availableTools={availableTools}
        loading={creationLoading}
        error={creationError}
        preview={creationPreview}
        isDefault={isEditingDefault}
        navigationSource={navigationState.navigationSource || 'direct'}
      />
    );
  }

  if (loading) {
    return (
      <AppModal
        visible={true}
        title="Agent Configuration"
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

  const showAgentModal = navigationState.activeView === 'config';

  const initialSelectedIndex =
    navigationState.preservedState?.selectedAgentIndex !== undefined
      ? Math.min(navigationState.preservedState.selectedAgentIndex, Math.max(0, agents.length - 1))
      : undefined;

  return (
    <AgentConfigurationModal
      visible={showAgentModal}
      agents={agents}
      enabledAgents={enabledAgents}
      initialSelectedIndex={initialSelectedIndex}
      onClose={deactivate}
      onAgentStatusChange={handleAgentStatusChange}
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
