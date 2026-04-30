import type { LLMPort, LLMFactory } from '../ports.js';
import type { SpecialistAgentConfig } from '../agent-types.js';

export class LLMResolver {
  constructor(private factory: LLMFactory) {}

  resolve(config: SpecialistAgentConfig): LLMPort {
    return this.factory.createLLM({
      provider: config.provider,
      model: config.model,
    });
  }
}
