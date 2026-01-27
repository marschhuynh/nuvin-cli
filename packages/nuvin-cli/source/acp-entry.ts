import { startACPServer } from '@nuvin/nuvin-acp';
import { OrchestratorManager } from './services/OrchestratorManager.js';
import { ConfigManager } from './config/index.js';
import { eventBus } from './services/EventBus.js';
import type { AgentEvent } from '@nuvin/nuvin-core';
import { AgentEventTypes } from '@nuvin/nuvin-core';
import { commandRegistry } from './modules/commands/registry.js';
import { registerCommands } from './modules/commands/definitions/index.js';
import { getCustomCommandRegistry } from './services/CustomCommandLoader.js';
import type { CommandContext, FunctionCommand } from './modules/commands/types.js';

export async function runACPMode(): Promise<void> {
  const configManager = ConfigManager.getInstance();
  await configManager.load({});

  await startACPServer(async (session) => {
    const manager = new OrchestratorManager();

    // Initialize with session config
    await manager.init(
      {
        sessionId: session.id,
        memPersist: false,
        streamingChunks: true,
      },
      {
        appendLine: () => {},
        updateLine: () => {},
        updateLineMetadata: () => {},
        handleError: () => {},
      },
    );

    // Change working directory
    process.chdir(session.cwd);

    // Register commands (built-in and custom)
    await registerCommands(manager);

    const eventHandlers: Array<(event: AgentEvent) => void> = [];

    // Gather available commands
    const allCommands: Array<{ id: string; description: string; requiresInput?: boolean }> = [];

    // Get built-in commands with error handling
    try {
      const builtInCommands = commandRegistry.list({ includeHidden: false });
      for (const cmd of builtInCommands) {
        // Skip component commands that are modal/UI-based (not suitable for slash commands)
        if (cmd.type === 'component') continue;

        // Strip the leading '/' from command IDs for ACP protocol
        // Commands are stored as '/exit' but should be advertised as 'exit'
        const commandName = cmd.id.startsWith('/') ? cmd.id.slice(1) : cmd.id;
        
        allCommands.push({
          id: commandName,
          description: cmd.description,
          requiresInput: false, // Built-in commands typically don't require input
        });
      }
    } catch (error) {
      console.warn('Failed to gather built-in commands:', error);
    }

    // Get custom commands with error handling
    try {
      const customRegistry = getCustomCommandRegistry();
      if (customRegistry) {
        const customCommands = customRegistry.list({ includeHidden: false });
        for (const cmd of customCommands) {
          if (cmd.enabled) {
            // Custom command IDs should NOT have '/' prefix in ACP protocol
            // The slash is part of invocation syntax, not the command name
            allCommands.push({
              id: cmd.id,
              description: cmd.description,
              requiresInput: true, // Custom commands typically need context
            });
          }
        }
      }
    } catch (error) {
      console.warn('Failed to gather custom commands:', error);
    }

    // Subscribe to agent events
    eventBus.on('agent:event', (event: AgentEvent) => {
      for (const handler of eventHandlers) {
        handler(event);
      }
    });

    return {
      sendMessage: async (text, options) => {
        // Check if this is a slash command
        if (text.trim().startsWith('/')) {
          const match = text.match(/^\/([a-z][a-z0-9_-]*)\s*(.*)/);
          if (match) {
            const [, commandId, input] = match;

            // Check custom commands FIRST (before built-in)
            // Custom commands are registered in commandRegistry but need special handling
            const customRegistry = getCustomCommandRegistry();
            const customCmd = customRegistry?.get(commandId); // commandId is without /
            if (customCmd && customRegistry) {
              // Render custom command prompt with input
              const renderedPrompt = customRegistry.renderPrompt(commandId, input);
              if (renderedPrompt) {
                try {
                  await manager.send(renderedPrompt, { stream: options.stream });
                } catch (error) {
                  console.error(`Failed to execute custom command '${commandId}':`, error);
                }
              }
              return;
            }

            // Check if command exists in built-in registry (commands are stored with / prefix)
            const builtIn = commandRegistry.get(`/${commandId}`);
            if (builtIn) {
              // Skip custom commands (already handled above)
              if ((builtIn as any).isCustomCommand) {
                // Should not reach here since we handle custom commands first
                console.warn(`Custom command '${commandId}' not handled by custom registry`);
              } else if (builtIn.type === 'function') {
                const fnCmd = builtIn as FunctionCommand;
                try {
                  // Create command context for the handler
                  const ctx: CommandContext = {
                    rawInput: text,
                    eventBus,
                    registry: commandRegistry,
                    config: {
                      get: <T>(key: string, scope?: string) => configManager.get(key, scope as any) as T | undefined,
                      set: (key: string, value: unknown, scope?: string) => configManager.set(key, value, scope as any),
                      delete: (key: string, scope?: string) => configManager.delete(key, scope as any),
                    },
                    orchestratorManager: manager,
                  };

                  // Execute the command handler
                  await fnCmd.handler(ctx);
                  return;
                } catch (error) {
                  console.error(`Failed to execute built-in command '${commandId}':`, error);
                  // Fall through to send as regular message
                }
              } else {
                // Component commands (UI-based) not supported in ACP mode
                console.warn(`Component command '${commandId}' not supported in ACP mode, sending as regular message`);
              }
            }

            // Command not found, send as regular message
            try {
              await manager.send(text, { stream: options.stream });
            } catch (error) {
              console.error('Failed to send message:', error);
            }
            return;
          }
        }

        // Regular message
        try {
          await manager.send(text, { stream: options.stream });
        } catch (error) {
          console.error('Failed to send message:', error);
        }
      },
      onEvent: (handler) => {
        eventHandlers.push(handler);

        // CRITICAL: Emit CommandsAvailable event AFTER the first handler is registered
        // Node's EventEmitter doesn't buffer events, so emitting before registration
        // causes the event to be lost. Using setImmediate ensures the event is sent
        // on the next tick, after the ACP server completes its setup.
        if (eventHandlers.length === 1) {
          setImmediate(() => {
            eventBus.emit('agent:event', {
              type: AgentEventTypes.CommandsAvailable,
              commands: allCommands,
            });
          });
        }
      },
      handleToolApproval: (approvalId, decision) => {
        manager.getOrchestrator()?.handleToolApproval(approvalId, decision === 'approve' ? 'approve' : 'deny');
      },
    };
  });
}
