import { commandRegistry } from '@/modules/commands/registry.js';

import { registerExitCommand } from './exit.js';
import { registerHelpCommand } from './help.js';
import { registerAuthCommand } from './auth/index.js';
import { registerHistoryCommand } from './history.js';
import { registerSudoCommand } from './sudo.js';
import { registerThinkingCommand } from './thinking.js';
import { registerModelsCommand } from './models/models.js';
import { registerExportCommand } from './export.js';
import { registerMCPCommand } from './mcp.js';
import { registerAgentCommand } from './agent.js';
import { registerClearCommand } from './clear.js';
import { registerNewCommand } from './new.js';
import { registerVimCommand } from './vim.js';
import { registerSummaryCommand } from './summary/index.js';

export function registerCommands() {
  registerExitCommand(commandRegistry);
  registerHelpCommand(commandRegistry);
  registerAuthCommand(commandRegistry);
  registerHistoryCommand(commandRegistry);
  registerSudoCommand(commandRegistry);
  registerThinkingCommand(commandRegistry);
  registerModelsCommand(commandRegistry);
  registerExportCommand(commandRegistry);
  registerMCPCommand(commandRegistry);
  registerAgentCommand(commandRegistry);
  registerClearCommand(commandRegistry);
  registerNewCommand(commandRegistry);
  registerVimCommand(commandRegistry);
  registerSummaryCommand(commandRegistry);
}
