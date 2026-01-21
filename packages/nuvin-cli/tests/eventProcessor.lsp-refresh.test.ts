import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import { AgentEventTypes, type ToolExecutionResult } from '@nuvin/nuvin-core';
import { processAgentEvent, initialEventProcessorState } from '../source/utils/eventProcessor.js';

const mockDiagnosticsForFile = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockIsEnabled = vi.hoisted(() => vi.fn(() => true));

vi.mock('../source/services/lsp/index.js', () => ({
  LSP: {
    isEnabled: mockIsEnabled,
    diagnosticsForFile: mockDiagnosticsForFile,
  },
}));

describe('eventProcessor LSP refresh', () => {
  beforeEach(() => {
    mockDiagnosticsForFile.mockClear();
  });

  it('triggers diagnostics after file_edit result', async () => {
    const toolResult = {
      id: 'tc-1',
      name: 'file_edit',
      status: 'success',
      type: 'text',
      result: 'ok',
      metadata: {
        path: 'src/demo.ts',
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        size: 1,
        eol: 'lf',
        oldTextLength: 1,
        newTextLength: 1,
        bytesWritten: 1,
        beforeSha: 'a',
        afterSha: 'b',
        dryRun: false,
        lineNumbers: {
          oldStartLine: 1,
          oldEndLine: 1,
          newStartLine: 1,
          newEndLine: 1,
          oldLineCount: 1,
          newLineCount: 1,
        },
      },
      durationMs: 10,
    } as ToolExecutionResult;

    const event = {
      type: AgentEventTypes.ToolResult,
      conversationId: 'conv-1',
      result: toolResult,
    };

    const nextState = processAgentEvent(event, initialEventProcessorState, {
      appendLine: vi.fn(),
    });

    if (nextState instanceof Promise) {
      await nextState;
    }

    expect(mockDiagnosticsForFile).toHaveBeenCalledWith(path.resolve(process.cwd(), 'src/demo.ts'));
  });

  it('triggers diagnostics after file_new result', async () => {
    const toolResult = {
      id: 'tc-2',
      name: 'file_new',
      status: 'success',
      type: 'text',
      result: 'ok',
      metadata: {
        file_path: 'src/new.ts',
        bytes: 10,
        lines: 1,
        created: new Date().toISOString(),
      },
      durationMs: 5,
    } as ToolExecutionResult;

    const event = {
      type: AgentEventTypes.ToolResult,
      conversationId: 'conv-1',
      result: toolResult,
    };

    const nextState = processAgentEvent(event, initialEventProcessorState, {
      appendLine: vi.fn(),
    });

    if (nextState instanceof Promise) {
      await nextState;
    }

    expect(mockDiagnosticsForFile).toHaveBeenCalledWith(path.resolve(process.cwd(), 'src/new.ts'));
  });
});
