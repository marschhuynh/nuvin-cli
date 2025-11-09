import { useState, useEffect } from 'react';
import { eventBus } from '@/services/EventBus.js';
import { commandRegistry } from '@/modules/commands/registry.js';
import type { CommandDefinition, ActiveCommand, CommandContext } from '@/modules/commands/types.js';

interface UseCommandReturn {
  commands: CommandDefinition[];
  activeCommand: ActiveCommand | null;
  execute: (input: string) => Promise<void>;
  setActiveCommand: (commandId: string, context: CommandContext) => void;
  clearActiveCommand: () => void;
}

export function useCommand(): UseCommandReturn {
  const [commands, setCommands] = useState<CommandDefinition[]>([]);
  const [activeCommand, setActiveCommandState] = useState<ActiveCommand | null>(null);

  useEffect(() => {
    const updateCommands = () => {
      setCommands(commandRegistry.list({ includeHidden: false }));
    };

    const updateActiveCommand = () => {
      setActiveCommandState(commandRegistry.getActive());
    };

    // Initial load
    updateCommands();
    updateActiveCommand();

    // Listen for registry changes
    eventBus.on('ui:command:activated', updateActiveCommand);
    eventBus.on('ui:command:deactivated', updateActiveCommand);

    return () => {
      eventBus.off('ui:command:activated', updateActiveCommand);
      eventBus.off('ui:command:deactivated', updateActiveCommand);
    };
  }, []);

  const execute = async (input: string) => {
    await commandRegistry.execute(input);
  };

  const setActiveCommand = (commandId: string, context: CommandContext) => {
    commandRegistry.setActive(commandId, context);
  };

  const clearActiveCommand = () => {
    commandRegistry.clearActive();
  };

  return {
    commands,
    activeCommand,
    execute,
    setActiveCommand,
    clearActiveCommand,
  };
}
