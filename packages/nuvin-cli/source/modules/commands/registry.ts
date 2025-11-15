import type { MemoryPort, Message } from '@nuvin/nuvin-core';
import { eventBus } from '@/services/EventBus.js';
import type { OrchestratorManager } from '@/services/OrchestratorManager.js';
import type {
  CommandDefinition,
  CommandContext,
  CommandExecutionResult,
  ActiveCommand,
  CommandRegistry as ICommandRegistry,
} from './types.js';

export class CommandRegistry implements ICommandRegistry {
  private commands = new Map<string, CommandDefinition>();
  private activeCommand: ActiveCommand | null = null;
  private configFunctions: CommandContext['config'] | null = null;
  private memory: MemoryPort<Message> | null = null;
  private orchestrator: OrchestratorManager | null = null;

  register(command: CommandDefinition): void {
    this.commands.set(command.id, command);

    // Run initialize hook if present
    if (command.initialize) {
      const context = this.createContext(command.id);
      command.initialize(context);
    }
  }

  get(id: string): CommandDefinition | undefined {
    return this.commands.get(id);
  }

  find(predicate: (cmd: CommandDefinition) => boolean): CommandDefinition[] {
    return Array.from(this.commands.values()).filter(predicate);
  }

  list(options: { includeHidden?: boolean } = {}): CommandDefinition[] {
    const commands = Array.from(this.commands.values());

    if (!options.includeHidden) {
      return commands.filter((cmd) => {
        if (!cmd.visible) return true;
        const context = this.createContext(cmd.id);
        return cmd.visible(context);
      });
    }

    return commands;
  }

  async execute(input: string): Promise<CommandExecutionResult> {
    try {
      const commandId = input.trim().split(' ')[0];
      const command = this.get(commandId);

      if (!command) {
        eventBus.emit('ui:error', `Unknown command: ${commandId}`);
        return { success: false, commandId, error: new Error(`Unknown command: ${commandId}`) };
      }

      const context = this.createContext(input);

      // Run beforeInvoke hook
      if (command.beforeInvoke) {
        await command.beforeInvoke(context);
      }

      // Execute command
      if (command.type === 'function') {
        await command.handler(context);
        if (command.afterInvoke) {
          await command.afterInvoke(context);
        }
        return { success: true, commandId };
      } else {
        // Component command - check if it has a handler for arguments
        if (command.handler) {
          const parts = input.trim().split(/\s+/);
          const hasArgs = parts.length > 1;

          if (hasArgs) {
            await command.handler(context);
            if (command.afterInvoke) {
              await command.afterInvoke(context);
            }
            return { success: true, commandId };
          }
        }

        // Show component if no handler or no arguments
        this.setActive(commandId, context);
        return { success: true, commandId };
      }
    } catch (error) {
      const commandId = input.trim().split(' ')[0];
      eventBus.emit('ui:error', `Command error: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, commandId, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  setActive(commandId: string, context: CommandContext): void {
    const command = this.get(commandId);
    if (!command || command.type !== 'component') return;

    // Clear current active command if any
    if (this.activeCommand) {
      this.clearActive();
    }

    const state = command.createState ? command.createState(context) : undefined;
    this.activeCommand = {
      command,
      context,
      state,
    };

    eventBus.emit('ui:command:activated', commandId);
  }

  clearActive(): void {
    if (!this.activeCommand) return;

    const { command, context } = this.activeCommand;

    // Run onExit hook for component commands
    if (command.onExit) {
      try {
        command.onExit(context);
      } catch (error) {
        console.error('Error in command onExit hook:', error);
      }
    }

    // Run afterInvoke hook
    if (command.afterInvoke) {
      try {
        command.afterInvoke(context);
      } catch (error) {
        console.error('Error in command afterInvoke hook:', error);
      }
    }

    this.activeCommand = null;
    eventBus.emit('ui:command:deactivated', command.id);
  }

  getActive(): ActiveCommand | null {
    return this.activeCommand;
  }

  isCommandActive(id: string): boolean {
    return this.activeCommand?.command.id === id;
  }

  setConfigFunctions(configFunctions: CommandContext['config']): void {
    this.configFunctions = configFunctions;
  }

  setMemory(memory: MemoryPort<Message> | null): void {
    this.memory = memory;
  }

  setOrchestrator(orchestrator: OrchestratorManager): void {
    this.orchestrator = orchestrator;
  }

  private createContext(input: string): CommandContext {
    if (!this.configFunctions) {
      throw new Error('Config functions not set. Call setConfigFunctions first.');
    }

    return {
      rawInput: input,
      eventBus,
      registry: this,
      config: this.configFunctions,
      memory: this.memory,
      orchestrator: this.orchestrator,
    };
  }
}

export const commandRegistry = new CommandRegistry();
