import { Tool } from '@/types/tools';

export const randomTool: Tool = {
  definition: {
    name: 'generate_random',
    description: 'Generate random numbers, strings, or make random choices',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description:
            'Type of random generation: "number", "string", "choice", "uuid"',
          enum: ['number', 'string', 'choice', 'uuid'],
        },
        min: {
          type: 'number',
          description: 'Minimum value for random number (inclusive)',
        },
        max: {
          type: 'number',
          description: 'Maximum value for random number (inclusive)',
        },
        length: {
          type: 'number',
          description: 'Length of random string to generate',
          minimum: 1,
          maximum: 1000,
        },
        charset: {
          type: 'string',
          description:
            'Character set for random string: "alphanumeric", "alpha", "numeric", "symbols"',
          enum: ['alphanumeric', 'alpha', 'numeric', 'symbols'],
        },
        choices: {
          type: 'array',
          description: 'Array of choices to pick from randomly',
          items: {
            type: 'string',
            description: 'Choice option',
          },
        },
        count: {
          type: 'number',
          description: 'Number of random items to generate',
          minimum: 1,
          maximum: 100,
        },
      },
      required: ['type'],
    },
  },

  async execute(parameters) {
    try {
      const {
        type,
        min = 0,
        max = 100,
        length = 10,
        charset = 'alphanumeric',
        choices,
        count = 1,
      } = parameters;

      const results = [];

      for (let i = 0; i < count; i++) {
        let result: any;

        switch (type) {
          case 'number':
            if (min >= max) {
              return {
                status: 'error',
                type: 'text',
                result: 'Minimum value must be less than maximum value',
              };
            }
            result = Math.floor(Math.random() * (max - min + 1)) + min;
            break;

          case 'string':
            result = generateRandomString(length, charset);
            break;

          case 'choice':
            if (!choices || !Array.isArray(choices) || choices.length === 0) {
              return {
                status: 'error',
                type: 'text',
                result: 'Choices array is required and must not be empty',
              };
            }
            result = choices[Math.floor(Math.random() * choices.length)];
            break;

          case 'uuid':
            result = generateUUID();
            break;

          default:
            return {
              status: 'error',
              type: 'text',
              result: `Unknown random type: ${type}`,
            };
        }

        results.push(result);
      }

      const finalResult = count === 1 ? results[0] : results;

      return {
        status: 'success',
        type: 'text',
        result:
          typeof finalResult === 'string'
            ? finalResult
            : JSON.stringify(finalResult),
        additionalResult: {
          type,
          count,
          rawResults: results,
          parameters: {
            min: type === 'number' ? min : undefined,
            max: type === 'number' ? max : undefined,
            length: type === 'string' ? length : undefined,
            charset: type === 'string' ? charset : undefined,
            choices: type === 'choice' ? choices : undefined,
          },
        },
      };
    } catch (error) {
      return {
        status: 'error',
        type: 'text',
        result: `Random generation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },

  validate(parameters) {
    const { type, min, max, length, choices, count } = parameters;

    if (!['number', 'string', 'choice', 'uuid'].includes(type)) {
      return false;
    }

    if (
      type === 'number' &&
      min !== undefined &&
      max !== undefined &&
      min >= max
    ) {
      return false;
    }

    if (
      type === 'string' &&
      length !== undefined &&
      (length < 1 || length > 1000)
    ) {
      return false;
    }

    if (
      type === 'choice' &&
      (!choices || !Array.isArray(choices) || choices.length === 0)
    ) {
      return false;
    }

    if (count !== undefined && (count < 1 || count > 100)) {
      return false;
    }

    return true;
  },

  category: 'utility',
  version: '1.0.0',
  author: 'system',
};

// Helper functions for the random tool
function generateRandomString(length: number, charset: string): string {
  const charsets = {
    alphanumeric:
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    numeric: '0123456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  };

  const chars =
    charsets[charset as keyof typeof charsets] || charsets.alphanumeric;
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
