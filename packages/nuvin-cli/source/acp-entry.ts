import { startACPServer } from '@nuvin/nuvin-acp';
import { OrchestratorManager } from './services/OrchestratorManager.js';
import { ConfigManager } from './config/index.js';
import { eventBus } from './services/EventBus.js';
import type { AgentEvent } from '@nuvin/nuvin-core';
import { AgentEventTypes } from '@nuvin/nuvin-core';
import { commandRegistry } from './modules/commands/registry.js';
import { registerCommands } from './modules/commands/definitions/index.js';
import { getCustomCommandRegistry } from './services/CustomCommandLoader.js';

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

        // Note: Built-in commands use bare IDs (e.g., "help", "exit")
        // while custom commands are prefixed with "/" (e.g., "/mycommand")
        // This maintains consistency with existing command invocation patterns
        allCommands.push({
          id: cmd.id,
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
            allCommands.push({
              id: `/${cmd.id}`,
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

            // Check if command exists in built-in registry (commands are stored with / prefix)
            const builtIn = commandRegistry.get(`/${commandId}`);
            if (builtIn) {
              // Execute built-in command
              // Note: Built-in commands typically use React UI, may need adaptation
              // For ACP mode, we send a descriptive message to the LLM to handle the command intent
              try {
                await manager.send(
                  `Execute the ${commandId} command${input ? ` with: ${input}` : ''}`,
                  { stream: options.stream },
                );
              } catch (error) {
                console.error(`Failed to execute built-in command '${commandId}':`, error);
              }
              return;
            }

            // Check custom commands (custom registry stores IDs without / prefix)
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
