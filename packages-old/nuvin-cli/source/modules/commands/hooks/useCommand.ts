import { useState, useEffect, useCallback, useMemo } from 'react';
import { eventBus } from '@/services/EventBus.js';
import { commandRegistry } from '@/modules/commands/registry.js';
import type { CommandDefinition, ActiveCommand, CommandContext } from '@/modules/commands/types.js';

interface UseCommandReturn {
  commands: CommandDefinition[];
  activeCommand: ActiveCommand | null;
  execute: (input: string) => Promise<void>;
  setActiveCommand: (commandId: string, context: CommandContext) => void;
  clearActiveCommand: () => void;
  refreshCommands: () => void;
}

export function useCommand(): UseCommandReturn {
  const [commands, setCommands] = useState<CommandDefinition[]>(() => commandRegistry.list({ includeHidden: false }));
  const [activeCommand, setActiveCommandState] = useState<ActiveCommand | null>(() => commandRegistry.getActive());

  const refreshCommands = useCallback(() => {
    setCommands(commandRegistry.list({ includeHidden: false }));
  }, []);

  useEffect(() => {
    const updateActiveCommand = () => {
      setActiveCommandState(commandRegistry.getActive());
    };

    const handleCommandsRefresh = () => {
      refreshCommands();
    };

    eventBus.on('ui:command:activated', updateActiveCommand);
    eventBus.on('ui:command:deactivated', updateActiveCommand);
    eventBus.on('ui:commands:refresh', handleCommandsRefresh);

    return () => {
      eventBus.off('ui:command:activated', updateActiveCommand);
      eventBus.off('ui:command:deactivated', updateActiveCommand);
      eventBus.off('ui:commands:refresh', handleCommandsRefresh);
    };
  }, [refreshCommands]);

  const execute = useCallback(async (input: string) => {
    await commandRegistry.execute(input);
  }, []);

  const setActiveCommand = useCallback((commandId: string, context: CommandContext) => {
    commandRegistry.setActive(commandId, context);
  }, []);

  const clearActiveCommand = useCallback(() => {
    commandRegistry.clearActive();
  }, []);

  return useMemo(
    () => ({
      commands,
      activeCommand,
      execute,
      setActiveCommand,
      clearActiveCommand,
      refreshCommands,
    }),
    [commands, activeCommand, execute, setActiveCommand, clearActiveCommand, refreshCommands],
  );
}
