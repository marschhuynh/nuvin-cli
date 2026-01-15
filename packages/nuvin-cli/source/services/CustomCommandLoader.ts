import * as path from 'node:path';
import * as os from 'node:os';
import { eventBus } from '@/services/EventBus.js';
import { CustomCommandRegistry } from '@/services/CustomCommandRegistry.js';
import { ConfigManager } from '@/config/manager.js';
import { DEFAULT_PROFILE } from '@/config/profile-types.js';
import type { CommandRegistry, FunctionCommand } from '@/modules/commands/types.js';

let customCommandRegistry: CustomCommandRegistry | null = null;
const registeredCommandIds: Set<string> = new Set();

export function getCustomCommandRegistry(): CustomCommandRegistry | null {
  return customCommandRegistry;
}

export async function loadAndRegisterCustomCommands(commandRegistry: CommandRegistry): Promise<void> {
  try {
    const configManager = ConfigManager.getInstance();
    const globalDir = configManager.globalDir || path.join(os.homedir(), '.nuvin');
    const localDir = configManager.localDir || path.join(process.cwd(), '.nuvin');

    const profile = configManager.getCurrentProfile();
    const profileManager = configManager.getProfileManager();

    let profileDir: string | undefined;
    if (profile && profile !== DEFAULT_PROFILE && profileManager) {
      profileDir = profileManager.getProfileCommandsDir(profile);
    }

    customCommandRegistry = new CustomCommandRegistry({
      globalDir,
      profileDir,
      localDir,
      activeProfile: profile,
    });

    await customCommandRegistry.initialize();

    registerCustomCommandsToRegistry(commandRegistry);
  } catch (error) {
    console.warn('Failed to load custom commands:', error instanceof Error ? error.message : String(error));
  }
}

function registerCustomCommandsToRegistry(commandRegistry: CommandRegistry): void {
  if (!customCommandRegistry) return;

  for (const cmdId of registeredCommandIds) {
    const existing = commandRegistry.get(cmdId);
    if (existing && (existing as FunctionCommand & { isCustomCommand?: boolean }).isCustomCommand) {
      // We can't unregister, but the command will be overwritten
    }
  }
  registeredCommandIds.clear();

  const customCommands = customCommandRegistry.list({ includeHidden: false });

  for (const cmd of customCommands) {
    const commandId = `/${cmd.id}`;

    if (commandRegistry.get(commandId)) {
      continue;
    }

    const customCommand: FunctionCommand & { isCustomCommand?: boolean } = {
      id: commandId,
      type: 'function',
      description: cmd.description,
      category: 'custom',
      isCustomCommand: true,
      handler: async (ctx) => {
        if (!customCommandRegistry) return;

        const userInput = ctx.rawInput.replace(commandId, '').trim();
        const renderedPrompt = customCommandRegistry.renderPrompt(cmd.id, userInput);

        eventBus.emit('custom-command:execute', {
          commandId: cmd.id,
          renderedPrompt,
          userInput,
        });
      },
    };

    commandRegistry.register(customCommand);
    registeredCommandIds.add(commandId);
  }
}

export async function reloadCustomCommands(commandRegistry: CommandRegistry): Promise<void> {
  if (customCommandRegistry) {
    await customCommandRegistry.reload();
    registerCustomCommandsToRegistry(commandRegistry);
  } else {
    await loadAndRegisterCustomCommands(commandRegistry);
  }
}
