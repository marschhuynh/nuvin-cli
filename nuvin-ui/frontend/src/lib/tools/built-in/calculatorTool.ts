import { Tool } from '@/types/tools';

export const calculatorTool: Tool = {
  definition: {
    name: 'calculator',
    description:
      'Perform mathematical calculations with basic arithmetic operations',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description:
            'Mathematical expression to evaluate (e.g., "2 + 3 * 4", "sqrt(16)", "sin(pi/2)")',
        },
      },
      required: ['expression'],
    },
  },

  async execute(parameters) {
    try {
      const { expression } = parameters;

      if (!expression || typeof expression !== 'string') {
        return {
          success: false,
          error: 'Expression parameter is required and must be a string',
        };
      }

      // Basic security: only allow safe mathematical operations
      const safeExpression = expression
        .replace(/[^0-9+\-*/.()^%\s]/g, '') // Remove non-mathematical characters
        .replace(/\^/g, '**'); // Convert ^ to ** for exponentiation

      // Use Math object functions
      const mathContext = {
        pi: Math.PI,
        e: Math.E,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        sqrt: Math.sqrt,
        abs: Math.abs,
        floor: Math.floor,
        ceil: Math.ceil,
        round: Math.round,
        log: Math.log,
        ln: Math.log,
        exp: Math.exp,
        pow: Math.pow,
        min: Math.min,
        max: Math.max,
      };

      // Create a safe evaluation function
      const evaluateExpression = (expr: string): number => {
        // Replace math functions
        let processedExpr = expr;
        Object.entries(mathContext).forEach(([name, func]) => {
          if (typeof func === 'function') {
            const regex = new RegExp(`\\b${name}\\s*\\(([^)]+)\\)`, 'g');
            processedExpr = processedExpr.replace(regex, (match, args) => {
              const argValues = args
                .split(',')
                .map((arg: string) => evaluateExpression(arg.trim()));
              return (func as any).apply(null, argValues).toString();
            });
          } else {
            processedExpr = processedExpr.replace(
              new RegExp(`\\b${name}\\b`, 'g'),
              func.toString(),
            );
          }
        });

        // Use Function constructor for safe evaluation
        return new Function('return ' + processedExpr)();
      };

      const result = evaluateExpression(safeExpression);

      if (isNaN(result)) {
        return {
          success: false,
          error: 'Invalid mathematical expression',
        };
      }

      return {
        success: true,
        data: {
          expression: expression,
          result: result,
          formatted: `${expression} = ${result}`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Calculation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },

  validate(parameters) {
    return (
      typeof parameters.expression === 'string' &&
      parameters.expression.trim().length > 0
    );
  },

  category: 'utility',
  version: '1.0.0',
  author: 'system',
};
