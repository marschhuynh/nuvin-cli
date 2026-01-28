import { startACPServer } from '@nuvin/nuvin-acp';
import { orchestratorManager as manager } from './services/OrchestratorManager.js';
import type { MCPServerManager } from './services/MCPServerManager.js';
import { ConfigManager, type ConfigScope } from './config/index.js';
import { eventBus } from './services/EventBus.js';
import type { AgentEvent } from '@nuvin/nuvin-core';
import { AgentEventTypes } from '@nuvin/nuvin-core';
import { commandRegistry } from './modules/commands/registry.js';
import { getCustomCommandRegistry } from './services/CustomCommandLoader.js';
import type { CommandContext, FunctionCommand } from './modules/commands/types.js';

export async function runACPMode(): Promise<void> {

  // Utility functions for tool approval
  // generateApprovalId and generateMessageId removed as they are no longer needed

  await startACPServer(async (session) => {
    // Initialize with session config - force session ID for ACP
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

    // Register commands (built-in and custom) - ALREADY DONE IN CLI.TSX
    // await registerCommands(manager);

    // Wait for MCP servers to finish initializing (they start in background)
    // We need to wrap tools AFTER MCP servers are registered, otherwise
    // the CompositeToolPort will replace our wrapped tools
    const maxWaitTime = 5000; // Wait up to 5 seconds
    const checkInterval = 100; // Check every 100ms
    let waited = 0;
    while (waited < maxWaitTime) {
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property
      const mcpManager = (manager as unknown as Record<string, MCPServerManager | null>)['mcpManager'];
      if (mcpManager) {
        const servers = mcpManager.getAllServers();
        // Check if all servers are either connected or failed (not in "pending" state)
        const allDone = Object.values(servers).every((s) => s.status === 'connected' || s.status === 'failed');
        if (allDone) {
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }
    if (waited >= maxWaitTime) {
      // MCP initialization timeout - proceeding anyway
    }

    // Track pending approvals - NO LONGER NEEDED as AgentOrchestrator handles this
    // const pendingApprovals = new Map<string, (decision: 'approve' | 'deny') => void>();

    const eventHandlers: Array<(event: AgentEvent) => void> = [];

    // Gather available commands
    const allCommands: Array<{
      id: string;
      description: string;
      requiresInput?: boolean;
    }> = [];

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

      // Forward to all eventHandlers (including ACP server's handler)
      for (const handler of eventHandlers) {
        try {
          handler(event);
        } catch (_error) {
          // Error in event handler
        }
      }
    });

    return {
      sendMessage: async (text: string, options: { stream: boolean; signal?: AbortSignal }) => {
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
                  await manager.send(renderedPrompt, {
                    stream: options.stream,
                  });
                } catch (error) {
                  console.error(`Failed to execute custom command '${commandId}':`, error);
                }
              }
              return;
            }

            // Check if command exists in built-in registry (commands are stored with / prefix)
            const builtIn = commandRegistry.get(`/${commandId}`);
            if (builtIn) {
              if (builtIn.type === 'function') {
                const fnCmd = builtIn as FunctionCommand;
                try {
                  // Create command context for the handler
                  const ctx: CommandContext = {
                    rawInput: text,
                    eventBus,
                    registry: commandRegistry,
                    config: {
                      get: <T>(key: string, scope?: ConfigScope) =>
                        ConfigManager.getInstance().get(key, scope) as T | undefined,
                      set: (key: string, value: unknown, scope?: ConfigScope) =>
                        ConfigManager.getInstance().set(key, value, scope as ConfigScope),
                      delete: (key: string, scope?: ConfigScope) => ConfigManager.getInstance().delete(key, scope),
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
      onEvent: (handler: (event: AgentEvent) => void) => {
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
        // Call the REAL orchestrator's handleToolApproval
        const agentOrchestrator = manager.getOrchestrator();
        if (agentOrchestrator) {
          try {
            // Map 'approve' | 'deny' from ACP to ToolApprovalDecision
            agentOrchestrator.handleToolApproval(approvalId, decision === 'approve' ? 'approve' : 'deny');
          } catch (_error) {
            // Error forwarding approval
          }
        }
      },
    };
  });
}
