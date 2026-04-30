import { ErrorReason } from '../ports.js';
import type { ToolExecutionContext, ExecResultError } from './types.js';
import type { AssignResult, AssignTool } from './AssignTool.js';
import { err } from './result-helpers.js';
import { AssignAliasTool } from './AssignAliasTool.js';

export type MemoryExtractToolInput = {
  scope?: 'project' | 'global';
  maxMessages?: number;
  minSimilarityScore?: number;
};

export type MemoryExtractToolResult = AssignResult;

export type MemoryExtractionTaskBuilder = (
  input: MemoryExtractToolInput,
  context?: ToolExecutionContext,
) => Promise<{ task: string; description?: string }>;

const memoryExtractParameters = {
  type: 'object',
  properties: {
    scope: {
      type: 'string',
      enum: ['project', 'global'],
      description: 'Scope to persist extracted memories into. Defaults to "project".',
    },
    maxMessages: {
      type: 'number',
      description: 'Maximum recent messages to analyze from the current conversation. Defaults to 12.',
    },
    minSimilarityScore: {
      type: 'number',
      description: 'Minimum similarity score when consolidating into existing memories. Defaults to 0.35.',
    },
  },
  required: [],
} as const;

const memoryExtractDescription =
  'Run memory extraction as an explicit, approval-required operation. ' +
  'Delegates to an internal specialist that analyzes recent conversation, queries existing memories to avoid duplicates, ' +
  'and persists only genuinely new or updated facts. ' +
  'Use after major decisions, user preference changes, or when the conversation produced durable knowledge worth recalling later. ' +
  'The specialist handles deduplication — do NOT call memory_save for the same facts before or after calling this tool.';

function validateMemoryExtractInput(input: MemoryExtractToolInput): ExecResultError | null {
  if (input.maxMessages !== undefined) {
    if (!Number.isFinite(input.maxMessages) || Math.floor(input.maxMessages) <= 0) {
      return err('Parameter "maxMessages" must be a positive integer.', undefined, ErrorReason.InvalidInput);
    }
  }
  if (input.minSimilarityScore !== undefined) {
    if (!Number.isFinite(input.minSimilarityScore) || input.minSimilarityScore < 0) {
      return err('Parameter "minSimilarityScore" must be a non-negative number.', undefined, ErrorReason.InvalidInput);
    }
  }
  return null;
}

export class MemoryExtractionTool extends AssignAliasTool<MemoryExtractToolInput> {
  constructor(
    getAssignTool: () => AssignTool | undefined,
    buildTask: MemoryExtractionTaskBuilder,
    hiddenAgentName: string,
  ) {
    super({
      name: 'memory_extract',
      description: memoryExtractDescription,
      parameters: memoryExtractParameters,
      getAssignTool,
      hiddenAgentName,
      validateInput: validateMemoryExtractInput,
      buildAssignTask: async (input, context) => {
        const built = await buildTask(input, context);
        return {
          description: built.description ?? 'Extract and consolidate memory from this conversation',
          task: built.task,
        };
      },
    });
  }
}
