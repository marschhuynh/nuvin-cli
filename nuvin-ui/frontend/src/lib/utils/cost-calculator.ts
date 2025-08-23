interface ModelPricing {
  inputCost: number; // Cost per 1M tokens
  outputCost: number; // Cost per 1M tokens
}

// Model pricing data (cost per 1M tokens in USD)
const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI Models
  'gpt-4o': { inputCost: 2.5, outputCost: 10.0 },
  'gpt-4o-mini': { inputCost: 0.15, outputCost: 0.6 },
  'gpt-4-turbo': { inputCost: 10.0, outputCost: 30.0 },
  'gpt-4': { inputCost: 30.0, outputCost: 60.0 },
  'gpt-3.5-turbo': { inputCost: 0.5, outputCost: 1.5 },

  // Anthropic Models
  'claude-3-5-sonnet-20241022': { inputCost: 3.0, outputCost: 15.0 },
  'claude-3-5-sonnet-20240620': { inputCost: 3.0, outputCost: 15.0 },
  'claude-3-5-haiku-20241022': { inputCost: 0.8, outputCost: 4.0 },
  'claude-3-opus-20240229': { inputCost: 15.0, outputCost: 75.0 },
  'claude-3-sonnet-20240229': { inputCost: 3.0, outputCost: 15.0 },
  'claude-3-haiku-20240307': { inputCost: 0.25, outputCost: 1.25 },

  // Common model aliases
  'claude-3-5-sonnet': { inputCost: 3.0, outputCost: 15.0 },
  'claude-3-5-haiku': { inputCost: 0.8, outputCost: 4.0 },
  'claude-3-opus': { inputCost: 15.0, outputCost: 75.0 },
  'claude-3-sonnet': { inputCost: 3.0, outputCost: 15.0 },
  'claude-3-haiku': { inputCost: 0.25, outputCost: 1.25 },
};

/**
 * Calculate the estimated cost for a completion based on token usage
 */
export function calculateCost(model: string, promptTokens: number = 0, completionTokens: number = 0): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    // Return 0 for unknown models rather than throwing an error
    return 0;
  }

  const inputCost = (promptTokens / 1000000) * pricing.inputCost;
  const outputCost = (completionTokens / 1000000) * pricing.outputCost;

  return inputCost + outputCost;
}

/**
 * Get pricing information for a model
 */
export function getModelPricing(model: string): ModelPricing | null {
  return MODEL_PRICING[model] || null;
}

/**
 * Check if pricing is available for a model
 */
export function hasPricingInfo(model: string): boolean {
  return model in MODEL_PRICING;
}

/**
 * Format cost as a currency string
 */
export function formatCost(cost: number): string {
  // Handle edge cases
  if (!Number.isFinite(cost) || Number.isNaN(cost)) return '$0.00';

  const isNegative = cost < 0;
  const absoluteCost = Math.abs(cost);

  if (absoluteCost === 0) return '$0.00';

  let formatted: string;

  if (absoluteCost >= 0.01) {
    // For amounts >= $0.01, use 2 decimal places
    formatted = `$${absoluteCost.toFixed(2)}`;
  } else {
    // For very small amounts, find the position of the first significant digit
    // and add one more decimal place for precision
    const logValue = Math.log10(absoluteCost);
    const firstSignificantDigitPosition = Math.floor(logValue);
    const decimalPlaces = Math.abs(firstSignificantDigitPosition) + 1;
    formatted = `$${absoluteCost.toFixed(decimalPlaces)}`;
  }

  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Get all supported models with pricing
 */
export function getSupportedModels(): string[] {
  return Object.keys(MODEL_PRICING);
}
