import { useCallback } from 'react';
import * as crypto from 'node:crypto';
import type { UserMessagePayload } from '@nuvin/nuvin-core';

import { commandRegistry } from '@/modules/commands/registry.js';
import { prepareUserSubmission } from '@/utils/userSubmission.js';
import type { MessageLine } from '@/adapters/index.js';

export function useHandleSubmit(deps: {
  appendLine: (line: MessageLine) => void;
  handleError: (message: string) => void;
  executeCommand: (input: string) => Promise<void>;
  processMessage: (submission: UserMessagePayload) => Promise<void>;
}) {
  const { appendLine, handleError, executeCommand, processMessage } = deps;

  return useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('/')) {
        const commandId = trimmed.split(' ')[0];
        const def = commandRegistry.get(commandId);
        const isModalCommand = !!def && def.type === 'component';

        if (!isModalCommand) {
          appendLine({
            id: crypto.randomUUID(),
            type: 'user',
            content: trimmed,
            metadata: { timestamp: new Date().toISOString() },
            color: 'cyan',
          });
        }

        if (trimmed !== '/') {
          if (def) {
            try {
              await executeCommand(trimmed);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              handleError(`Command failed: ${message}`);
            }
            return;
          } else {
            appendLine({
              id: crypto.randomUUID(),
              type: 'error',
              content: `! Unknown command: ${commandId}`,
              metadata: { timestamp: new Date().toISOString() },
              color: 'red',
            });
            appendLine({
              id: crypto.randomUUID(),
              type: 'info',
              content: 'Type /help to see available commands',
              metadata: { timestamp: new Date().toISOString() },
              color: 'gray',
            });
            return;
          }
        }
      }

      let submission: UserMessagePayload;
      try {
        const clipboardFiles = globalThis.__clipboardFiles ?? [];
        submission = await prepareUserSubmission(trimmed, clipboardFiles);
        globalThis.__clipboardFiles = undefined;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        handleError(message);
        return;
      }

      await processMessage(submission);
    },
    [appendLine, handleError, executeCommand, processMessage],
  );
}
