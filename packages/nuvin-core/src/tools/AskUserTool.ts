import type { ToolDefinition } from '../ports.js';
import { ErrorReason, AgentEventTypes } from '../ports.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError } from './types.js';
import { okText, err } from './result-helpers.js';
import type { AskUserArgs } from './tool-params.js';
import type { AskUserMetadata } from './tool-result-metadata.js';

export type AskUserSuccessResult = {
  status: 'success';
  type: 'text';
  result: string;
  metadata: AskUserMetadata;
};

export type AskUserErrorResult = ExecResultError;

export type AskUserResult = AskUserSuccessResult | AskUserErrorResult;

export class AskUserTool implements FunctionTool<AskUserArgs, ToolExecutionContext, AskUserResult> {
  name = 'ask_user_tool' as const;

  parameters = {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The complete question to ask the user. Should be clear, specific, and end with a question mark. Example: "Which library should we use for date formatting?" If multiSelect is true, phrase it accordingly, e.g. "Which features do you want to enable?"'
            },
            header: {
              type: 'string',
              description: 'Very short label displayed as a chip/tag (max 12 chars). Examples: "Auth method", "Library", "Approach".'
            },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              items: {
                type: 'object',
                properties: {
                  label: {
                    type: 'string',
                    description: 'The display text for this option that the user will see and select. Should be concise (1-5 words) and clearly describe the choice.'
                  },
                  description: {
                    type: 'string',
                    description: 'Explanation of what this option means or what will happen if chosen. Useful for providing context about trade-offs or implications.'
                  }
                },
                required: ['label', 'description']
              },
              description: 'The available choices for this question. Must have 2-4 options. Each option should be a distinct, mutually exclusive choice (unless multiSelect is enabled). There should be no \'Other\' option, that will be provided automatically.'
            },
            multiSelect: {
              type: 'boolean',
              description: 'Set to true to allow the user to select multiple options instead of just one. Use when choices are not mutually exclusive.'
            }
          },
          required: ['question', 'header', 'options', 'multiSelect']
        },
        description: 'Questions to ask the user (1-4 questions)'
      },
      answers: {
        type: 'object',
        additionalProperties: {
          type: 'string'
        },
        description: 'User answers collected by the permission component'
      }
    },
    required: ['questions']
  } as const;

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description: `Use this tool when you need to ask the user questions during execution. This allows you to:
1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take.

Usage notes:
- Users will always be able to select "Other" to provide custom text input
- Use multiSelect: true to allow multiple answers to be selected for a question
- If you recommend a specific option, make that the first option in the list and add "(Recommended)" at the end of the label`,
      parameters: this.parameters,
    };
  }

  async execute(params: AskUserArgs, context?: ToolExecutionContext): Promise<AskUserResult> {
    // Validation
    if (!params.questions || !Array.isArray(params.questions)) {
      return err('Parameter "questions" is required and must be an array', undefined, ErrorReason.InvalidInput);
    }

    if (params.questions.length < 1 || params.questions.length > 4) {
      return err('Must provide 1-4 questions', undefined, ErrorReason.InvalidInput);
    }

    for (let i = 0; i < params.questions.length; i++) {
      const q = params.questions[i];
      
      if (!q.question || typeof q.question !== 'string') {
        return err(`Question ${i + 1}: "question" field is required and must be a string`, undefined, ErrorReason.InvalidInput);
      }

      if (!q.header || typeof q.header !== 'string') {
        return err(`Question ${i + 1}: "header" field is required and must be a string`, undefined, ErrorReason.InvalidInput);
      }

      if (q.header.length > 12) {
        return err(`Question ${i + 1}: "header" must be max 12 characters, got ${q.header.length}`, undefined, ErrorReason.InvalidInput);
      }

      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) {
        return err(`Question ${i + 1}: must have 2-4 options`, undefined, ErrorReason.InvalidInput);
      }

      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j];
        if (!opt.label || !opt.description) {
          return err(`Question ${i + 1}, Option ${j + 1}: both "label" and "description" are required`, undefined, ErrorReason.InvalidInput);
        }
      }

      if (typeof q.multiSelect !== 'boolean') {
        return err(`Question ${i + 1}: "multiSelect" must be a boolean`, undefined, ErrorReason.InvalidInput);
      }
    }

    // If answers already provided (second call), return them
    if (params.answers && Object.keys(params.answers).length > 0) {
      const questionId = context?.messageId || 'unknown';
      return okText(
        `User responses received: ${JSON.stringify(params.answers, null, 2)}`,
        {
          questionId,
          questionCount: params.questions.length,
          answers: params.answers,
        }
      );
    }

    // Otherwise, we need to emit event and wait for response
    // This will be implemented in Task 3 when we integrate with orchestrator
    return err('User question mechanism not yet integrated with orchestrator', undefined, ErrorReason.Unknown);
  }
}
