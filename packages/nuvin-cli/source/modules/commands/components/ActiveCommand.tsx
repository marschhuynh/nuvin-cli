import { useCommand } from '@/modules/commands/hooks/useCommand.js';

export function ActiveCommand() {
  const { activeCommand, clearActiveCommand } = useCommand();

  if (!activeCommand) return null;

  const { command, context } = activeCommand;

  return <command.component context={context} deactivate={clearActiveCommand} isActive />;
}
