import { startACPServer } from '@nuvin/nuvin-acp';
import { OrchestratorManager } from './services/OrchestratorManager.js';
import { ConfigManager } from './config/index.js';
import { eventBus } from './services/EventBus.js';
import type { AgentEvent, ToolCall } from '@nuvin/nuvin-core';
import { AgentEventTypes, ErrorReason } from '@nuvin/nuvin-core';
import { commandRegistry } from './modules/commands/registry.js';
import { registerCommands } from './modules/commands/definitions/index.js';
import { getCustomCommandRegistry } from './services/CustomCommandLoader.js';
import type { CommandContext, FunctionCommand } from './modules/commands/types.js';

export async function runACPMode(): Promise<void> {
  const configManager = ConfigManager.getInstance();
  await configManager.load({});

  // Utility functions for tool approval
  function generateApprovalId(): string {
    return `approval_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  function generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

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

    // Track pending approvals
    const pendingApprovals = new Map<string, (decision: 'approve' | 'deny') => void>();

    // Wrap tool execution to request approval for tools in ACP mode
    const orchestrator = manager.getOrchestrator();
    if (orchestrator) {
      const tools = orchestrator.getTools();
      const originalExecuteToolCalls = tools.executeToolCalls.bind(tools);

      // Helper to convert ToolInvocation to ToolCall format
      function toToolCall(invocation: any): ToolCall {
        return {
          id: invocation.id,
          type: 'function',
          function: {
            name: invocation.name,
            arguments: JSON.stringify(invocation.parameters),
          },
          editInstruction: invocation.editInstruction,
        };
      }

      tools.executeToolCalls = async (calls, context, maxConcurrent, signal) => {
        // For each tool call, request approval before executing
        const approvalPromises = calls.map(async (call) => {
          const approvalId = generateApprovalId();

          // Convert ToolInvocation to ToolCall format for the event
          const toolCall: ToolCall = toToolCall(call);

          // Emit ToolApprovalRequired event
          eventBus.emit('agent:event', {
            type: AgentEventTypes.ToolApprovalRequired,
            conversationId: manager.getConversationContext().getActiveConversationId(),
            messageId: generateMessageId(),
            toolCalls: [toolCall],
            approvalId,
          } as AgentEvent);

          // Wait for handleToolApproval to be called
          const decision = await new Promise<'approve' | 'deny'>((resolve) => {
            // Set up timeout to reject if no response
            const timeout = setTimeout(() => {
              pendingApprovals.delete(approvalId);
              resolve('deny'); // Default to deny on timeout
            }, 30000); // 30 second timeout

            // Store resolver that will be called by handleToolApproval
            pendingApprovals.set(approvalId, (decision) => {
              clearTimeout(timeout);
              resolve(decision);
            });
          });

          return { call, decision, approvalId };
        });

        const approvals = await Promise.all(approvalPromises);

        // Filter out denied calls and execute approved ones
        const approvedCalls = approvals.filter((a) => a.decision === 'approve').map((a) => a.call);

        // If all calls were denied, return error results
        if (approvedCalls.length === 0) {
          return approvals.map((a) => ({
            id: a.call.id,
            name: a.call.name,
            status: 'error' as const,
            type: 'text' as const,
            result: `Tool execution denied: ${a.call.name}`,
            metadata: { errorReason: ErrorReason.Denied },
            durationMs: 0,
          }));
        }

        // Execute only approved calls
        const results = await originalExecuteToolCalls(approvedCalls, context, maxConcurrent, signal);

        // Add error results for denied calls
        const deniedResults = approvals
          .filter((a) => a.decision === 'deny')
          .map((a) => ({
            id: a.call.id,
            name: a.call.name,
            status: 'error' as const,
            type: 'text' as const,
            result: `Tool execution denied: ${a.call.name}`,
            metadata: { errorReason: ErrorReason.Denied },
            durationMs: 0,
          }));

        return [...results, ...deniedResults];
      };
    }

    const eventHandlers: Array<(event: AgentEvent) => void> = [];

    // Gather available commands
    const allCommands: Array<{ name: string; description: string; requiresInput?: boolean }> = [];

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
          name: commandName,
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
              name: cmd.id,
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
        // Resolve the pending approval promise
        const resolver = pendingApprovals.get(approvalId);
        if (resolver) {
          resolver(decision === 'approve' ? 'approve' : 'deny');
          pendingApprovals.delete(approvalId);
        }

        // Also call the orchestrator's handleToolApproval for compatibility
        manager.getOrchestrator()?.handleToolApproval(approvalId, decision === 'approve' ? 'approve' : 'deny');
      },
    };
  });
}
