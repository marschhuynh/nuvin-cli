import { startACPServer } from '@nuvin/nuvin-acp';
import { OrchestratorManager } from './services/OrchestratorManager.js';
import { ConfigManager } from './config/index.js';
import { eventBus } from './services/EventBus.js';
import type { AgentEvent } from '@nuvin/nuvin-core';

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

    const eventHandlers: Array<(event: AgentEvent) => void> = [];

    // Subscribe to agent events
    eventBus.on('agent:event', (event: AgentEvent) => {
      for (const handler of eventHandlers) {
        handler(event);
      }
    });

    return {
      sendMessage: async (text, options) => {
        await manager.send(text, {
          stream: options.stream,
        });
      },
      onEvent: (handler) => {
        eventHandlers.push(handler);
      },
      handleToolApproval: (approvalId, decision) => {
        manager.getOrchestrator()?.handleToolApproval(approvalId, decision === 'approve' ? 'approve' : 'deny');
      },
    };
  });
}
