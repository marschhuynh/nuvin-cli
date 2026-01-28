import { useCallback, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import type { ToolPort, AgentAwareToolPort } from '@nuvin/nuvin-core';
import { AppModal } from '@/components/AppModal.js';
import { AgentList } from '@/components/AgentModal/AgentList.js';
import type { AgentInfo } from '@/components/AgentModal/AgentModal.js';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { HelpText } from '@/components/HelpText.js';
import * as crypto from 'node:crypto';

const MODAL_HEIGHT = 30;

const SwapCommandComponent = ({ context, deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);

  // Load agents from AgentRegistry
  const loadAgents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const tools = context.orchestratorManager?.getOrchestrator()?.getTools?.();
      const agentAwareTools = tools as (ToolPort & AgentAwareToolPort) | undefined;
      const agentRegistry = agentAwareTools?.getAgentRegistry?.();

      if (!agentRegistry) {
        setError('Agent registry not available. Please restart the CLI and try again.');
        setAgents([]);
        return;
      }

      const allAgents = agentRegistry.list();
      const agentInfos: AgentInfo[] = allAgents.map((agent) => ({
        ...agent,
        isDefault: agentRegistry.isDefault(agent.name),
      }));

      setAgents(agentInfos);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load agents: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [context.orchestratorManager]);

  // Load agents on mount
  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  // Handle escape key to close
  useInput(
    (_input, key) => {
      if (key.escape) {
        deactivate();
      }
    },
    { isActive: !isSwapping },
  );

  // Handle agent swap
  const handleSwap = useCallback(
    async (agentId: string) => {
      if (isSwapping) return;

      setIsSwapping(true);
      setError(null);

      try {
        if (agentId === 'main') {
          await context.orchestratorManager?.swapToMain();
        } else {
          await context.orchestratorManager?.swapToAgent(agentId);
        }

        // Emit info line for success message
        context.eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'info' as const,
          content: `Swapped to ${agentId === 'main' ? 'main agent' : agentId}`,
          metadata: { timestamp: new Date().toISOString() },
        });

        // Close after a brief delay
        setTimeout(() => {
          deactivate();
        }, 100);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Failed to swap agent: ${message}`);
        setIsSwapping(false);
      }
    },
    [context.orchestratorManager, isSwapping, deactivate, context.eventBus],
  );

  // Calculate modal height based on terminal size
  const modalHeight = Math.min(MODAL_HEIGHT, rows - 4);

  // Footer with help text
  const footerContent = (
    <Box marginLeft={1} flexGrow={1} marginRight={1} flexShrink={0}>
      <HelpText
        segments={[
          { text: '↑↓', highlight: true },
          { text: ' navigate • ' },
          { text: 'Enter', highlight: true },
          { text: ' swap • ' },
          { text: 'ESC', highlight: true },
          { text: ' exit' },
        ]}
      />
    </Box>
  );

  // Show loading state
  if (loading) {
    return (
      <AppModal visible={true} title="Swap Agent" onClose={deactivate} closeOnEscape={true} footer={footerContent}>
        <Text color={theme.colors.warning}>Loading agents...</Text>
      </AppModal>
    );
  }

  // Show error state
  if (error) {
    return (
      <AppModal
        visible={true}
        title="Swap Agent"
        titleColor={theme.colors.error}
        type="error"
        onClose={deactivate}
        closeOnEscape={true}
        footer={footerContent}
      >
        <Text color={theme.colors.error}>{error}</Text>
      </AppModal>
    );
  }

  return (
    <AppModal
      visible={true}
      title="Swap Agent"
      onClose={deactivate}
      closeOnEscape={true}
      closeOnEnter={false}
      paddingX={1}
      paddingY={0}
      footer={footerContent}
      height={modalHeight}
    >
      <AgentList
        agents={[
          {
            name: 'main',
            description: 'Default main agent',
            instructions: '',
            allowed_tools: [],
            temperature: 0.7,
            isDefault: true,
          },
          ...agents,
        ]}
        isAgentEnabled={() => true}
        onAgentSelect={() => {}}
        onToggle={() => {}}
        onEdit={(agentId: string) => {
          void handleSwap(agentId);
        }}
        showStatus={false}
        flexGrow={1}
        focus={true}
      />
    </AppModal>
  );
};

export function registerSwapCommand(registry: CommandRegistry) {
  registry.register({
    id: '/swap',
    type: 'component',
    description: 'Swap to a different agent: /swap [main|<agent-id>]',
    category: 'session',
    component: SwapCommandComponent,
    createState({ rawInput }) {
      const parts = rawInput.trim().split(/\s+/);
      const arg = parts.slice(1).join(' ').trim();
      return { arg };
    },
    async handler({ rawInput, orchestratorManager, eventBus }) {
      const parts = rawInput.trim().split(/\s+/);
      const arg = parts.slice(1).join(' ').trim();

      if (!arg) {
        // No argument provided - let the component handle it by showing the modal
        return;
      }

      try {
        if (arg === 'main') {
          await orchestratorManager?.swapToMain();
          eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'info' as const,
            content: 'Swapped to main agent',
            metadata: { timestamp: new Date().toISOString() },
          });
        } else {
          await orchestratorManager?.swapToAgent(arg);
          eventBus.emit('ui:line', {
            id: crypto.randomUUID(),
            type: 'info' as const,
            content: `Swapped to agent: ${arg}`,
            metadata: { timestamp: new Date().toISOString() },
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'error' as const,
          content: `Failed to swap agent: ${message}`,
          metadata: { timestamp: new Date().toISOString() },
        });
      }
    },
  });
}
