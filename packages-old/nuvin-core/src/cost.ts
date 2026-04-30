import type { CostCalculator, UsageData } from './ports.js';

export class SimpleCost implements CostCalculator {
  estimate(_model: string, usage?: UsageData): number | undefined {
    return usage?.cost;
  }
}
